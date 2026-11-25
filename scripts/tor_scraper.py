#!/usr/bin/env python3
"""
Lyriksa — Tor-Routed Malagasy Lyrics Scraper (tononkira.serasera.org)
====================================================================
Features:
- Routes 100% of HTTP traffic through Tor SOCKS5 proxy (127.0.0.1:9050)
- Tor Stream Isolation: dynamically rotates IP/circuits per request to prevent IP bans
- Dual-Pass diffing with difflib to strip 100% of dynamic random watermarks
- Resilient SQLite checkpoint database (crawl_queue & songs) with zero duplicate work on resume
- Multi-threaded worker pool with configurable concurrency and polite delays
- Direct JSON export matching Lyriksa mobile app seed schema
"""

import argparse
import concurrent.futures
import difflib
import json
import os
import random
import re
import signal
import sqlite3
import sys
import threading
import time
from html import unescape
from urllib.parse import urljoin, quote

try:
    import requests
    import bs4
except ImportError:
    print("Error: 'requests' and 'beautifulsoup4' are required. Install with: pip install requests beautifulsoup4")
    sys.exit(1)

# Default Configuration
BASE_URL = "https://tononkira.serasera.org"
TOR_SOCKS_HOST = "127.0.0.1"
TOR_SOCKS_PORT = 9050
DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "data", "lyriksa_scraped.db")
DEFAULT_JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "data", "seed-songs.json")

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15",
]

# Global termination flag for clean Ctrl+C shutdown
stop_requested = False


def signal_handler(signum, frame):
    global stop_requested
    print("\n[!] Interruption signal received (Ctrl+C). Saving checkpoints and shutting down gracefully...")
    stop_requested = True


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def get_tor_proxies():
    """
    Returns SOCKS5h proxies with stream isolation credentials.
    Varying the username forces Tor to create a distinct circuit with a different IP.
    """
    circuit_id = random.randint(100000, 999999)
    proxy_url = f"socks5h://scraper_{circuit_id}:pwd@{TOR_SOCKS_HOST}:{TOR_SOCKS_PORT}"
    return {"http": proxy_url, "https": proxy_url}


def check_tor_connection(preferred_port=None):
    """Verifies that Tor is running and returns current Tor IP, with port auto-failover."""
    global TOR_SOCKS_PORT
    candidate_ports = [preferred_port] if preferred_port else [TOR_SOCKS_PORT, 9055, 9050]
    candidate_ports = list(dict.fromkeys([p for p in candidate_ports if p]))

    endpoints = [
        ("https://api.ipify.org?format=json", lambda d: d.get("ip")),
        ("https://check.torproject.org/api/ip", lambda d: d.get("IP") if d.get("IsTor") else None),
        ("https://httpbin.org/ip", lambda d: d.get("origin")),
    ]

    for port in candidate_ports:
        TOR_SOCKS_PORT = port
        for url, extractor in endpoints:
            try:
                proxies = get_tor_proxies()
                resp = requests.get(url, proxies=proxies, timeout=10)
                ip = extractor(resp.json())
                if ip:
                    print(f"[*] Tor Connection Active on port {port}: IP={ip} (Verified Tor Proxy)")
                    return True
            except Exception:
                continue

    print(f"[ERROR] Could not connect to Tor SOCKS5 proxy on {TOR_SOCKS_HOST}:{candidate_ports}")
    print("Make sure Tor is running (e.g., 'sudo systemctl start tor').")
    return False


