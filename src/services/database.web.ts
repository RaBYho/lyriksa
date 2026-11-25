import seedData from '../../assets/data/seed-songs.json';

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

function parseStoredStringSet(key: string): Set<string> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const data = window.localStorage.getItem(key);
      if (data) {
        const parsed: unknown = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return new Set(parsed.filter((item): item is string => typeof item === 'string'));
        }
      }
    }
  } catch {}
  return new Set();
}

function getStoredFavorites(): Set<string> {
  return parseStoredStringSet('lyriksa_favorites');
}

function saveStoredFavorites(favs: Set<string>) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('lyriksa_favorites', JSON.stringify(Array.from(favs)));
    }
  } catch {}
}

function getStoredFavoriteArtists(): Set<string> {
  return parseStoredStringSet('lyriksa_favorite_artists');
}

function saveStoredFavoriteArtists(favs: Set<string>) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('lyriksa_favorite_artists', JSON.stringify(Array.from(favs)));
    }
  } catch {}
}

export async function getDatabase(): Promise<any | null> {
  return null;
}

export async function initDatabase(): Promise<void> {
  // Web uses pre-bundled JSON data directly
}

export async function getTopArtists(): Promise<Artist[]> {
  const favArtists = getStoredFavoriteArtists();
  return (seedData.artists as Artist[]).map(a => ({
    ...a,
    is_favorite: favArtists.has(a.id) || favArtists.has(a.slug),
  }));
}

export async function getFavoriteArtists(
  limit = 10
): Promise<{ artists: Artist[]; isFallback: boolean }> {
  const favArtists = getStoredFavoriteArtists();
  const byKey = new Map<string, Artist>();
  (seedData.artists as Artist[]).forEach(a => {
    byKey.set(a.id, a);
    byKey.set(a.slug, a);
  });

  // 1. Explicitly favorited artists first (newest added first)
  const explicit: Artist[] = [];
  const seenIds = new Set<string>();
  for (const key of Array.from(favArtists).reverse()) {
    const artist = byKey.get(key);
    if (artist && !seenIds.has(artist.id)) {
      seenIds.add(artist.id);
      explicit.push({ ...artist, is_favorite: true, is_song_derived: false });
      if (explicit.length >= limit) break;
    }
  }

  // 2. Complement remaining slots with artists from favorite songs
  const favs = getStoredFavorites();
  const derived: Artist[] = [];
  if (explicit.length < limit && favs.size > 0) {
    const favSongIds = new Set(Array.from(favs));
    const favSongs = seedData.songs.filter(s => favSongIds.has(s.id));
    const counts = new Map<string, number>();
    favSongs.forEach(s => {
      counts.set(s.artist_id, (counts.get(s.artist_id) || 0) + 1);
    });

    const candidates = (seedData.artists as Artist[])
      .filter(
        a =>
          !seenIds.has(a.id) &&
          (counts.has(a.id) || counts.has(a.slug))
      )
      .sort((a, b) => {
        const ca = counts.get(a.id) ?? counts.get(a.slug) ?? 0;
        const cb = counts.get(b.id) ?? counts.get(b.slug) ?? 0;
        if (cb !== ca) return cb - ca;
        return b.song_count - a.song_count;
      })
      .slice(0, limit - explicit.length);

    candidates.forEach(a => {
      derived.push({ ...a, is_favorite: false, is_song_derived: true });
    });
  }

  const combined = [...explicit, ...derived];
  if (combined.length > 0) {
    return { artists: combined, isFallback: false };
  }

  const top = await getTopArtists();
  return { artists: top.slice(0, limit), isFallback: true };
}

export async function getFavoriteArtistsList(): Promise<Artist[]> {
  const favArtists = getStoredFavoriteArtists();
  const byKey = new Map<string, Artist>();
  (seedData.artists as Artist[]).forEach(a => {
    byKey.set(a.id, a);
    byKey.set(a.slug, a);
  });

  const seen = new Set<string>();
  const result: Artist[] = [];
  for (const key of Array.from(favArtists).reverse()) {
    const artist = byKey.get(key);
    if (artist && !seen.has(artist.id)) {
      seen.add(artist.id);
      result.push({ ...artist, is_favorite: true });
    }
  }
  return result;
}

