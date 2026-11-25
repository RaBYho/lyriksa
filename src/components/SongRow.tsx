import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing, ThemePalette, fontStyle } from '@/constants/theme';
import { useThemePalette } from '@/context/AppSettingsContext';
import { Song } from '@/services/database';
import { HighlightedText } from '@/components/HighlightedText';
import { AnimatedHeartButton } from '@/components/AnimatedHeartButton';
import { triggerLightHaptic } from '@/utils/haptics';

interface SongRowProps {
  song: Song;
  onToggleFavorite?: (id: string) => void;
  highlightText?: string;
  currentArtistName?: string;
  onSelect?: () => void;
}

const songRowStylesCache = new WeakMap<ThemePalette, ReturnType<typeof createStyles>>();

function getSongRowStyles(colors: ThemePalette) {
  let cached = songRowStylesCache.get(colors);
  if (!cached) {
    cached = createStyles(colors);
    songRowStylesCache.set(colors, cached);
  }
  return cached;
}

export const SongRow = React.memo(function SongRow({
  song,
  onToggleFavorite,
  highlightText,
  currentArtistName,
  onSelect,
}: SongRowProps) {
  const router = useRouter();
  const colors = useThemePalette();
  const styles = getSongRowStyles(colors);

  const handlePress = () => {
    triggerLightHaptic();
    onSelect?.();
    router.push(`/song/${song.id}` as any);
  };

  const validFeaturedArtists = useMemo(() => {
    if (!song.featured_artists || song.featured_artists.length === 0) return [];
    const main = (song.artist_name || '').toLowerCase().trim();
    return song.featured_artists.filter(f => f && f.toLowerCase().trim() !== main);
  }, [song.featured_artists, song.artist_name]);

  const hasFeat = validFeaturedArtists.length > 0;
  const isGuest = Boolean(
    hasFeat &&
      currentArtistName &&
      song.artist_name.toLowerCase() !== currentArtistName.toLowerCase()
  );

  return (
    <Pressable
      style={({ pressed }) => [styles.wrapper, pressed && styles.wrapperPressed]}
      onPress={handlePress}>
      <View style={styles.mainContent}>
        <View style={[styles.iconContainer, hasFeat && styles.iconContainerFeat]}>
          <Ionicons
            name={hasFeat ? 'people' : 'musical-notes'}
            size={18}
            color={hasFeat ? colors.secondary : colors.primary}
          />
        </View>

        <View style={styles.textContainer}>
          <View style={styles.titleRow}>
            <HighlightedText
              text={song.title}
              highlight={highlightText}
              style={styles.title}
              numberOfLines={1}
            />
            {hasFeat && (
              <View style={[styles.featBadge, isGuest && styles.featBadgeGuest]}>
                <Text style={[styles.featBadgeText, isGuest && styles.featBadgeGuestText]}>
                  {isGuest ? 'Feat' : 'Collab'}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.artist} numberOfLines={1}>
            {song.artist_name}
            {hasFeat ? (
              <Text style={styles.featArtistText}> (feat. {validFeaturedArtists.join(', ')})</Text>
            ) : null}
            {song.category ? ` — ${song.category}` : ''}
          </Text>

          {song.snippet ? (
            <View style={styles.snippetContainer}>
              <HighlightedText
                text={`« ${song.snippet} »`}
                highlight={highlightText}
                style={styles.snippet}
                highlightStyle={styles.snippetHighlight}
                numberOfLines={2}
              />
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.actions}>
        {onToggleFavorite && (
          <AnimatedHeartButton
            isFavorite={Boolean(song.is_favorite)}
            onPress={() => onToggleFavorite(song.id)}
          />
        )}
        <Pressable onPress={handlePress} style={styles.chevronButton} hitSlop={6}>
          <Ionicons name="chevron-forward" size={16} color={colors.outline} />
        </Pressable>
      </View>
    </Pressable>
  );
});

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    wrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainer,
      borderRadius: Radius.lg,
      paddingVertical: Spacing.sm + 3,
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: colors.isDark ? 0.16 : 0.04,
      shadowRadius: 6,
      elevation: colors.isDark ? 2 : 1,
    },
    wrapperPressed: {
      transform: [{ scale: 0.985 }],
      opacity: 0.88,
    },
    mainContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      minWidth: 0,
    },
    iconContainer: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconContainerFeat: {
      backgroundColor: colors.secondaryWash,
      borderColor: 'transparent',
    },
    textContainer: {
      flex: 1,
      minWidth: 0,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    title: {
      fontSize: 15.5,
      ...fontStyle('bold'),
      color: colors.text,
      letterSpacing: -0.2,
      flexShrink: 1,
    },
    featBadge: {
      backgroundColor: colors.primaryWash,
      paddingHorizontal: 6,
      paddingVertical: 1.5,
      borderRadius: Radius.xs,
    },
    featBadgeText: {
      fontSize: 9.5,
      ...fontStyle('bold'),
      color: colors.primary,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    featBadgeGuest: {
      backgroundColor: colors.secondaryWash,
    },
    featBadgeGuestText: {
      color: colors.secondary,
    },
    artist: {
      fontSize: 12.5,
      ...fontStyle('medium'),
      color: colors.textSecondary,
      marginTop: 2.5,
    },
    featArtistText: {
      color: colors.secondary,
      ...fontStyle('semiBold'),
    },
    snippetContainer: {
      marginTop: 7,
      backgroundColor: colors.surfaceContainerHigh,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: Radius.sm,
      borderLeftWidth: 2.5,
      borderLeftColor: colors.primary,
      alignSelf: 'stretch',
    },
    snippet: {
      fontSize: 12,
      ...fontStyle('mediumItalic'),
      color: colors.textSecondary,
      lineHeight: 17,
    },
    snippetHighlight: {
      color: colors.secondary,
      ...fontStyle('bold'),
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      marginLeft: Spacing.xs,
    },
    chevronButton: {
      padding: 4,
    },
  });
