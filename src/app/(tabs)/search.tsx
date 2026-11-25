import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  FlatList,
  Pressable,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing, ThemePalette, fontStyle } from '@/constants/theme';
import { useThemePalette } from '@/context/AppSettingsContext';
import { SongRow } from '@/components/SongRow';
import { ArtistListCard } from '@/components/ArtistListCard';
import { ScalePressable } from '@/components/ScalePressable';
import { triggerSelectionHaptic } from '@/utils/haptics';
import {
  SongRowSkeletonList,
  ArtistListCardSkeletonList,
  SearchAllSkeleton,
} from '@/components/Skeleton';
import {
  searchCatalog,
  toggleFavorite,
  toggleFavoriteArtist,
  getSearchHistory,
  recordSearchHistory,
  removeSearchHistoryItem,
  clearSearchHistory,
  UnifiedSearchResults,
  Artist,
  Song,
} from '@/services/database';

type FilterType = 'all' | 'artist' | 'title' | 'lyrics';

interface FilterTab {
  id: FilterType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const FILTER_TABS: FilterTab[] = [
  { id: 'all', label: 'Rehetra', icon: 'layers-outline' },
  { id: 'artist', label: 'Mpihira', icon: 'person-outline' },
  { id: 'title', label: 'Lohateny', icon: 'musical-notes-outline' },
  { id: 'lyrics', label: 'Tononkira', icon: 'document-text-outline' },
];

const EMPTY_RESULTS: UnifiedSearchResults = {
  artists: [],
  titleSongs: [],
  lyricsSongs: [],
  counts: { artists: 0, titles: 0, lyrics: 0, total: 0 },
};

const SUGGESTED_SEARCHES = [
  'fitiavana',
  'rano',
  'mama',
  'masoandro',
  'antanambao',
  'krismasy',
  'Mahaleo',
  'Ambondrona',
];

const PREVIEW_LIMIT_ARTISTS = 3;
const PREVIEW_LIMIT_TITLES = 4;
const PREVIEW_LIMIT_LYRICS = 5;

export default function SearchScreen() {
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const params = useLocalSearchParams<{
    autofocus?: string;
    filter?: FilterType;
    t?: string;
  }>();
  const inputRef = useRef<any>(null);
  const searchSeqRef = useRef(0);

  const [query, setQuery] = useState('');
  const queryRef = useRef(query);
  queryRef.current = query;
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [results, setResults] = useState<UnifiedSearchResults>(EMPTY_RESULTS);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const commitSearchHistory = useCallback((rawTerm: string) => {
    const cleaned = rawTerm.trim();
    if (!cleaned) return;
    setSearchHistory(prev =>
      [
        cleaned,
        ...prev.filter(item => item.toLowerCase() !== cleaned.toLowerCase()),
      ].slice(0, 12)
    );
    recordSearchHistory(cleaned).catch(() => {});
  }, []);

  const handleRemoveHistoryItem = useCallback((term: string) => {
    triggerSelectionHaptic();
    setSearchHistory(prev =>
      prev.filter(item => item.toLowerCase() !== term.toLowerCase())
    );
    removeSearchHistoryItem(term).catch(() => {});
  }, []);

  const handleClearHistory = useCallback(() => {
    triggerSelectionHaptic();
    setSearchHistory([]);
    clearSearchHistory().catch(() => {});
  }, []);

  useEffect(() => {
    if (params.filter && ['all', 'title', 'artist', 'lyrics'].includes(params.filter)) {
      setFilterType(params.filter as FilterType);
    }
  }, [params.filter, params.t]);

  useFocusEffect(
    useCallback(() => {
      getSearchHistory(12)
        .then(setSearchHistory)
        .catch(() => {});

      const activeQuery = queryRef.current.trim();
      if (activeQuery) {
        const seq = ++searchSeqRef.current;
        searchCatalog(activeQuery, 50)
          .then(res => {
            if (searchSeqRef.current === seq) {
              setResults(res);
            }
          })
          .catch(() => {});
      }

      if (params.autofocus === 'true' || params.autofocus) {
        const t1 = setTimeout(() => inputRef.current?.focus(), 80);
        const t2 = setTimeout(() => inputRef.current?.focus(), 200);
        return () => {
          clearTimeout(t1);
          clearTimeout(t2);
        };
      }
    }, [params.autofocus, params.t])
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      searchSeqRef.current += 1;
      setResults(EMPTY_RESULTS);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    const seq = ++searchSeqRef.current;
    setIsSearching(true);
    setHasSearched(true);

    const timer = setTimeout(async () => {
      try {
        const res = await searchCatalog(trimmed, 50);
        if (searchSeqRef.current === seq) {
          setResults(res);
        }
      } catch (err) {
        console.warn('Search error:', err);
      } finally {
        if (searchSeqRef.current === seq) {
          setIsSearching(false);
        }
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  const handleToggleSongFavorite = useCallback(async (songId: string) => {
    const isNowFav = await toggleFavorite(songId);
    setResults(prev => ({
      ...prev,
      titleSongs: prev.titleSongs.map(s =>
        s.id === songId ? { ...s, is_favorite: isNowFav } : s
      ),
      lyricsSongs: prev.lyricsSongs.map(s =>
        s.id === songId ? { ...s, is_favorite: isNowFav } : s
      ),
    }));
  }, []);

  const handleToggleArtistFavorite = useCallback(async (artistId: string) => {
    const isNowFav = await toggleFavoriteArtist(artistId);
    setResults(prev => ({
      ...prev,
      artists: prev.artists.map(a =>
        a.id === artistId || a.slug === artistId
          ? { ...a, is_favorite: isNowFav }
          : a
      ),
    }));
  }, []);

  const clearQuery = () => {
    searchSeqRef.current += 1;
    setQuery('');
    setResults(EMPTY_RESULTS);
    setHasSearched(false);
    setIsSearching(false);
    inputRef.current?.focus();
  };

  const getTabCount = (tabId: FilterType): number => {
    if (tabId === 'all') return results.counts.total;
    if (tabId === 'artist') return results.counts.artists;
    if (tabId === 'title') return results.counts.titles;
    return results.counts.lyrics;
  };

  const previewArtists = useMemo(
    () => results.artists.slice(0, PREVIEW_LIMIT_ARTISTS),
    [results.artists]
  );
  const previewTitleSongs = useMemo(
    () => results.titleSongs.slice(0, PREVIEW_LIMIT_TITLES),
    [results.titleSongs]
  );
  const previewLyricsSongs = useMemo(() => {
    const shownTitleIds = new Set(previewTitleSongs.map(s => s.id));
    const distinct = results.lyricsSongs.filter(s => !shownTitleIds.has(s.id));
    const source = distinct.length > 0 ? distinct : results.lyricsSongs;
    return source.slice(0, PREVIEW_LIMIT_LYRICS);
  }, [results.lyricsSongs, previewTitleSongs]);

  const renderCrossTabSuggestions = (currentTab: Exclude<FilterType, 'all'>) => {
    const alternatives: {
      id: FilterType;
      label: string;
      count: number;
      icon: keyof typeof Ionicons.glyphMap;
    }[] = [];
    if (currentTab !== 'artist' && results.counts.artists > 0) {
      alternatives.push({
        id: 'artist',
        label: 'Mpihira',
        count: results.counts.artists,
        icon: 'person-outline',
      });
    }
    if (currentTab !== 'title' && results.counts.titles > 0) {
      alternatives.push({
        id: 'title',
        label: 'Lohateny',
        count: results.counts.titles,
        icon: 'musical-notes-outline',
      });
    }
    if (currentTab !== 'lyrics' && results.counts.lyrics > 0) {
      alternatives.push({
        id: 'lyrics',
        label: 'Tononkira',
        count: results.counts.lyrics,
        icon: 'document-text-outline',
      });
    }

    const emptyLabel =
      currentTab === 'artist'
        ? 'Tsy nisy mpihira nahitana izany'
        : currentTab === 'title'
          ? 'Tsy nisy lohateny nahitana izany'
          : 'Tsy nisy tononkira nahitana izany';

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconBg}>
          <Ionicons name="search-outline" size={32} color={colors.outline} />
        </View>
        <Text style={styles.emptyTitle}>{emptyLabel}</Text>
        <Text style={styles.emptyDesc}>
          {alternatives.length > 0
            ? 'Misy valiny mifanaraka kosa ao amin’ireto sokajy ireto :'
            : 'Andramo ampiasaina teny hafa na jereo ny tsipelina.'}
        </Text>

        {alternatives.length > 0 && (
          <View style={styles.crossTabRow}>
            {alternatives.map(alt => (
              <ScalePressable
                key={alt.id}
                style={styles.crossTabChip}
                scaleTo={0.95}
                onPress={() => {
                  triggerSelectionHaptic();
                  setFilterType(alt.id);
                }}>
                <Ionicons name={alt.icon} size={14} color={colors.primary} />
                <Text style={styles.crossTabChipText}>
                  {alt.label} ({alt.count})
                </Text>
                <Ionicons name="arrow-forward" size={13} color={colors.primary} />
              </ScalePressable>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderAllResults = () => {
    if (results.counts.total === 0) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconBg}>
            <Ionicons name="search-outline" size={32} color={colors.outline} />
          </View>
          <Text style={styles.emptyTitle}>Tsy nisy valiny</Text>
          <Text style={styles.emptyDesc}>
            Tsy nahitana mpihira, lohateny na tononkira mifanaraka amin’ny « {query.trim()} ».
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.allSectionsContainer}>
        {previewArtists.length > 0 && (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.amberBar} />
                <Text style={styles.sectionTitle}>Mpihira</Text>
                <View style={styles.sectionCountBadge}>
                  <Text style={styles.sectionCountText}>{results.counts.artists}</Text>
                </View>
              </View>
              {results.counts.artists > PREVIEW_LIMIT_ARTISTS && (
                <Pressable
                  onPress={() => {
                    triggerSelectionHaptic();
                    setFilterType('artist');
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.seeAllText}>Hijery rehetra →</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.artistsSectionList}>
              {previewArtists.map(artist => (
                <ArtistListCard
                  key={`all-artist-${artist.id}`}
                  artist={artist}
                  onToggleFavorite={handleToggleArtistFavorite}
                  highlightText={query}
                  onSelect={() => commitSearchHistory(query)}
                />
              ))}
            </View>
          </View>
        )}

        {previewTitleSongs.length > 0 && (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.primaryBar} />
                <Text style={styles.sectionTitle}>Lohateny</Text>
                <View style={styles.sectionCountBadge}>
                  <Text style={styles.sectionCountText}>{results.counts.titles}</Text>
                </View>
              </View>
              {results.counts.titles > PREVIEW_LIMIT_TITLES && (
                <Pressable
                  onPress={() => {
                    triggerSelectionHaptic();
                    setFilterType('title');
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.seeAllText}>Hijery rehetra →</Text>
                </Pressable>
              )}
            </View>

            <View>
              {previewTitleSongs.map(song => (
                <SongRow
                  key={`all-title-${song.id}`}
                  song={song}
                  onToggleFavorite={handleToggleSongFavorite}
                  highlightText={query}
                  onSelect={() => commitSearchHistory(query)}
                />
              ))}
            </View>
          </View>
        )}

        {previewLyricsSongs.length > 0 && (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.emeraldBar} />
                <Text style={styles.sectionTitle}>Tononkira</Text>
                <View style={styles.sectionCountBadge}>
                  <Text style={styles.sectionCountText}>{results.counts.lyrics}</Text>
                </View>
              </View>
              {results.counts.lyrics > PREVIEW_LIMIT_LYRICS && (
                <Pressable
                  onPress={() => {
                    triggerSelectionHaptic();
                    setFilterType('lyrics');
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.seeAllText}>Hijery rehetra →</Text>
                </Pressable>
              )}
            </View>

            <View>
              {previewLyricsSongs.map(song => (
                <SongRow
                  key={`all-lyrics-${song.id}`}
                  song={song}
                  onToggleFavorite={handleToggleSongFavorite}
                  highlightText={query}
                  onSelect={() => commitSearchHistory(query)}
                />
              ))}
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderArtistTabItem = useCallback(
    ({ item }: { item: Artist }) => (
      <ArtistListCard
        artist={item}
        onToggleFavorite={handleToggleArtistFavorite}
        highlightText={query}
        onSelect={() => commitSearchHistory(query)}
      />
    ),
    [handleToggleArtistFavorite, query, commitSearchHistory]
  );

  const renderSongTabItem = useCallback(
    ({ item }: { item: Song }) => (
      <SongRow
        song={item}
        onToggleFavorite={handleToggleSongFavorite}
        highlightText={query}
        onSelect={() => commitSearchHistory(query)}
      />
    ),
    [handleToggleSongFavorite, query, commitSearchHistory]
  );

  const renderArtistSeparator = useCallback(
    () => <View style={styles.artistCardSeparator} />,
    [styles.artistCardSeparator]
  );

  const renderListHeader = (
    label: string,
    loadedCount: number,
    totalCount: number,
    unit: string
  ) => {
    if (loadedCount === 0) return undefined;
    return (
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>{label}</Text>
        <Text style={styles.statusCount}>
          {totalCount > loadedCount
            ? `${loadedCount} amin’ny ${totalCount} ${unit}`
            : `${totalCount} ${unit}`}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Editorial Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandSubtitle}>FIKAROHANA HORS-LIGNE</Text>
          <Text style={styles.headerTitle}>Hitady</Text>
        </View>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchBarContainer}>
        <Pressable
          style={[
            styles.searchBar,
            isInputFocused && styles.searchBarFocused,
          ]}
          onPress={() => inputRef.current?.focus()}>
          <Ionicons
            name="search"
            size={19}
            color={isInputFocused || query ? colors.primary : colors.textSecondary}
          />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Hitady hira, mpihira, tononkira..."
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => commitSearchHistory(query)}
          />
          {query ? (
            <Pressable onPress={clearQuery} style={styles.clearBtn} hitSlop={8}>
              <Ionicons
                name="close-circle"
                size={19}
                color={colors.textSecondary}
              />
            </Pressable>
          ) : null}
        </Pressable>

        {query ? (
          <Pressable onPress={clearQuery} style={styles.cancelBtn} hitSlop={8}>
            <Text style={styles.cancelText}>Aoka</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Filter Capsules */}
      <View style={styles.filtersSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}>
          {FILTER_TABS.map(tab => {
            const isActive = filterType === tab.id;
            const count = getTabCount(tab.id);
            const showCount = hasSearched && !isSearching;

            return (
              <ScalePressable
                key={tab.id}
                scaleTo={0.95}
                style={[
                  styles.filterPill,
                  isActive && styles.filterPillActive,
                ]}
                onPress={() => {
                  triggerSelectionHaptic();
                  setFilterType(tab.id);
                }}>
                <Ionicons
                  name={tab.icon}
                  size={14}
                  color={isActive ? '#FFFFFF' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.filterPillText,
                    isActive && styles.filterPillTextActive,
                  ]}>
                  {tab.label}
                </Text>
                {showCount && (
                  <View
                    style={[
                      styles.pillCount,
                      isActive && styles.pillCountActive,
                    ]}>
                    <Text
                      style={[
                        styles.pillCountText,
                        isActive && styles.pillCountTextActive,
                        !isActive && count === 0 && styles.pillCountTextZero,
                      ]}>
                      {count}
                    </Text>
                  </View>
                )}
              </ScalePressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Body */}
      {isSearching ? (
        <ScrollView
          style={styles.resultsScroll}
          contentContainerStyle={styles.resultsContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {filterType === 'all' ? (
            <SearchAllSkeleton />
          ) : filterType === 'artist' ? (
            <ArtistListCardSkeletonList count={5} />
          ) : (
            <SongRowSkeletonList count={5} />
          )}
        </ScrollView>
      ) : !hasSearched ? (
        <ScrollView
          style={styles.resultsScroll}
          contentContainerStyle={styles.resultsContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.suggestionsContainer}>
            {searchHistory.length > 0 ? (
              <>
                <View style={styles.historyHeaderRow}>
                  <View style={styles.suggestionsHeaderLeft}>
                    <Ionicons
                      name="time-outline"
                      size={16}
                      color={colors.secondary}
                    />
                    <Text style={styles.suggestionsTitle}>Notadiavina farany</Text>
                  </View>
                  <Pressable
                    onPress={handleClearHistory}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
                    <Text style={styles.clearHistoryText}>Fafao rehetra</Text>
                  </Pressable>
                </View>

                <View style={styles.tagsGrid}>
                  {searchHistory.map(item => (
                    <Animated.View
                      key={item.toLowerCase()}
                      entering={FadeIn.duration(180).reduceMotion(ReduceMotion.Never)}
                      exiting={FadeOut.duration(140).reduceMotion(ReduceMotion.Never)}
                      layout={LinearTransition.springify().damping(18).reduceMotion(ReduceMotion.Never)}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.historyChip,
                          pressed && styles.tagChipPressed,
                        ]}
                        onPress={() => {
                          triggerSelectionHaptic();
                          setQuery(item);
                          commitSearchHistory(item);
                        }}>
                        <Ionicons
                          name="time-outline"
                          size={14}
                          color={colors.secondary}
                        />
                        <Text style={styles.historyChipText} numberOfLines={1}>
                          {item}
                        </Text>
                        <Pressable
                          onPress={e => {
                            e.stopPropagation?.();
                            handleRemoveHistoryItem(item);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 6, right: 8 }}
                          style={({ pressed }) => [
                            styles.historyChipRemoveBtn,
                            pressed && { opacity: 0.6 },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Esory ${item}`}>
                          <Ionicons
                            name="close"
                            size={13}
                            color={colors.textSecondary}
                          />
                        </Pressable>
                      </Pressable>
                    </Animated.View>
                  ))}
                </View>
              </>
            ) : (
              <>
                <View style={styles.suggestionsHeaderRow}>
                  <Ionicons
                    name="trending-up"
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={styles.suggestionsTitle}>Soso-kevitra fitadiavana</Text>
                </View>

                <View style={styles.tagsGrid}>
                  {SUGGESTED_SEARCHES.map(tag => (
                    <ScalePressable
                      key={tag}
                      scaleTo={0.94}
                      style={styles.tagChip}
                      onPress={() => {
                        triggerSelectionHaptic();
                        setQuery(tag);
                        commitSearchHistory(tag);
                        inputRef.current?.focus();
                      }}>
                      <Ionicons
                        name="search"
                        size={13}
                        color={colors.primary}
                      />
                      <Text style={styles.tagText}>{tag}</Text>
                    </ScalePressable>
                  ))}
                </View>

                <Text style={styles.suggestionsHint}>
                  Mitadiava anaran’ny mpihira, lohatenin-kira na andalan-tononkira.
                </Text>
              </>
            )}
          </View>
        </ScrollView>
      ) : filterType === 'all' ? (
        <ScrollView
          style={styles.resultsScroll}
          contentContainerStyle={styles.resultsContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {renderAllResults()}
        </ScrollView>
      ) : filterType === 'artist' ? (
        <FlatList
          key="list-artist"
          data={results.artists}
          keyExtractor={item => `artist-${item.id}`}
          renderItem={renderArtistTabItem}
          ItemSeparatorComponent={renderArtistSeparator}
          ListHeaderComponent={renderListHeader(
            'Mpihira hita',
            results.artists.length,
            results.counts.artists,
            'mpihira'
          )}
          ListEmptyComponent={renderCrossTabSuggestions('artist')}
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.resultsContent}
        />
      ) : filterType === 'title' ? (
        <FlatList
          key="list-title"
          data={results.titleSongs}
          keyExtractor={item => `title-${item.id}`}
          renderItem={renderSongTabItem}
          ListHeaderComponent={renderListHeader(
            'Lohateny hita',
            results.titleSongs.length,
            results.counts.titles,
            'hira'
          )}
          ListEmptyComponent={renderCrossTabSuggestions('title')}
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.resultsContent}
        />
      ) : (
        <FlatList
          key="list-lyrics"
          data={results.lyricsSongs}
          keyExtractor={item => `lyrics-${item.id}`}
          renderItem={renderSongTabItem}
          ListHeaderComponent={renderListHeader(
            'Tononkira hita',
            results.lyricsSongs.length,
            results.counts.lyrics,
            'hira'
          )}
          ListEmptyComponent={renderCrossTabSuggestions('lyrics')}
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.resultsContent}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
    },
    brandSubtitle: {
      fontSize: 9.5,
      ...fontStyle('extraBold'),
      color: colors.primary,
      letterSpacing: 1.5,
    },
    headerTitle: {
      fontSize: 24,
      ...fontStyle('extraBold'),
      color: colors.text,
      letterSpacing: -0.5,
    },
    searchBarContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.xs,
      paddingBottom: Spacing.xs,
      gap: Spacing.sm,
    },
    searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainer,
      borderRadius: Radius.full,
      paddingHorizontal: Spacing.md,
      paddingVertical: 11,
      borderWidth: 1.5,
      borderColor: colors.border,
      gap: Spacing.sm,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: colors.isDark ? 0.14 : 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    searchBarFocused: {
      borderColor: colors.primary,
      shadowColor: colors.primary,
      shadowOpacity: colors.isDark ? 0.22 : 0.14,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      ...fontStyle('medium'),
      color: colors.text,
      padding: 0,
      ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
    },
    clearBtn: {
      padding: 2,
    },
    cancelBtn: {
      paddingHorizontal: Spacing.xs,
    },
    cancelText: {
      fontSize: 14,
      ...fontStyle('bold'),
      color: colors.primary,
    },
    filtersSection: {
      paddingVertical: Spacing.xs,
    },
    filterScroll: {
      paddingHorizontal: Spacing.md,
      gap: 8,
    },
    filterPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 13,
      paddingVertical: 7.5,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterPillText: {
      fontSize: 12,
      ...fontStyle('semiBold'),
      color: colors.textSecondary,
    },
    filterPillTextActive: {
      color: '#FFFFFF',
      ...fontStyle('bold'),
    },
    pillCount: {
      backgroundColor: colors.surfaceContainerLowest,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: Radius.full,
      minWidth: 20,
      alignItems: 'center',
    },
    pillCountActive: {
      backgroundColor: 'rgba(0, 0, 0, 0.22)',
    },
    pillCountText: {
      fontSize: 10,
      ...fontStyle('bold'),
      color: colors.textSecondary,
    },
    pillCountTextActive: {
      color: '#FFFFFF',
    },
    pillCountTextZero: {
      color: colors.textMuted,
    },
    resultsScroll: {
      flex: 1,
    },
    resultsContent: {
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
      paddingBottom: 112,
    },
    allSectionsContainer: {
      gap: Spacing.lg,
      paddingTop: Spacing.xs,
    },
    sectionBlock: {
      gap: Spacing.sm,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 2,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    sectionTitle: {
      fontSize: 17,
      ...fontStyle('bold'),
      color: colors.text,
      letterSpacing: -0.2,
    },
    amberBar: {
      width: 3.5,
      height: 16,
      borderRadius: 2,
      backgroundColor: colors.secondary,
    },
    primaryBar: {
      width: 3.5,
      height: 16,
      borderRadius: 2,
      backgroundColor: colors.primary,
    },
    emeraldBar: {
      width: 3.5,
      height: 16,
      borderRadius: 2,
      backgroundColor: colors.tertiary,
    },
    sectionCountBadge: {
      backgroundColor: colors.surfaceContainerHigh,
      paddingHorizontal: 7,
      paddingVertical: 1.5,
      borderRadius: Radius.full,
    },
    sectionCountText: {
      fontSize: 11,
      ...fontStyle('bold'),
      color: colors.textSecondary,
    },
    seeAllText: {
      fontSize: 13,
      ...fontStyle('semiBold'),
      color: colors.primary,
    },
    artistsSectionList: {
      gap: 10,
    },
    artistCardSeparator: {
      height: 10,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
      paddingVertical: 2,
    },
    statusLabel: {
      fontSize: 12,
      ...fontStyle('bold'),
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    statusCount: {
      fontSize: 12,
      ...fontStyle('bold'),
      color: colors.primary,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      paddingHorizontal: Spacing.md,
      gap: Spacing.sm,
    },
    emptyIconBg: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.xs,
    },
    emptyTitle: {
      fontSize: 16,
      ...fontStyle('bold'),
      color: colors.text,
      textAlign: 'center',
    },
    emptyDesc: {
      fontSize: 13,
      ...fontStyle('regular'),
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
    },
    crossTabRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
      marginTop: Spacing.sm,
    },
    crossTabChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primaryWash,
      borderWidth: 1,
      borderColor: colors.primaryBorderWash,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: Radius.full,
    },
    crossTabChipText: {
      fontSize: 13,
      ...fontStyle('bold'),
      color: colors.primary,
    },
    suggestionsContainer: {
      paddingTop: Spacing.md,
    },
    suggestionsHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: Spacing.md,
    },
    historyHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.md,
    },
    suggestionsHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    suggestionsTitle: {
      fontSize: 13,
      ...fontStyle('bold'),
      color: colors.textSecondary,
      letterSpacing: 0.3,
    },
    clearHistoryText: {
      fontSize: 12,
      ...fontStyle('semiBold'),
      color: colors.primary,
    },
    historyChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surfaceContainer,
      paddingLeft: 12,
      paddingRight: 8,
      paddingVertical: 7.5,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      maxWidth: '100%',
    },
    historyChipText: {
      fontSize: 13,
      ...fontStyle('semiBold'),
      color: colors.text,
      flexShrink: 1,
    },
    historyChipRemoveBtn: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 2,
    },
    tagsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    tagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surfaceContainer,
      paddingHorizontal: 13,
      paddingVertical: 8.5,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tagChipPressed: {
      opacity: 0.78,
      transform: [{ scale: 0.96 }],
    },
    tagText: {
      fontSize: 13,
      ...fontStyle('semiBold'),
      color: colors.text,
    },
    suggestionsHint: {
      marginTop: Spacing.lg,
      fontSize: 12,
      ...fontStyle('regular'),
      color: colors.textMuted,
      lineHeight: 17,
    },
  });