export async function getArtistById(artistId: string): Promise<{ artist: Artist | null; songs: Song[] }> {
  const favs = getStoredFavorites();
  const favArtists = getStoredFavoriteArtists();
  const rawArtist = (seedData.artists.find(a => a.id === artistId || a.slug === artistId) as Artist) || null;
  const artist = rawArtist
    ? {
        ...rawArtist,
        is_favorite: favArtists.has(rawArtist.id) || favArtists.has(rawArtist.slug),
      }
    : null;
  const songs = seedData.songs
    .filter(s => s.artist_id === artistId || (artist && s.artist_name.toLowerCase() === artist.name.toLowerCase()))
    .map(s => ({ ...s, is_favorite: favs.has(s.id) })) as Song[];

  return { artist, songs };
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

export async function getSongCategoryCounts(): Promise<Record<string, number>> {
  const all = seedData.songs;
  return {
    rehetra: all.length,
    folk: all.filter(s => (s.category || '').toLowerCase().includes('folk') || (s.category || '').toLowerCase().includes('acoustic')).length,
    rock: all.filter(s => (s.category || '').toLowerCase().includes('rock') || (s.category || '').toLowerCase().includes('pop')).length,
    fiderana: all.filter(s => (s.category || '').toLowerCase().includes('fiderana') || (s.category || '').toLowerCase().includes('gospel')).length,
    kalos: all.filter(s => (s.category || '').toLowerCase().includes('kalo') || (s.category || '').toLowerCase().includes('romantique')).length,
    vakodrazana: all.filter(s => (s.category || '').toLowerCase().includes('vako') || (s.category || '').toLowerCase().includes('salegy')).length,
  };
}

export async function getSongsPaginated(params: SongQueryParams = {}): Promise<PaginatedSongsResult> {
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const search = (params.search || '').trim().toLowerCase();
  const category = params.category || 'rehetra';
  const sort = params.sort || 'all';

  const favs = getStoredFavorites();
  let filtered = seedData.songs.filter(s => s.title && s.title.trim().length > 0);

  if (search) {
    filtered = filtered.filter(
      s => s.title.toLowerCase().includes(search) || s.artist_name.toLowerCase().includes(search)
    );
  }

  if (category !== 'rehetra') {
    filtered = filtered.filter(s => {
      const c = (s.category || '').toLowerCase();
      if (category === 'folk') return c.includes('folk') || c.includes('acoustic');
      if (category === 'rock') return c.includes('rock') || c.includes('pop');
      if (category === 'fiderana') return c.includes('fiderana') || c.includes('gospel');
      if (category === 'kalos') return c.includes('kalo') || c.includes('romantique');
      if (category === 'vakodrazana') return c.includes('vako') || c.includes('salegy');
      return true;
    });
  }

  if (sort === 'recent') {
    filtered = [...filtered].reverse();
  } else {
    filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
  }

  const total = filtered.length;
  const paged = filtered.slice(offset, offset + limit).map(s => ({
    ...s,
    is_favorite: favs.has(s.id),
  })) as Song[];

  return {
    songs: paged,
    total,
    hasMore: offset + paged.length < total,
  };
}

export async function getAllSongs(limit?: number): Promise<Song[]> {
  const favs = getStoredFavorites();
  const list = limit ? seedData.songs.slice(0, limit) : seedData.songs;
  return list.map(s => ({
    ...s,
    is_favorite: favs.has(s.id),
  })) as Song[];
}

export async function getTrendingSongs(limit = 10): Promise<Song[]> {
  return getAllSongs(limit);
}

export async function getRecentSongs(limit = 10): Promise<Song[]> {
  const favs = getStoredFavorites();
  return [...seedData.songs].reverse().slice(0, limit).map(s => ({
    ...s,
    is_favorite: favs.has(s.id),
  })) as Song[];
}

export async function getSongById(songId: string): Promise<Song | null> {
  const favs = getStoredFavorites();
  const found = seedData.songs.find(s => s.id === songId);
  if (!found) return null;
  return { ...found, is_favorite: favs.has(found.id) } as Song;
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
  const q = query.trim().toLowerCase();
  if (!q) {
    return {
      artists: [],
      titleSongs: [],
      lyricsSongs: [],
      counts: { artists: 0, titles: 0, lyrics: 0, total: 0 },
    };
  }

  const favSongs = getStoredFavorites();
  const favArtists = getStoredFavoriteArtists();

  const matchedArtists = (seedData.artists as Artist[])
    .filter(a => a.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const al = a.name.toLowerCase();
      const bl = b.name.toLowerCase();
      const aRank = al === q ? 0 : al.startsWith(q) ? 1 : 2;
      const bRank = bl === q ? 0 : bl.startsWith(q) ? 1 : 2;
      if (aRank !== bRank) return aRank - bRank;
      return b.song_count - a.song_count;
    });

  const validSongs = seedData.songs.filter(s => s.title && s.title.trim().length > 0);
  const matchedTitles = validSongs
    .filter(s => s.title.toLowerCase().includes(q))
    .sort((a, b) => {
      const al = a.title.toLowerCase();
      const bl = b.title.toLowerCase();
      const aRank = al === q ? 0 : al.startsWith(q) ? 1 : 2;
      const bRank = bl === q ? 0 : bl.startsWith(q) ? 1 : 2;
      if (aRank !== bRank) return aRank - bRank;
      return a.title.localeCompare(b.title);
    });

  const matchedLyrics = validSongs
    .filter(s => s.lyrics && s.lyrics.toLowerCase().includes(q))
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    artists: matchedArtists.slice(0, limitPerCategory).map(a => ({
      ...a,
      is_favorite: favArtists.has(a.id) || favArtists.has(a.slug),
    })),
    titleSongs: matchedTitles.slice(0, limitPerCategory).map(s => ({
      ...s,
      lyrics: '',
      is_favorite: favSongs.has(s.id),
    })) as Song[],
    lyricsSongs: matchedLyrics.slice(0, limitPerCategory).map(s => ({
      ...s,
      lyrics: '',
      is_favorite: favSongs.has(s.id),
      snippet: extractSnippet(s.lyrics, q) || undefined,
    })) as Song[],
    counts: {
      artists: matchedArtists.length,
      titles: matchedTitles.length,
      lyrics: matchedLyrics.length,
      total: matchedArtists.length + matchedTitles.length + matchedLyrics.length,
    },
  };
}

