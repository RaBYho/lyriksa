import '@/global.css';
import { Platform } from 'react-native';

export interface ThemePalette {
  isDark: boolean;
  background: string;
  surface: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  primary: string;
  primaryContainer: string;
  onPrimary: string;
  secondary: string;
  secondaryContainer: string;
  tertiary: string;
  tertiaryContainer: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  outline: string;
  border: string;
  // Adaptive subtle washes, double-bezel edges, and shimmer tokens
  cardWash: string;
  bezelOuter: string;
  bezelOuterBorder: string;
  bezelInnerShadow: string;
  primaryWash: string;
  primaryBorderWash: string;
  secondaryWash: string;
  tertiaryWash: string;
  heroBorder: string;
  shimmerBase: string;
  shimmerHighlight: string;
  heroGradientStart: string;
  heroGradientEnd: string;
  // Compatibility for starter helpers
  light: {
    text: string;
    background: string;
    backgroundElement: string;
    backgroundSelected: string;
    textSecondary: string;
  };
  dark: {
    text: string;
    background: string;
    backgroundElement: string;
    backgroundSelected: string;
    textSecondary: string;
  };
}

const SHARED_COMPAT = {
  light: {
    text: '#1E1B18',
    background: '#F6F3ED',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EFEAE0',
    textSecondary: '#6A635B',
  },
  dark: {
    text: '#F5F1EB',
    background: '#100F0E',
    backgroundElement: '#1E1C1A',
    backgroundSelected: '#282522',
    textSecondary: '#9E978E',
  },
} as const;

export const DarkPalette: ThemePalette = {
  isDark: true,
  background: '#100F0E',
  surface: '#171514',
  surfaceContainerLowest: '#0A0908',
  surfaceContainerLow: '#181614',
  surfaceContainer: '#1E1C1A',
  surfaceContainerHigh: '#282522',
  surfaceContainerHighest: '#332F2B',

  primary: '#E46E52',
  primaryContainer: '#FFB9A8',
  onPrimary: '#FFFFFF',
  secondary: '#F4B248',
  secondaryContainer: '#452B00',
  tertiary: '#34D375',
  tertiaryContainer: '#003910',

  text: '#F5F1EB',
  textSecondary: '#9E978E',
  textMuted: '#6E6860',
  outline: '#46413C',
  border: 'rgba(245, 241, 235, 0.08)',

  cardWash: 'rgba(245, 241, 235, 0.05)',
  bezelOuter: 'rgba(245, 241, 235, 0.03)',
  bezelOuterBorder: 'rgba(245, 241, 235, 0.07)',
  bezelInnerShadow: 'rgba(255, 255, 255, 0.06)',
  primaryWash: 'rgba(228, 110, 82, 0.15)',
  primaryBorderWash: 'rgba(228, 110, 82, 0.38)',
  secondaryWash: 'rgba(244, 178, 72, 0.14)',
  tertiaryWash: 'rgba(52, 211, 117, 0.14)',
  heroBorder: 'rgba(228, 110, 82, 0.24)',
  shimmerBase: '#24211E',
  shimmerHighlight: '#36312C',
  heroGradientStart: '#231B18',
  heroGradientEnd: '#191715',

  ...SHARED_COMPAT,
};

export const LightPalette: ThemePalette = {
  isDark: false,
  background: '#F6F3ED',
  surface: '#FCFBF8',
  surfaceContainerLowest: '#EAE4D8',
  surfaceContainerLow: '#FAF8F4',
  surfaceContainer: '#FFFFFF',
  surfaceContainerHigh: '#EFEAE0',
  surfaceContainerHighest: '#E4DDD1',

  primary: '#C95236',
  primaryContainer: '#9F371E',
  onPrimary: '#FFFFFF',
  secondary: '#B86E00',
  secondaryContainer: '#FFF2DA',
  tertiary: '#188C44',
  tertiaryContainer: '#E1F6E8',

  text: '#1E1B18',
  textSecondary: '#6A635B',
  textMuted: '#918A81',
  outline: '#CFC7BB',
  border: 'rgba(30, 27, 24, 0.09)',

  cardWash: 'rgba(30, 27, 24, 0.04)',
  bezelOuter: 'rgba(30, 27, 24, 0.03)',
  bezelOuterBorder: 'rgba(30, 27, 24, 0.07)',
  bezelInnerShadow: 'rgba(255, 255, 255, 0.85)',
  primaryWash: 'rgba(201, 82, 54, 0.11)',
  primaryBorderWash: 'rgba(201, 82, 54, 0.32)',
  secondaryWash: 'rgba(184, 110, 0, 0.11)',
  tertiaryWash: 'rgba(24, 140, 68, 0.11)',
  heroBorder: 'rgba(201, 82, 54, 0.22)',
  shimmerBase: '#EAE4D8',
  shimmerHighlight: '#F7F4EE',
  heroGradientStart: '#FFF9F4',
  heroGradientEnd: '#F8F2EA',

  ...SHARED_COMPAT,
};

// Default static fallback (prefer useThemePalette() for reactive theming)
export const Colors = DarkPalette;

export type ThemeColor = keyof typeof DarkPalette.light & keyof typeof DarkPalette.dark;

export const FontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  mediumItalic: 'PlusJakartaSans_500Medium_Italic',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
} as const;

export type FontWeightKey = keyof typeof FontFamily;

/**
 * Returns clean cross-platform fontFamily styling without triggering Android
 * faux-weight Typeface lookup conflicts on loaded custom font files.
 */
export function fontStyle(weight: FontWeightKey = 'regular') {
  return { fontFamily: FontFamily[weight] };
}

export const Fonts = Platform.select({
  ios: {
    sans: FontFamily.regular,
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: FontFamily.regular,
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,

  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  xxl: 30,
  full: 9999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
