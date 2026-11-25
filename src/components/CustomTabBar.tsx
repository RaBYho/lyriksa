import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
} from 'react-native';
import Animated, {
  ReduceMotion,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius, Spacing, ThemePalette, fontStyle } from '@/constants/theme';
import { useThemePalette } from '@/context/AppSettingsContext';
import { triggerSelectionHaptic } from '@/utils/haptics';

export type TabBarVariant = 'pill' | 'circle' | 'line' | 'classic';

export interface CustomTabBarProps {
  state: {
    index: number;
    routes: Array<{ key: string; name: string; params?: any }>;
  };
  descriptors: Record<string, { options: any }>;
  navigateToTab?: (routeKey: string) => void;
  navigation?: any;
  emitter?: any;
  insets?: any;
  variant?: TabBarVariant;
  [key: string]: any;
}

const TAB_ICONS: Record<
  string,
  { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }
> = {
  index: { active: 'home', inactive: 'home-outline' },
  search: { active: 'search', inactive: 'search-outline' },
  songbook: { active: 'heart', inactive: 'heart-outline' },
  settings: { active: 'settings', inactive: 'settings-outline' },
};

const PILL_WIDTHS: Record<string, number> = {
  index: 120,
  search: 90,
  songbook: 90,
  settings: 100,
};

function computeTabGeometry(rowWidth: number, routes: Array<{ name: string }>) {
  const count = routes.length;
  if (count === 0 || rowWidth <= 0) {
    return {
      centers: [60, 146, 230, 314],
      widths: [120, 90, 90, 100],
    };
  }

  const widths = routes.map(r => PILL_WIDTHS[r.name] || 92);
  const pad = 6;
  const firstCenter = pad + widths[0] / 2;
  const lastCenter = Math.max(firstCenter + 120, rowWidth - pad - widths[count - 1] / 2);

  const step = count > 1 ? (lastCenter - firstCenter) / (count - 1) : 0;
  const centers = routes.map((_, i) => firstCenter + i * step);

  return { centers, widths };
}

