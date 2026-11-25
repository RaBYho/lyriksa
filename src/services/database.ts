import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

export interface Song {
  id: string;
  title: string;
  slug: string;
  artist_id: string;
  artist_name: string;
  category: string;
  lyrics: string;
  url?: string;
  is_favorite?: boolean;
  snippet?: string;
  featured_artists?: string[];
}

export interface Artist {
  id: string;
  name: string;
  slug: string;
  category: string;
  song_count: number;
  is_favorite?: boolean;
  is_song_derived?: boolean;
}

export interface Collaboration {
  song_id: string;
  artist_id: string;
  artist_name: string;
  role: 'primary' | 'featured';
}

export interface SongQueryParams {
  limit?: number;
  offset?: number;
  search?: string;
  category?: string;
  sort?: 'all' | 'recent';
}

export interface PaginatedSongsResult {
  songs: Song[];
  total: number;
  hasMore: boolean;
}

export interface UnifiedSearchResults {
  artists: Artist[];
  titleSongs: Song[];
  lyricsSongs: Song[];
  counts: {
    artists: number;
    titles: number;
    lyrics: number;
    total: number;
  };
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type LyricsAlign = 'left' | 'center';

export interface AppSettings {
  themeMode: ThemeMode;
  keepAwake: boolean;
  highContrast: boolean;
  defaultFontSize: number;
  defaultScrollSpeed: number;
  lyricsAlign: LyricsAlign;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  themeMode: 'system',
  keepAwake: true,
  highContrast: false,
  defaultFontSize: 18,
  defaultScrollSpeed: 1,
  lyricsAlign: 'left',
};

export interface UserDataCounts {
  favoriteSongs: number;
  favoriteArtists: number;
  songHistory: number;
  searchHistory: number;
}

let dbInstance: SQLite.SQLiteDatabase | null = null;
let isInitialized = false;
let initPromise: Promise<void> | null = null;
const CURRENT_SEED_VERSION = '3.4';

// In-memory fallback for web or when sqlite is not yet ready
let memoryFavorites = new Set<string>();
let memoryFavoriteArtists = new Set<string>();
let memoryHistory: { songId: string; openedAt: number }[] = [];
let memorySearchHistory: { query: string; searchedAt: number }[] = [];
let memoryAppSettings: AppSettings = { ...DEFAULT_APP_SETTINGS };

// Lazy-loaded seed data (only imported if SQLite is not available or seeding is needed)
let _cachedSeedData: any = null;
function getSeedData(): any {
  if (!_cachedSeedData) {
    _cachedSeedData = require('../../assets/data/seed-songs.json');
  }
  return _cachedSeedData;
}

function mapSongRow(row: any): Song {
  let featured_artists: string[] | undefined = undefined;
  if (row.featured_artists) {
    if (Array.isArray(row.featured_artists)) {
      featured_artists = row.featured_artists;
    } else if (typeof row.featured_artists === 'string') {
      try {
        const parsed = JSON.parse(row.featured_artists);
        if (Array.isArray(parsed)) {
          featured_artists = parsed.filter(Boolean);
        }
      } catch {
        featured_artists = undefined;
      }
    }
  }

  // Filter out the primary artist from featured_artists (preventing Artist feat. Artist bug)
  if (featured_artists && row.artist_name) {
    const mainArtist = row.artist_name.toLowerCase().trim();
    featured_artists = featured_artists.filter(
      (a: string) => a && a.toLowerCase().trim() !== mainArtist
    );
  }

  return {
    ...row,
    is_favorite: Boolean(row.is_favorite),
    featured_artists: featured_artists && featured_artists.length > 0 ? featured_artists : undefined,
  };
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  if (!dbInstance) {
    try {
      dbInstance = await SQLite.openDatabaseAsync('lyriksa.db');
    } catch (err) {
      console.warn('Failed to open SQLite database:', err);
      return null;
    }
  }
  return dbInstance;
}

/**
 * Ultra-fast batched database seeder
 * Uses a single transaction + multi-row chunked statements to insert 17k+ records in ~250ms
 */
async function seedDatabaseFast(db: SQLite.SQLiteDatabase): Promise<void> {
  const seed = getSeedData();
  const CHUNK_SIZE = 50;

  await db.withTransactionAsync(async () => {
    // 1. Clear previous catalog
    await db.execAsync(`
      DELETE FROM song_collaborations;
      DELETE FROM songs;
      DELETE FROM artists;
    `);

    // 2. Insert Artists in batches of 50
    const artists = seed.artists;
    for (let i = 0; i < artists.length; i += CHUNK_SIZE) {
      const chunk = artists.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const params: any[] = [];
      for (const a of chunk) {
        params.push(a.id, a.name, a.slug, a.category, a.song_count);
      }
      await db.runAsync(`INSERT OR REPLACE INTO artists VALUES ${placeholders}`, ...params);
    }

    // 3. Insert Songs in batches of 50
    const songs = seed.songs;
    for (let i = 0; i < songs.length; i += CHUNK_SIZE) {
      const chunk = songs.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const params: any[] = [];
      for (const s of chunk) {
        const featJson =
          s.featured_artists && s.featured_artists.length > 0
            ? JSON.stringify(s.featured_artists)
            : null;
        params.push(
          s.id,
          s.title,
          s.slug,
          s.artist_id,
          s.artist_name,
          s.category,
          s.lyrics,
          s.url || null,
          featJson
        );
      }
      await db.runAsync(
        `INSERT OR REPLACE INTO songs (id, title, slug, artist_id, artist_name, category, lyrics, url, featured_artists) VALUES ${placeholders}`,
        ...params
      );
    }

    // 4. Insert Primary Collaborations in batches of 50
    for (let i = 0; i < songs.length; i += CHUNK_SIZE) {
      const chunk = songs.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
      const params: any[] = [];
      for (const s of chunk) {
        params.push(s.id, s.artist_id, s.artist_name, 'primary');
      }
      await db.runAsync(
        `INSERT OR REPLACE INTO song_collaborations (song_id, artist_id, artist_name, role) VALUES ${placeholders}`,
        ...params
      );
    }

    // 5. Insert Featured Collaborations in batches of 50
    const collabs = seed.collaborations || [];
    for (let i = 0; i < collabs.length; i += CHUNK_SIZE) {
      const chunk = collabs.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
      const params: any[] = [];
      for (const c of chunk) {
        params.push(c.song_id, c.artist_id, c.artist_name, c.role || 'featured');
      }
      await db.runAsync(
        `INSERT OR REPLACE INTO song_collaborations (song_id, artist_id, artist_name, role) VALUES ${placeholders}`,
        ...params
      );
    }

    // 6. Record version
    await db.runAsync(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('seed_version', ?)",
      CURRENT_SEED_VERSION
    );
  });
}

export async function initDatabase(): Promise<void> {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const db = await getDatabase();
    if (!db) {
      isInitialized = true;
      return;
    }

    try {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA temp_store = MEMORY;
        PRAGMA cache_size = -64000;

        CREATE TABLE IF NOT EXISTS artists (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT NOT NULL,
          category TEXT,
          song_count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS songs (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          slug TEXT NOT NULL,
          artist_id TEXT NOT NULL,
          artist_name TEXT NOT NULL,
          category TEXT,
          lyrics TEXT NOT NULL,
          url TEXT,
          featured_artists TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(artist_id) REFERENCES artists(id)
        );

        CREATE TABLE IF NOT EXISTS song_collaborations (
          song_id TEXT NOT NULL,
          artist_id TEXT NOT NULL,
          artist_name TEXT NOT NULL,
          role TEXT NOT NULL,
          PRIMARY KEY (song_id, artist_id),
          FOREIGN KEY(song_id) REFERENCES songs(id)
        );

        CREATE TABLE IF NOT EXISTS favorites (
          song_id TEXT PRIMARY KEY,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(song_id) REFERENCES songs(id)
        );

        CREATE TABLE IF NOT EXISTS favorite_artists (
          artist_id TEXT PRIMARY KEY,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(artist_id) REFERENCES artists(id)
        );

        CREATE TABLE IF NOT EXISTS song_history (
          song_id TEXT PRIMARY KEY,
          opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(song_id) REFERENCES songs(id)
        );

        CREATE TABLE IF NOT EXISTS search_history (
          query TEXT PRIMARY KEY,
          searched_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_songs_artist_id ON songs(artist_id);
        CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
        CREATE INDEX IF NOT EXISTS idx_collab_artist_id ON song_collaborations(artist_id);
        CREATE INDEX IF NOT EXISTS idx_collab_song_id ON song_collaborations(song_id);
        CREATE INDEX IF NOT EXISTS idx_artists_song_count ON artists(song_count DESC);
        CREATE INDEX IF NOT EXISTS idx_favorites_song_id ON favorites(song_id);
        CREATE INDEX IF NOT EXISTS idx_fav_artists_id ON favorite_artists(artist_id);
        CREATE INDEX IF NOT EXISTS idx_history_opened_at ON song_history(opened_at DESC);
        CREATE INDEX IF NOT EXISTS idx_search_history_at ON search_history(searched_at DESC);
      `);

      // Ensure featured_artists column exists on legacy tables
      try {
        const tableInfo = await db.getAllAsync<{ name: string }>('PRAGMA table_info(songs)');
        const hasFeaturedCol = tableInfo.some(col => col.name === 'featured_artists');
        if (!hasFeaturedCol) {
          await db.execAsync('ALTER TABLE songs ADD COLUMN featured_artists TEXT;');
        }
      } catch (err) {
        console.warn('Column check warning:', err);
      }

      const currentVer = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM app_meta WHERE key = 'seed_version'"
      );

      if (!currentVer || currentVer.value !== CURRENT_SEED_VERSION) {
        await seedDatabaseFast(db);
      }

      // Auto-cleanup: fix any blank titles from previous seeds
      try {
        await db.runAsync(`
          UPDATE songs
          SET title = 'Faneva (Mitsangàna)',
              slug = 'faneva-mitsangana',
              artist_id = 'akonny-famonjena',
              artist_name = "Akon'ny Famonjena",
              category = 'Hira Fiderana / Gospel'
          WHERE id = 'faneva-mitsangàna-akonny-famonjena-item' OR TRIM(COALESCE(title, '')) = '';
        `);
        await db.runAsync(`
          DELETE FROM artists WHERE id = 'faneva-mitsangàna-akonny-famonjena';
        `);
      } catch (err) {
        console.warn('Data cleanup warning:', err);
      }
    } catch (err) {
      console.error('Error initializing database:', err);
    } finally {
      isInitialized = true;
    }
  })().finally(() => {
    initPromise = null;
  });

  return initPromise;
}

export async function getTopArtists(): Promise<Artist[]> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      const rows = await db.getAllAsync<any>(
        `SELECT a.*, CASE WHEN fa.artist_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
         FROM artists a
         LEFT JOIN favorite_artists fa ON (a.id = fa.artist_id OR a.slug = fa.artist_id)
         ORDER BY a.song_count DESC`
      );
      if (rows && rows.length > 0) {
        return rows.map(r => ({ ...r, is_favorite: Boolean(r.is_favorite) }));
      }
    } catch (err) {
      console.warn('Error fetching artists from db:', err);
    }
  }
  return (getSeedData().artists as Artist[]).map(a => ({
    ...a,
    is_favorite: memoryFavoriteArtists.has(a.id) || memoryFavoriteArtists.has(a.slug),
  }));
}

export async function getFavoriteArtists(
  limit = 10
): Promise<{ artists: Artist[]; isFallback: boolean }> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      // 1. Explicitly favorited artists first
      const explicitRows = await db.getAllAsync<any>(
        `SELECT a.id, a.name, a.slug, a.category, a.song_count, 1 as is_favorite
         FROM artists a
         JOIN favorite_artists fa ON (a.id = fa.artist_id OR a.slug = fa.artist_id)
         ORDER BY fa.created_at DESC, fa.rowid DESC
         LIMIT ?`,
        limit
      );
      const explicitArtists: Artist[] = explicitRows.map(r => ({
        ...r,
        is_favorite: true,
        is_song_derived: false,
      }));

      if (explicitArtists.length >= limit) {
        return {
          artists: explicitArtists,
          isFallback: false,
        };
      }

      // 2. Complement remaining slots with artists from the user's favorite songs
      const remaining = limit - explicitArtists.length;
      const excludeKeys = new Set<string>();
      explicitArtists.forEach(a => {
        excludeKeys.add(a.id);
        excludeKeys.add(a.slug);
      });

      const songDerivedRows = await db.getAllAsync<any>(
        `SELECT a.id, a.name, a.slug, a.category, a.song_count, 0 as is_favorite
         FROM artists a
         JOIN song_collaborations c ON c.artist_id = a.id OR c.artist_id = a.slug
         JOIN favorites f ON c.song_id = f.song_id
         GROUP BY a.id
         ORDER BY COUNT(f.song_id) DESC, a.song_count DESC
         LIMIT ?`,
        limit + excludeKeys.size
      );

      const derivedArtists: Artist[] = songDerivedRows
        .filter(r => !excludeKeys.has(r.id) && !excludeKeys.has(r.slug))
        .slice(0, remaining)
        .map(r => ({
          ...r,
          is_favorite: false,
          is_song_derived: true,
        }));

      const combined = [...explicitArtists, ...derivedArtists];
      if (combined.length > 0) {
        return {
          artists: combined,
          isFallback: false,
        };
      }
    } catch (err) {
      console.warn('Error fetching favorite artists from db:', err);
    }
  }

  // Memory fallback: merge explicit favorites + song-derived artists
  const seed = getSeedData();
  const explicit = (seed.artists as Artist[])
    .filter(a => memoryFavoriteArtists.has(a.id) || memoryFavoriteArtists.has(a.slug))
    .slice(0, limit)
    .map(a => ({ ...a, is_favorite: true, is_song_derived: false }));

  const explicitIds = new Set(explicit.flatMap(a => [a.id, a.slug]));
  let derived: Artist[] = [];

  if (explicit.length < limit && memoryFavorites.size > 0) {
    const favSongIds = Array.from(memoryFavorites);
    const favSongs = seed.songs.filter((s: any) => favSongIds.includes(s.id));
    const counts = new Map<string, number>();
    favSongs.forEach((s: any) => {
      counts.set(s.artist_id, (counts.get(s.artist_id) || 0) + 1);
    });
    derived = (seed.artists as Artist[])
      .filter(
        a =>
          !explicitIds.has(a.id) &&
          !explicitIds.has(a.slug) &&
          (counts.has(a.id) || counts.has(a.slug))
      )
      .sort((a, b) => {
        const ca = counts.get(a.id) ?? counts.get(a.slug) ?? 0;
        const cb = counts.get(b.id) ?? counts.get(b.slug) ?? 0;
        if (cb !== ca) return cb - ca;
        return b.song_count - a.song_count;
      })
      .slice(0, limit - explicit.length)
      .map(a => ({ ...a, is_favorite: false, is_song_derived: true }));
  }

  const merged = [...explicit, ...derived];
  if (merged.length > 0) {
    return { artists: merged, isFallback: false };
  }

  // Graceful fallback to top artists if no favorites yet
  const topArtists = await getTopArtists();
  return { artists: topArtists.slice(0, limit), isFallback: true };
}

export async function getFavoriteArtistsList(): Promise<Artist[]> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      const rows = await db.getAllAsync<any>(
        `SELECT a.id, a.name, a.slug, a.category, a.song_count, 1 as is_favorite
         FROM artists a
         JOIN favorite_artists fa ON (a.id = fa.artist_id OR a.slug = fa.artist_id)
         ORDER BY fa.created_at DESC, fa.rowid DESC`
      );
      return rows.map(r => ({ ...r, is_favorite: true }));
    } catch (err) {
      console.warn('Error fetching favorite artists list from db:', err);
    }
  }

  const seed = getSeedData();
  const favIds = Array.from(memoryFavoriteArtists).reverse();
  const byKey = new Map<string, Artist>();
  (seed.artists as Artist[]).forEach(a => {
    byKey.set(a.id, a);
    byKey.set(a.slug, a);
  });
  const seen = new Set<string>();
  const result: Artist[] = [];
  for (const key of favIds) {
    const artist = byKey.get(key);
    if (artist && !seen.has(artist.id)) {
      seen.add(artist.id);
      result.push({ ...artist, is_favorite: true });
    }
  }
  return result;
}

export async function getArtistById(artistId: string): Promise<{ artist: Artist | null; songs: Song[] }> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      const artist = await db.getFirstAsync<Artist>('SELECT * FROM artists WHERE id = ? OR slug = ?', artistId, artistId);
      const targetId = artist?.id || artistId;
      const targetSlug = artist?.slug || artistId;

      const favArtist = await db.getFirstAsync<{ artist_id: string }>(
        'SELECT artist_id FROM favorite_artists WHERE artist_id = ? OR artist_id = ?',
        targetId,
        targetSlug
      );

      const rows = await db.getAllAsync<Song>(
        `SELECT DISTINCT s.*, CASE WHEN f.song_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
         FROM songs s
         LEFT JOIN song_collaborations c ON s.id = c.song_id
         LEFT JOIN favorites f ON s.id = f.song_id
         WHERE s.artist_id = ? OR s.artist_id = ? OR c.artist_id = ? OR c.artist_id = ?
         ORDER BY s.title ASC`,
        targetId,
        targetSlug,
        targetId,
        targetSlug
      );
      return {
        artist: artist ? { ...artist, is_favorite: Boolean(favArtist) } : null,
        songs: rows.map(mapSongRow),
      };
    } catch (err) {
      console.warn('Error fetching artist songs from db:', err);
    }
  }

  const seed = getSeedData();
  const artist = (seed.artists.find((a: any) => a.id === artistId || a.slug === artistId) as Artist) || null;
  const targetId = artist?.id || artistId;
  const targetName = artist?.name.toLowerCase();

  const collabSongIds = new Set(
    (seed.collaborations || [])
      .filter((c: any) => c.artist_id === targetId || (targetName && c.artist_name.toLowerCase() === targetName))
      .map((c: any) => c.song_id)
  );

  const songs = seed.songs
    .filter((s: any) =>
      s.artist_id === targetId ||
      (targetName && s.artist_name.toLowerCase() === targetName) ||
      collabSongIds.has(s.id) ||
      (targetName && s.featured_artists?.some((f: any) => f.toLowerCase() === targetName))
    )
    .map((s: any) => mapSongRow({
      ...s,
      is_favorite: memoryFavorites.has(s.id),
    }));

  return {
    artist: artist
      ? {
          ...artist,
          is_favorite: memoryFavoriteArtists.has(artist.id) || memoryFavoriteArtists.has(artist.slug),
        }
      : null,
    songs,
  };
}

export async function getAllSongs(limit?: number): Promise<Song[]> {
  await initDatabase();
  const db = await getDatabase();
  const safeLimit =
    typeof limit === 'number' && Number.isFinite(limit) && limit > 0
      ? Math.floor(limit)
      : null;

  if (db) {
    try {
      const baseQuery = `
        SELECT s.id, s.title, s.slug, s.artist_id, s.artist_name, s.category, '' as lyrics,
               CASE WHEN f.song_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
               (
                 SELECT json_group_array(a.name)
                 FROM song_collaborations sc
                 JOIN artists a ON sc.artist_id = a.id
                 WHERE sc.song_id = s.id AND sc.role = 'featured'
               ) as featured_artists
        FROM songs s
        LEFT JOIN favorites f ON s.id = f.song_id
        ORDER BY s.title COLLATE NOCASE ASC
      `;
      const rows =
        safeLimit !== null
          ? await db.getAllAsync<any>(`${baseQuery} LIMIT ?`, safeLimit)
          : await db.getAllAsync<any>(baseQuery);
      return rows.map(mapSongRow);
    } catch (err) {
      console.warn('Error getting all songs from db:', err);
    }
  }

  const seed = getSeedData().songs;
  const list = safeLimit !== null ? seed.slice(0, safeLimit) : seed;
  return list.map((s: any) =>
    mapSongRow({
      ...s,
      is_favorite: memoryFavorites.has(s.id),
    })
  );
}

export async function getTrendingSongs(limit = 10): Promise<Song[]> {
  return getAllSongs(limit);
}

export async function getSongCategoryCounts(): Promise<Record<string, number>> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      const row = await db.getFirstAsync<any>(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN category LIKE '%folk%' OR category LIKE '%acoustic%' THEN 1 ELSE 0 END) as folk,
          SUM(CASE WHEN category LIKE '%rock%' OR category LIKE '%pop%' THEN 1 ELSE 0 END) as rock,
          SUM(CASE WHEN category LIKE '%fiderana%' OR category LIKE '%gospel%' THEN 1 ELSE 0 END) as fiderana,
          SUM(CASE WHEN category LIKE '%kalo%' OR category LIKE '%classique%' OR category LIKE '%romantique%' THEN 1 ELSE 0 END) as kalos,
          SUM(CASE WHEN category LIKE '%vako%' OR category LIKE '%salegy%' THEN 1 ELSE 0 END) as vakodrazana
        FROM songs
      `);
      if (row) {
        return {
          rehetra: row.total || 0,
          folk: row.folk || 0,
          rock: row.rock || 0,
          fiderana: row.fiderana || 0,
          kalos: row.kalos || 0,
          vakodrazana: row.vakodrazana || 0,
        };
      }
    } catch (err) {
      console.warn('Error getting category counts:', err);
    }
  }

  const all = getSeedData().songs;
  return {
    rehetra: all.length,
    folk: all.filter((s: any) => (s.category || '').toLowerCase().includes('folk')).length,
    rock: all.filter((s: any) => (s.category || '').toLowerCase().includes('rock')).length,
    fiderana: all.filter((s: any) => (s.category || '').toLowerCase().includes('fiderana')).length,
    kalos: all.filter((s: any) => (s.category || '').toLowerCase().includes('kalo')).length,
    vakodrazana: all.filter((s: any) => (s.category || '').toLowerCase().includes('vako')).length,
  };
}

export async function getSongsPaginated(params: SongQueryParams = {}): Promise<PaginatedSongsResult> {
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const search = (params.search || '').trim().toLowerCase();
  const category = params.category || 'rehetra';
  const sort = params.sort || 'all';

  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      const conditions: string[] = ["TRIM(COALESCE(s.title, '')) != ''"];
      const args: any[] = [];

      if (search) {
        conditions.push("(s.title LIKE ? ESCAPE '\\' OR s.artist_name LIKE ? ESCAPE '\\')");
        const q = `%${escapeLikePattern(search)}%`;
        args.push(q, q);
      }

      if (category === 'folk') {
        conditions.push('(s.category LIKE "%folk%" OR s.category LIKE "%acoustic%")');
      } else if (category === 'rock') {
        conditions.push('(s.category LIKE "%rock%" OR s.category LIKE "%pop%")');
      } else if (category === 'fiderana') {
        conditions.push('(s.category LIKE "%fiderana%" OR s.category LIKE "%gospel%")');
      } else if (category === 'kalos') {
        conditions.push('(s.category LIKE "%kalo%" OR s.category LIKE "%classique%" OR s.category LIKE "%romantique%")');
      } else if (category === 'vakodrazana') {
        conditions.push('(s.category LIKE "%vako%" OR s.category LIKE "%salegy%")');
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const orderClause = sort === 'recent' ? 'ORDER BY s.rowid DESC' : 'ORDER BY s.title COLLATE NOCASE ASC';

      const countRes = await db.getFirstAsync<{ total: number }>(
        `SELECT COUNT(*) as total FROM songs s ${whereClause}`,
        ...args
      );
      const total = countRes?.total ?? 0;

      const rows = await db.getAllAsync<any>(
        `SELECT s.id, s.title, s.slug, s.artist_id, s.artist_name, s.category, '' as lyrics,
                CASE WHEN f.song_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
                (
                  SELECT json_group_array(a.name)
                  FROM song_collaborations sc
                  JOIN artists a ON sc.artist_id = a.id
                  WHERE sc.song_id = s.id AND sc.role = 'featured'
                ) as featured_artists
         FROM songs s
         LEFT JOIN favorites f ON s.id = f.song_id
         ${whereClause}
         ${orderClause}
         LIMIT ? OFFSET ?`,
        ...args,
        limit,
        offset
      );

      const songs = rows.map(mapSongRow);
      return {
        songs,
        total,
        hasMore: offset + songs.length < total,
      };
    } catch (err) {
      console.warn('Error in getSongsPaginated:', err);
    }
  }

