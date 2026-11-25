#!/usr/bin/env python3
"""
Lyriksa — Data Engineering & Cleaning Pipeline
===============================================
Features:
1. Entity Resolution & Collaboration (Feat) Extraction:
   - Identifies 'feat.', 'ft.', 'sy', '&', 'x', 'miaraka amin\'i' in titles and artist names.
   - Preserves protected official groups (e.g. Lolo sy ny tariny, Vola sy Noro, Mika sy Davis, etc.).
   - Splits composite artists into primary and featured artists.
   - Assigns collaborations so songs appear on both artists' profiles.
2. Smart Deduplication Engine:
   - Detects exact and near-duplicate songs by title and normalized lyrics text.
   - Merges duplicates, keeping the highest quality / most complete version.
   - Re-links collaborations and favorites.
3. Database & Seed Export:
   - Updates SQLite tables (`songs`, `artists`, `song_collaborations`).
   - Exports pristine `seed-songs.json` for Lyriksa.
"""

import sqlite3
import json
import os
import re
import shutil
import difflib
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "..", "assets", "data", "lyriksa_scraped.db")
BACKUP_PATH = os.path.join(BASE_DIR, "..", "assets", "data", "lyriksa_scraped.db.bak")
JSON_PATH = os.path.join(BASE_DIR, "..", "assets", "data", "seed-songs.json")

# Protected official bands containing 'sy', '&', 'x' that must NEVER be split
PROTECTED_BANDS = {
    "lolo sy ny tariny",
    "vola sy noro",
    "mika sy davis",
    "mika & davis",
    "ndondolah sy tahiry",
    "agrad sy skaiz",
    "wada & yoongs",
    "rafidimanantsoa sy ny tariny",
    "rinah sy ny tariny",
    "randiatsarafara emilson sy ny tariny",
    "mpanazava sy tily eto madagasikara",
    "antoko mpihira orima sy tomima",
    "aifa imerintsiatosika",
    "aifa imerintsiatosika (aina sy fanahy ziona vaovao imerintsiatosika)",
    "antoko mpihira peniela",
    "antoko mpihira peniela ambohimandroso alfa sy omega",
    "akon'ny alfa sy omega",
    "bitaka",
    "bitaka (bika sy tarehin-java-kanto)",
    "reko - fy & his band",
    "dama sy dadah",
    "dadah sy fafah",
    "taninketsa fjkm ambohibao antehiroka",
    "rantsana fanantenana bemasoandro itaosy",
    "vetson'ny fanantenana bemasoandro",
    "slk 'lay mpiantsa soa",
    "kintana telo",
    "tarika samy faly",
    "ny railovy",
    "tarika tsinjo",
    "feon'ny tany",
}

def slugify(text: str) -> str:
    """Generates a clean URL and ID slug from a string."""
    t = text.lower().strip()
    t = re.sub(r"[^\w\s-]", "", t)
    t = re.sub(r"[\s_-]+", "-", t)
    return t.strip("-") or "item"

def clean_artist_string(name: str) -> str:
    """Cleans punctuation, rogue parentheses or uploader tags."""
    t = name.strip()
    # Remove inverted Serasera format artifacts like: "Titre) (Artist"
    t = re.sub(r"^[^(]*\)\s*\((.*?)$", r"\1", t)
    t = re.sub(r"\)\s*\([^)]*$", "", t)
    t = re.sub(r"^[([{\s]+|[)\]}\s]+$", "", t)
    return t.strip()