export async function searchSongs(
  query: string,
  filterType: 'all' | 'title' | 'artist' | 'lyrics' = 'all'
): Promise<Song[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const favs = getStoredFavorites();
  const filtered = seedData.songs.filter(s => {
    const titleMatch = s.title.toLowerCase().includes(q);
    const artistMatch = s.artist_name.toLowerCase().includes(q);
    const lyricsMatch = s.lyrics.toLowerCase().includes(q);

    if (filterType === 'title') return titleMatch;
    if (filterType === 'artist') return artistMatch;
    if (filterType === 'lyrics') return lyricsMatch;
    return titleMatch || artistMatch || lyricsMatch;
  });

  return filtered.map(s => ({
    ...s,
    is_favorite: favs.has(s.id),
    snippet: extractSnippet(s.lyrics, q) || undefined,
  })) as Song[];
}

export async function toggleFavorite(songId: string): Promise<boolean> {
  const favs = getStoredFavorites();
  let isNowFav = false;
  if (favs.has(songId)) {
    favs.delete(songId);
    isNowFav = false;
  } else {
    favs.add(songId);
    isNowFav = true;
  }
  saveStoredFavorites(favs);
  return isNowFav;
}

export async function isFavorite(songId: string): Promise<boolean> {
  const favs = getStoredFavorites();
  return favs.has(songId);
}

export async function getFavoriteSongs(): Promise<Song[]> {
  const favs = getStoredFavorites();
  const byId = new Map<string, (typeof seedData.songs)[number]>();
  seedData.songs.forEach(s => byId.set(s.id, s));
  return Array.from(favs)
    .reverse()
    .map(id => byId.get(id))
    .filter((s): s is (typeof seedData.songs)[number] => Boolean(s))
    .map(s => ({ ...s, is_favorite: true })) as Song[];
}

export async function toggleFavoriteArtist(artistId: string): Promise<boolean> {
  const favs = getStoredFavoriteArtists();
  let isNowFav = false;
  if (favs.has(artistId)) {
    favs.delete(artistId);
    isNowFav = false;
  } else {
    favs.add(artistId);
    isNowFav = true;
  }
  saveStoredFavoriteArtists(favs);
  return isNowFav;
}

