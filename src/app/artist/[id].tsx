import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  FadeInDown,
  ReduceMotion,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { fontStyle, Radius, Spacing, ThemePalette } from '@/constants/theme';
import { useThemePalette } from '@/context/AppSettingsContext';
import { SongRow } from '@/components/SongRow';
import { ArtistDetailSkeleton } from '@/components/Skeleton';
import { ScalePressable } from '@/components/ScalePressable';
import { AnimatedHeartButton } from '@/components/AnimatedHeartButton';
import { triggerLightHaptic, triggerMediumHaptic, triggerSelectionHaptic } from '@/utils/haptics';
import { getArtistById, toggleFavorite, toggleFavoriteArtist, Artist, Song } from '@/services/database';

type ArtistSongFilter = 'all' | 'favorites';

export default function ArtistScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const router = useRouter();
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [artist, setArtist] = useState<Artist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [songFilter, setSongFilter] = useState<ArtistSongFilter>('all');
  const [loading, setLoading] = useState(true);
  const [filterTrackWidth, setFilterTrackWidth] = useState(0);

  const scrollY = useSharedValue(0);
  const filterProgress = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: event => {
      scrollY.value = event.contentOffset.y;
    },
  });

  useFocusEffect(
    useCallback(() => {
      if (!id) {
        setLoading(false);
        return;
      }
      getArtistById(id)
        .then(res => {
          setArtist(res.artist);
          setSongs(res.songs);
        })
        .catch(() => {})
        .finally(() => {
          setLoading(false);
        });
    }, [id])
  );

  const favoriteSongs = useMemo(
    () => songs.filter(s => Boolean(s.is_favorite)),
    [songs]
  );

  const effectiveFilter: ArtistSongFilter =
    songFilter === 'favorites' && favoriteSongs.length > 0 ? 'favorites' : 'all';

  useEffect(() => {
    filterProgress.value = withSpring(effectiveFilter === 'favorites' ? 1 : 0, {
      damping: 20,
      stiffness: 240,
      mass: 0.7,
      reduceMotion: ReduceMotion.Never,
    });
  }, [effectiveFilter, filterProgress]);

  const filterThumbWidth = Math.max(0, (filterTrackWidth - 8) / 2);
  const filterThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: filterProgress.value * filterThumbWidth }],
  }));

  const stickyTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [120, 175], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(scrollY.value, [120, 175], [8, 0], Extrapolation.CLAMP),
      },
    ],
  }));

  const headerBorderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [110, 165], [0, 1], Extrapolation.CLAMP),
  }));

  const heroAvatarParallaxStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(scrollY.value, [-100, 0, 220], [-14, 0, 22], Extrapolation.CLAMP),
      },
      {
        scale: interpolate(scrollY.value, [-100, 0, 180], [1.08, 1, 0.9], Extrapolation.CLAMP),
      },
    ],
    opacity: interpolate(scrollY.value, [0, 180], [1, 0.25], Extrapolation.CLAMP),
  }));

  const displayedSongs = useMemo(
    () => (effectiveFilter === 'favorites' ? favoriteSongs : songs),
    [effectiveFilter, favoriteSongs, songs]
  );

  const handleToggleArtistFavorite = useCallback(async () => {
    if (!artist) return;
    const isNowFav = await toggleFavoriteArtist(artist.id);
    setArtist(prev => (prev ? { ...prev, is_favorite: isNowFav } : null));
  }, [artist]);

  const handleToggleFavorite = useCallback(async (songId: string) => {
    const isNowFav = await toggleFavorite(songId);
    setSongs(prev =>
      prev.map(s => (s.id === songId ? { ...s, is_favorite: isNowFav } : s))
    );
  }, []);

  const handleRandomSong = useCallback(() => {
    if (displayedSongs.length === 0) return;
    triggerMediumHaptic();
    const randomIndex = Math.floor(Math.random() * displayedSongs.length);
    router.push(`/song/${displayedSongs[randomIndex].id}` as any);
  }, [displayedSongs, router]);

  if (loading) {
    return <ArtistDetailSkeleton />;
  }

  const artistName = artist?.name || id || 'Mpihira';
  const initials = artistName
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  const collabCount = songs.filter(
    s => s.featured_artists && s.featured_artists.length > 0
  ).length;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Sticky Collapsible Top Header */}
      <View style={styles.headerWrapper}>
        <View style={styles.header}>
          <ScalePressable
            style={styles.backButton}
            scaleTo={0.95}
            onPress={() => {
              triggerLightHaptic();
              router.back();
            }}
            hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
            <Text style={styles.backLabel}>Mpihira</Text>
          </ScalePressable>

          <Animated.View style={[styles.stickyCenter, stickyTitleStyle]} pointerEvents="none">
            <Text style={styles.stickyTitle} numberOfLines={1}>
              {artistName}
            </Text>
          </Animated.View>

          <View
            style={[
              styles.headerHeartPill,
              artist?.is_favorite && styles.headerHeartPillActive,
            ]}>
            <AnimatedHeartButton
              isFavorite={Boolean(artist?.is_favorite)}
              onPress={handleToggleArtistFavorite}
              size={20}
              inactiveColor={colors.text}
              accessibilityLabel={
                artist?.is_favorite
                  ? 'Esory amin ny ankafizina'
                  : 'Ampio amin ny ankafizina'
              }
            />
          </View>
        </View>
        <Animated.View style={[styles.headerDivider, headerBorderStyle]} />
      </View>

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}>
        {/* Artist Hero Stage with Subtle Gradient Wash & Double-Bezel Avatar */}
        <LinearGradient
          colors={[colors.heroGradientStart, colors.background]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.heroBanner}>
          <Animated.View style={[styles.avatarStage, heroAvatarParallaxStyle]}>
            <View style={styles.avatarOuterBezel}>
              <View style={styles.avatarLargeRing}>
                <View style={styles.avatarLarge}>
                  <Text style={styles.avatarLargeText}>{initials}</Text>
                </View>
              </View>
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.duration(320).reduceMotion(ReduceMotion.Never)}
            style={styles.heroMetaCenter}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>
                {artist?.category || 'Mpihira Malagasy'}
              </Text>
            </View>

            <Text style={styles.artistTitle}>{artistName}</Text>

            <View style={styles.badgesRow}>
              <View style={styles.metaPill}>
                <Ionicons name="musical-notes" size={14} color={colors.primary} />
                <Text style={styles.metaPillText}>{songs.length} hira</Text>
              </View>
              {collabCount > 0 ? (
                <View style={styles.metaPill}>
                  <Ionicons name="people" size={14} color={colors.secondary} />
                  <Text style={styles.metaPillText}>{collabCount} fiaraha-miasa</Text>
                </View>
              ) : null}
            </View>

            {/* Double-Bezel CTA Button */}
            <ScalePressable
              style={styles.randomBtnOuter}
              scaleTo={0.96}
              onPress={handleRandomSong}>
              <LinearGradient
                colors={[colors.primary, colors.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.randomBtn}>
                <View style={styles.randomBtnIcon}>
                  <Ionicons name="shuffle" size={16} color={colors.onPrimary} />
                </View>
                <Text style={styles.randomBtnText}>Hira Kisendrasendra</Text>
              </LinearGradient>
            </ScalePressable>
          </Animated.View>
        </LinearGradient>

        {/* Songs Catalog List */}
        <View style={styles.catalogSection}>
          <View style={styles.catalogHeader}>
            <Text style={styles.catalogTitle}>
              {effectiveFilter === 'favorites'
                ? 'Hira ankafizinao'
                : "Katalogin'ny Hira"}
            </Text>
            <Text style={styles.catalogCount}>{displayedSongs.length} hira</Text>
          </View>

          {favoriteSongs.length > 0 && (
            <View style={styles.filterTrackWrapper}>
              <View
                style={styles.filterTrack}
                onLayout={e => setFilterTrackWidth(e.nativeEvent.layout.width)}>
                {filterThumbWidth > 0 && (
                  <Animated.View
                    style={[
                      styles.filterThumb,
                      { width: filterThumbWidth },
                      filterThumbStyle,
                    ]}
                  />
                )}

                <ScalePressable
                  scaleTo={0.97}
                  style={[
                    styles.filterPill,
                    filterThumbWidth === 0 &&
                      effectiveFilter === 'all' &&
                      styles.filterPillFallbackActive,
                  ]}
                  onPress={() => {
                    if (effectiveFilter !== 'all') {
                      triggerSelectionHaptic();
                      setSongFilter('all');
                    }
                  }}>
                  <Ionicons
                    name="musical-notes"
                    size={13}
                    color={effectiveFilter === 'all' ? colors.onPrimary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.filterPillText,
                      effectiveFilter === 'all' && styles.filterPillTextActive,
                    ]}>
                    Rehetra ({songs.length})
                  </Text>
                </ScalePressable>

                <ScalePressable
                  scaleTo={0.97}
                  style={[
                    styles.filterPill,
                    filterThumbWidth === 0 &&
                      effectiveFilter === 'favorites' &&
                      styles.filterPillFallbackActive,
                  ]}
                  onPress={() => {
                    if (effectiveFilter !== 'favorites') {
                      triggerSelectionHaptic();
                      setSongFilter('favorites');
                    }
                  }}>
                  <Ionicons
                    name="heart"
                    size={13}
                    color={effectiveFilter === 'favorites' ? colors.onPrimary : colors.primary}
                  />
                  <Text
                    style={[
                      styles.filterPillText,
                      effectiveFilter === 'favorites' && styles.filterPillTextActive,
                    ]}>
                    Ankafiziko ({favoriteSongs.length})
                  </Text>
                </ScalePressable>
              </View>
            </View>
          )}

          <View style={styles.songsList}>
            {displayedSongs.map(song => (
              <SongRow
                key={song.id}
                song={song}
                currentArtistName={artistName}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </View>
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerWrapper: {
      zIndex: 10,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
      gap: Spacing.sm,
    },
    headerDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
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
    stickyCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stickyTitle: {
      fontSize: 16,
      color: colors.text,
      letterSpacing: -0.3,
      ...fontStyle('bold'),
    },
    headerHeartPill: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerHeartPillActive: {
      backgroundColor: colors.primaryWash,
      borderColor: colors.primaryBorderWash,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: Spacing.xxl,
    },
    heroBanner: {
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    avatarStage: {
      marginBottom: Spacing.md,
    },
    avatarOuterBezel: {
      padding: 6,
      borderRadius: 56,
      backgroundColor: colors.bezelOuter,
      borderWidth: 1,
      borderColor: colors.bezelOuterBorder,
    },
    avatarLargeRing: {
      width: 92,
      height: 92,
      borderRadius: 46,
      padding: 4,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.primaryBorderWash,
    },
    avatarLarge: {
      width: 82,
      height: 82,
      borderRadius: 41,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarLargeText: {
      fontSize: 30,
      color: colors.primary,
      letterSpacing: 0.5,
      ...fontStyle('extraBold'),
    },
    heroMetaCenter: {
      alignItems: 'center',
      width: '100%',
    },
    categoryBadge: {
      backgroundColor: colors.secondaryWash,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: Radius.full,
      marginBottom: Spacing.sm,
    },
    categoryBadgeText: {
      fontSize: 10.5,
      color: colors.secondary,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      ...fontStyle('bold'),
    },
    artistTitle: {
      fontSize: 30,
      color: colors.text,
      letterSpacing: -0.7,
      textAlign: 'center',
      marginBottom: Spacing.sm,
      ...fontStyle('extraBold'),
    },
    badgesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.lg,
    },
    metaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: Radius.full,
      gap: 6,
    },
    metaPillText: {
      fontSize: 12.5,
      color: colors.textSecondary,
      ...fontStyle('semiBold'),
    },
    randomBtnOuter: {
      padding: 4,
      borderRadius: Radius.full,
      backgroundColor: colors.bezelOuter,
      borderWidth: 1,
      borderColor: colors.bezelOuterBorder,
    },
    randomBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 11,
      borderRadius: Radius.full,
      gap: 10,
      minHeight: 44,
    },
    randomBtnIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    randomBtnText: {
      fontSize: 14.5,
      color: colors.onPrimary,
      ...fontStyle('bold'),
    },
    catalogSection: {
      paddingTop: Spacing.lg,
      paddingHorizontal: Spacing.lg,
    },
    catalogHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
    },
    catalogTitle: {
      fontSize: 18,
      color: colors.text,
      letterSpacing: -0.3,
      ...fontStyle('bold'),
    },
    catalogCount: {
      fontSize: 13,
      color: colors.textSecondary,
      ...fontStyle('semiBold'),
    },
    filterTrackWrapper: {
      marginBottom: Spacing.md,
    },
    filterTrack: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 4,
    },
    filterThumb: {
      position: 'absolute',
      top: 4,
      left: 4,
      bottom: 4,
      borderRadius: Radius.full,
      backgroundColor: colors.primary,
    },
    filterPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: Radius.full,
      zIndex: 1,
    },
    filterPillFallbackActive: {
      backgroundColor: colors.primary,
    },
    filterPillText: {
      color: colors.textSecondary,
      fontSize: 12.5,
      ...fontStyle('bold'),
    },
    filterPillTextActive: {
      color: colors.onPrimary,
    },
    songsList: {
      gap: 0,
    },
  });