  // Fallback
  const seed = getSeedData().songs;
  let filtered = seed;
  if (search) {
    filtered = filtered.filter(
      (s: any) =>
        s.title.toLowerCase().includes(search) ||
        s.artist_name.toLowerCase().includes(search)
    );
  }
  if (category !== 'rehetra') {
    filtered = filtered.filter((s: any) => {
      const c = (s.category || '').toLowerCase();
      if (category === 'folk') return c.includes('folk') || c.includes('acoustic');
      if (category === 'rock') return c.includes('rock') || c.includes('pop');
      if (category === 'fiderana') return c.includes('fiderana') || c.includes('gospel');
      if (category === 'kalos') return c.includes('kalo') || c.includes('classique') || c.includes('romantique');
      if (category === 'vakodrazana') return c.includes('vako') || c.includes('salegy');
      return true;
    });
  }

  if (sort === 'recent') {
    filtered = [...filtered].reverse();
  } else {
    filtered = [...filtered].sort((a: any, b: any) => a.title.localeCompare(b.title));
  }

  const total = filtered.length;
  const paged = filtered.slice(offset, offset + limit).map((s: any) =>
    mapSongRow({
      ...s,
      is_favorite: memoryFavorites.has(s.id),
    })
  );

  return {
    songs: paged,
    total,
    hasMore: offset + paged.length < total,
  };
}

