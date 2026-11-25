import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  ReduceMotion,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
  FadeOutDown,
} from 'react-native-reanimated';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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
} from '@/components/Skeleton';
import {
  getFavoriteSongs,
  getFavoriteArtistsList,
  toggleFavorite,
  toggleFavoriteArtist,
  Song,
  Artist,
} from '@/services/database';

type TahiryTab = 'songs' | 'artists';
type CategoryKey = 'rehetra' | 'fiderana' | 'folk' | 'rock' | 'kalos' | 'vakodrazana';

interface CategoryBanner {
  id: CategoryKey;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  colorKey: 'primary' | 'secondary';
}

interface UndoAction {
  type: TahiryTab;
  label: string;
  song?: Song;
  artist?: Artist;
  index: number;
}

const CATEGORIES: CategoryBanner[] = [
  { id: 'rehetra', name: 'Tiako Rehetra', icon: 'heart', colorKey: 'primary' },
  { id: 'fiderana', name: 'Hira Fiderana', icon: 'sparkles', colorKey: 'secondary' },
  { id: 'folk', name: 'Folk & Bagasy', icon: 'musical-notes', colorKey: 'primary' },
  { id: 'rock', name: 'Pop & Rock', icon: 'flash', colorKey: 'secondary' },
  { id: 'kalos', name: "Kalon'ny Fahiny", icon: 'disc', colorKey: 'primary' },
  { id: 'vakodrazana', name: 'Vakodrazana', icon: 'flame', colorKey: 'secondary' },
];