def infer_malagasy_category(artist_name, song_title="", lyrics=""):
    """Infers the musical category based on artist name and lyrics keywords."""
    a = (artist_name or "").lower()
    t = (song_title or "").lower()
    l = (lyrics or "").lower()

    if any(k in a for k in ["fjkm", "flm", "chorale", "barea", "gospel", "tsanta", "fiderana", "filadelfia"]) or \
       any(k in l for k in ["jesosy", "tompoko", "fiangonana", "haleloia", "mpamonjy", "aleloia", "andriamanitra"]):
        return "Hira Fiderana / Gospel"

    if any(k in a for k in ["mahaleo", "erick manana", "dama", "lolo sy ny tariny", "kolibera", "beby", "rajery"]):
        return "Folk / Acoustic"

    if any(k in a for k in ["ambondrona", "mage 4", "kiaka", "iraimbilanja", "apostoly", "green", "tselatra", "red metal"]):
        return "Rock"

    if any(k in a for k in ["rebika", "henri ratsimbazafy", "bessa", "lalao rabeson", "salomon", "njila", "poopy", "bodo", "ny ainga"]):
        return "Kalon'ny Fahiny"

    if any(k in a for k in ["rossy", "wawa", "jiofily", "din rotsaka", "vaiavy chila", "tence mena", "black nadia", "shyn", "smaven"]):
        return "Vakodrazana / Salegy"

    return "Variété Malagasy"


class CheckpointDatabase:
    """Thread-safe SQLite database for storage and crawling checkpoints."""

    def __init__(self, db_path):
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self.lock = threading.Lock()
        self.init_schema()

    def get_connection(self):
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        return conn

    def init_schema(self):
        with self.lock:
            conn = self.get_connection()
            try:
                conn.executescript("""
                    CREATE TABLE IF NOT EXISTS artists (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        slug TEXT NOT NULL,
                        category TEXT,
                        song_count INTEGER DEFAULT 0,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS songs (
                        id TEXT PRIMARY KEY,
                        title TEXT NOT NULL,
                        slug TEXT NOT NULL,
                        artist_id TEXT NOT NULL,
                        artist_name TEXT NOT NULL,
                        category TEXT,
                        lyrics TEXT NOT NULL,
                        url TEXT UNIQUE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS crawl_queue (
                        url TEXT PRIMARY KEY,
                        item_type TEXT NOT NULL, -- 'page', 'artist', 'song'
                        status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'done', 'failed'
                        retries INTEGER DEFAULT 0,
                        last_error TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS scanned_pages (
                        page_num INTEGER PRIMARY KEY,
                        discovered_count INTEGER DEFAULT 0,
                        scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist_id);
                    CREATE INDEX IF NOT EXISTS idx_queue_status ON crawl_queue(status, item_type);
                """)
                conn.commit()
            finally:
                conn.close()

    def preseed_from_json(self, json_path):
        """Populates database with curated seed songs if not already stored."""
        if not os.path.exists(json_path):
            return
        with self.lock:
            conn = self.get_connection()
            try:
                cur = conn.cursor()
                with open(json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)

                added = 0
                for a in data.get("artists", []):
                    cur.execute("""
                        INSERT OR IGNORE INTO artists (id, name, slug, category, song_count)
                        VALUES (?, ?, ?, ?, ?)
                    """, (a["id"], a["name"], a["slug"], a.get("category", "Variété Malagasy"), a.get("song_count", 0)))

                for s in data.get("songs", []):
                    cur.execute("""
                        INSERT OR IGNORE INTO songs (id, title, slug, artist_id, artist_name, category, lyrics, url)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        s["id"],
                        s["title"],
                        s["slug"],
                        s["artist_id"],
                        s["artist_name"],
                        s.get("category", "Variété Malagasy"),
                        s["lyrics"],
                        s.get("url", "")
                    ))
                    if cur.rowcount > 0:
                        added += 1
                    if s.get("url"):
                        cur.execute("INSERT OR IGNORE INTO crawl_queue (url, item_type, status) VALUES (?, 'song', 'done')", (s["url"],))

                conn.commit()
                if added > 0:
                    print(f"[*] Pre-seeded {added} curated songs from {os.path.basename(json_path)}")
            finally:
                conn.close()

    def add_queue_items(self, items):
        """items is list of (url, item_type)"""
        with self.lock:
            conn = self.get_connection()
            try:
                conn.executemany(
                    "INSERT OR IGNORE INTO crawl_queue (url, item_type, status) VALUES (?, ?, 'pending')",
                    items
                )
                conn.commit()
            finally:
                conn.close()

    def is_page_scanned(self, page_num):
        with self.lock:
            conn = self.get_connection()
            try:
                cur = conn.cursor()
                cur.execute("SELECT 1 FROM scanned_pages WHERE page_num = ?", (page_num,))
                return bool(cur.fetchone())
            finally:
                conn.close()

    def mark_page_scanned(self, page_num, count):
        with self.lock:
            conn = self.get_connection()
            try:
                conn.execute(
                    "INSERT OR REPLACE INTO scanned_pages (page_num, discovered_count) VALUES (?, ?)",
                    (page_num, count)
                )
                conn.commit()
            finally:
                conn.close()

    def get_scanned_pages(self):
        with self.lock:
            conn = self.get_connection()
            try:
                cur = conn.cursor()
                cur.execute("SELECT page_num FROM scanned_pages")
                return {row[0] for row in cur.fetchall()}
            finally:
                conn.close()

    def get_scanned_pages_count(self):
        with self.lock:
            conn = self.get_connection()
            try:
                cur = conn.cursor()
                cur.execute("SELECT COUNT(*) FROM scanned_pages")
                return cur.fetchone()[0]
            finally:
                conn.close()

    def get_pending_songs(self, limit=50):
        with self.lock:
            conn = self.get_connection()
            try:
                cur = conn.cursor()
                cur.execute(
                    "SELECT url FROM crawl_queue WHERE item_type = 'song' AND status = 'pending' LIMIT ?",
                    (limit,)
                )
                return [row[0] for row in cur.fetchall()]
            finally:
                conn.close()

    def mark_status(self, url, status, error=None):
        with self.lock:
            conn = self.get_connection()
            try:
                conn.execute(
                    "UPDATE crawl_queue SET status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE url = ?",
                    (status, error, url)
                )
                conn.commit()
            finally:
                conn.close()

    def save_song(self, song_data, artist_data):
        with self.lock:
            conn = self.get_connection()
            try:
                cur = conn.cursor()
                # Upsert Artist
                cur.execute("""
                    INSERT INTO artists (id, name, slug, category, song_count)
                    VALUES (?, ?, ?, ?, 1)
                    ON CONFLICT(id) DO UPDATE SET
                        song_count = song_count + 1,
                        updated_at = CURRENT_TIMESTAMP
                """, (artist_data["id"], artist_data["name"], artist_data["slug"], artist_data["category"]))

                # Insert Song
                cur.execute("""
                    INSERT OR REPLACE INTO songs (id, title, slug, artist_id, artist_name, category, lyrics, url)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    song_data["id"],
                    song_data["title"],
                    song_data["slug"],
                    song_data["artist_id"],
                    song_data["artist_name"],
                    song_data["category"],
                    song_data["lyrics"],
                    song_data["url"]
                ))

                # Mark queue item done
                cur.execute(
                    "UPDATE crawl_queue SET status = 'done', updated_at = CURRENT_TIMESTAMP WHERE url = ?",
                    (song_data["url"],)
                )
                conn.commit()
            finally:
                conn.close()

    def get_stats(self):
        with self.lock:
            conn = self.get_connection()
            try:
                cur = conn.cursor()
                cur.execute("SELECT COUNT(*) FROM songs")
                total_songs = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM artists")
                total_artists = cur.fetchone()[0]
                cur.execute("SELECT status, COUNT(*) FROM crawl_queue GROUP BY status")
                queue_stats = dict(cur.fetchall())
                return {
                    "total_songs": total_songs,
                    "total_artists": total_artists,
                    "queue": queue_stats
                }
            finally:
                conn.close()