def parse_collaborations(raw_artist: str, raw_title: str):
    """
    Extracts primary artist, featured artists, and cleaned title.
    Returns: (clean_primary_artist, [featured_artists], clean_title)
    """
    artist = clean_artist_string(raw_artist)
    title = raw_title.strip()
    featured_artists = []

    # 1. Check if artist is protected
    if artist.lower() in PROTECTED_BANDS:
        return artist, [], title

    # 2. Extract feat from Title: e.g. "Titre (feat. ArtistB)" or "Titre ft ArtistB"
    # Matches: (feat. X), [ft. X], (miaraka amin'i X), etc.
    title_feat_pattern = re.compile(
        r"[\(\[]\s*(?:feat\.?|ft\.?|featuring|miaraka\s+amin[\'’]?i)\s+([^()\[\]]+)[\)\]]",
        re.IGNORECASE
    )
    m_title = title_feat_pattern.search(title)
    if m_title:
        feat_raw = m_title.group(1).strip()
        # Clean from title
        title = title[:m_title.start()].strip() + title[m_title.end():].strip()
        title = re.sub(r"\s+", " ", title).strip()
        for f in re.split(r",|\s+sy\s+|\s+&\s+", feat_raw, flags=re.IGNORECASE):
            f_clean = clean_artist_string(f)
            if f_clean and f_clean.lower() != artist.lower():
                featured_artists.append(f_clean)

    # 3. Check for feat in Artist name: e.g. "ArtistA feat. ArtistB" or "ArtistA ft ArtistB"
    feat_artist_pattern = re.compile(r"\s+(?:feat\.?|ft\.?|featuring)\s+", re.IGNORECASE)
    if feat_artist_pattern.search(artist):
        parts = feat_artist_pattern.split(artist)
        if len(parts) >= 2:
            artist = clean_artist_string(parts[0])
            for p in parts[1:]:
                for f in re.split(r",|\s+sy\s+|\s+&\s+", p, flags=re.IGNORECASE):
                    f_clean = clean_artist_string(f)
                    if f_clean and f_clean.lower() != artist.lower():
                        featured_artists.append(f_clean)

    # 4. Check for 'sy' or '&' in Artist name (if not protected band)
    if artist.lower() not in PROTECTED_BANDS:
        # Check 'sy'
        if re.search(r"\s+sy\s+", artist, re.IGNORECASE):
            parts = re.split(r"\s+sy\s+", artist, flags=re.IGNORECASE)
            # Only treat as collab if both parts look like names (length >= 2)
            if len(parts) == 2 and len(parts[0].strip()) >= 2 and len(parts[1].strip()) >= 2:
                artist = clean_artist_string(parts[0])
                f_clean = clean_artist_string(parts[1])
                if f_clean and f_clean.lower() != artist.lower():
                    featured_artists.append(f_clean)

        # Check '&' or 'x'
        elif re.search(r"\s+(&|x)\s+", artist, re.IGNORECASE):
            parts = re.split(r"\s+(&|x)\s+", artist, flags=re.IGNORECASE)
            # filter out connector tokens
            clean_parts = [p.strip() for p in parts if p.strip().lower() not in ["&", "x"]]
            if len(clean_parts) >= 2 and len(clean_parts[0]) >= 2:
                artist = clean_artist_string(clean_parts[0])
                for p in clean_parts[1:]:
                    f_clean = clean_artist_string(p)
                    if f_clean and f_clean.lower() != artist.lower():
                        featured_artists.append(f_clean)

    # Deduplicate featured artists preserving order
    unique_feats = []
    seen = {artist.lower()}
    for f in featured_artists:
        if f.lower() not in seen:
            seen.add(f.lower())
            unique_feats.append(f)

    return artist, unique_feats, title


def normalize_lyrics_fingerprint(lyrics: str) -> str:
    """Returns normalized alphanumeric text for fuzzy duplicate detection."""
    # Strip non-alphanumeric
    cleaned = re.sub(r"[^\w]", "", lyrics.lower())
    # Return first 350 characters
    return cleaned[:350]


def lyrics_similarity(l1: str, l2: str) -> float:
    """Calculates Levenshtein similarity ratio between two lyrics."""
    c1 = re.sub(r"[^\w]", "", l1.lower())[:500]
    c2 = re.sub(r"[^\w]", "", l2.lower())[:500]
    if not c1 or not c2:
        return 0.0
    return difflib.SequenceMatcher(None, c1, c2).ratio()


