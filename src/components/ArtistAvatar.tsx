import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemePalette, fontStyle } from '@/constants/theme';
import { useThemePalette } from '@/context/AppSettingsContext';
import { ScalePressable } from '@/components/ScalePressable';
import { Artist } from '@/services/database';

interface ArtistAvatarProps {
  artist: Artist;
}

export const ArtistAvatar = React.memo(function ArtistAvatar({ artist }: ArtistAvatarProps) {
  const router = useRouter();
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handlePress = () => {
    router.push(`/artist/${artist.id}` as any);
  };

  const initials = artist.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <ScalePressable
      style={styles.container}
      scaleTo={0.94}
      onPress={handlePress}>
      <View style={styles.bezelOuter}>
        <View style={styles.avatarRing}>
          <View style={styles.avatar}>
            <Text style={styles.initials}>{initials || '?'}</Text>
          </View>
        </View>
        {artist.is_favorite ? (
          <View style={styles.heartBadge}>
            <Ionicons name="heart" size={10} color="#FFFFFF" />
          </View>
        ) : artist.is_song_derived ? (
          <View style={styles.derivedBadge}>
            <Ionicons name="musical-notes" size={9} color={colors.onPrimary} />
          </View>
        ) : null}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {artist.name}
      </Text>
      <Text style={styles.count}>{artist.song_count} hira</Text>
    </ScalePressable>
  );
});

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      width: 82,
      marginRight: 10,
    },
    bezelOuter: {
      position: 'relative',
      width: 68,
      height: 68,
      borderRadius: 34,
      padding: 2.5,
      backgroundColor: colors.bezelOuter,
      borderWidth: 1,
      borderColor: colors.bezelOuterBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarRing: {
      width: '100%',
      height: '100%',
      borderRadius: 31,
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
      borderRadius: 29,
      backgroundColor: colors.surfaceContainerHighest,
      alignItems: 'center',
      justifyContent: 'center',
    },
    initials: {
      fontSize: 18,
      ...fontStyle('extraBold'),
      color: colors.primaryContainer,
      letterSpacing: 0.5,
    },
    heartBadge: {
      position: 'absolute',
      bottom: -1,
      right: -1,
      width: 19,
      height: 19,
      borderRadius: 9.5,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.background,
    },
    derivedBadge: {
      position: 'absolute',
      bottom: -1,
      right: -1,
      width: 19,
      height: 19,
      borderRadius: 9.5,
      backgroundColor: colors.secondary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.background,
    },
    name: {
      fontSize: 13,
      ...fontStyle('semiBold'),
      color: colors.text,
      marginTop: 7,
      textAlign: 'center',
      width: '100%',
    },
    count: {
      fontSize: 11,
      ...fontStyle('medium'),
      color: colors.textSecondary,
      marginTop: 1,
    },
  });
