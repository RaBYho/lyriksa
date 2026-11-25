import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  ReduceMotion,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useThemePalette } from '@/context/AppSettingsContext';
import { triggerLightHaptic } from '@/utils/haptics';

interface AnimatedHeartButtonProps {
  isFavorite: boolean;
  onPress: (e: any) => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  inactiveColor?: string;
}

function HeartBurstHalo({ borderColor }: { borderColor: string }) {
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0.6);

  useEffect(() => {
    ringScale.value = withTiming(1.65, {
      duration: 360,
      reduceMotion: ReduceMotion.Never,
    });
    ringOpacity.value = withTiming(0, {
      duration: 360,
      reduceMotion: ReduceMotion.Never,
    });
  }, [ringScale, ringOpacity]);

  const ringAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.haloRing, { borderColor }, ringAnimatedStyle]}
    />
  );
}

/**
 * Tactile heart toggle with Reanimated spring pop, lazy burst halo, and light haptic.
 * Allocates only one shared value at rest so virtualized lists stay fast.
 */
export function AnimatedHeartButton({
  isFavorite,
  onPress,
  size = 22,
  style,
  accessibilityLabel,
  inactiveColor,
}: AnimatedHeartButtonProps) {
  const colors = useThemePalette();
  const iconScale = useSharedValue(1);
  const [burstKey, setBurstKey] = useState(0);
  const prevFavRef = useRef(isFavorite);

  useEffect(() => {
    if (isFavorite && !prevFavRef.current) {
      iconScale.value = withSequence(
        withTiming(0.76, { duration: 70, reduceMotion: ReduceMotion.Never }),
        withSpring(1.26, {
          damping: 10,
          stiffness: 340,
          reduceMotion: ReduceMotion.Never,
        }),
        withSpring(1, {
          damping: 14,
          stiffness: 260,
          reduceMotion: ReduceMotion.Never,
        })
      );
      setBurstKey(k => k + 1);
      const timer = setTimeout(() => setBurstKey(0), 400);
      prevFavRef.current = isFavorite;
      return () => clearTimeout(timer);
    }

    if (!isFavorite && prevFavRef.current) {
      iconScale.value = withSequence(
        withTiming(0.84, { duration: 90, reduceMotion: ReduceMotion.Never }),
        withSpring(1, {
          damping: 16,
          stiffness: 280,
          reduceMotion: ReduceMotion.Never,
        })
      );
    }
    prevFavRef.current = isFavorite;
  }, [isFavorite, iconScale]);

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  return (
    <Pressable
      onPress={e => {
        e?.stopPropagation?.();
        triggerLightHaptic();
        onPress(e);
      }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ||
        (isFavorite ? 'Esory amin ny ankafizina' : 'Ampio amin ny ankafizina')
      }
      style={({ pressed }) => [
        styles.button,
        pressed && { opacity: 0.78 },
        style,
      ]}>
      {burstKey > 0 ? <HeartBurstHalo key={burstKey} borderColor={colors.primary} /> : null}
      <Animated.View style={iconAnimatedStyle}>
        <Ionicons
          name={isFavorite ? 'heart' : 'heart-outline'}
          size={size}
          color={isFavorite ? colors.primary : inactiveColor || colors.textSecondary}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  haloRing: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
  },
});
