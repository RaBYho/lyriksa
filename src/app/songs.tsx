import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TextInput,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  ReduceMotion,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { fontStyle, Radius, Spacing, ThemePalette } from '@/constants/theme';
import { useThemePalette } from '@/context/AppSettingsContext';
import { SongRow } from '@/components/SongRow';
import { SongRowSkeletonList } from '@/components/Skeleton';
import { ScalePressable } from '@/components/ScalePressable';
import { triggerLightHaptic, triggerSelectionHaptic } from '@/utils/haptics';
import {
  getSongsPaginated,
  getSongCategoryCounts,
  toggleFavorite,
  Song,
} from '@/services/database';

interface CategoryItem {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  colorKey: 'primary' | 'secondary';
}

const CATEGORIES: CategoryItem[] = [
  { id: 'rehetra', name: 'Rehetra', icon: 'musical-notes', colorKey: 'primary' },
  { id: 'folk', name: 'Folk & Bagasy', icon: 'musical-notes', colorKey: 'primary' },
  { id: 'rock', name: 'Pop & Rock', icon: 'flash', colorKey: 'secondary' },
  { id: 'fiderana', name: 'Hira Fiderana', icon: 'sparkles', colorKey: 'secondary' },
  { id: 'kalos', name: "Kalon'ny Fahiny", icon: 'disc', colorKey: 'primary' },
  { id: 'vakodrazana', name: 'Vakodrazana', icon: 'flame', colorKey: 'secondary' },
];

const PAGE_SIZE = 50;