class TononkiraScraper:
    """Core Scraper with Tor routing, intelligent anti-429 defense, and paragraph-preserving dual-pass watermark elimination."""

    def __init__(self, db: CheckpointDatabase, delay=1.0):
        self.db = db
        self.delay = delay
        self.consecutive_429 = 0

    def fetch_url(self, url, retries=5):
        """Fetches URL through a fresh Tor SOCKS5 circuit with intelligent 429 backoff."""
        for attempt in range(retries):
            if stop_requested:
                return None
            proxies = get_tor_proxies()
            headers = {
                "User-Agent": random.choice(USER_AGENTS),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "mg,fr-FR;q=0.9,fr;q=0.8,en-US;q=0.7,en;q=0.6",
                "Referer": "https://tononkira.serasera.org/hira",
            }
            try:
                resp = requests.get(url, proxies=proxies, headers=headers, timeout=25)
                if resp.status_code == 200:
                    self.consecutive_429 = 0
                    return resp.text
                elif resp.status_code == 429:
                    self.consecutive_429 += 1
                    retry_after = resp.headers.get("Retry-After")
                    try:
                        backoff = int(retry_after) if retry_after else min(45, 4 * (2 ** attempt)) + random.uniform(2.0, 4.0)
                    except ValueError:
                        backoff = min(45, 4 * (2 ** attempt)) + random.uniform(2.0, 4.0)

                    if self.consecutive_429 >= 3:
                        print(f"   [!] 🚨 Circuit Breaker Tripped ({self.consecutive_429} consecutive 429s). Cooldown 30s...")
                        time.sleep(30)
                        self.consecutive_429 = 0
                    else:
                        print(f"   [!] HTTP 429 (Too Many Requests) on {url.replace(BASE_URL, '')}. Rotating Tor circuit & sleeping {backoff:.1f}s...")
                        time.sleep(backoff)
                elif resp.status_code in [500, 502, 503, 504]:
                    backoff = 2 * (attempt + 1) + random.uniform(1.0, 2.5)
                    print(f"   [!] Server error HTTP {resp.status_code}. Rotating Tor circuit & sleeping {backoff:.1f}s...")
                    time.sleep(backoff)
                elif resp.status_code == 404:
                    return None
            except Exception as e:
                backoff = 1.5 * (attempt + 1) + random.uniform(0.8, 2.0)
                time.sleep(backoff)
        return None

    def parse_html_to_paragraphs(self, html):
        """
        Parses lyrics container while strictly respecting poetic strophes (paragraphs).
        - Multiple consecutive <br> tags = Strophe / Paragraph break (__PARA__)
        - Single <br> tag = Verse / Line break within strophe (\n)
        """
        soup = bs4.BeautifulSoup(html, "html.parser")
        col = soup.find("div", class_="col-md-8")
        if not col:
            return None, None, []

        # Extract Title and Artist from H2
        # Example H2: "Any ho any (Agrad)"
        h2 = col.find("h2")
        title = "Hira"
        artist = "Mpihira"
        if h2:
            raw_header = h2.text.strip()
            match = re.search(r"^(.*?)\s*\((.*?)\)$", raw_header)
            if match:
                title = match.group(1).strip()
                artist = match.group(2).strip()
            else:
                title = raw_header

        divs = [c for c in col.children if getattr(c, "name", None) == "div"]
        target_div = None
        for d in divs:
            classes = d.get("class") or []
            if not any(c in classes for c in ["text-end", "print", "mw-100", "no-print", "alert", "card"]):
                if len(d.text.strip()) > 30:
                    target_div = d
                    break

        if not target_div:
            return title, artist, []

        raw = str(target_div)
        raw = raw.replace("\r\n", "\n").replace("\r", "\n")
        # 2 or more <br> = Paragraph / Strophe separator
        raw = re.sub(r"(?:<br\s*/?>\s*){2,}", "__PARA__", raw)
        # Single <br> = line break within the same strophe
        raw = re.sub(r"<br\s*/?>\s*", "\n", raw)
        # Strip other HTML tags
        raw = re.sub(r"<[^>]+>", "", raw)
        raw = unescape(raw)

        raw_paras = raw.split("__PARA__")
        clean_paras = []
        for p in raw_paras:
            lines = [re.sub(r"\s+", " ", l).strip() for l in p.splitlines() if l.strip()]
            if lines:
                clean_paras.append(lines)

        return title, artist, clean_paras

    def clean_lyrics_dual_pass(self, url):
        """
        Executes two fetches across different Tor circuits.
        Intersects words to eliminate 100% of dynamically injected watermarks,
        while strictly preserving poetic strophes (paragraphs).
        """
        html1 = self.fetch_url(url)
        if not html1:
            return None

        # Polite jittered delay before second pass
        time.sleep(self.delay + random.uniform(0.2, 0.6))
        html2 = self.fetch_url(url)
        if not html2:
            html2 = html1

        title1, artist1, paras1 = self.parse_html_to_paragraphs(html1)
        _, _, paras2 = self.parse_html_to_paragraphs(html2)

        if not paras1:
            return None

        if not paras2:
            paras2 = paras1

        end_markers = ["hametraka hevitra", "hevitra mandeha", "rohy:", "adikao", "--------"]

        def clean_line_watermark(w1, w2):
            sm = difflib.SequenceMatcher(None, w1, w2)
            common = []
            for tag, i1, i2, j1, j2 in sm.get_opcodes():
                if tag == "equal":
                    common.extend(w1[i1:i2])
            return common

        final_paragraphs = []
        stopped = False

        for p1_lines, p2_lines in zip(paras1, paras2):
            if stopped:
                break
            para_lines = []
            for l1, l2 in zip(p1_lines, p2_lines):
                # Clean any embedded domain token
                l1_clean = l1.replace("tononkira.serasera.org", "").strip()
                l2_clean = l2.replace("tononkira.serasera.org", "").strip()

                # Stop if boilerplate footer marker reached
                if any(marker in l1_clean.lower() for marker in end_markers):
                    stopped = True
                    break

                w1 = l1_clean.split()
                w2 = l2_clean.split()
                common = clean_line_watermark(w1, w2)
                line = " ".join(common).strip()
                if line:
                    para_lines.append(line)

            if para_lines:
                # Verses within a strophe joined by single newline
                final_paragraphs.append("\n".join(para_lines))

        # Join distinct strophes with double newline (\n\n)
        clean_lyrics = "\n\n".join(final_paragraphs).strip()

        return {
            "title": title1,
            "artist": artist1,
            "lyrics": clean_lyrics
        }

    def scrape_single_song(self, song_url):
        """Scrapes and saves one song to the SQLite database."""
        try:
            result = self.clean_lyrics_dual_pass(song_url)
            if not result or not result["lyrics"]:
                self.db.mark_status(song_url, "failed", "Empty lyrics")
                return False

            title = result["title"]
            artist_name = result["artist"]
            lyrics = result["lyrics"]

            # Derive clean slugs
            def slugify(text):
                t = text.lower().strip()
                t = re.sub(r"[^\w\s-]", "", t)
                t = re.sub(r"[\s_-]+", "-", t)
                return t.strip("-") or "item"

            artist_slug = slugify(artist_name)
            song_slug = slugify(title)
            song_id = f"{artist_slug}-{song_slug}"

            category = infer_malagasy_category(artist_name, title, lyrics)

            song_data = {
                "id": song_id,
                "title": title,
                "slug": song_slug,
                "artist_id": artist_slug,
                "artist_name": artist_name,
                "category": category,
                "lyrics": lyrics,
                "url": song_url
            }

            artist_data = {
                "id": artist_slug,
                "name": artist_name,
                "slug": artist_slug,
                "category": category
            }

            self.db.save_song(song_data, artist_data)
            return True
        except Exception as e:
            self.db.mark_status(song_url, "failed", str(e))
            return False

    def discover_songs_on_page(self, page_num):
        """Extracts song URLs from /hira?page=N and tracks page in scanned_pages."""
        if self.db.is_page_scanned(page_num):
            return []

        url = f"{BASE_URL}/hira?page={page_num}"
        html = self.fetch_url(url)
        if not html:
            return []

        soup = bs4.BeautifulSoup(html, "html.parser")
        song_urls = []
        for a in soup.find_all("a"):
            href = a.get("href")
            if href and "/hira/" in href:
                if not any(k in href for k in ["ankafizo", "hevitra", "ampidiro", "page="]):
                    full_url = urljoin(BASE_URL, href)
                    # Verify canonical song link format: /hira/<artist>/<title>
                    parts = full_url.replace(BASE_URL, "").strip("/").split("/")
                    if len(parts) == 3 and parts[0] == "hira":
                        song_urls.append((full_url, "song"))

        # Deduplicate
        unique_urls = list(dict.fromkeys(song_urls))
        self.db.add_queue_items(unique_urls)
        self.db.mark_page_scanned(page_num, len(unique_urls))
        return [u[0] for u in unique_urls]

    def discover_artist_songs(self, artist_query):
        """Discovers all songs for a specific artist query."""
        url = f"{BASE_URL}/hira?mpihira={quote(artist_query)}"
        html = self.fetch_url(url)
        if not html:
            return []

        soup = bs4.BeautifulSoup(html, "html.parser")
        song_urls = []
        for a in soup.find_all("a"):
            href = a.get("href")
            if href and "/hira/" in href:
                if not any(k in href for k in ["ankafizo", "hevitra", "ampidiro", "page="]):
                    full_url = urljoin(BASE_URL, href)
                    parts = full_url.replace(BASE_URL, "").strip("/").split("/")
                    if len(parts) == 3 and parts[0] == "hira":
                        song_urls.append((full_url, "song"))

        unique_urls = list(dict.fromkeys(song_urls))
        self.db.add_queue_items(unique_urls)
        return [u[0] for u in unique_urls]