def run_pipeline(dry_run=False):
    print("=" * 70)
    print(" 🛠️ LYRIKSA — PIPELINE D'INGÉNIERIE & DÉDUPLICATION DES DONNÉES")
    print("=" * 70)

    if not os.path.exists(DB_PATH):
        print(f"[!] Database not found at: {DB_PATH}")
        return

    # 1. Safety Backup
    if not dry_run:
        print(f"[*] Creating safety backup: {os.path.basename(BACKUP_PATH)}...")
        shutil.copyfile(DB_PATH, BACKUP_PATH)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM songs")
    initial_song_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM artists")
    initial_artist_count = cur.fetchone()[0]

    print(f"[*] État initial : {initial_song_count} chansons, {initial_artist_count} artistes.")

    # ---------------------------------------------------------
    # STEP 1: PARSE ALL SONGS & EXTRACT FEATURINGS
    # ---------------------------------------------------------
    print("\n[*] Étape 1 : Analyse des featurings et normalisation des artistes...")
    cur.execute("SELECT id, title, slug, artist_id, artist_name, category, lyrics, url FROM songs")
    raw_songs = cur.fetchall()

    processed_songs = []
    feats_extracted_count = 0
    artists_to_upsert = {} # slug -> name

    for s_id, title, slug, artist_id, artist_name, category, lyrics, url in raw_songs:
        clean_artist, feats, clean_title = parse_collaborations(artist_name, title)
        
        primary_slug = slugify(clean_artist)
        artists_to_upsert[primary_slug] = clean_artist

        feat_slugs = []
        for f in feats:
            f_slug = slugify(f)
            artists_to_upsert[f_slug] = f
            feat_slugs.append((f_slug, f))
            feats_extracted_count += 1

        processed_songs.append({
            "id": s_id,
            "title": clean_title,
            "original_title": title,
            "slug": slug,
            "artist_id": primary_slug,
            "artist_name": clean_artist,
            "category": category,
            "lyrics": lyrics,
            "url": url,
            "featured": feat_slugs # list of (slug, name)
        })

    print(f"[✓] {feats_extracted_count} mentions de collaborations (Feat/Duo) extraites !")

    # ---------------------------------------------------------
    # STEP 2: DEDUPLICATION ENGINE
    # ---------------------------------------------------------
    print("\n[*] Étape 2 : Moteur de déduplication (Similarité de paroles & Titres)...")

    # Group by normalized lyrics fingerprint
    fingerprint_groups = defaultdict(list)
    for s in processed_songs:
        fp = normalize_lyrics_fingerprint(s["lyrics"])
        if len(fp) >= 50:
            fingerprint_groups[fp].append(s)

    merged_duplicates_count = 0
    songs_to_keep = {}
    duplicate_ids_to_remove = set()

    for fp, group in fingerprint_groups.items():
        if len(group) == 1:
            songs_to_keep[group[0]["id"]] = group[0]
        else:
            # Pairwise verify similarity
            primary = group[0]
            # Choose best primary: longest lyrics, no "-1" in slug if possible
            group_sorted = sorted(
                group,
                key=lambda x: (
                    not x["slug"].endswith("-1"),
                    not x["slug"].endswith("-2"),
                    len(x["lyrics"].split("\n\n")), # strophe count
                    len(x["lyrics"])
                ),
                reverse=True
            )
            winner = group_sorted[0]
            songs_to_keep[winner["id"]] = winner

            for candidate in group_sorted[1:]:
                sim = lyrics_similarity(winner["lyrics"], candidate["lyrics"])
                if sim >= 0.90:
                    # Verified duplicate!
                    duplicate_ids_to_remove.add(candidate["id"])
                    merged_duplicates_count += 1
                    # Merge any featured artists from candidate into winner
                    existing_feat_slugs = {f[0] for f in winner["featured"]}
                    for f in candidate["featured"]:
                        if f[0] not in existing_feat_slugs:
                            winner["featured"].append(f)
                            existing_feat_slugs.add(f[0])
                else:
                    songs_to_keep[candidate["id"]] = candidate

    # Also check songs that had very short lyrics (< 50 chars)
    for s in processed_songs:
        if s["id"] not in duplicate_ids_to_remove and s["id"] not in songs_to_keep:
            songs_to_keep[s["id"]] = s

    final_unique_songs = list(songs_to_keep.values())
    print(f"[✓] {merged_duplicates_count} doublons fusionnés et éliminés !")
    print(f"[✓] Catalogue épuré : {len(final_unique_songs)} chansons uniques conservées.")

    if dry_run:
        print("\n[DRY-RUN] Terminé sans modification de la base.")
        conn.close()
        return

    # ---------------------------------------------------------
    # STEP 3: APPLY DATABASE SCHEMA & DATA UPDATES
    # ---------------------------------------------------------
    print("\n[*] Étape 3 : Application des modifications dans la base SQLite...")

    # Create collaborations table
    cur.executescript("""
        CREATE TABLE IF NOT EXISTS song_collaborations (
            song_id TEXT NOT NULL,
            artist_id TEXT NOT NULL,
            artist_name TEXT NOT NULL,
            role TEXT NOT NULL, -- 'primary' ou 'featured'
            PRIMARY KEY(song_id, artist_id)
        );
        CREATE INDEX IF NOT EXISTS idx_collab_artist ON song_collaborations(artist_id);
        CREATE INDEX IF NOT EXISTS idx_collab_song ON song_collaborations(song_id);
    """)

    # Check if 'featured_artists' column exists in songs
    cur.execute("PRAGMA table_info(songs)")
    cols = [col[1] for col in cur.fetchall()]
    if "featured_artists" not in cols:
        cur.execute("ALTER TABLE songs ADD COLUMN featured_artists TEXT")

    # Clear existing collaborations table
    cur.execute("DELETE FROM song_collaborations")

    # Remove duplicates from songs table
    if duplicate_ids_to_remove:
        cur.executemany("DELETE FROM songs WHERE id = ?", [(did,) for did in duplicate_ids_to_remove])
        print(f"[✓] Supprimé {len(duplicate_ids_to_remove)} enregistrements doublons dans la table 'songs'.")

    # Update clean titles, primary artist, and featured artists in songs
    for s in final_unique_songs:
        feat_names = [f[1] for f in s["featured"]]
        feat_json = json.dumps(feat_names, ensure_ascii=False) if feat_names else None

        cur.execute("""
            UPDATE songs 
            SET title = ?, artist_id = ?, artist_name = ?, featured_artists = ?
            WHERE id = ?
        """, (s["title"], s["artist_id"], s["artist_name"], feat_json, s["id"]))

        # Insert primary collaboration
        cur.execute("""
            INSERT OR REPLACE INTO song_collaborations (song_id, artist_id, artist_name, role)
            VALUES (?, ?, ?, 'primary')
        """, (s["id"], s["artist_id"], s["artist_name"]))

        # Insert featured collaborations
        for f_slug, f_name in s["featured"]:
            cur.execute("""
                INSERT OR REPLACE INTO song_collaborations (song_id, artist_id, artist_name, role)
                VALUES (?, ?, ?, 'featured')
            """, (s["id"], f_slug, f_name))

    # Ensure all referenced artists exist in 'artists' table
    for a_slug, a_name in artists_to_upsert.items():
        cur.execute("""
            INSERT INTO artists (id, name, slug, category, song_count)
            VALUES (?, ?, ?, 'Variété Malagasy', 0)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name
        """, (a_slug, a_name, a_slug))

    # Recalculate accurate song counts for every artist (including featurings!)
    cur.execute("""
        UPDATE artists
        SET song_count = (
            SELECT COUNT(DISTINCT song_id)
            FROM song_collaborations
            WHERE song_collaborations.artist_id = artists.id
        )
    """)

    # Purge composite artists that have 0 songs left
    cur.execute("DELETE FROM artists WHERE song_count = 0")
    deleted_empty_artists = cur.rowcount
    print(f"[✓] Supprimé {deleted_empty_artists} faux artistes composites orphelins (ex: 'Tovo J\\'Hay feat \\'Zay').")

    conn.commit()

    cur.execute("SELECT COUNT(*) FROM songs")
    final_song_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM artists")
    final_artist_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM song_collaborations WHERE role = 'featured'")
    total_feat_links = cur.fetchone()[0]

    conn.close()

    # ---------------------------------------------------------
    # STEP 4: EXPORT TO SEED-SONGS.JSON FOR THE MOBILE APP
    # ---------------------------------------------------------
    print(f"\n[*] Étape 4 : Exportation dans {os.path.basename(JSON_PATH)}...")
    export_clean_json(DB_PATH, JSON_PATH)

    print("\n" + "=" * 70)
    print(" 🏆 BILAN DE L'INGÉNIERIE DES DONNÉES LYRIKSA")
    print("=" * 70)
    print(f"[*] Chansons : {initial_song_count} -> {final_song_count} (-{merged_duplicates_count} doublons éliminés)")
    print(f"[*] Artistes : {initial_artist_count} -> {final_artist_count} (-{deleted_empty_artists} faux artistes supprimés)")
    print(f"[*] Collaborations actives créées : {total_feat_links} duos multi-artistes")
    print(f"[✓] Base SQLite : {DB_PATH}")
    print(f"[✓] JSON Seed : {JSON_PATH}")