export default function AllSongsScreen() {
  const router = useRouter();
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const params = useLocalSearchParams<{ sort?: string }>();
  const [songs, setSongs] = useState<Song[]>([]);
  const [totalSongs, setTotalSongs] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('rehetra');
  const [activeSort, setActiveSort] = useState<'all' | 'recent'>(
    params.sort === 'recent' ? 'recent' : 'all'
  );
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [sortTrackWidth, setSortTrackWidth] = useState(0);
  const offsetRef = useRef(0);

  const sortProgress = useSharedValue(activeSort === 'recent' ? 1 : 0);

  useEffect(() => {
    sortProgress.value = withSpring(activeSort === 'recent' ? 1 : 0, {
      damping: 20,
      stiffness: 240,
      mass: 0.7,
      reduceMotion: ReduceMotion.Never,
    });
  }, [activeSort, sortProgress]);

  const sortThumbWidth = Math.max(0, (sortTrackWidth - 8) / 2);
  const sortThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sortProgress.value * sortThumbWidth }],
  }));

  // Load category counts once
  useEffect(() => {
    getSongCategoryCounts().then(counts => {
      setCategoryCounts(counts);
    });
  }, []);

  // Update sort when params change
  useEffect(() => {
    if (params.sort === 'recent') {
      setActiveSort('recent');
    }
  }, [params.sort]);

  const loadInitial = useCallback(
    async (cat = selectedCategory, q = search, sort = activeSort) => {
      try {
        setLoading(true);
        offsetRef.current = 0;
        const res = await getSongsPaginated({
          limit: PAGE_SIZE,
          offset: 0,
          search: q,
          category: cat,
          sort: sort,
        });
        setSongs(res.songs);
        setTotalSongs(res.total);
        setHasMore(res.hasMore);
        offsetRef.current = res.songs.length;
      } catch (err) {
        console.warn('Error loading initial songs:', err);
      } finally {
        setLoading(false);
      }
    },
    [selectedCategory, search, activeSort]
  );

  // Trigger reload on filter/search/sort change with debounce for search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadInitial(selectedCategory, search, activeSort);
    }, 200);
    return () => clearTimeout(timer);
  }, [search, selectedCategory, activeSort, loadInitial]);

  // Load more on scroll
  const handleLoadMore = async () => {
    if (loading || loadingMore || !hasMore) return;
    try {
      setLoadingMore(true);
      const res = await getSongsPaginated({
        limit: PAGE_SIZE,
        offset: offsetRef.current,
        search: search,
        category: selectedCategory,
        sort: activeSort,
      });
      setSongs(prev => [...prev, ...res.songs]);
      setHasMore(res.hasMore);
      offsetRef.current += res.songs.length;
    } catch (err) {
      console.warn('Error loading more songs:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleToggleFavorite = useCallback(async (songId: string) => {
    await toggleFavorite(songId);
    setSongs(prev =>
      prev.map(s => (s.id === songId ? { ...s, is_favorite: !s.is_favorite } : s))
    );
  }, []);

  const renderSongItem = useCallback(
    ({ item: song }: { item: Song }) => (
      <SongRow song={song} onToggleFavorite={handleToggleFavorite} />
    ),
    [handleToggleFavorite]
  );

  const currentCategoryInfo = CATEGORIES.find(c => c.id === selectedCategory) || CATEGORIES[0];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Navigation Header */}
      <View style={styles.header}>
        <ScalePressable
          style={styles.backButton}
          scaleTo={0.95}
          onPress={() => {
            triggerLightHaptic();
            router.back();
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={styles.backLabel}>Hiverina</Text>
        </ScalePressable>
      </View>

      {/* Screen Title */}
      <View style={styles.titleContainer}>
        <Text style={styles.eyebrow}>KATALOGY</Text>
        <Text style={styles.title}>
          {activeSort === 'recent' ? 'Hira Vao Nampidirina' : 'Hira Rehetra'}
        </Text>
        <Text style={styles.subtitle}>
          {totalSongs > 0
            ? `${totalSongs.toLocaleString()} tononkira malagasy`
            : 'Tononkira malagasy'}{' '}
          {activeSort === 'recent' ? 'nampidirina farany' : 'voatahiry'}
        </Text>
      </View>

      {/* Search Input */}
      <View style={[styles.searchBar, searchFocused && styles.searchBarFocused]}>
        <Ionicons
          name="search"
          size={18}
          color={searchFocused ? colors.primary : colors.textSecondary}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Hitady lohateny, mpihira, tononkira..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          returnKeyType="search"
        />
        {search ? (
          <ScalePressable
            scaleTo={0.88}
            onPress={() => {
              triggerLightHaptic();
              setSearch('');
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </ScalePressable>
        ) : null}
      </View>

      {/* Segmented Sort Toggle Track */}
      <View style={styles.sortWrapper}>
        <View
          style={styles.sortTrack}
          onLayout={e => setSortTrackWidth(e.nativeEvent.layout.width)}>
          {sortThumbWidth > 0 && (
            <Animated.View
              style={[
                styles.sortThumb,
                { width: sortThumbWidth },
                sortThumbStyle,
              ]}
            />
          )}

          <ScalePressable
            scaleTo={0.97}
            style={[
              styles.sortTab,
              sortThumbWidth === 0 && activeSort === 'all' && styles.sortTabFallbackActive,
            ]}
            onPress={() => {
              if (activeSort !== 'all') {
                triggerSelectionHaptic();
                setActiveSort('all');
              }
            }}>
            <Ionicons
              name="musical-notes"
              size={14}
              color={activeSort === 'all' ? colors.onPrimary : colors.textSecondary}
            />
            <Text
              style={[
                styles.sortTabText,
                activeSort === 'all' && styles.sortTabTextActive,
              ]}>
              Hira rehetra
            </Text>
          </ScalePressable>

          <ScalePressable
            scaleTo={0.97}
            style={[
              styles.sortTab,
              sortThumbWidth === 0 && activeSort === 'recent' && styles.sortTabFallbackActive,
            ]}
            onPress={() => {
              if (activeSort !== 'recent') {
                triggerSelectionHaptic();
                setActiveSort('recent');
              }
            }}>
            <Ionicons
              name="sparkles"
              size={14}
              color={activeSort === 'recent' ? colors.onPrimary : colors.textSecondary}
            />
            <Text
              style={[
                styles.sortTabText,
                activeSort === 'recent' && styles.sortTabTextActive,
              ]}>
              Vaovao (Récents)
            </Text>
          </ScalePressable>
        </View>
      </View>

      {/* Category Banners */}
      <View style={styles.bannersSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}>
          {CATEGORIES.map(cat => {
            const isActive = selectedCategory === cat.id;
            const count = categoryCounts[cat.id] ?? (cat.id === 'rehetra' ? totalSongs : 0);

            return (
              <ScalePressable
                key={cat.id}
                scaleTo={0.95}
                style={[
                  styles.categoryBanner,
                  isActive && styles.categoryBannerActive,
                ]}
                onPress={() => {
                  if (selectedCategory !== cat.id) {
                    triggerSelectionHaptic();
                    setSelectedCategory(cat.id);
                  }
                }}>
                <Ionicons
                  name={cat.icon}
                  size={15}
                  color={isActive ? colors.onPrimary : colors[cat.colorKey]}
                />

                <Text
                  style={[
                    styles.categoryText,
                    isActive && styles.categoryTextActive,
                  ]}>
                  {cat.name}
                </Text>

                <View
                  style={[
                    styles.countPill,
                    isActive && styles.countPillActive,
                  ]}>
                  <Text
                    style={[
                      styles.countPillText,
                      isActive && styles.countPillTextActive,
                    ]}>
                    {count}
                  </Text>
                </View>
              </ScalePressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Category & Results Status Row */}
      <View style={styles.statusRow}>
        <Text style={styles.statusText}>
          {selectedCategory === 'rehetra'
            ? 'Hira rehetra'
            : currentCategoryInfo.name}
        </Text>
        <Text style={styles.statusCount}>
          {totalSongs.toLocaleString()} hira
        </Text>
      </View>

      {/* Virtualized & Paginated Song List */}
      <FlatList
        data={loading && songs.length === 0 ? [] : songs}
        keyExtractor={item => item.id}
        renderItem={renderSongItem}
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.footerLoaderText}>Maka hira manaraka...</Text>
            </View>
          ) : !hasMore && songs.length > 0 ? (
            <View style={styles.footerEnd}>
              <Ionicons name="checkmark-circle-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.footerEndText}>
                Tonga amin'ny faran'ny lisitra ({songs.length.toLocaleString()} hira)
              </Text>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          loading ? (
            <SongRowSkeletonList count={8} />
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconOuter}>
                <View style={styles.emptyIconBg}>
                  <Ionicons name="search-outline" size={34} color={colors.outline} />
                </View>
              </View>
              <Text style={styles.emptyTitle}>Tsy nisy hira mifanaraka amin'ny sivana</Text>
              <Text style={styles.emptySubtitle}>
                Andramo ovaina ny teny tadiavina na fidio ny sokajy « Rehetra ».
              </Text>
              <ScalePressable
                style={styles.resetBtn}
                scaleTo={0.96}
                onPress={() => {
                  triggerSelectionHaptic();
                  setSearch('');
                  setSelectedCategory('rehetra');
                }}>
                <Text style={styles.resetBtnText}>Asehoy ny hira rehetra</Text>
              </ScalePressable>
            </View>
          )
        }
      />
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
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.xs,
      paddingBottom: 6,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 38,
    },
    backLabel: {
      fontSize: 14,
      color: colors.primary,
      ...fontStyle('semiBold'),
    },
    titleContainer: {
      paddingHorizontal: Spacing.lg,
      paddingTop: 6,
      paddingBottom: Spacing.sm,
    },
    eyebrow: {
      color: colors.primary,
      fontSize: 10,
      letterSpacing: 1.8,
      marginBottom: 4,
      ...fontStyle('bold'),
    },
    title: {
      fontSize: 30,
      color: colors.text,
      letterSpacing: -0.6,
      ...fontStyle('extraBold'),
    },
    subtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
      ...fontStyle('regular'),
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
      marginHorizontal: Spacing.lg,
      marginTop: 6,
      marginBottom: Spacing.sm,
      paddingHorizontal: Spacing.md,
      height: 46,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
    },
    searchBarFocused: {
      borderColor: colors.primary,
      backgroundColor: colors.surfaceContainerHigh,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
      height: '100%',
      ...fontStyle('regular'),
    },
    sortWrapper: {
      paddingHorizontal: Spacing.lg,
      marginBottom: Spacing.sm,
    },
    sortTrack: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 4,
    },
    sortThumb: {
      position: 'absolute',
      top: 4,
      left: 4,
      bottom: 4,
      borderRadius: Radius.full,
      backgroundColor: colors.primary,
    },
    sortTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      gap: 6,
      borderRadius: Radius.full,
      zIndex: 1,
    },
    sortTabFallbackActive: {
      backgroundColor: colors.primary,
    },
    sortTabText: {
      color: colors.textSecondary,
      fontSize: 12.5,
      ...fontStyle('bold'),
    },
    sortTabTextActive: {
      color: colors.onPrimary,
    },
    bannersSection: {
      marginBottom: Spacing.sm,
    },
    categoryScroll: {
      paddingHorizontal: Spacing.lg,
      gap: 8,
      paddingVertical: 4,
    },
    categoryBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radius.full,
      gap: 7,
      minHeight: 38,
    },
    categoryBannerActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    categoryText: {
      fontSize: 13,
      color: colors.text,
      ...fontStyle('semiBold'),
    },
    categoryTextActive: {
      color: colors.onPrimary,
    },
    countPill: {
      backgroundColor: colors.surfaceContainerHigh,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: Radius.full,
    },
    countPillActive: {
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
    },
    countPillText: {
      fontSize: 11,
      color: colors.textSecondary,
      ...fontStyle('bold'),
    },
    countPillTextActive: {
      color: colors.onPrimary,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingVertical: 8,
    },
    statusText: {
      fontSize: 15,
      color: colors.text,
      letterSpacing: -0.2,
      ...fontStyle('bold'),
    },
    statusCount: {
      fontSize: 12,
      color: colors.textSecondary,
      ...fontStyle('semiBold'),
    },
    scrollContent: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.xs,
      paddingBottom: 60,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.xxl,
      paddingHorizontal: Spacing.lg,
    },
    emptyIconOuter: {
      padding: 6,
      borderRadius: Radius.full,
      backgroundColor: colors.bezelOuter,
      borderWidth: 1,
      borderColor: colors.bezelOuterBorder,
      marginBottom: Spacing.md,
    },
    emptyIconBg: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      fontSize: 17,
      color: colors.text,
      textAlign: 'center',
      ...fontStyle('bold'),
    },
    emptySubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginTop: 6,
      maxWidth: 290,
      ...fontStyle('regular'),
    },
    resetBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: Spacing.lg,
      paddingVertical: 11,
      borderRadius: Radius.full,
      marginTop: Spacing.lg,
    },
    resetBtnText: {
      color: colors.onPrimary,
      fontSize: 13,
      ...fontStyle('bold'),
    },
    footerLoader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.lg,
      gap: 8,
    },
    footerLoaderText: {
      color: colors.textSecondary,
      fontSize: 13,
      ...fontStyle('medium'),
    },
    footerEnd: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.lg,
      gap: 6,
      opacity: 0.7,
    },
    footerEndText: {
      color: colors.textSecondary,
      fontSize: 12,
      ...fontStyle('medium'),
    },
  });