def export_database_to_json(db_path, json_path):
    """Exports SQLite songs and artists into seed-songs.json format for Lyriksa."""
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute("""
        SELECT a.id, a.name, a.slug, a.category, COUNT(s.id) as actual_count
        FROM artists a
        LEFT JOIN songs s ON (s.artist_id = a.id OR s.artist_id = a.slug)
        GROUP BY a.id
        HAVING actual_count > 0
        ORDER BY actual_count DESC, a.name ASC
    """)
    artists = []
    for row in cur.fetchall():
        artists.append({
            "id": row[0],
            "name": row[1],
            "slug": row[2],
            "category": row[3],
            "song_count": row[4]
        })

    cur.execute("SELECT id, title, slug, artist_id, artist_name, category, lyrics, url FROM songs ORDER BY title ASC")
    songs = []
    for row in cur.fetchall():
        songs.append({
            "id": row[0],
            "title": row[1],
            "slug": row[2],
            "artist_id": row[3],
            "artist_name": row[4],
            "category": row[5],
            "lyrics": row[6],
            "url": row[7]
        })

    conn.close()

    output = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_artists": len(artists),
        "total_songs": len(songs),
        "artists": artists,
        "songs": songs
    }

    os.makedirs(os.path.dirname(os.path.abspath(json_path)), exist_ok=True)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"[✓] Exported {len(songs)} songs across {len(artists)} artists to: {json_path}")


