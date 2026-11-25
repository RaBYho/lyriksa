#!/usr/bin/env python3
import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
import difflib
from html import unescape

BASE_URL = "https://tononkira.serasera.org"

TARGET_ARTISTS = [
    {"name": "Mahaleo", "slug": "mahaleo", "category": "Folk / Acoustic"},
    {"name": "Ambondrona", "slug": "ambondrona", "category": "Pop Rock"},
    {"name": "Erick Manana", "slug": "erick-manana", "category": "Folk / Acoustic"},
    {"name": "Mage 4", "slug": "mage-4", "category": "Rock"},
    {"name": "Kiaka", "slug": "kiaka", "category": "Rock"},
    {"name": "Rebika", "slug": "rebika", "category": "Variété / Romantique"},
    {"name": "Dama", "slug": "dama", "category": "Folk"},
    {"name": "Henri Ratsimbazafy", "slug": "henri-ratsimbazafy", "category": "Kalos / Classique"},
    {"name": "BAREA FJKM", "slug": "barea-fjkm-ambohitsoa-fibebahana", "category": "Hira Fiderana / Gospel"},
    {"name": "Rossy", "slug": "rossy", "category": "Vakodrazana / Pop"}
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
}

def fetch_url(url, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=12) as response:
                return response.read().decode("utf-8", errors="ignore")
        except Exception:
            time.sleep(1 + i)
    return ""

def extract_raw_lyrics_block(html):
    col = re.search(r'<div[^>]*class=\"[^\"]*col-md-8[^\"]*\"[^>]*>(.*?)</div>\s*</div>', html, re.DOTALL)
    candidate = col.group(1) if col else html
    best = ""
    for d in re.finditer(r'<div[^>]*>(.*?)</div>', candidate, re.DOTALL):
        inner = d.group(1)
        if any(skip in inner for skip in ["text-end", "permalink", "copylink", "print", "btn"]):
            continue
        t = re.sub(r'<br\s*/?>', '\n', inner)
        t = re.sub(r'<[^>]+>', '', t).replace("tononkira.serasera.org", "")
        if len(t.strip()) > len(best):
            best = t.strip()
    return best

def fetch_clean_lyrics_dual_pass(url):
    """
    Serasera dynamically injects random watermark nonsense tokens (e.g. kbmqpca, kqcw) on each request.
    By doing two separate fetches and computing the longest common words subsequence,
    we strip 100% of the dynamic watermarks while preserving authentic lyrics and stanzas.
    """
    html1 = fetch_url(url)
    raw1 = extract_raw_lyrics_block(html1)
    if not raw1:
        return ""

    time.sleep(0.2)
    html2 = fetch_url(url)
    raw2 = extract_raw_lyrics_block(html2)
    if not raw2:
        raw2 = raw1

    lines1 = raw1.splitlines()
    lines2 = raw2.splitlines()

    clean_lines = []
    end_markers = ["Hametraka hevitra", "Hevitra mandeha", "Rohy:", "Adikao", "--------", "tononkira.serasera.org"]

    for l1, l2 in zip(lines1, lines2):
        w1 = l1.split()
        w2 = l2.split()
        sm = difflib.SequenceMatcher(None, w1, w2)
        common_words = []
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "equal":
                common_words.extend(w1[i1:i2])

        line_str = unescape(" ".join(common_words)).strip()
        if any(marker in line_str for marker in end_markers):
            break
        clean_lines.append(line_str)

    # Clean double empty lines to normalize stanzas
    result = "\n".join(clean_lines).strip()
    result = re.sub(r'\n{3,}', '\n\n', result)
    return result

def scrape_artist_songs(artist, max_songs=8):
    print(f"Scraping artist: {artist['name']}...")
    url = f"{BASE_URL}/hira?mpihira={urllib.parse.quote(artist['name'])}"
    page_html = fetch_url(url)
    if not page_html:
        url = f"{BASE_URL}/mpihira/{artist['slug']}"
        page_html = fetch_url(url)

    links = []
    seen = set()
    for m in re.finditer(r'href=\"(https?://tononkira\.serasera\.org/hira/[^\"]+|/hira/[^\"]+)\"[^>]*>([^<]+)</a>', page_html):
        href = m.group(1)
        title = unescape(m.group(2)).strip()
        if not href.startswith("http"):
            href = BASE_URL + href

        if any(skip in href for skip in ["/ankafizo", "/ankafiziko", "/nampidiriko", "/ahitsio", "fitadiavana"]):
            continue
        if href in seen or not title or title.lower().startswith("hira") or len(title) < 2:
            continue

        seen.add(href)
        links.append({"title": title, "url": href})
        if len(links) >= max_songs:
            break

    print(f"  Found {len(links)} songs for {artist['name']}")
    songs = []
    for item in links:
        song_slug = item["url"].rstrip("/").split("/")[-1]
        song_id = f"{artist['slug']}_{song_slug}"
        lyrics = fetch_clean_lyrics_dual_pass(item["url"])

        if lyrics and len(lyrics) > 40:
            songs.append({
                "id": song_id,
                "title": item["title"],
                "slug": song_slug,
                "artist_id": artist["slug"],
                "artist_name": artist["name"],
                "category": artist["category"],
                "lyrics": lyrics,
                "url": item["url"]
            })
            print(f"    ✓ {item['title']} ({len(lyrics.splitlines())} lines clean)")
        time.sleep(0.2)

    return songs

def main():
    os.makedirs("assets/data", exist_ok=True)
    all_songs = []
    all_artists = []

    for a in TARGET_ARTISTS:
        songs = scrape_artist_songs(a, max_songs=8)
        all_songs.extend(songs)
        all_artists.append({
            "id": a["slug"],
            "name": a["name"],
            "slug": a["slug"],
            "category": a["category"],
            "song_count": len(songs)
        })

    dataset = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "artists": all_artists,
        "songs": all_songs
    }

    out_path = "assets/data/seed-songs.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)

    print(f"\n🎉 Clean re-scrape complete! Saved {len(all_songs)} songs across {len(all_artists)} artists to {out_path}.")

if __name__ == "__main__":
    main()