export async function getRecentSongs(limit = 10): Promise<Song[]> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      const rows = await db.getAllAsync<any>(
        `SELECT s.id, s.title, s.slug, s.artist_id, s.artist_name, s.category, '' as lyrics,
                CASE WHEN f.song_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
                (
                  SELECT json_group_array(a.name)
                  FROM song_collaborations sc
                  JOIN artists a ON sc.artist_id = a.id
                  WHERE sc.song_id = s.id AND sc.role = 'featured'
                ) as featured_artists
         FROM songs s
         LEFT JOIN favorites f ON s.id = f.song_id
         ORDER BY s.rowid DESC
         LIMIT ?`,
        limit
      );
      return rows.map(mapSongRow);
    } catch (err) {
      console.warn('Error getting recent songs from db:', err);
    }
  }

  return [...getSeedData().songs].reverse().slice(0, limit).map((s: any) =>
    mapSongRow({
      ...s,
      is_favorite: memoryFavorites.has(s.id),
    })
  );
}

export async function recordSongHistory(songId: string): Promise<void> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      await db.runAsync(
        'INSERT OR REPLACE INTO song_history (song_id, opened_at) VALUES (?, CURRENT_TIMESTAMP)',
        songId
      );
      return;
    } catch (err) {
      console.warn('Error recording song history in db:', err);
    }
  }

  memoryHistory = [
    { songId, openedAt: Date.now() },
    ...memoryHistory.filter(h => h.songId !== songId),
  ].slice(0, 50);
}