def export_clean_json(db_path, json_path):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute("SELECT id, name, slug, category, song_count FROM artists WHERE song_count > 0 ORDER BY song_count DESC, name ASC")
    artists = []
    for row in cur.fetchall():
        artists.append({
            "id": row[0],
            "name": row[1],
            "slug": row[2],
            "category": row[3],
            "song_count": row[4]
        })

    cur.execute("""
        SELECT id, title, slug, artist_id, artist_name, category, lyrics, url, featured_artists 
        FROM songs 
        ORDER BY title ASC
    """)
    songs = []
    for row in cur.fetchall():
        feat_list = json.loads(row[8]) if row[8] else []
        songs.append({
            "id": row[0],
            "title": row[1],
            "slug": row[2],
            "artist_id": row[3],
            "artist_name": row[4],
            "category": row[5],
            "lyrics": row[6],
            "url": row[7],
            "featured_artists": feat_list
        })

    cur.execute("SELECT song_id, artist_id, artist_name, role FROM song_collaborations WHERE role = 'featured'")
    collaborations = []
    for row in cur.fetchall():
        collaborations.append({
            "song_id": row[0],
            "artist_id": row[1],
            "artist_name": row[2],
            "role": row[3]
        })

    conn.close()

    output = {
        "generated_at": "2026-11-24T20:45:00Z",
        "total_artists": len(artists),
        "total_songs": len(songs),
        "total_collaborations": len(collaborations),
        "artists": artists,
        "songs": songs,
        "collaborations": collaborations
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"[✓] Exporté avec succès : {len(songs)} chansons, {len(artists)} artistes, {len(collaborations)} collaborations.")


if __name__ == "__main__":
    import sys
    dry_run = "--dry-run" in sys.argv
    run_pipeline(dry_run=dry_run)