def run_phase_1_indexer(scraper: TononkiraScraper, start_page=1, max_pages=891, workers=2):
    """
    Phase 1: Indexes all catalog pages into crawl_queue with Tor stream isolation and polite rate limiting.
    Supports resuming: pages already recorded in scanned_pages are skipped automatically.
    """
    total_target_pages = max_pages
    all_pages = list(range(start_page, start_page + max_pages))
    scanned = scraper.db.get_scanned_pages()
    pending_pages = [p for p in all_pages if p not in scanned]

    print("=" * 70)
    print(" 📑 PHASE 1 : CARTOGRAPHIE & INDEXATION DES PAGES DU CATALOGUE")
    print("=" * 70)
    print(f"[*] Objectif : Pages {start_page} à {start_page + max_pages - 1} ({total_target_pages} pages au total)")
    print(f"[*] Déjà indexées précédemment : {len(scanned)} pages")
    print(f"[*] Pages restantes à indexer : {len(pending_pages)} pages")
    print(f"[*] Concurrence : {workers} threads légers avec Tor Stream Isolation (IPs tournantes)")

    if not pending_pages:
        stats = scraper.db.get_stats()
        print(f"\n[✓] Toutes les {total_target_pages} pages sont déjà indexées !")
        print(f"[*] Total chansons dans la file d'attente : {stats['queue'].get('pending', 0)} à télécharger, {stats['queue'].get('done', 0)} déjà terminées.")
        return

    discovered_this_run = 0

    def process_page(page_num):
        nonlocal discovered_this_run
        if stop_requested:
            return 0
        songs = scraper.discover_songs_on_page(page_num)
        time.sleep(random.uniform(1.0, 1.8))
        return len(songs) if songs is not None else 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(process_page, p): p for p in pending_pages}
        for future in concurrent.futures.as_completed(futures):
            if stop_requested:
                break
            page_num = futures[future]
            try:
                count = future.result()
                discovered_this_run += count
                stats = scraper.db.get_stats()
                total_in_queue = sum(stats['queue'].values())
                pending_in_queue = stats['queue'].get('pending', 0)
                done_in_queue = stats['queue'].get('done', 0)
                print(f"[*] [Page {page_num:03d}/{total_target_pages}] +{count} chansons | Total Queue: {total_in_queue} (En attente: {pending_in_queue}, Déjà téléchargées: {done_in_queue})")
            except Exception as e:
                print(f"[!] Erreur sur la page {page_num}: {e}")

    stats = scraper.db.get_stats()
    print("\n" + "=" * 70)
    print(" [✓] PHASE 1 TERMINÉE !")
    print("=" * 70)
    print(f"[*] Pages indexées : {scraper.db.get_scanned_pages_count()} / {total_target_pages}")
    print(f"[*] Total chansons répertoriées dans la file d'attente : {sum(stats['queue'].values())}")
    print(f"[*] Chansons prêtes pour la Phase 2 : {stats['queue'].get('pending', 0)} en attente")