function SlidingPillTabItem({
  routeKey,
  isFocused,
  label,
  icons,
  centerPosition,
  slotWidth,
  options,
  onPress,
  onLongPress,
  colors,
  styles,
}: {
  routeKey: string;
  isFocused: boolean;
  label: string;
  icons: { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap };
  centerPosition: number;
  slotWidth: number;
  options: any;
  onPress: () => void;
  onLongPress: () => void;
  colors: ThemePalette;
  styles: ReturnType<typeof createStyles>;
}) {
  const progress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(isFocused ? 1 : 0, {
      duration: isFocused ? 230 : 150,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.Never,
    });
  }, [isFocused, progress]);

  const maxTextWidth = Math.max(44, label.length * 8);

  const labelStyle = useAnimatedStyle(() => ({
    maxWidth: interpolate(progress.value, [0, 1], [0, maxTextWidth]),
    opacity: interpolate(progress.value, [0, 0.4, 1], [0, 0.15, 1]),
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-6, 0]) }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 1.08]) }],
  }));

  return (
    <Pressable
      key={routeKey}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={options.tabBarAccessibilityLabel || label}
      testID={options.tabBarButtonTestID}
      style={({ pressed }) => [
        styles.tabSlot,
        {
          width: slotWidth,
          left: centerPosition - slotWidth / 2,
        },
        pressed && styles.tabPressed,
      ]}>
      <View style={styles.pillContentRow}>
        <Animated.View style={iconStyle}>
          <Ionicons
            name={isFocused ? icons.active : icons.inactive}
            size={19}
            color={isFocused ? colors.primary : colors.textSecondary}
          />
        </Animated.View>

        <Animated.View style={[styles.labelContainer, labelStyle]}>
          <Text style={styles.pillActiveLabel} numberOfLines={1}>
            {label}
          </Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

export function CustomTabBar({
  state,
  descriptors,
  navigateToTab,
  navigation,
  emitter,
  variant = 'pill',
}: CustomTabBarProps) {
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  // Keep deterministic initial width on Web SSR so server & client hydration match
  const [rowWidth, setRowWidth] = useState<number>(() =>
    Platform.OS === 'web'
      ? 504
      : Math.min(Dimensions.get('window').width - 16, 520)
  );
  const { centers, widths } = computeTabGeometry(rowWidth, state.routes);

  const activeIndex = Math.min(Math.max(0, state.index), state.routes.length - 1);
  const targetCenter = centers[activeIndex] || 60;
  const targetWidth = widths[activeIndex] || 120;
  const targetLeft = targetCenter - targetWidth / 2;

  const cadreX = useSharedValue(targetLeft);
  const cadreW = useSharedValue(targetWidth);
  const isInitialLayout = useRef(true);

  useEffect(() => {
    if (isInitialLayout.current) {
      cadreX.value = targetLeft;
      cadreW.value = targetWidth;
      isInitialLayout.current = false;
      return;
    }

    cadreX.value = withSpring(targetLeft, {
      damping: 19,
      stiffness: 210,
      mass: 0.85,
      reduceMotion: ReduceMotion.Never,
    });
    cadreW.value = withSpring(targetWidth, {
      damping: 19,
      stiffness: 210,
      mass: 0.85,
      reduceMotion: ReduceMotion.Never,
    });
  }, [activeIndex, rowWidth, targetLeft, targetWidth, cadreX, cadreW]);

  const slidingCadreStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: cadreX.value }],
    width: cadreW.value,
  }));

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
        },
      ]}>
      <View
        style={styles.tabRow}
        onLayout={e => {
          const w = e.nativeEvent.layout.width;
          if (w > 0 && Math.abs(w - rowWidth) > 1) {
            setRowWidth(w);
          }
        }}>
        {variant === 'pill' && (
          <Animated.View
            pointerEvents="none"
            style={[styles.slidingCadre, slidingCadreStyle]}
          />
        )}

        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
                ? options.title
                : route.name;

          const icons = TAB_ICONS[route.name] || {
            active: 'ellipse',
            inactive: 'ellipse-outline',
          };

          const onPress = () => {
            const isPrevented = emitter?.emit
              ? emitter.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                })?.defaultPrevented
              : navigation?.emit
                ? navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  })?.defaultPrevented
                : false;

            if (!isFocused && !isPrevented) {
              triggerSelectionHaptic();
              if (navigateToTab) {
                navigateToTab(route.key);
              } else if (navigation?.navigate) {
                navigation.navigate(route.name);
              }
            }
          };

          const onLongPress = () => {
            if (emitter?.emit) {
              emitter.emit({ type: 'tabLongPress', target: route.key });
            } else if (navigation?.emit) {
              navigation.emit({ type: 'tabLongPress', target: route.key });
            }
          };

          if (variant === 'pill') {
            return (
              <SlidingPillTabItem
                key={route.key}
                routeKey={route.key}
                isFocused={isFocused}
                icons={icons}
                label={String(label)}
                centerPosition={centers[index] || 60}
                slotWidth={widths[index] || 92}
                options={options}
                onPress={onPress}
                onLongPress={onLongPress}
                colors={colors}
                styles={styles}
              />
            );
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              style={({ pressed }) => [
                styles.standardTab,
                pressed && styles.tabPressed,
              ]}>
              <Ionicons
                name={isFocused ? icons.active : icons.inactive}
                size={22}
                color={isFocused ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.standardLabel,
                  isFocused && styles.standardLabelActive,
                ]}
                numberOfLines={1}>
                {String(label)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: colors.isDark ? 0.35 : 0.08,
      shadowRadius: 12,
      elevation: 16,
    },
    tabRow: {
      position: 'relative',
      height: 50,
      maxWidth: 520,
      width: '100%',
      alignSelf: 'center',
      paddingHorizontal: Spacing.xs,
    },
    tabPressed: {
      opacity: 0.78,
      transform: [{ scale: 0.96 }],
    },
    slidingCadre: {
      position: 'absolute',
      left: 0,
      top: 4,
      height: 42,
      backgroundColor: colors.primaryWash,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: colors.primaryBorderWash,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: colors.isDark ? 0.2 : 0.12,
      shadowRadius: 6,
      elevation: 2,
      zIndex: 1,
    },
    tabSlot: {
      position: 'absolute',
      top: 1,
      width: 88,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    pillContentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    labelContainer: {
      overflow: 'hidden',
      marginLeft: 5,
    },
    pillActiveLabel: {
      fontSize: 12,
      ...fontStyle('bold'),
      color: colors.primary,
      letterSpacing: -0.2,
    },
    standardTab: {
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      paddingVertical: 4,
      minHeight: 48,
    },
    standardLabel: {
      fontSize: 11,
      ...fontStyle('semiBold'),
      color: colors.textSecondary,
      marginTop: 4,
    },
    standardLabelActive: {
      color: colors.primary,
      ...fontStyle('bold'),
    },
  });
