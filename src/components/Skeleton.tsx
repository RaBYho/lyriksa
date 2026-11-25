import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, DimensionValue, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  ReduceMotion,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing, ThemePalette } from '@/constants/theme';
import { useThemePalette } from '@/context/AppSettingsContext';

interface SkeletonBoxProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle;
}

const SHIMMER_SWEEP_WIDTH = 160;

/**
 * GPU-driven directional shimmer skeleton placeholder using Reanimated 4 + LinearGradient.
 */
export function SkeletonBox({
  width = '100%',
  height = 16,
  borderRadius = Radius.sm,
  style,
}: SkeletonBoxProps) {
  const colors = useThemePalette();
  const translateX = useSharedValue(-SHIMMER_SWEEP_WIDTH);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(380, {
        duration: 1250,
        easing: Easing.inOut(Easing.ease),
        reduceMotion: ReduceMotion.Never,
      }),
      -1,
      false,
      undefined,
      ReduceMotion.Never
    );
  }, [translateX]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.shimmerBase,
          overflow: 'hidden',
        },
        style,
      ]}>
      <Animated.View style={[StyleSheet.absoluteFill, { width: SHIMMER_SWEEP_WIDTH }, shimmerStyle]}>
        <LinearGradient
          colors={[colors.shimmerBase, colors.shimmerHighlight, colors.shimmerBase]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

export function SongRowSkeleton() {
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.songRow}>
      <SkeletonBox width={40} height={40} borderRadius={20} />
      <View style={styles.songInfo}>
        <SkeletonBox width="62%" height={15} borderRadius={Radius.xs} />
        <SkeletonBox
          width="42%"
          height={12}
          borderRadius={Radius.xs}
          style={{ marginTop: 6 }}
        />
      </View>
      <SkeletonBox width={24} height={24} borderRadius={12} />
    </View>
  );
}

export function SongRowSkeletonList({ count = 6 }: { count?: number }) {
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.listContainer}>
      {Array.from({ length: count }).map((_, i) => (
        <SongRowSkeleton key={i} />
      ))}
    </View>
  );
}

export function ArtistListCardSkeleton() {
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.artistCardRow}>
      <SkeletonBox width={52} height={52} borderRadius={26} />
      <View style={styles.songInfo}>
        <SkeletonBox width="52%" height={15} borderRadius={Radius.xs} />
        <SkeletonBox width="36%" height={11} borderRadius={Radius.xs} style={{ marginTop: 5 }} />
        <SkeletonBox width="28%" height={11} borderRadius={Radius.xs} style={{ marginTop: 6 }} />
      </View>
      <SkeletonBox width={34} height={34} borderRadius={17} />
    </View>
  );
}

export function ArtistListCardSkeletonList({ count = 6 }: { count?: number }) {
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.artistListContainer}>
      {Array.from({ length: count }).map((_, i) => (
        <ArtistListCardSkeleton key={i} />
      ))}
    </View>
  );
}

export function SearchAllSkeleton() {
  return (
    <View style={{ gap: Spacing.lg, paddingTop: Spacing.xs }}>
      <View style={{ gap: Spacing.sm }}>
        <SkeletonBox width={110} height={16} borderRadius={Radius.xs} />
        <ArtistListCardSkeletonList count={2} />
      </View>
      <View style={{ gap: Spacing.sm }}>
        <SkeletonBox width={120} height={16} borderRadius={Radius.xs} />
        <SongRowSkeletonList count={3} />
      </View>
    </View>
  );
}

export function ArtistAvatarSkeleton() {
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.artistItem}>
      <SkeletonBox width={68} height={68} borderRadius={34} />
      <SkeletonBox
        width={52}
        height={11}
        borderRadius={Radius.xs}
        style={{ marginTop: 8 }}
      />
    </View>
  );
}

export function ArtistAvatarSkeletonList({ count = 5 }: { count?: number }) {
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.artistsRow}>
      {Array.from({ length: count }).map((_, i) => (
        <ArtistAvatarSkeleton key={i} />
      ))}
    </View>
  );
}

