import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  ReduceMotion,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing, ThemePalette, fontStyle } from '@/constants/theme';
import { useThemePalette } from '@/context/AppSettingsContext';

interface SplashScreenViewProps {
  onFinish?: () => void;
  minDurationMs?: number;
  ready?: boolean;
}

function AcousticWaveBar({
  delay,
  maxScale,
  color,
}: {
  delay: number;
  maxScale: number;
  color: string;
}) {
  const scaleY = useSharedValue(0.35);

  useEffect(() => {
    scaleY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(maxScale, {
            duration: 420,
            easing: Easing.inOut(Easing.ease),
            reduceMotion: ReduceMotion.Never,
          }),
          withTiming(0.32, {
            duration: 460,
            easing: Easing.inOut(Easing.ease),
            reduceMotion: ReduceMotion.Never,
          })
        ),
        -1,
        true,
        undefined,
        ReduceMotion.Never
      ),
      ReduceMotion.Never
    );
  }, [delay, maxScale, scaleY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: scaleY.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: 3.5,
          height: 20,
          borderRadius: 2,
          backgroundColor: color,
        },
        animStyle,
      ]}
    />
  );
}

export function SplashScreenView({
  onFinish,
  minDurationMs = 1350,
  ready = true,
}: SplashScreenViewProps) {
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const containerOpacity = useSharedValue(1);
  const contentOpacity = useSharedValue(0);
  const contentScale = useSharedValue(0.86);
  const contentTranslateY = useSharedValue(14);
  const haloScale = useSharedValue(0.7);
  const [minElapsed, setMinElapsed] = React.useState(false);
  const exitingRef = React.useRef(false);
  const finishTriggeredRef = React.useRef(false);

  const triggerFinish = React.useCallback(() => {
    if (finishTriggeredRef.current) return;
    finishTriggeredRef.current = true;
    onFinish?.();
  }, [onFinish]);

  const startExit = React.useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;

    contentScale.value = withTiming(1.04, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.Never,
    });
    contentTranslateY.value = withTiming(-8, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.Never,
    });
    containerOpacity.value = withTiming(
      0,
      {
        duration: 340,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.Never,
      },
      finished => {
        'worklet';
        if (finished) {
          runOnJS(triggerFinish)();
        }
      }
    );

    // Failsafe guarantee so the splash overlay can never stay mounted
    setTimeout(() => {
      triggerFinish();
    }, 450);
  }, [containerOpacity, contentScale, contentTranslateY, triggerFinish]);

  useEffect(() => {
    contentOpacity.value = withTiming(1, {
      duration: 480,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.Never,
    });
    contentScale.value = withSpring(1, {
      damping: 14,
      stiffness: 130,
      reduceMotion: ReduceMotion.Never,
    });
    contentTranslateY.value = withSpring(0, {
      damping: 16,
      stiffness: 140,
      reduceMotion: ReduceMotion.Never,
    });
    haloScale.value = withRepeat(
      withSequence(
        withTiming(1.12, {
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          reduceMotion: ReduceMotion.Never,
        }),
        withTiming(0.88, {
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          reduceMotion: ReduceMotion.Never,
        })
      ),
      -1,
      true,
      undefined,
      ReduceMotion.Never
    );

    const timer = setTimeout(() => {
      setMinElapsed(true);
    }, minDurationMs);

    return () => clearTimeout(timer);
  }, [contentOpacity, contentScale, contentTranslateY, haloScale, minDurationMs]);

  useEffect(() => {
    if (ready && minElapsed) {
      startExit();
    }
  }, [ready, minElapsed, startExit]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [
      { scale: contentScale.value },
      { translateY: contentTranslateY.value },
    ],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: haloScale.value }],
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <LinearGradient
        colors={
          colors.isDark
            ? ['#1C1411', '#100F0E', '#0A0908']
            : ['#FAF3EC', '#F6F3ED', '#EFE8DC']
        }
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[styles.content, contentStyle]}>
        {/* Pulsing Acoustic Halo + Double-Bezel Logo Medallion */}
        <View style={styles.medallionArea}>
          <Animated.View style={[styles.ambientHalo, haloStyle]} />
          <View style={styles.bezelOuter}>
            <View style={styles.bezelInner}>
              <Image
                source={require('@/assets/images/logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
          </View>
        </View>

        <Text style={styles.brandTitle}>LYRIKSA</Text>
        <Text style={styles.brandTagline}>Tononkira Malagasy</Text>

        {/* 5-bar Acoustic Waveform */}
        <View style={styles.waveRow}>
          <AcousticWaveBar delay={0} maxScale={0.75} color={colors.secondary} />
          <AcousticWaveBar delay={120} maxScale={1.0} color={colors.primary} />
          <AcousticWaveBar delay={240} maxScale={0.85} color={colors.primaryContainer} />
          <AcousticWaveBar delay={100} maxScale={1.0} color={colors.primary} />
          <AcousticWaveBar delay={220} maxScale={0.7} color={colors.secondary} />
        </View>
      </Animated.View>

      <View style={styles.footerBadge}>
        <Ionicons name="cloud-offline-outline" size={13} color={colors.tertiary} />
        <Text style={styles.footerText}>100% Tsy mila aterineto</Text>
      </View>
    </Animated.View>
  );
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
    },
    content: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    medallionArea: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.lg,
    },
    ambientHalo: {
      position: 'absolute',
      width: 156,
      height: 156,
      borderRadius: 78,
      backgroundColor: colors.primaryWash,
    },
    bezelOuter: {
      width: 108,
      height: 108,
      borderRadius: 34,
      padding: 6,
      backgroundColor: colors.bezelOuter,
      borderWidth: 1,
      borderColor: colors.primaryBorderWash,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bezelInner: {
      width: '100%',
      height: '100%',
      borderRadius: 28,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: colors.isDark ? 0.35 : 0.16,
      shadowRadius: 18,
      elevation: 10,
    },
    logo: {
      width: 68,
      height: 68,
      borderRadius: 18,
    },
    brandTitle: {
      fontSize: 28,
      ...fontStyle('extraBold'),
      color: colors.text,
      letterSpacing: 5,
      textAlign: 'center',
    },
    brandTagline: {
      fontSize: 14,
      ...fontStyle('semiBold'),
      color: colors.primary,
      letterSpacing: 0.6,
      marginTop: 4,
    },
    waveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      height: 24,
      marginTop: Spacing.lg,
    },
    footerBadge: {
      position: 'absolute',
      bottom: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: Radius.full,
      backgroundColor: colors.cardWash,
      borderWidth: 1,
      borderColor: colors.border,
    },
    footerText: {
      fontSize: 11,
      ...fontStyle('semiBold'),
      color: colors.textSecondary,
      letterSpacing: 0.4,
    },
  });