export async function getRecentlyOpenedSongs(limit = 6): Promise<Song[]> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      const rows = await db.getAllAsync<Song>(
        `SELECT s.*, CASE WHEN f.song_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
         FROM song_history h
         JOIN songs s ON s.id = h.song_id
         LEFT JOIN favorites f ON s.id = f.song_id
         ORDER BY h.opened_at DESC
         LIMIT ?`,
        limit
      );
      return rows.map(mapSongRow);
    } catch (err) {
      console.warn('Error getting recently opened songs from db:', err);
    }
  }

  const seed = getSeedData();
  const ids = memoryHistory.slice(0, limit).map(h => h.songId);
  return ids
    .map(id => seed.songs.find((s: any) => s.id === id))
    .filter((s): s is (typeof seed.songs)[0] => Boolean(s))
    .map(s =>
      mapSongRow({
        ...s,
        is_favorite: memoryFavorites.has(s.id),
      })
    );
}

export async function clearSongHistory(): Promise<void> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      await db.runAsync('DELETE FROM song_history');
      return;
    } catch (err) {
      console.warn('Error clearing song history in db:', err);
    }
  }
  memoryHistory = [];
}

export async function getSearchHistory(limit = 12): Promise<string[]> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      const rows = await db.getAllAsync<{ query: string }>(
        `SELECT query FROM search_history ORDER BY searched_at DESC LIMIT ?`,
        limit
      );
      return rows.map(r => r.query);
    } catch (err) {
      console.warn('Error getting search history from db:', err);
    }
  }
  return memorySearchHistory.slice(0, limit).map(h => h.query);
}