export function LyricsScreenSkeleton({ onBack }: { onBack?: () => void }) {
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.fullScreen} edges={['top']}>
      <View style={styles.readerHeader}>
        <View style={styles.headerBackPlaceholder}>
          <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
        </View>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <SkeletonBox width={120} height={14} borderRadius={Radius.xs} />
          <SkeletonBox
            width={80}
            height={11}
            borderRadius={Radius.xs}
            style={{ marginTop: 4 }}
          />
        </View>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.readerContent}>
        <View style={styles.readerBanner}>
          <SkeletonBox width="75%" height={26} borderRadius={Radius.sm} />
          <SkeletonBox
            width="45%"
            height={16}
            borderRadius={Radius.xs}
            style={{ marginTop: 8 }}
          />
          <SkeletonBox
            width={70}
            height={20}
            borderRadius={Radius.sm}
            style={{ marginTop: 10 }}
          />
        </View>

        <View style={styles.stanzasArea}>
          <View style={styles.stanzaBlock}>
            <SkeletonBox width="92%" height={16} borderRadius={Radius.xs} />
            <SkeletonBox width="85%" height={16} borderRadius={Radius.xs} style={{ marginTop: 8 }} />
            <SkeletonBox width="95%" height={16} borderRadius={Radius.xs} style={{ marginTop: 8 }} />
            <SkeletonBox width="70%" height={16} borderRadius={Radius.xs} style={{ marginTop: 8 }} />
          </View>

          <View style={styles.stanzaBlock}>
            <SkeletonBox width="88%" height={16} borderRadius={Radius.xs} />
            <SkeletonBox width="94%" height={16} borderRadius={Radius.xs} style={{ marginTop: 8 }} />
            <SkeletonBox width="78%" height={16} borderRadius={Radius.xs} style={{ marginTop: 8 }} />
          </View>

          <View style={styles.stanzaBlock}>
            <SkeletonBox width="90%" height={16} borderRadius={Radius.xs} />
            <SkeletonBox width="82%" height={16} borderRadius={Radius.xs} style={{ marginTop: 8 }} />
            <SkeletonBox width="96%" height={16} borderRadius={Radius.xs} style={{ marginTop: 8 }} />
            <SkeletonBox width="65%" height={16} borderRadius={Radius.xs} style={{ marginTop: 8 }} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

export function ArtistDetailSkeleton() {
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.fullScreen} edges={['top']}>
      <View style={styles.readerHeader}>
        <View style={styles.headerBackPlaceholder}>
          <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
        </View>
        <SkeletonBox width={100} height={14} borderRadius={Radius.xs} />
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.artistHero}>
        <SkeletonBox width={88} height={88} borderRadius={44} />
        <SkeletonBox
          width={160}
          height={22}
          borderRadius={Radius.sm}
          style={{ marginTop: 14 }}
        />
        <SkeletonBox
          width={90}
          height={14}
          borderRadius={Radius.xs}
          style={{ marginTop: 6 }}
        />
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
          <SkeletonBox width={120} height={38} borderRadius={Radius.full} />
          <SkeletonBox width={120} height={38} borderRadius={Radius.full} />
        </View>
      </View>

      <View style={{ paddingHorizontal: Spacing.md, marginTop: Spacing.lg }}>
        <SkeletonBox width={140} height={16} borderRadius={Radius.xs} style={{ marginBottom: 12 }} />
        <SongRowSkeletonList count={5} />
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    listContainer: {
      gap: Spacing.sm,
    },
    artistListContainer: {
      gap: 10,
    },
    songRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainer,
      paddingVertical: Spacing.sm + 4,
      paddingHorizontal: Spacing.md,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    artistCardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainer,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 74,
    },
    songInfo: {
      flex: 1,
      marginLeft: Spacing.md,
    },
    artistsRow: {
      flexDirection: 'row',
      gap: Spacing.md,
      paddingHorizontal: Spacing.md,
    },
    artistItem: {
      alignItems: 'center',
      width: 76,
    },
    fullScreen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    readerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border,
    },
    headerBackPlaceholder: {
      padding: 4,
    },
    readerContent: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.lg,
    },
    readerBanner: {
      marginBottom: Spacing.xl,
      paddingBottom: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    stanzasArea: {
      gap: Spacing.xl,
    },
    stanzaBlock: {
      gap: 4,
    },
    artistHero: {
      alignItems: 'center',
      paddingVertical: Spacing.xl,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surfaceContainerLow,
    },
  });
