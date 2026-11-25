import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing, ThemePalette, fontStyle } from '@/constants/theme';
import { useThemePalette } from '@/context/AppSettingsContext';
import { ArtistAvatar } from '@/components/ArtistAvatar';
import { SongRow } from '@/components/SongRow';
import { ScalePressable } from '@/components/ScalePressable';
import {
  ArtistAvatarSkeletonList,
  SongRowSkeletonList,
} from '@/components/Skeleton';
import {
  getFavoriteArtists,
  getRecentSongs,
  getRecentlyOpenedSongs,
  toggleFavorite,
  Artist,
  Song,
} from '@/services/database';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Miarahaba maraina';
  if (hour >= 12 && hour < 18) return 'Miarahaba tolakandro';
  return 'Miarahaba hariva';
}

function getGreetingIcon(): keyof typeof Ionicons.glyphMap {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 18) return 'sunny-outline';
  return 'moon-outline';
}

export default function HomeScreen() {
  const router = useRouter();
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [artists, setArtists] = useState<Artist[]>([]);
  const [recentSongs, setRecentSongs] = useState<Song[]>([]);
  const [openedSongs, setOpenedSongs] = useState<Song[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [favArtistsRes, recents, opened] = await Promise.all([
        getFavoriteArtists(10),
        getRecentSongs(6),
        getRecentlyOpenedSongs(6),
      ]);
      setArtists(favArtistsRes.artists);
      setRecentSongs(recents);
      setOpenedSongs(opened);
    } catch (err) {
      console.error('Error loading Fandraisana data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleToggleFavorite = useCallback(async (songId: string) => {
    const isNowFav = await toggleFavorite(songId);
    setRecentSongs(prev =>
      prev.map(s => (s.id === songId ? { ...s, is_favorite: isNowFav } : s))
    );
    setOpenedSongs(prev =>
      prev.map(s => (s.id === songId ? { ...s, is_favorite: isNowFav } : s))
    );

    getFavoriteArtists(10).then(res => {
      setArtists(res.artists);
    });
  }, []);

  const navigateToSearch = (filter: 'all' | 'title' | 'artist' | 'lyrics' = 'all') => {
    router.push({
      pathname: '/(tabs)/search',
      params: {
        filter,
        autofocus: 'true',
        t: Date.now().toString(),
      },
    } as any);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Editorial Top Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.logo}
          />
          <View>
            <Text style={styles.brandSubtitle}>LYRIKSA</Text>
            <Text style={styles.headerTitle}>Fandraisana</Text>
          </View>
        </View>
        <ScalePressable
          style={styles.headerSearchBtn}
          scaleTo={0.92}
          onPress={() => navigateToSearch('all')}
          accessibilityLabel="Hitady">
          <Ionicons name="search" size={19} color={colors.text} />
        </ScalePressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }>
        {/* Double-Bezel Acoustic Spotlight Hero Card */}
        <Animated.View
          entering={FadeInDown.duration(340).springify().damping(18).reduceMotion(ReduceMotion.Never)}
          style={styles.heroBezelOuter}>
          <LinearGradient
            colors={[colors.heroGradientStart, colors.heroGradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.greetingChip}>
                <Ionicons name={getGreetingIcon()} size={12} color={colors.secondary} />
                <Text style={styles.greetingText}>{getGreeting()}</Text>
              </View>
              <View style={styles.offlinePill}>
                <Ionicons name="musical-notes" size={11} color={colors.tertiary} />
                <Text style={styles.offlinePillText}>17 294 tononkira</Text>
              </View>
            </View>

            <Text style={styles.heroQuestion}>
              {'Inona ny hira hohiraintsika anio\u00A0?'}
            </Text>

            <View style={styles.heroBottomRow}>
              <Text style={styles.heroSubText}>
                Azo vakiana na aiza na aiza, tsy mila aterineto.
              </Text>
              <ScalePressable
                style={styles.heroExploreBtn}
                scaleTo={0.95}
                onPress={() => router.push('/songs' as any)}>
                <Text style={styles.heroExploreText}>Katalaogy</Text>
                <View style={styles.heroExploreArrowCircle}>
                  <Ionicons name="arrow-forward" size={12} color={colors.onPrimary} />
                </View>
              </ScalePressable>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Section 1: Mpihira Ankafiziko */}
        <Animated.View
          entering={FadeInDown.delay(60).duration(340).springify().damping(18).reduceMotion(ReduceMotion.Never)}
          style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.amberBar} />
              <Text style={styles.sectionTitle}>Mpihira Ankafiziko</Text>
            </View>
            <Pressable
              onPress={() => {
                const hasExplicitFavs = artists.some(a => Boolean(a.is_favorite));
                router.push(
                  hasExplicitFavs
                    ? ({ pathname: '/artists', params: { category: 'ankafiziko' } } as any)
                    : ('/artists' as any)
                );
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.seeAllText}>Hijery rehetra →</Text>
            </Pressable>
          </View>

          {loading && artists.length === 0 ? (
            <ArtistAvatarSkeletonList count={5} />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.artistsScroll}>
              <ScalePressable
                style={styles.addArtistBtn}
                scaleTo={0.94}
                onPress={() => router.push('/artists' as any)}
                accessibilityRole="button"
                accessibilityLabel="Ampio mpihira ankafizina">
                <View style={styles.addArtistCircle}>
                  <Ionicons name="add" size={26} color={colors.primary} />
                </View>
                <Text style={styles.addArtistName} numberOfLines={1}>
                  Ampio
                </Text>
                <Text style={styles.addArtistSub}>Hisafidy</Text>
              </ScalePressable>

              {artists.map(artist => (
                <ArtistAvatar key={artist.id} artist={artist} />
              ))}
            </ScrollView>
          )}
        </Animated.View>

        {/* Section 2: Hira Vao Nampidirina */}
        <Animated.View
          entering={FadeInDown.delay(120).duration(340).springify().damping(18).reduceMotion(ReduceMotion.Never)}
          style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.emeraldBar} />
              <Text style={styles.sectionTitle}>Hira Vao Nampidirina</Text>
            </View>
            <Pressable
              onPress={() => router.push({ pathname: '/songs', params: { sort: 'recent' } } as any)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.seeAllText}>Hijery rehetra →</Text>
            </Pressable>
          </View>

          <View style={styles.songsList}>
            {loading && recentSongs.length === 0 ? (
              <SongRowSkeletonList count={4} />
            ) : (
              recentSongs.map(song => (
                <SongRow
                  key={`recent-${song.id}`}
                  song={song}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))
            )}
          </View>
        </Animated.View>

        {/* Section 3: Hira Nosokafana Farany */}
        <Animated.View
          entering={FadeInDown.delay(180).duration(340).springify().damping(18).reduceMotion(ReduceMotion.Never)}
          style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.indigoBar} />
              <Text style={styles.sectionTitle}>Hira Nosokafana Farany</Text>
            </View>
          </View>

          {loading && openedSongs.length === 0 ? (
            <View style={styles.songsList}>
              <SongRowSkeletonList count={3} />
            </View>
          ) : openedSongs.length > 0 ? (
            <View style={styles.songsList}>
              {openedSongs.map(song => (
                <SongRow
                  key={`opened-${song.id}`}
                  song={song}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyHistoryCard}>
              <View style={styles.emptyHistoryIcon}>
                <Ionicons name="time-outline" size={22} color={colors.textSecondary} />
              </View>
              <View style={styles.emptyHistoryTextContainer}>
                <Text style={styles.emptyHistoryTitle}>Mbola tsy nisy hira nosokafana</Text>
                <Text style={styles.emptyHistorySubtitle}>
                  Rehefa mamaky tononkira ianao dia hiseho eto avy hatrany izy ireo mba ho mora hitanao indray.
                </Text>
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>
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
      paddingBottom: Spacing.sm + 2,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    headerSearchBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: colors.isDark ? 0.2 : 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    logo: {
      width: 34,
      height: 34,
      borderRadius: Radius.md,
    },
    brandSubtitle: {
      fontSize: 9.5,
      ...fontStyle('extraBold'),
      color: colors.primary,
      letterSpacing: 1.5,
    },
    headerTitle: {
      fontSize: 22,
      ...fontStyle('extraBold'),
      color: colors.text,
      letterSpacing: -0.5,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 112,
    },
    heroBezelOuter: {
      marginHorizontal: Spacing.md,
      marginTop: Spacing.xs,
      marginBottom: Spacing.xs,
      padding: 4,
      borderRadius: Radius.xl + 4,
      backgroundColor: colors.bezelOuter,
      borderWidth: 1,
      borderColor: colors.bezelOuterBorder,
    },
    heroCard: {
      paddingHorizontal: Spacing.md + 2,
      paddingVertical: Spacing.md + 2,
      borderRadius: Radius.xl,
      borderWidth: 1,
      borderColor: colors.heroBorder,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: colors.isDark ? 0.14 : 0.08,
      shadowRadius: 16,
      elevation: 3,
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    greetingChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.secondaryWash,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: Radius.full,
    },
    greetingText: {
      fontSize: 10,
      ...fontStyle('bold'),
      color: colors.secondary,
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    offlinePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.cardWash,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: colors.border,
    },
    offlinePillText: {
      fontSize: 11,
      ...fontStyle('semiBold'),
      color: colors.textSecondary,
    },
    heroQuestion: {
      fontSize: 22,
      ...fontStyle('extraBold'),
      color: colors.text,
      letterSpacing: -0.5,
      lineHeight: 28,
      marginTop: 14,
      marginBottom: 14,
    },
    heroBottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    heroSubText: {
      flex: 1,
      fontSize: 12,
      ...fontStyle('medium'),
      color: colors.textSecondary,
      lineHeight: 17,
    },
    heroExploreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.primaryWash,
      borderWidth: 1,
      borderColor: colors.primaryBorderWash,
      paddingLeft: 12,
      paddingRight: 4,
      paddingVertical: 4,
      borderRadius: Radius.full,
    },
    heroExploreText: {
      fontSize: 12,
      ...fontStyle('bold'),
      color: colors.primary,
    },
    heroExploreArrowCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    section: {
      marginTop: Spacing.lg - 2,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.sm + 2,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionTitle: {
      fontSize: 17.5,
      ...fontStyle('bold'),
      color: colors.text,
      letterSpacing: -0.3,
    },
    amberBar: {
      width: 3.5,
      height: 17,
      borderRadius: 2,
      backgroundColor: colors.secondary,
    },
    emeraldBar: {
      width: 3.5,
      height: 17,
      borderRadius: 2,
      backgroundColor: colors.tertiary,
    },
    indigoBar: {
      width: 3.5,
      height: 17,
      borderRadius: 2,
      backgroundColor: '#818CF8',
    },
    addArtistBtn: {
      alignItems: 'center',
      width: 82,
      marginRight: 10,
    },
    addArtistCircle: {
      width: 68,
      height: 68,
      borderRadius: 34,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.primary,
      backgroundColor: colors.primaryWash,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addArtistName: {
      fontSize: 12,
      ...fontStyle('bold'),
      color: colors.primary,
      marginTop: 7,
      textAlign: 'center',
    },
    addArtistSub: {
      fontSize: 10.5,
      ...fontStyle('medium'),
      color: colors.textSecondary,
      marginTop: 1,
      textAlign: 'center',
    },
    seeAllText: {
      fontSize: 13,
      ...fontStyle('semiBold'),
      color: colors.primary,
    },
    artistsScroll: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
    },
    songsList: {
      paddingHorizontal: Spacing.md,
    },
    emptyHistoryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainer,
      marginHorizontal: Spacing.md,
      padding: Spacing.md,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      gap: Spacing.md,
    },
    emptyHistoryIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyHistoryTextContainer: {
      flex: 1,
    },
    emptyHistoryTitle: {
      fontSize: 14,
      ...fontStyle('semiBold'),
      color: colors.text,
      marginBottom: 2,
    },
    emptyHistorySubtitle: {
      fontSize: 12,
      ...fontStyle('regular'),
      color: colors.textSecondary,
      lineHeight: 17,
    },
  });