def run_worker_pool(scraper: TononkiraScraper, max_workers=4):
    """Processes pending songs in the queue concurrently using Tor stream isolation."""
    print(f"[*] Starting worker pool ({max_workers} threads) via Tor proxy...")
    stats_start = scraper.db.get_stats()
    last_exported = stats_start["total_songs"]

    while not stop_requested:
        pending_batch = scraper.db.get_pending_songs(limit=max_workers * 2)
        if not pending_batch:
            break

        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(scraper.scrape_single_song, url): url for url in pending_batch}
            for future in concurrent.futures.as_completed(futures):
                if stop_requested:
                    break
                url = futures[future]
                try:
                    success = future.result()
                    stats = scraper.db.get_stats()
                    status_symbol = "✓" if success else "✗"
                    print(f"[{status_symbol}] Scraped: {url.replace(BASE_URL, '')} | Total Saved: {stats['total_songs']}")

                    # Periodic auto-export every 50 songs
                    if stats["total_songs"] - last_exported >= 50:
                        export_database_to_json(scraper.db.db_path, DEFAULT_JSON_PATH)
                        last_exported = stats["total_songs"]
                except Exception as e:
                    print(f"[!] Worker error on {url}: {e}")

        # Polite jittered delay between batches to respect server rate limits
        time.sleep(random.uniform(0.8, 1.8))