export async function recordSearchHistory(rawQuery: string): Promise<void> {
  const cleaned = rawQuery.trim();
  if (!cleaned) return;
  const now = Date.now();

  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      await db.runAsync('DELETE FROM search_history WHERE LOWER(query) = LOWER(?)', cleaned);
      await db.runAsync(
        'INSERT OR REPLACE INTO search_history (query, searched_at) VALUES (?, ?)',
        cleaned,
        now
      );
      await db.runAsync(
        `DELETE FROM search_history WHERE query NOT IN (
          SELECT query FROM search_history ORDER BY searched_at DESC LIMIT 20
        )`
      );
      return;
    } catch (err) {
      console.warn('Error recording search history in db:', err);
    }
  }

  memorySearchHistory = [
    { query: cleaned, searchedAt: now },
    ...memorySearchHistory.filter(h => h.query.toLowerCase() !== cleaned.toLowerCase()),
  ].slice(0, 20);
}

export async function removeSearchHistoryItem(rawQuery: string): Promise<void> {
  const cleaned = rawQuery.trim();
  if (!cleaned) return;

  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      await db.runAsync('DELETE FROM search_history WHERE LOWER(query) = LOWER(?)', cleaned);
      return;
    } catch (err) {
      console.warn('Error removing search history item in db:', err);
    }
  }
  memorySearchHistory = memorySearchHistory.filter(
    h => h.query.toLowerCase() !== cleaned.toLowerCase()
  );
}

export async function clearSearchHistory(): Promise<void> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      await db.runAsync('DELETE FROM search_history');
      return;
    } catch (err) {
      console.warn('Error clearing search history in db:', err);
    }
  }
  memorySearchHistory = [];
}

