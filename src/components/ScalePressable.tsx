import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  ReduceMotion,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ScalePressableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  pressedOpacity?: number;
  children: React.ReactNode;
}

/**
 * GPU-driven spring press wrapper replacing static opacity-only taps.
 */
export function ScalePressable({
  style,
  scaleTo = 0.975,
  pressedOpacity = 0.92,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: ScalePressableProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={e => {
        scale.value = withSpring(scaleTo, {
          damping: 18,
          stiffness: 360,
          reduceMotion: ReduceMotion.Never,
        });
        opacity.value = withSpring(pressedOpacity, {
          damping: 20,
          stiffness: 360,
          reduceMotion: ReduceMotion.Never,
        });
        onPressIn?.(e);
      }}
      onPressOut={e => {
        scale.value = withSpring(1, {
          damping: 15,
          stiffness: 280,
          reduceMotion: ReduceMotion.Never,
        });
        opacity.value = withSpring(1, {
          damping: 18,
          stiffness: 280,
          reduceMotion: ReduceMotion.Never,
        });
        onPressOut?.(e);
      }}
      style={[style, animatedStyle]}>
      {children}
    </AnimatedPressable>
  );
}