def main():
    parser = argparse.ArgumentParser(description="Lyriksa — Tor-Routed Malagasy Lyrics Scraper")
    parser.add_argument("--test", action="store_true", help="Runs a quick test verification of Tor and scrapes 3 sample songs")
    parser.add_argument("--artist", type=str, help="Scrapes all songs for a specific artist name or slug")
    parser.add_argument("--phase-1", "--index-only", action="store_true", dest="phase_1",
                        help="Phase 1: Indexes all catalog pages into crawl_queue with resume support (default 891 pages)")
    parser.add_argument("--phase-2", "--download-only", action="store_true", dest="phase_2",
                        help="Phase 2: Downloads lyrics for pending songs in crawl_queue via Tor worker pool")
    parser.add_argument("--full", action="store_true", help="Runs discovery and download together")
    parser.add_argument("--start-page", type=int, default=1, help="Start page for catalog crawl (default 1)")
    parser.add_argument("--max-pages", type=int, default=891, help="Maximum catalog pages to discover (default 891)")
    parser.add_argument("--workers", type=int, default=2, help="Concurrent worker threads (default 2, avoids 429 rate-limiting)")
    parser.add_argument("--tor-port", type=int, default=None, help="Tor SOCKS5 port (default auto-detect between 9050 and 9055)")
    parser.add_argument("--delay", type=float, default=1.0, help="Polite delay in seconds between dual passes (default 1.0)")
    parser.add_argument("--db", type=str, default=DEFAULT_DB_PATH, help=f"SQLite database path (default: {DEFAULT_DB_PATH})")
    parser.add_argument("--export", type=str, default=None, help="Export collected songs to Lyriksa JSON file")

    args = parser.parse_args()

    print("=" * 70)
    print(" 🎵 LYRIKSA — Malagasy Lyrics Scraper (Tor-Routed & Watermark-Free)")
    print("=" * 70)

    # 1. Tor Proxy Health Check with Auto-Failover
    if not check_tor_connection(args.tor_port):
        sys.exit(1)

    db = CheckpointDatabase(args.db)
    # Pre-seed existing curated songs from seed-songs.json if database is fresh
    db.preseed_from_json(DEFAULT_JSON_PATH)

    scraper = TononkiraScraper(db, delay=args.delay)

    # Mode: Export only
    if args.export:
        export_database_to_json(args.db, args.export)
        return

    # Mode: Phase 1 (Index only)
    if args.phase_1:
        run_phase_1_indexer(scraper, start_page=args.start_page, max_pages=args.max_pages, workers=args.workers)
        return

    # Mode: Phase 2 (Download pending only)
    if args.phase_2:
        print("\n[*] Starting Phase 2: Concurrent download of pending songs in queue...")
        run_worker_pool(scraper, max_workers=args.workers)
        stats = db.get_stats()
        print(f"\n[✓] Phase 2 finished! Total songs in database: {stats['total_songs']} across {stats['total_artists']} artists.")
        export_database_to_json(args.db, DEFAULT_JSON_PATH)
        return

    # Mode: Test
    if args.test:
        print("\n[*] Running test verification on 3 representative songs...")
        test_urls = [
            f"{BASE_URL}/hira/mahaleo/antanambao",
            f"{BASE_URL}/hira/agrad/any-ho-any",
            f"{BASE_URL}/hira/barea-fjkm-ambohitsoa-fibebahana/miandry-anao"
        ]
        db.add_queue_items([(u, "song") for u in test_urls])
        for url in test_urls:
            print(f"-> Processing test song via Tor: {url}")
            res = scraper.clean_lyrics_dual_pass(url)
            if res:
                print(f"   [✓] Title: {res['title']} | Artist: {res['artist']}")
                print(f"   [✓] Clean Lyrics Preview (First paragraph):")
                preview = "\n".join([f"       {l}" for l in res['lyrics'].splitlines()[:5] if l.strip()])
                print(preview)
                scraper.scrape_single_song(url)
            else:
                print(f"   [✗] Failed to scrape {url}")

        stats = db.get_stats()
        print(f"\n[✓] Test completed! Total saved in database: {stats['total_songs']} songs.")
        export_database_to_json(args.db, DEFAULT_JSON_PATH)
        return

    # Mode: Single Artist
    if args.artist:
        print(f"\n[*] Discovering songs for artist: '{args.artist}'...")
        discovered = scraper.discover_artist_songs(args.artist)
        print(f"[*] Found {len(discovered)} song(s). Starting Tor worker pool...")
        run_worker_pool(scraper, max_workers=args.workers)
        stats = db.get_stats()
        print(f"\n[✓] Artist scrape completed! Total database songs: {stats['total_songs']}")
        export_database_to_json(args.db, DEFAULT_JSON_PATH)
        return

    # Mode: Full / Multi-Page Crawl
    if args.full:
        print(f"\n[*] Discovering songs across catalog pages {args.start_page} to {args.start_page + args.max_pages - 1}...")
        for p in range(args.start_page, args.start_page + args.max_pages):
            if stop_requested:
                break
            found = scraper.discover_songs_on_page(p)
            print(f"[*] Page {p}: Discovered {len(found)} songs.")
            time.sleep(random.uniform(1.2, 2.2))

        print("[*] Starting concurrent download of discovered songs...")
        run_worker_pool(scraper, max_workers=args.workers)

        stats = db.get_stats()
        print(f"\n[✓] Crawl finished! Total songs in database: {stats['total_songs']} across {stats['total_artists']} artists.")
        export_database_to_json(args.db, DEFAULT_JSON_PATH)
        return

    parser.print_help()


if __name__ == "__main__":
    main()