export async function getSongById(songId: string): Promise<Song | null> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      const song = await db.getFirstAsync<Song>(
        `SELECT s.*, CASE WHEN f.song_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
         FROM songs s
         LEFT JOIN favorites f ON s.id = f.song_id
         WHERE s.id = ?`,
        songId
      );
      if (song) {
        return mapSongRow(song);
      }
    } catch (err) {
      console.warn('Error getting song from db:', err);
    }
  }

  const found = getSeedData().songs.find((s: any) => s.id === songId);
  if (!found) return null;
  return mapSongRow({ ...found, is_favorite: memoryFavorites.has(found.id) });
}

function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, ch => `\\${ch}`);
}

export async function searchSongs(
  query: string,
  filterType: 'all' | 'title' | 'artist' | 'lyrics' = 'all'
): Promise<Song[]> {
  await initDatabase();
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const escapedLike = `%${escapeLikePattern(q)}%`;
  const db = await getDatabase();
  if (db) {
    try {
      let sql = `
        SELECT s.*, CASE WHEN f.song_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
        FROM songs s
        LEFT JOIN favorites f ON s.id = f.song_id
        WHERE 
      `;
      let params: string[] = [];

      if (filterType === 'title') {
        sql += `LOWER(s.title) LIKE ? ESCAPE '\\'`;
        params.push(escapedLike);
      } else if (filterType === 'artist') {
        sql += `(LOWER(s.artist_name) LIKE ? ESCAPE '\\' OR (s.featured_artists IS NOT NULL AND LOWER(s.featured_artists) LIKE ? ESCAPE '\\'))`;
        params.push(escapedLike, escapedLike);
      } else if (filterType === 'lyrics') {
        sql += `LOWER(s.lyrics) LIKE ? ESCAPE '\\'`;
        params.push(escapedLike);
      } else {
        sql += `(LOWER(s.title) LIKE ? ESCAPE '\\' OR LOWER(s.artist_name) LIKE ? ESCAPE '\\' OR (s.featured_artists IS NOT NULL AND LOWER(s.featured_artists) LIKE ? ESCAPE '\\') OR LOWER(s.lyrics) LIKE ? ESCAPE '\\')`;
        params.push(escapedLike, escapedLike, escapedLike, escapedLike);
      }

      sql += ` ORDER BY CASE WHEN LOWER(s.title) LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, s.title ASC LIMIT 40`;
      params.push(escapedLike);

      const rows = await db.getAllAsync<Song>(sql, ...params);
      return rows.map(s => {
        const mapped = mapSongRow(s);
        const snippet = extractSnippet(s.lyrics, q);
        return {
          ...mapped,
          snippet: snippet || undefined,
        };
      });
    } catch (err) {
      console.warn('Error searching db:', err);
    }
  }

  // Fallback search in JSON
  const filtered = getSeedData().songs.filter((s: any) => {
    const titleMatch = s.title.toLowerCase().includes(q);
    const featMatch = s.featured_artists?.some((f: any) => f.toLowerCase().includes(q)) ?? false;
    const artistMatch = s.artist_name.toLowerCase().includes(q) || featMatch;
    const lyricsMatch = s.lyrics.toLowerCase().includes(q);

    if (filterType === 'title') return titleMatch;
    if (filterType === 'artist') return artistMatch;
    if (filterType === 'lyrics') return lyricsMatch;
    return titleMatch || artistMatch || lyricsMatch;
  });

  return filtered.map((s: any) => {
    const mapped = mapSongRow({
      ...s,
      is_favorite: memoryFavorites.has(s.id),
    });
    return {
      ...mapped,
      snippet: extractSnippet(s.lyrics, q) || undefined,
    };
  });
}

function extractSnippet(lyrics: string, query: string): string | null {
  if (!lyrics || !query) return null;
  const lines = lyrics.split('\n');
  const q = query.toLowerCase();
  for (const line of lines) {
    const trimmed = line.trim();
    const idx = trimmed.toLowerCase().indexOf(q);
    if (idx !== -1) {
      if (trimmed.length <= 105) {
        return trimmed;
      }
      const start = Math.max(0, idx - 35);
      const end = Math.min(trimmed.length, idx + q.length + 55);
      const prefix = start > 0 ? '...' : '';
      const suffix = end < trimmed.length ? '...' : '';
      return `${prefix}${trimmed.slice(start, end).trim()}${suffix}`;
    }
  }
  return null;
}

