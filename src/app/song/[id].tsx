import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Animated, {
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { fontStyle, Radius, Spacing, ThemePalette } from '@/constants/theme';
import { useAppSettings } from '@/context/AppSettingsContext';
import { AutoScrollHUD } from '@/components/AutoScrollHUD';
import { LyricsScreenSkeleton } from '@/components/Skeleton';
import { ScalePressable } from '@/components/ScalePressable';
import { AnimatedHeartButton } from '@/components/AnimatedHeartButton';
import { QuoteShareModal } from '@/components/QuoteShareModal';
import { triggerLightHaptic, triggerMediumHaptic } from '@/utils/haptics';
import { getSongById, toggleFavorite, recordSongHistory, Song } from '@/services/database';

const KEEP_AWAKE_TAG = 'lyriksa-song-reader';

export default function SongLyricsScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const router = useRouter();
  const { settings, colors, isLoaded } = useAppSettings();

  const [song, setSong] = useState<Song | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [fontSize, setFontSize] = useState<number>(settings.defaultFontSize);
  const [speed, setSpeed] = useState<number>(settings.defaultScrollSpeed);
  const [isScrolling, setIsScrolling] = useState<boolean>(false);
  const [chromeVisible, setChromeVisible] = useState<boolean>(true);
  const [quoteStanza, setQuoteStanza] = useState<string | null>(null);

  const hasAdjustedFontRef = useRef(false);
  const hasAdjustedSpeedRef = useRef(false);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const scrollPositionRef = useRef<number>(0);

  const readingProgress = useSharedValue(0);
  const headerChromeOpacity = useSharedValue(1);

  const styles = useMemo(
    () => createStyles(colors, settings.highContrast),
    [colors, settings.highContrast]
  );

  useEffect(() => {
    headerChromeOpacity.value = withTiming(chromeVisible ? 1 : 0, {
      duration: 220,
      reduceMotion: ReduceMotion.Never,
    });
  }, [chromeVisible, headerChromeOpacity]);

  const headerFadeStyle = useAnimatedStyle(() => ({
    opacity: headerChromeOpacity.value,
  }));

  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${Math.round(readingProgress.value * 1000) / 10}%`,
  }));

  // Sync initial fontSize & speed once settings finish loading
  useEffect(() => {
    if (isLoaded && !hasAdjustedFontRef.current) {
      setFontSize(settings.defaultFontSize);
    }
    if (isLoaded && !hasAdjustedSpeedRef.current) {
      setSpeed(settings.defaultScrollSpeed);
    }
  }, [isLoaded, settings.defaultFontSize, settings.defaultScrollSpeed]);

  // Honor Keep Awake setting while viewing lyrics
  useEffect(() => {
    if (settings.keepAwake) {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    } else {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    }
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [settings.keepAwake]);

  useEffect(() => {
    setNotFound(false);
    setSong(null);
    if (!id) {
      setNotFound(true);
      return;
    }

    let cancelled = false;
    getSongById(id)
      .then(loadedSong => {
        if (cancelled) return;
        if (!loadedSong) {
          setNotFound(true);
          return;
        }
        setSong(loadedSong);
        recordSongHistory(loadedSong.id);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Auto-scroll animation logic
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isScrolling) {
      interval = setInterval(() => {
        scrollPositionRef.current += speed * 1.5;
        scrollRef.current?.scrollTo({
          y: scrollPositionRef.current,
          animated: false,
        });
      }, 50);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isScrolling, speed]);

  const handleToggleFavorite = useCallback(async () => {
    if (!song) return;
    const isNowFav = await toggleFavorite(song.id);
    setSong(prev => (prev ? { ...prev, is_favorite: isNowFav } : null));
  }, [song]);

  const handleShare = useCallback(async () => {
    if (!song) return;
    triggerMediumHaptic();
    const fullArtist =
      song.featured_artists && song.featured_artists.length > 0
        ? `${song.artist_name} (feat. ${song.featured_artists.join(', ')})`
        : song.artist_name;
    try {
      await Share.share({
        title: `${song.title} - ${fullArtist}`,
        message: `${song.title} (${fullArtist})\n\n${song.lyrics}\n\nLyriksa - Tononkira Malagasy`,
      });
    } catch (err) {
      console.warn('Share error:', err);
    }
  }, [song]);

  const handleToggleChrome = useCallback(() => {
    triggerLightHaptic();
    setChromeVisible(prev => !prev);
  }, []);

  if (notFound) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <ScalePressable
            style={styles.backButton}
            scaleTo={0.93}
            onPress={() => {
              triggerLightHaptic();
              router.back();
            }}
            hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
          </ScalePressable>
        </View>
        <View style={styles.notFoundContainer}>
          <View style={styles.notFoundIconOuter}>
            <View style={styles.notFoundIconInner}>
              <Ionicons name="musical-notes-outline" size={32} color={colors.primary} />
            </View>
          </View>
          <Text style={styles.notFoundTitle}>Hira tsy hita</Text>
          <Text style={styles.notFoundSubtitle}>
            Tsy hita tao amin’ny tahiry ity tononkira ity na diso ny rohy.
          </Text>
          <ScalePressable
            style={styles.notFoundBtn}
            scaleTo={0.96}
            onPress={() => {
              triggerLightHaptic();
              router.back();
            }}>
            <Text style={styles.notFoundBtnText}>Hiverina</Text>
          </ScalePressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!song) {
    return <LyricsScreenSkeleton onBack={() => router.back()} />;
  }

  const stanzas = song.lyrics.split(/\n\s*\n/);
  const featText =
    song.featured_artists && song.featured_artists.length > 0
      ? ` feat. ${song.featured_artists.join(', ')}`
      : '';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Fixed-Height Animated Header & Hairline Reading Progress Bar */}
      <Animated.View
        style={[styles.headerShell, headerFadeStyle]}
        pointerEvents={chromeVisible ? 'auto' : 'none'}>
        <View style={styles.header}>
          <ScalePressable
            style={styles.backButton}
            scaleTo={0.93}
            onPress={() => {
              triggerLightHaptic();
              router.back();
            }}
            hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
          </ScalePressable>

          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {song.title}
            </Text>
            <ScalePressable
              scaleTo={0.96}
              onPress={() => {
                triggerLightHaptic();
                router.push(`/artist/${song.artist_id}` as any);
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Text style={styles.headerArtist} numberOfLines={1}>
                {song.artist_name}{featText}
              </Text>
            </ScalePressable>
          </View>

          <View style={styles.headerActions}>
            <View style={styles.headerActionPill}>
              <AnimatedHeartButton
                isFavorite={Boolean(song.is_favorite)}
                onPress={handleToggleFavorite}
                size={20}
                inactiveColor={colors.text}
                accessibilityLabel={
                  song.is_favorite
                    ? 'Esory amin ny hira ankafizina'
                    : 'Ampio amin ny hira ankafizina'
                }
              />
            </View>

            <ScalePressable
              style={styles.headerActionPill}
              scaleTo={0.92}
              onPress={handleShare}
              hitSlop={6}
              accessibilityLabel="Hizara ny tononkira">
              <Ionicons name="share-outline" size={19} color={colors.text} />
            </ScalePressable>
          </View>
        </View>

        {/* Subtle Hairline Progress Track */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, progressBarStyle]} />
        </View>
      </Animated.View>

      {/* Lyrics Content Stage */}
      <ScrollView
        ref={scrollRef}
        style={styles.lyricsScroll}
        contentContainerStyle={styles.lyricsContent}
        onScroll={e => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          scrollPositionRef.current = contentOffset.y;
          const scrollableHeight = Math.max(1, contentSize.height - layoutMeasurement.height);
          readingProgress.value = Math.min(1, Math.max(0, contentOffset.y / scrollableHeight));
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(280).reduceMotion(ReduceMotion.Never)}>
          {/* Title Banner (Tap blank area to toggle distraction-free focus) */}
          <Pressable
            onPress={handleToggleChrome}
            style={[
              styles.titleBanner,
              settings.lyricsAlign === 'center' && styles.titleBannerCentered,
            ]}>
            <Text
              style={[
                styles.mainSongTitle,
                settings.lyricsAlign === 'center' && styles.textCentered,
              ]}>
              {song.title}
            </Text>

            {/* Clean clickable artist line */}
            <View
              style={[
                styles.artistLine,
                settings.lyricsAlign === 'center' && styles.artistLineCentered,
              ]}>
              <ScalePressable
                scaleTo={0.96}
                onPress={() => {
                  triggerLightHaptic();
                  router.push(`/artist/${song.artist_id}` as any);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}>
                <Text style={styles.mainArtistName}>{song.artist_name}</Text>
              </ScalePressable>

              {song.featured_artists && song.featured_artists.length > 0 && (
                <>
                  <Text style={styles.featSeparator}> feat. </Text>
                  {song.featured_artists.map((featName, idx) => {
                    const featSlug = featName
                      .toLowerCase()
                      .replace(/[^\w\s-]/g, '')
                      .trim()
                      .replace(/[\s_-]+/g, '-');
                    return (
                      <React.Fragment key={idx}>
                        {idx > 0 && <Text style={styles.featSeparator}>, </Text>}
                        <ScalePressable
                          scaleTo={0.96}
                          onPress={() => {
                            if (!featSlug) return;
                            triggerLightHaptic();
                            router.push(`/artist/${featSlug}` as any);
                          }}
                          hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}>
                          <Text style={styles.featArtistName}>{featName}</Text>
                        </ScalePressable>
                      </React.Fragment>
                    );
                  })}
                </>
              )}
            </View>

            <View
              style={[
                styles.metaPillsRow,
                settings.lyricsAlign === 'center' && styles.metaPillsCentered,
              ]}>
              {song.category ? (
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>{song.category}</Text>
                </View>
              ) : null}

              <View style={styles.stageHintBadge}>
                <Ionicons name="sparkles-outline" size={11} color={colors.textMuted} />
                <Text style={styles.stageHintText}>Tsindrio maharitra raha hizara andininy</Text>
              </View>
            </View>
          </Pressable>

          {/* Stanzas (Tap: Focus mode | Long-Press: Quote Card Share Modal) */}
          <View style={styles.stanzasContainer}>
            {stanzas.map((stanza, idx) => {
              const cleaned = stanza.trim();
              if (!cleaned) return null;
              return (
                <Pressable
                  key={idx}
                  delayLongPress={320}
                  onPress={handleToggleChrome}
                  onLongPress={() => {
                    triggerMediumHaptic();
                    setQuoteStanza(cleaned);
                  }}
                  style={({ pressed }) => [
                    styles.stanzaBlock,
                    pressed && styles.stanzaBlockPressed,
                  ]}>
                  <Text
                    style={[
                      styles.stanzaText,
                      {
                        fontSize,
                        lineHeight: Math.round(fontSize * 1.72),
                        textAlign: settings.lyricsAlign,
                      },
                    ]}>
                    {cleaned}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={handleToggleChrome} style={styles.endPadding} />
        </Animated.View>
      </ScrollView>

      {/* Floating Auto-Scroll & Typography Controls */}
      <AutoScrollHUD
        isScrolling={isScrolling}
        onToggleScroll={() => setIsScrolling(prev => !prev)}
        speed={speed}
        onChangeSpeed={newSpeed => {
          hasAdjustedSpeedRef.current = true;
          setSpeed(newSpeed);
        }}
        fontSize={fontSize}
        onIncreaseFontSize={() => {
          hasAdjustedFontRef.current = true;
          setFontSize(prev => Math.min(prev + 2, 32));
        }}
        onDecreaseFontSize={() => {
          hasAdjustedFontRef.current = true;
          setFontSize(prev => Math.max(prev - 2, 14));
        }}
        visible={chromeVisible}
      />

      {/* Shareable Acoustic Quote Card Modal */}
      <QuoteShareModal
        visible={Boolean(quoteStanza)}
        stanza={quoteStanza}
        songTitle={song.title}
        artistName={song.artist_name}
        category={song.category}
        onClose={() => setQuoteStanza(null)}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette, highContrast: boolean) => {
  const readerBg = highContrast
    ? colors.isDark
      ? '#000000'
      : '#FFFFFF'
    : colors.background;
  const readerText = highContrast
    ? colors.isDark
      ? '#FFFFFF'
      : '#000000'
    : colors.text;

  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: readerBg,
    },
    headerShell: {
      backgroundColor: readerBg,
      zIndex: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
      gap: Spacing.sm,
    },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleContainer: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    headerTitle: {
      color: readerText,
      fontSize: 15,
      letterSpacing: -0.2,
      ...fontStyle('bold'),
    },
    headerArtist: {
      color: colors.primary,
      fontSize: 12,
      marginTop: 1,
      ...fontStyle('semiBold'),
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    headerActionPill: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    progressTrack: {
      height: 2,
      width: '100%',
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.primary,
    },
    lyricsScroll: {
      flex: 1,
    },
    lyricsContent: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.lg,
      paddingBottom: 140,
    },
    titleBanner: {
      marginBottom: Spacing.xl,
      paddingBottom: Spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    titleBannerCentered: {
      alignItems: 'center',
    },
    mainSongTitle: {
      fontSize: 28,
      color: readerText,
      letterSpacing: -0.6,
      marginBottom: 8,
      ...fontStyle('extraBold'),
    },
    textCentered: {
      textAlign: 'center',
    },
    artistLine: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      marginBottom: 12,
    },
    artistLineCentered: {
      justifyContent: 'center',
    },
    mainArtistName: {
      fontSize: 16,
      color: colors.primary,
      ...fontStyle('bold'),
    },
    featSeparator: {
      fontSize: 14,
      color: colors.textSecondary,
      ...fontStyle('mediumItalic'),
    },
    featArtistName: {
      fontSize: 15,
      color: colors.secondary,
      ...fontStyle('bold'),
    },
    metaPillsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
      marginTop: 2,
    },
    metaPillsCentered: {
      justifyContent: 'center',
    },
    categoryBadge: {
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: Radius.full,
    },
    categoryText: {
      fontSize: 11,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      ...fontStyle('bold'),
    },
    stageHintBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 4,
    },
    stageHintText: {
      fontSize: 11,
      color: colors.textMuted,
      ...fontStyle('medium'),
    },
    stanzasContainer: {
      gap: Spacing.lg,
    },
    stanzaBlock: {
      borderRadius: Radius.md,
      paddingVertical: 4,
      paddingHorizontal: 4,
      marginHorizontal: -4,
    },
    stanzaBlockPressed: {
      backgroundColor: colors.primaryWash,
    },
    stanzaText: {
      color: readerText,
      letterSpacing: 0.15,
      ...fontStyle(highContrast ? 'semiBold' : 'medium'),
    },
    endPadding: {
      height: 110,
    },
    notFoundContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.xl,
      paddingBottom: Spacing.xxl,
    },
    notFoundIconOuter: {
      padding: 6,
      borderRadius: Radius.full,
      backgroundColor: colors.bezelOuter,
      borderWidth: 1,
      borderColor: colors.bezelOuterBorder,
      marginBottom: Spacing.md,
    },
    notFoundIconInner: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notFoundTitle: {
      fontSize: 20,
      color: colors.text,
      textAlign: 'center',
      ...fontStyle('bold'),
    },
    notFoundSubtitle: {
      fontSize: 13.5,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 20,
      maxWidth: 280,
      ...fontStyle('regular'),
    },
    notFoundBtn: {
      marginTop: Spacing.lg,
      backgroundColor: colors.primary,
      paddingHorizontal: Spacing.xl,
      paddingVertical: 11,
      borderRadius: Radius.full,
    },
    notFoundBtnText: {
      color: colors.onPrimary,
      fontSize: 14,
      ...fontStyle('bold'),
    },
  });
};
