import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Extrapolation,
  ReduceMotion,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { fontStyle, Radius, ThemePalette } from '@/constants/theme';
import { useThemePalette } from '@/context/AppSettingsContext';
import { ScalePressable } from '@/components/ScalePressable';
import { triggerLightHaptic, triggerSelectionHaptic } from '@/utils/haptics';

interface AutoScrollHUDProps {
  isScrolling: boolean;
  onToggleScroll: () => void;
  speed: number;
  onChangeSpeed: (speed: number) => void;
  fontSize: number;
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
  visible?: boolean;
}

const SPEEDS = [0.5, 1, 1.5, 2];

export function AutoScrollHUD({
  isScrolling,
  onToggleScroll,
  speed,
  onChangeSpeed,
  fontSize,
  onIncreaseFontSize,
  onDecreaseFontSize,
  visible = true,
}: AutoScrollHUDProps) {
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isOpen, setIsOpen] = useState(false);

  const openProgress = useSharedValue(0);
  const hudVisibility = useSharedValue(visible ? 1 : 0);
  const pulseValue = useSharedValue(1);

  useEffect(() => {
    openProgress.value = withSpring(isOpen ? 1 : 0, {
      damping: 18,
      stiffness: 250,
      mass: 0.72,
      reduceMotion: ReduceMotion.Never,
    });
  }, [isOpen, openProgress]);

  useEffect(() => {
    hudVisibility.value = withTiming(visible ? 1 : 0, {
      duration: 220,
      reduceMotion: ReduceMotion.Never,
    });
  }, [visible, hudVisibility]);

  useEffect(() => {
    if (isScrolling) {
      pulseValue.value = withRepeat(
        withSequence(
          withTiming(1.18, { duration: 680, reduceMotion: ReduceMotion.Never }),
          withTiming(1, { duration: 680, reduceMotion: ReduceMotion.Never })
        ),
        -1,
        true,
        undefined,
        ReduceMotion.Never
      );
    } else {
      pulseValue.value = withTiming(1, {
        duration: 180,
        reduceMotion: ReduceMotion.Never,
      });
    }
  }, [isScrolling, pulseValue]);

  const handleCycleSpeed = () => {
    triggerSelectionHaptic();
    const currentIndex = SPEEDS.indexOf(speed);
    const nextIndex = (currentIndex + 1) % SPEEDS.length;
    onChangeSpeed(SPEEDS[nextIndex]);
  };

  const hudContainerStyle = useAnimatedStyle(() => ({
    opacity: hudVisibility.value,
    transform: [
      {
        translateY: interpolate(hudVisibility.value, [0, 1], [18, 0], Extrapolation.CLAMP),
      },
      {
        scale: interpolate(hudVisibility.value, [0, 1], [0.92, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  const drawerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(openProgress.value, [0, 0.35, 1], [0, 0.3, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(openProgress.value, [0, 1], [16, 0], Extrapolation.CLAMP),
      },
      {
        scale: interpolate(openProgress.value, [0, 1], [0.82, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  const triggerIconStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${interpolate(openProgress.value, [0, 1], [0, 90], Extrapolation.CLAMP)}deg`,
      },
    ],
  }));

  const scrollPulseRingStyle = useAnimatedStyle(() => ({
    opacity: isScrolling
      ? interpolate(pulseValue.value, [1, 1.18], [0.68, 0.12], Extrapolation.CLAMP)
      : 0,
    transform: [{ scale: pulseValue.value }],
  }));

  return (
    <Animated.View
      style={[styles.floatingContainer, hudContainerStyle]}
      pointerEvents={visible ? 'box-none' : 'none'}>
      {/* Expandable Floating Acoustic Capsule Rail */}
      <Animated.View
        pointerEvents={isOpen && visible ? 'auto' : 'none'}
        style={[styles.capsuleOuter, drawerStyle]}>
        <View style={styles.capsuleRail}>
          {/* 1. Play / Pause Auto-Scroll */}
          <ScalePressable
            scaleTo={0.9}
            style={[
              styles.hudItemBtn,
              isScrolling && styles.hudItemBtnActive,
            ]}
            onPress={() => {
              triggerSelectionHaptic();
              onToggleScroll();
            }}
            accessibilityLabel={isScrolling ? 'Ajanona ny auto-scroll' : 'Alefaso ny auto-scroll'}
            accessibilityRole="button">
            <Ionicons
              name={isScrolling ? 'pause' : 'play'}
              size={18}
              color={isScrolling ? colors.onPrimary : colors.text}
            />
          </ScalePressable>

          {/* 2. Speed Cycle */}
          <ScalePressable
            scaleTo={0.9}
            style={styles.hudItemBtn}
            onPress={handleCycleSpeed}
            accessibilityLabel="Hanova hafainganam-pandeha"
            accessibilityRole="button">
            <Text style={styles.speedText}>{speed}x</Text>
          </ScalePressable>

          <View style={styles.railDivider} />

          {/* 3. Increase Font */}
          <ScalePressable
            scaleTo={0.9}
            style={[styles.hudItemBtn, fontSize >= 32 && styles.hudItemBtnDisabled]}
            disabled={fontSize >= 32}
            onPress={() => {
              triggerLightHaptic();
              onIncreaseFontSize();
            }}
            accessibilityLabel="Hampitombo ny haben'ny soratra"
            accessibilityRole="button">
            <Text style={styles.fontLabel}>A+</Text>
          </ScalePressable>

          {/* Font Size Micro Indicator */}
          <View style={styles.fontSizeReadout}>
            <Text style={styles.fontSizeReadoutText}>{fontSize}</Text>
          </View>

          {/* 4. Decrease Font */}
          <ScalePressable
            scaleTo={0.9}
            style={[styles.hudItemBtn, fontSize <= 14 && styles.hudItemBtnDisabled]}
            disabled={fontSize <= 14}
            onPress={() => {
              triggerLightHaptic();
              onDecreaseFontSize();
            }}
            accessibilityLabel="Hampihena ny haben'ny soratra"
            accessibilityRole="button">
            <Text style={styles.fontLabel}>A-</Text>
          </ScalePressable>
        </View>
      </Animated.View>

      {/* Main Trigger FAB */}
      <View style={styles.triggerAnchor}>
        <Animated.View
          pointerEvents="none"
          style={[styles.pulseHalo, scrollPulseRingStyle]}
        />

        <View style={styles.triggerOuterBezel}>
          <ScalePressable
            scaleTo={0.92}
            style={[
              styles.triggerFab,
              isOpen && styles.triggerFabOpen,
              isScrolling && !isOpen && styles.triggerFabScrolling,
            ]}
            onPress={() => {
              triggerLightHaptic();
              setIsOpen(prev => !prev);
            }}
            accessibilityLabel="Fitaovana famakiana"
            accessibilityRole="button">
            <Animated.View style={triggerIconStyle}>
              <Ionicons
                name={isOpen ? 'close' : 'options-outline'}
                size={21}
                color={
                  isOpen || isScrolling ? colors.onPrimary : colors.primary
                }
              />
            </Animated.View>
          </ScalePressable>
        </View>
      </View>
    </Animated.View>
  );
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    floatingContainer: {
      position: 'absolute',
      bottom: 24,
      right: 20,
      alignItems: 'center',
      gap: 10,
      zIndex: 100,
    },
    capsuleOuter: {
      padding: 4,
      borderRadius: Radius.full,
      backgroundColor: colors.bezelOuter,
      borderWidth: 1,
      borderColor: colors.bezelOuterBorder,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.28,
      shadowRadius: 16,
      elevation: 10,
    },
    capsuleRail: {
      backgroundColor: colors.surfaceContainerHigh,
      borderRadius: Radius.full,
      paddingVertical: 6,
      paddingHorizontal: 5,
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    hudItemBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hudItemBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    hudItemBtnDisabled: {
      opacity: 0.35,
    },
    railDivider: {
      width: 22,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: 1,
    },
    speedText: {
      color: colors.text,
      fontSize: 12,
      ...fontStyle('bold'),
    },
    fontLabel: {
      color: colors.text,
      fontSize: 13.5,
      ...fontStyle('bold'),
    },
    fontSizeReadout: {
      paddingVertical: 1,
    },
    fontSizeReadoutText: {
      color: colors.textSecondary,
      fontSize: 10.5,
      ...fontStyle('semiBold'),
    },
    triggerAnchor: {
      width: 56,
      height: 56,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pulseHalo: {
      position: 'absolute',
      width: 56,
      height: 56,
      borderRadius: 28,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    triggerOuterBezel: {
      padding: 4,
      borderRadius: 28,
      backgroundColor: colors.bezelOuter,
      borderWidth: 1,
      borderColor: colors.bezelOuterBorder,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.32,
      shadowRadius: 12,
      elevation: 10,
    },
    triggerFab: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: 1,
      borderColor: colors.primaryBorderWash,
      alignItems: 'center',
      justifyContent: 'center',
    },
    triggerFabOpen: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    triggerFabScrolling: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
  });