export async function searchCatalog(
  query: string,
  limitPerCategory = 50
): Promise<UnifiedSearchResults> {
  await initDatabase();
  const q = query.trim().toLowerCase();
  if (!q) {
    return {
      artists: [],
      titleSongs: [],
      lyricsSongs: [],
      counts: { artists: 0, titles: 0, lyrics: 0, total: 0 },
    };
  }

  const escapedQ = escapeLikePattern(q);
  const likePattern = `%${escapedQ}%`;
  const prefixPattern = `${escapedQ}%`;
  const db = await getDatabase();

  if (db) {
    try {
      const [
        artistCountRow,
        artistRows,
        titleCountRow,
        titleRows,
        lyricsCountRow,
        lyricsRows,
      ] = await Promise.all([
        db.getFirstAsync<{ c: number }>(
          `SELECT COUNT(*) as c FROM artists WHERE LOWER(name) LIKE ? ESCAPE '\\'`,
          likePattern
        ),
        db.getAllAsync<any>(
          `SELECT a.*, CASE WHEN fa.artist_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
           FROM artists a
           LEFT JOIN favorite_artists fa ON (a.id = fa.artist_id OR a.slug = fa.artist_id)
           WHERE LOWER(a.name) LIKE ? ESCAPE '\\'
           ORDER BY
             CASE
               WHEN LOWER(a.name) = ? THEN 0
               WHEN LOWER(a.name) LIKE ? ESCAPE '\\' THEN 1
               ELSE 2
             END,
             a.song_count DESC
           LIMIT ?`,
          likePattern,
          q,
          prefixPattern,
          limitPerCategory
        ),
        db.getFirstAsync<{ c: number }>(
          `SELECT COUNT(*) as c FROM songs s WHERE TRIM(COALESCE(s.title, '')) != '' AND LOWER(s.title) LIKE ? ESCAPE '\\'`,
          likePattern
        ),
        db.getAllAsync<any>(
          `SELECT s.id, s.title, s.slug, s.artist_id, s.artist_name, s.category, '' as lyrics,
                  CASE WHEN f.song_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
                  (
                    SELECT json_group_array(a.name)
                    FROM song_collaborations sc
                    JOIN artists a ON sc.artist_id = a.id
                    WHERE sc.song_id = s.id AND sc.role = 'featured'
                  ) as featured_artists
           FROM songs s
           LEFT JOIN favorites f ON s.id = f.song_id
           WHERE TRIM(COALESCE(s.title, '')) != '' AND LOWER(s.title) LIKE ? ESCAPE '\\'
           ORDER BY
             CASE
               WHEN LOWER(s.title) = ? THEN 0
               WHEN LOWER(s.title) LIKE ? ESCAPE '\\' THEN 1
               ELSE 2
             END,
             s.title COLLATE NOCASE ASC
           LIMIT ?`,
          likePattern,
          q,
          prefixPattern,
          limitPerCategory
        ),
        db.getFirstAsync<{ c: number }>(
          `SELECT COUNT(*) as c FROM songs s WHERE TRIM(COALESCE(s.title, '')) != '' AND LOWER(s.lyrics) LIKE ? ESCAPE '\\'`,
          likePattern
        ),
        db.getAllAsync<any>(
          `SELECT s.id, s.title, s.slug, s.artist_id, s.artist_name, s.category, s.lyrics,
                  CASE WHEN f.song_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
                  (
                    SELECT json_group_array(a.name)
                    FROM song_collaborations sc
                    JOIN artists a ON sc.artist_id = a.id
                    WHERE sc.song_id = s.id AND sc.role = 'featured'
                  ) as featured_artists
           FROM songs s
           LEFT JOIN favorites f ON s.id = f.song_id
           WHERE TRIM(COALESCE(s.title, '')) != '' AND LOWER(s.lyrics) LIKE ? ESCAPE '\\'
           ORDER BY
             CASE WHEN LOWER(s.title) LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END,
             s.title COLLATE NOCASE ASC
           LIMIT ?`,
          likePattern,
          likePattern,
          limitPerCategory
        ),
      ]);

      const artists: Artist[] = artistRows.map(r => ({
        ...r,
        is_favorite: Boolean(r.is_favorite),
      }));
      const titleSongs: Song[] = titleRows.map(mapSongRow);
      const lyricsSongs: Song[] = lyricsRows.map(r => {
        const mapped = mapSongRow(r);
        const snippet = extractSnippet(r.lyrics, q) || undefined;
        return {
          ...mapped,
          lyrics: '',
          snippet,
        };
      });

      const artistCount = artistCountRow?.c ?? artists.length;
      const titleCount = titleCountRow?.c ?? titleSongs.length;
      const lyricsCount = lyricsCountRow?.c ?? lyricsSongs.length;

      return {
        artists,
        titleSongs,
        lyricsSongs,
        counts: {
          artists: artistCount,
          titles: titleCount,
          lyrics: lyricsCount,
          total: artistCount + titleCount + lyricsCount,
        },
      };
    } catch (err) {
      console.warn('Error in searchCatalog:', err);
    }
  }

  // Fallback search in JSON
  const seed = getSeedData();
  const matchedArtists = (seed.artists as Artist[])
    .filter(a => a.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const al = a.name.toLowerCase();
      const bl = b.name.toLowerCase();
      const aRank = al === q ? 0 : al.startsWith(q) ? 1 : 2;
      const bRank = bl === q ? 0 : bl.startsWith(q) ? 1 : 2;
      if (aRank !== bRank) return aRank - bRank;
      return b.song_count - a.song_count;
    });

  const validSongs = seed.songs.filter((s: any) => s.title && s.title.trim().length > 0);
  const matchedTitles = validSongs
    .filter((s: any) => s.title.toLowerCase().includes(q))
    .sort((a: any, b: any) => {
      const al = a.title.toLowerCase();
      const bl = b.title.toLowerCase();
      const aRank = al === q ? 0 : al.startsWith(q) ? 1 : 2;
      const bRank = bl === q ? 0 : bl.startsWith(q) ? 1 : 2;
      if (aRank !== bRank) return aRank - bRank;
      return a.title.localeCompare(b.title);
    });

  const matchedLyrics = validSongs
    .filter((s: any) => s.lyrics && s.lyrics.toLowerCase().includes(q))
    .sort((a: any, b: any) => a.title.localeCompare(b.title));

  return {
    artists: matchedArtists.slice(0, limitPerCategory).map(a => ({
      ...a,
      is_favorite: memoryFavoriteArtists.has(a.id) || memoryFavoriteArtists.has(a.slug),
    })),
    titleSongs: matchedTitles.slice(0, limitPerCategory).map((s: any) =>
      mapSongRow({
        ...s,
        lyrics: '',
        is_favorite: memoryFavorites.has(s.id),
      })
    ),
    lyricsSongs: matchedLyrics.slice(0, limitPerCategory).map((s: any) => ({
      ...mapSongRow({
        ...s,
        is_favorite: memoryFavorites.has(s.id),
      }),
      lyrics: '',
      snippet: extractSnippet(s.lyrics, q) || undefined,
    })),
    counts: {
      artists: matchedArtists.length,
      titles: matchedTitles.length,
      lyrics: matchedLyrics.length,
      total: matchedArtists.length + matchedTitles.length + matchedLyrics.length,
    },
  };
}

export async function toggleFavorite(songId: string): Promise<boolean> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      const existing = await db.getFirstAsync<{ song_id: string }>(
        'SELECT song_id FROM favorites WHERE song_id = ?',
        songId
      );
      if (existing) {
        await db.runAsync('DELETE FROM favorites WHERE song_id = ?', songId);
        return false;
      } else {
        await db.runAsync('INSERT INTO favorites (song_id) VALUES (?)', songId);
        return true;
      }
    } catch (err) {
      console.warn('Error toggling favorite in db:', err);
    }
  }

  if (memoryFavorites.has(songId)) {
    memoryFavorites.delete(songId);
    return false;
  } else {
    memoryFavorites.add(songId);
    return true;
  }
}

