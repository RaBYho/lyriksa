import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Radius, ThemePalette, fontStyle } from '@/constants/theme';
import { useThemePalette } from '@/context/AppSettingsContext';
import { Artist } from '@/services/database';
import { HighlightedText } from '@/components/HighlightedText';
import { AnimatedHeartButton } from '@/components/AnimatedHeartButton';
import { triggerLightHaptic } from '@/utils/haptics';

interface ArtistListCardProps {
  artist: Artist;
  onToggleFavorite?: (artistId: string) => void;
  highlightText?: string;
  onSelect?: () => void;
}

const artistCardStylesCache = new WeakMap<ThemePalette, ReturnType<typeof createStyles>>();

function getArtistCardStyles(colors: ThemePalette) {
  let cached = artistCardStylesCache.get(colors);
  if (!cached) {
    cached = createStyles(colors);
    artistCardStylesCache.set(colors, cached);
  }
  return cached;
}

/**
 * Shared artist catalog card with Double-Bezel avatar ring and tactile interactions.
 */
export const ArtistListCard = React.memo(function ArtistListCard({
  artist,
  onToggleFavorite,
  highlightText,
  onSelect,
}: ArtistListCardProps) {
  const router = useRouter();
  const colors = useThemePalette();
  const styles = getArtistCardStyles(colors);

  const initials = artist.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <Pressable
      style={({ pressed }) => [styles.artistCard, pressed && styles.artistCardPressed]}
      onPress={() => {
        triggerLightHaptic();
        onSelect?.();
        router.push(`/artist/${artist.id}` as any);
      }}>
      <View style={styles.avatarRing}>
        <View style={styles.avatar}>
          <Text style={styles.initials}>{initials || '?'}</Text>
        </View>
      </View>

      <View style={styles.artistInfo}>
        <HighlightedText
          text={artist.name}
          highlight={highlightText}
          style={styles.artistName}
          numberOfLines={1}
        />
        <Text style={styles.artistCategory} numberOfLines={1}>
          {artist.category || 'Mpihira malagasy'}
        </Text>
        <View style={styles.songCountBadge}>
          <Ionicons name="musical-notes" size={12} color={colors.primary} />
          <Text style={styles.songCountText}>
            {artist.song_count} hira voatahiry
          </Text>
        </View>
      </View>

      <View style={styles.cardRightActions}>
        {onToggleFavorite && (
          <AnimatedHeartButton
            isFavorite={Boolean(artist.is_favorite)}
            onPress={() => onToggleFavorite(artist.id)}
            style={styles.heartBtnBg}
          />
        )}
        <Ionicons name="chevron-forward" size={16} color={colors.outline} />
      </View>
    </Pressable>
  );
});

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    artistCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainer,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
      minHeight: 74,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: colors.isDark ? 0.16 : 0.04,
      shadowRadius: 6,
      elevation: colors.isDark ? 2 : 1,
    },
    artistCardPressed: {
      transform: [{ scale: 0.985 }],
      opacity: 0.88,
    },
    avatarRing: {
      width: 52,
      height: 52,
      borderRadius: 26,
      padding: 2,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    avatar: {
      width: '100%',
      height: '100%',
      borderRadius: 24,
      backgroundColor: colors.surfaceContainerHighest,
      alignItems: 'center',
      justifyContent: 'center',
    },
    initials: {
      fontSize: 16,
      ...fontStyle('extraBold'),
      color: colors.primaryContainer,
    },
    artistInfo: {
      flex: 1,
      minWidth: 0,
    },
    artistName: {
      fontSize: 16,
      ...fontStyle('bold'),
      color: colors.text,
      letterSpacing: -0.2,
    },
    artistCategory: {
      fontSize: 12,
      ...fontStyle('regular'),
      color: colors.textSecondary,
      marginTop: 2,
    },
    songCountBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
    },
    songCountText: {
      fontSize: 11,
      ...fontStyle('semiBold'),
      color: colors.primary,
    },
    cardRightActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 4,
    },
    heartBtnBg: {
      backgroundColor: colors.cardWash,
    },
  });