export default function SongbookScreen() {
  const router = useRouter();
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const params = useLocalSearchParams<{ tab?: string; t?: string }>();

  const [activeTab, setActiveTab] = useState<TahiryTab>(
    params.tab === 'artists' ? 'artists' : 'songs'
  );
  const [trackWidth, setTrackWidth] = useState(0);
  const thumbX = useSharedValue(0);

  const [favorites, setFavorites] = useState<Song[]>([]);
  const [favoriteArtists, setFavoriteArtists] = useState<Artist[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('rehetra');
  const [searchQuery, setSearchQuery] = useState('');
  const [artistSearchQuery, setArtistSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (params.tab === 'artists' || params.tab === 'songs') {
      setActiveTab(params.tab);
    }
  }, [params.tab, params.t]);

  useEffect(() => {
    if (trackWidth <= 0) return;
    const segmentW = (trackWidth - 8) / 2;
    const target = activeTab === 'songs' ? 0 : segmentW;
    thumbX.value = withSpring(target, {
      damping: 19,
      stiffness: 220,
      mass: 0.85,
      reduceMotion: ReduceMotion.Never,
    });
  }, [activeTab, trackWidth, thumbX]);

  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbX.value }],
  }));

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const showUndoToast = useCallback((action: UndoAction) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoAction(action);
    undoTimerRef.current = setTimeout(() => {
      setUndoAction(null);
    }, 3500);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [favList, favArtistList] = await Promise.all([
        getFavoriteSongs(),
        getFavoriteArtistsList(),
      ]);
      setFavorites(favList);
      setFavoriteArtists(favArtistList);
    } catch (err) {
      console.warn('Error loading favorites in Tahiry:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleToggleSongFavorite = useCallback(
    async (songId: string) => {
      const idx = favorites.findIndex(s => s.id === songId);
      const removedSong = idx !== -1 ? favorites[idx] : undefined;
      setFavorites(prev => prev.filter(s => s.id !== songId));

      try {
        const isNowFav = await toggleFavorite(songId);
        if (isNowFav) {
          await loadData();
        } else if (removedSong) {
          showUndoToast({
            type: 'songs',
            label: `Nesorina « ${removedSong.title} »`,
            song: removedSong,
            index: idx,
          });
        }
      } catch {
        await loadData();
      }
    },
    [favorites, loadData, showUndoToast]
  );

  const handleToggleArtistFavorite = useCallback(
    async (artistId: string) => {
      const idx = favoriteArtists.findIndex(
        a => a.id === artistId || a.slug === artistId
      );
      const removedArtist = idx !== -1 ? favoriteArtists[idx] : undefined;
      setFavoriteArtists(prev =>
        prev.filter(a => a.id !== artistId && a.slug !== artistId)
      );

      try {
        const isNowFav = await toggleFavoriteArtist(artistId);
        if (isNowFav) {
          await loadData();
        } else if (removedArtist) {
          showUndoToast({
            type: 'artists',
            label: `Nesorina « ${removedArtist.name} »`,
            artist: removedArtist,
            index: idx,
          });
        }
      } catch {
        await loadData();
      }
    },
    [favoriteArtists, loadData, showUndoToast]
  );

  const handleUndo = useCallback(async () => {
    if (!undoAction) return;
    triggerSelectionHaptic();
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const action = undoAction;
    setUndoAction(null);

    if (action.type === 'songs' && action.song) {
      const restored = { ...action.song, is_favorite: true };
      setFavorites(prev => {
        if (prev.some(s => s.id === restored.id)) return prev;
        const copy = [...prev];
        copy.splice(Math.min(action.index, copy.length), 0, restored);
        return copy;
      });
      await toggleFavorite(restored.id);
    } else if (action.type === 'artists' && action.artist) {
      const restored = { ...action.artist, is_favorite: true };
      setFavoriteArtists(prev => {
        if (prev.some(a => a.id === restored.id)) return prev;
        const copy = [...prev];
        copy.splice(Math.min(action.index, copy.length), 0, restored);
        return copy;
      });
      await toggleFavoriteArtist(restored.id);
    }
  }, [undoAction]);

  const matchesCategory = (song: Song, cat: CategoryKey): boolean => {
    if (cat === 'rehetra') return true;
    const c = (song.category || '').toLowerCase();
    const a = (song.artist_name || '').toLowerCase();

    if (cat === 'fiderana') {
      return c.includes('fiderana') || c.includes('gospel') || a.includes('barea');
    }
    if (cat === 'folk') {
      return (
        c.includes('folk') ||
        c.includes('acoustic') ||
        ['mahaleo', 'erick manana', 'dama'].some(name => a.includes(name))
      );
    }
    if (cat === 'rock') {
      return (
        c.includes('rock') ||
        c.includes('pop') ||
        ['ambondrona', 'mage 4', 'kiaka'].some(name => a.includes(name))
      );
    }
    if (cat === 'kalos') {
      return (
        c.includes('kalo') ||
        c.includes('classique') ||
        c.includes('romantique') ||
        ['henri ratsimbazafy', 'rebika'].some(name => a.includes(name))
      );
    }
    if (cat === 'vakodrazana') {
      return c.includes('vako') || a.includes('rossy');
    }
    return false;
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryKey, number> = {
      rehetra: favorites.length,
      fiderana: 0,
      folk: 0,
      rock: 0,
      kalos: 0,
      vakodrazana: 0,
    };

    favorites.forEach(song => {
      (Object.keys(counts) as CategoryKey[]).forEach(k => {
        if (k !== 'rehetra' && matchesCategory(song, k)) {
          counts[k] += 1;
        }
      });
    });

    return counts;
  }, [favorites]);

  const displayedFavorites = useMemo(() => {
    let list = favorites.filter(song => matchesCategory(song, activeCategory));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        s =>
          s.title.toLowerCase().includes(q) ||
          s.artist_name.toLowerCase().includes(q) ||
          (s.featured_artists?.some(f => f.toLowerCase().includes(q)) ?? false) ||
          s.lyrics.toLowerCase().includes(q)
      );
    }

    return list;
  }, [favorites, activeCategory, searchQuery]);

  const displayedArtists = useMemo(() => {
    if (!artistSearchQuery.trim()) return favoriteArtists;
    const q = artistSearchQuery.toLowerCase().trim();
    return favoriteArtists.filter(
      a =>
        a.name.toLowerCase().includes(q) ||
        (a.category && a.category.toLowerCase().includes(q))
    );
  }, [favoriteArtists, artistSearchQuery]);

  const handleRandomSong = () => {
    if (displayedFavorites.length === 0) return;
    triggerSelectionHaptic();
    const randomIndex = Math.floor(Math.random() * displayedFavorites.length);
    router.push(`/song/${displayedFavorites[randomIndex].id}` as any);
  };

  const activeCategoryInfo =
    CATEGORIES.find(c => c.id === activeCategory) || CATEGORIES[0];

  const renderSongItem = useCallback(
    ({ item }: { item: Song }) => (
      <SongRow
        song={{ ...item, is_favorite: true }}
        onToggleFavorite={handleToggleSongFavorite}
        highlightText={searchQuery}
      />
    ),
    [handleToggleSongFavorite, searchQuery]
  );

  const renderArtistItem = useCallback(
    ({ item }: { item: Artist }) => (
      <ArtistListCard
        artist={{ ...item, is_favorite: true }}
        onToggleFavorite={handleToggleArtistFavorite}
        highlightText={artistSearchQuery}
      />
    ),
    [handleToggleArtistFavorite, artistSearchQuery]
  );

  const renderSongsHeader = () => {
    if (favorites.length === 0) return undefined;
    return (
      <View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Hitady ao amin'ny hira voatahiry..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery ? (
            <Pressable
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.bannersSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScroll}>
            {CATEGORIES.map(cat => {
              const isActive = activeCategory === cat.id;
              const count = categoryCounts[cat.id];

              return (
                <ScalePressable
                  key={cat.id}
                  scaleTo={0.95}
                  style={[
                    styles.categoryBanner,
                    isActive && styles.categoryBannerActive,
                  ]}
                  onPress={() => {
                    triggerSelectionHaptic();
                    setActiveCategory(cat.id);
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

        <View style={styles.listHeaderRow}>
          <Text style={styles.listHeaderTitle}>
            {activeCategory === 'rehetra'
              ? 'Hira voatahiry rehetra'
              : `Hira voatahiry — ${activeCategoryInfo.name}`}
          </Text>
          <Text style={styles.listHeaderCount}>
            {displayedFavorites.length} hira
          </Text>
        </View>
      </View>
    );
  };

  const renderArtistsHeader = () => {
    if (favoriteArtists.length === 0) return undefined;
    return (
      <View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Hitady mpihira voatahiry..."
            placeholderTextColor={colors.textSecondary}
            value={artistSearchQuery}
            onChangeText={setArtistSearchQuery}
            returnKeyType="search"
          />
          {artistSearchQuery ? (
            <Pressable
              onPress={() => setArtistSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.listHeaderRow}>
          <Text style={styles.listHeaderTitle}>Mpihira ankafizinao</Text>
          <Text style={styles.listHeaderCount}>
            {displayedArtists.length} mpihira
          </Text>
        </View>
      </View>
    );
  };

  const renderSongsEmpty = () => {
    if (loading) {
      return <SongRowSkeletonList count={5} />;
    }
    return (
      <View style={styles.emptyBezelOuter}>
        <View style={styles.emptyState}>
          <View style={styles.emptyIconBg}>
            <Ionicons name="heart-outline" size={34} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>
            {favorites.length === 0
              ? 'Tsy mbola misy hira voatahiry'
              : searchQuery.trim()
                ? 'Tsy nisy hira mifanaraka'
                : `Tsy misy ${activeCategoryInfo.name} voatahiry`}
          </Text>
          <Text style={styles.emptyDesc}>
            {favorites.length === 0
              ? "Kitiho ny fo kely eo amin'ny hira ankafizinao mba hanangonana azy eto amin'ny Tahirinao."
              : searchQuery.trim()
                ? 'Andramo ovaina ny teny fikarohana na ny sokajy.'
                : `Tsy mbola nanisy marika tamin'ny hira ao amin'ny ${activeCategoryInfo.name} ianao.`}
          </Text>
          <View style={styles.emptyActions}>
            <ScalePressable
              style={styles.exploreBtn}
              scaleTo={0.96}
              onPress={() => router.push('/songs' as any)}>
              <Ionicons name="musical-notes" size={16} color={colors.onPrimary} />
              <Text style={styles.exploreBtnText}>Hijery hira rehetra</Text>
            </ScalePressable>
            <ScalePressable
              style={styles.searchBtnAlt}
              scaleTo={0.96}
              onPress={() => router.push('/search' as any)}>
              <Text style={styles.searchBtnAltText}>Hitady hira</Text>
            </ScalePressable>
          </View>
        </View>
      </View>
    );
  };

  const renderArtistsEmpty = () => {
    if (loading) {
      return <ArtistListCardSkeletonList count={4} />;
    }
    return (
      <View style={styles.emptyBezelOuter}>
        <View style={styles.emptyState}>
          <View style={styles.emptyIconBg}>
            <Ionicons name="people-outline" size={34} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>
            {favoriteArtists.length === 0
              ? 'Tsy mbola misy mpihira voatahiry'
              : 'Tsy nisy mpihira mifanaraka'}
          </Text>
          <Text style={styles.emptyDesc}>
            {favoriteArtists.length === 0
              ? "Tsindrio ny fo eo amin'ny mpihira na tarika tianao mba hiseho eto sy eo amin'ny fandraisana."
              : 'Andramo ovaina ny teny tadiavina ao amin’ny tahiry.'}
          </Text>
          <View style={styles.emptyActions}>
            <ScalePressable
              style={styles.exploreBtn}
              scaleTo={0.96}
              onPress={() => router.push('/artists' as any)}>
              <Ionicons name="add" size={18} color={colors.onPrimary} />
              <Text style={styles.exploreBtnText}>Hisafidy mpihira</Text>
            </ScalePressable>
          </View>
        </View>
      </View>
    );
  };

  const segmentWidth = trackWidth > 0 ? (trackWidth - 8) / 2 : 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Editorial Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandSubtitle}>NY TAHIRIKO</Text>
          <Text style={styles.headerTitle}>Tahiry</Text>
        </View>

        <View style={styles.headerActions}>
          {activeTab === 'songs' && favorites.length > 0 ? (
            <ScalePressable
              style={styles.randomButton}
              scaleTo={0.95}
              onPress={handleRandomSong}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="shuffle" size={17} color={colors.primary} />
              <Text style={styles.randomButtonText}>Kisendrasendra</Text>
            </ScalePressable>
          ) : activeTab === 'artists' ? (
            <ScalePressable
              style={styles.randomButton}
              scaleTo={0.95}
              onPress={() => router.push('/artists' as any)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="add" size={18} color={colors.primary} />
              <Text style={styles.randomButtonText}>Ampio</Text>
            </ScalePressable>
          ) : null}
        </View>
      </View>

      {/* Spring-Animated Segmented Switch */}
      <View style={styles.segmentedWrapper}>
        <View
          style={styles.segmentedTrack}
          onLayout={e => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && Math.abs(w - trackWidth) > 1) {
              setTrackWidth(w);
            }
          }}>
          {segmentWidth > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.segmentThumb,
                { width: segmentWidth },
                thumbAnimatedStyle,
              ]}
            />
          )}

          <Pressable
            style={styles.segmentBtn}
            onPress={() => {
              if (activeTab !== 'songs') {
                triggerSelectionHaptic();
                setActiveTab('songs');
              }
            }}>
            <Ionicons
              name="musical-notes"
              size={15}
              color={activeTab === 'songs' ? colors.onPrimary : colors.textSecondary}
            />
            <Text
              style={[
                styles.segmentText,
                activeTab === 'songs' && styles.segmentTextActive,
              ]}>
              Hira
            </Text>
            <View
              style={[
                styles.segmentBadge,
                activeTab === 'songs' && styles.segmentBadgeActive,
              ]}>
              <Text
                style={[
                  styles.segmentBadgeText,
                  activeTab === 'songs' && styles.segmentBadgeTextActive,
                ]}>
                {favorites.length}
              </Text>
            </View>
          </Pressable>

          <Pressable
            style={styles.segmentBtn}
            onPress={() => {
              if (activeTab !== 'artists') {
                triggerSelectionHaptic();
                setActiveTab('artists');
              }
            }}>
            <Ionicons
              name="people"
              size={15}
              color={activeTab === 'artists' ? colors.onPrimary : colors.textSecondary}
            />
            <Text
              style={[
                styles.segmentText,
                activeTab === 'artists' && styles.segmentTextActive,
              ]}>
              Mpihira
            </Text>
            <View
              style={[
                styles.segmentBadge,
                activeTab === 'artists' && styles.segmentBadgeActive,
              ]}>
              <Text
                style={[
                  styles.segmentBadgeText,
                  activeTab === 'artists' && styles.segmentBadgeTextActive,
                ]}>
                {favoriteArtists.length}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* Virtualized Library Content */}
      {activeTab === 'songs' ? (
        <FlatList
          key="tahiry-songs"
          data={loading ? [] : displayedFavorites}
          keyExtractor={item => `fav-song-${item.id}`}
          renderItem={renderSongItem}
          ListHeaderComponent={renderSongsHeader()}
          ListEmptyComponent={renderSongsEmpty}
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <FlatList
          key="tahiry-artists"
          data={loading ? [] : displayedArtists}
          keyExtractor={item => `fav-artist-${item.id}`}
          renderItem={renderArtistItem}
          ItemSeparatorComponent={() => <View style={styles.artistSeparator} />}
          ListHeaderComponent={renderArtistsHeader()}
          ListEmptyComponent={renderArtistsEmpty}
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Animated Undo Snackbar */}
      {undoAction ? (
        <Animated.View
          entering={FadeInDown.springify().damping(18).reduceMotion(ReduceMotion.Never)}
          exiting={FadeOutDown.duration(180).reduceMotion(ReduceMotion.Never)}
          style={styles.undoToast}>
          <Text style={styles.undoLabel} numberOfLines={1}>
            {undoAction.label}
          </Text>
          <ScalePressable
            onPress={handleUndo}
            scaleTo={0.94}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.undoBtn}>
            <Text style={styles.undoBtnText}>Avereno</Text>
          </ScalePressable>
        </Animated.View>
      ) : null}
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
      justifyContent: 'space-between',
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
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    randomButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surfaceContainer,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 40,
    },
    randomButtonText: {
      fontSize: 12,
      ...fontStyle('bold'),
      color: colors.text,
    },
    segmentedWrapper: {
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.xs,
      paddingBottom: Spacing.xs,
    },
    segmentedTrack: {
      position: 'relative',
      flexDirection: 'row',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: Radius.full,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segmentThumb: {
      position: 'absolute',
      left: 4,
      top: 4,
      bottom: 4,
      borderRadius: Radius.full,
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: colors.isDark ? 0.25 : 0.16,
      shadowRadius: 6,
      elevation: 2,
    },
    segmentBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 9,
      borderRadius: Radius.full,
      minHeight: 40,
      zIndex: 1,
    },
    segmentText: {
      fontSize: 13,
      ...fontStyle('bold'),
      color: colors.textSecondary,
    },
    segmentTextActive: {
      color: colors.onPrimary,
    },
    segmentBadge: {
      backgroundColor: colors.surfaceContainerHigh,
      paddingHorizontal: 7,
      paddingVertical: 1,
      borderRadius: Radius.full,
      minWidth: 22,
      alignItems: 'center',
    },
    segmentBadgeActive: {
      backgroundColor: 'rgba(0, 0, 0, 0.22)',
    },
    segmentBadgeText: {
      fontSize: 11,
      ...fontStyle('extraBold'),
      color: colors.textSecondary,
    },
    segmentBadgeTextActive: {
      color: '#FFFFFF',
    },
    listContent: {
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
      paddingBottom: 115,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainer,
      borderRadius: Radius.full,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
      gap: Spacing.sm,
      marginBottom: Spacing.sm,
      minHeight: 44,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      ...fontStyle('medium'),
      color: colors.text,
      padding: 0,
    },
    bannersSection: {
      marginBottom: Spacing.md,
      marginHorizontal: -Spacing.md,
    },
    categoryScroll: {
      paddingHorizontal: Spacing.md,
      gap: Spacing.sm,
      paddingVertical: 2,
    },
    categoryBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 42,
    },
    categoryBannerActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    categoryText: {
      fontSize: 12.5,
      ...fontStyle('bold'),
      color: colors.textSecondary,
    },
    categoryTextActive: {
      color: colors.onPrimary,
    },
    countPill: {
      backgroundColor: colors.surfaceContainerLowest,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: Radius.full,
      minWidth: 20,
      alignItems: 'center',
    },
    countPillActive: {
      backgroundColor: 'rgba(0, 0, 0, 0.22)',
    },
    countPillText: {
      fontSize: 10.5,
      ...fontStyle('extraBold'),
      color: colors.textSecondary,
    },
    countPillTextActive: {
      color: '#FFFFFF',
    },
    listHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
    },
    listHeaderTitle: {
      fontSize: 12,
      ...fontStyle('bold'),
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    listHeaderCount: {
      fontSize: 12,
      ...fontStyle('bold'),
      color: colors.primary,
    },
    artistSeparator: {
      height: 10,
    },
    emptyBezelOuter: {
      padding: 4,
      borderRadius: Radius.xl + 4,
      backgroundColor: colors.bezelOuter,
      borderWidth: 1,
      borderColor: colors.bezelOuterBorder,
      marginTop: Spacing.sm,
    },
    emptyState: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: Radius.xl,
      padding: Spacing.xl,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyIconBg: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: colors.primaryWash,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.md,
      borderWidth: 1.5,
      borderColor: colors.primaryBorderWash,
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
      marginTop: 6,
      lineHeight: 19,
      paddingHorizontal: 10,
    },
    emptyActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: Spacing.lg,
    },
    exploreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: Radius.full,
      minHeight: 44,
    },
    exploreBtnText: {
      fontSize: 13,
      ...fontStyle('bold'),
      color: colors.onPrimary,
    },
    searchBtnAlt: {
      backgroundColor: colors.surfaceContainerHigh,
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 44,
      justifyContent: 'center',
    },
    searchBtnAltText: {
      fontSize: 13,
      ...fontStyle('semiBold'),
      color: colors.text,
    },
    undoToast: {
      position: 'absolute',
      left: Spacing.md,
      right: Spacing.md,
      bottom: 96,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceContainerHigh,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.primaryBorderWash,
      paddingHorizontal: Spacing.md,
      paddingVertical: 12,
      gap: Spacing.sm,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: colors.isDark ? 0.35 : 0.14,
      shadowRadius: 12,
      elevation: 6,
    },
    undoLabel: {
      flex: 1,
      fontSize: 13,
      ...fontStyle('medium'),
      color: colors.text,
    },
    undoBtn: {
      backgroundColor: colors.primaryWash,
      paddingHorizontal: 13,
      paddingVertical: 6,
      borderRadius: Radius.full,
    },
    undoBtnText: {
      fontSize: 12,
      ...fontStyle('extraBold'),
      color: colors.primary,
    },
  });