export async function isFavorite(songId: string): Promise<boolean> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      const res = await db.getFirstAsync<{ song_id: string }>(
        'SELECT song_id FROM favorites WHERE song_id = ?',
        songId
      );
      return Boolean(res);
    } catch {
      return false;
    }
  }
  return memoryFavorites.has(songId);
}

export async function getFavoriteSongs(): Promise<Song[]> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      const rows = await db.getAllAsync<any>(
        `SELECT s.*, 1 as is_favorite,
                (
                  SELECT json_group_array(a.name)
                  FROM song_collaborations sc
                  JOIN artists a ON sc.artist_id = a.id
                  WHERE sc.song_id = s.id AND sc.role = 'featured'
                ) as featured_artists
         FROM songs s
         INNER JOIN favorites f ON s.id = f.song_id
         ORDER BY f.created_at DESC, f.rowid DESC`
      );
      return rows.map(s => mapSongRow({ ...s, is_favorite: true }));
    } catch (err) {
      console.warn('Error getting favorites from db:', err);
    }
  }

  const favIds = Array.from(memoryFavorites).reverse();
  const seedSongs = getSeedData().songs;
  const byId = new Map<string, any>();
  seedSongs.forEach((s: any) => byId.set(s.id, s));
  return favIds
    .map(id => byId.get(id))
    .filter(Boolean)
    .map((s: any) => mapSongRow({ ...s, is_favorite: true }));
}

export async function toggleFavoriteArtist(artistId: string): Promise<boolean> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      const existing = await db.getFirstAsync<{ artist_id: string }>(
        'SELECT artist_id FROM favorite_artists WHERE artist_id = ?',
        artistId
      );
      if (existing) {
        await db.runAsync('DELETE FROM favorite_artists WHERE artist_id = ?', artistId);
        return false;
      } else {
        await db.runAsync('INSERT OR REPLACE INTO favorite_artists (artist_id) VALUES (?)', artistId);
        return true;
      }
    } catch (err) {
      console.warn('Error toggling artist favorite in db:', err);
    }
  }

  if (memoryFavoriteArtists.has(artistId)) {
    memoryFavoriteArtists.delete(artistId);
    return false;
  } else {
    memoryFavoriteArtists.add(artistId);
    return true;
  }
}

export async function isArtistFavorite(artistId: string): Promise<boolean> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      const res = await db.getFirstAsync<{ artist_id: string }>(
        'SELECT artist_id FROM favorite_artists WHERE artist_id = ?',
        artistId
      );
      return Boolean(res);
    } catch {
      return false;
    }
  }
  return memoryFavoriteArtists.has(artistId);
}

export async function getFavoriteArtistIds(): Promise<Set<string>> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      const rows = await db.getAllAsync<{ artist_id: string }>('SELECT artist_id FROM favorite_artists');
      return new Set(rows.map(r => r.artist_id));
    } catch (err) {
      console.warn('Error getting favorite artist IDs from db:', err);
    }
  }
  return new Set(memoryFavoriteArtists);
}

export async function getStats(): Promise<{ totalSongs: number; totalArtists: number }> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      const songsCount = await db.getFirstAsync<{ c: number }>('SELECT count(*) as c FROM songs');
      const artistsCount = await db.getFirstAsync<{ c: number }>('SELECT count(*) as c FROM artists');
      return {
        totalSongs: songsCount?.c ?? getSeedData().songs.length,
        totalArtists: artistsCount?.c ?? getSeedData().artists.length,
      };
    } catch (err) {
      console.warn('Error getting stats from db:', err);
    }
  }
  const seed = getSeedData();
  return {
    totalSongs: seed.songs.length,
    totalArtists: seed.artists.length,
  };
}

export async function getUserDataCounts(): Promise<UserDataCounts> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      const [favSongsRow, favArtistsRow, songHistRow, searchHistRow] = await Promise.all([
        db.getFirstAsync<{ c: number }>('SELECT count(*) as c FROM favorites'),
        db.getFirstAsync<{ c: number }>('SELECT count(*) as c FROM favorite_artists'),
        db.getFirstAsync<{ c: number }>('SELECT count(*) as c FROM song_history'),
        db.getFirstAsync<{ c: number }>('SELECT count(*) as c FROM search_history'),
      ]);
      return {
        favoriteSongs: favSongsRow?.c ?? 0,
        favoriteArtists: favArtistsRow?.c ?? 0,
        songHistory: songHistRow?.c ?? 0,
        searchHistory: searchHistRow?.c ?? 0,
      };
    } catch (err) {
      console.warn('Error getting user data counts from db:', err);
    }
  }
  return {
    favoriteSongs: memoryFavorites.size,
    favoriteArtists: memoryFavoriteArtists.size,
    songHistory: memoryHistory.length,
    searchHistory: memorySearchHistory.length,
  };
}

function normalizeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  const merged = { ...DEFAULT_APP_SETTINGS, ...(raw || {}) };
  if (!['system', 'light', 'dark'].includes(merged.themeMode)) {
    merged.themeMode = 'system';
  }
  if (!['left', 'center'].includes(merged.lyricsAlign)) {
    merged.lyricsAlign = 'left';
  }
  merged.defaultFontSize = Math.min(28, Math.max(14, Number(merged.defaultFontSize) || 18));
  merged.defaultScrollSpeed = [0.5, 1, 1.5, 2].includes(Number(merged.defaultScrollSpeed))
    ? Number(merged.defaultScrollSpeed)
    : 1;
  merged.keepAwake = Boolean(merged.keepAwake);
  merged.highContrast = Boolean(merged.highContrast);
  return merged;
}

export async function getAppSettings(): Promise<AppSettings> {
  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      const row = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM app_meta WHERE key = 'user_settings'"
      );
      if (row?.value) {
        return normalizeSettings(JSON.parse(row.value));
      }
    } catch (err) {
      console.warn('Error reading app settings from db:', err);
    }
  }
  return { ...memoryAppSettings };
}

export async function saveAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getAppSettings();
  const next = normalizeSettings({ ...current, ...patch });
  memoryAppSettings = next;

  await initDatabase();
  const db = await getDatabase();
  if (db) {
    try {
      await db.runAsync(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('user_settings', ?)",
        JSON.stringify(next)
      );
    } catch (err) {
      console.warn('Error saving app settings to db:', err);
    }
  }
  return next;
}