export async function isArtistFavorite(artistId: string): Promise<boolean> {
  const favs = getStoredFavoriteArtists();
  return favs.has(artistId);
}

export async function getFavoriteArtistIds(): Promise<Set<string>> {
  return getStoredFavoriteArtists();
}

export async function getStats(): Promise<{ totalSongs: number; totalArtists: number }> {
  return {
    totalSongs: seedData.songs.length,
    totalArtists: seedData.artists.length,
  };
}

export async function getUserDataCounts(): Promise<UserDataCounts> {
  return {
    favoriteSongs: getStoredFavorites().size,
    favoriteArtists: getStoredFavoriteArtists().size,
    songHistory: getStoredHistory().length,
    searchHistory: getStoredSearchHistory().length,
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
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem('lyriksa_user_settings');
      if (raw) {
        return normalizeSettings(JSON.parse(raw));
      }
    }
  } catch {}
  return { ...DEFAULT_APP_SETTINGS };
}

export async function saveAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getAppSettings();
  const next = normalizeSettings({ ...current, ...patch });
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('lyriksa_user_settings', JSON.stringify(next));
    }
  } catch {}
  return next;
}

function getStoredHistory(): Array<{ songId: string; openedAt: number }> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const data = window.localStorage.getItem('lyriksa_song_history');
      if (data) {
        const parsed: unknown = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (h): h is { songId: string; openedAt: number } =>
              Boolean(h) &&
              typeof h === 'object' &&
              typeof (h as any).songId === 'string' &&
              typeof (h as any).openedAt === 'number'
          );
        }
      }
    }
  } catch {}
  return [];
}

function saveStoredHistory(history: Array<{ songId: string; openedAt: number }>) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('lyriksa_song_history', JSON.stringify(history));
    }
  } catch {}
}

export async function recordSongHistory(songId: string): Promise<void> {
  const history = getStoredHistory();
  const updated = [
    { songId, openedAt: Date.now() },
    ...history.filter(h => h.songId !== songId),
  ].slice(0, 50);
  saveStoredHistory(updated);
}

export async function getRecentlyOpenedSongs(limit = 6): Promise<Song[]> {
  const history = getStoredHistory();
  const favs = getStoredFavorites();
  const ids = history.slice(0, limit).map(h => h.songId);
  return ids
    .map(id => seedData.songs.find(s => s.id === id))
    .filter((s): s is (typeof seedData.songs)[0] => Boolean(s))
    .map(s => ({
      ...s,
      is_favorite: favs.has(s.id),
    })) as Song[];
}

export async function clearSongHistory(): Promise<void> {
  saveStoredHistory([]);
}

function getStoredSearchHistory(): Array<{ query: string; searchedAt: number }> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const data = window.localStorage.getItem('lyriksa_search_history');
      if (data) {
        const parsed: unknown = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (h): h is { query: string; searchedAt: number } =>
              Boolean(h) &&
              typeof h === 'object' &&
              typeof (h as any).query === 'string' &&
              typeof (h as any).searchedAt === 'number'
          );
        }
      }
    }
  } catch {}
  return [];
}

function saveStoredSearchHistory(history: Array<{ query: string; searchedAt: number }>) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('lyriksa_search_history', JSON.stringify(history));
    }
  } catch {}
}

export async function getSearchHistory(limit = 12): Promise<string[]> {
  return getStoredSearchHistory()
    .slice(0, limit)
    .map(h => h.query);
}

export async function recordSearchHistory(rawQuery: string): Promise<void> {
  const cleaned = rawQuery.trim();
  if (!cleaned) return;
  const history = getStoredSearchHistory();
  const updated = [
    { query: cleaned, searchedAt: Date.now() },
    ...history.filter(h => h.query.toLowerCase() !== cleaned.toLowerCase()),
  ].slice(0, 20);
  saveStoredSearchHistory(updated);
}

export async function removeSearchHistoryItem(rawQuery: string): Promise<void> {
  const cleaned = rawQuery.trim();
  if (!cleaned) return;
  const history = getStoredSearchHistory();
  saveStoredSearchHistory(
    history.filter(h => h.query.toLowerCase() !== cleaned.toLowerCase())
  );
}

export async function clearSearchHistory(): Promise<void> {
  saveStoredSearchHistory([]);
}
