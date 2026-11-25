/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useAppSettings } from '@/context/AppSettingsContext';

export function useTheme() {
  const { colors, resolvedScheme } = useAppSettings();
  return resolvedScheme === 'dark' ? colors.dark : colors.light;
}

export { useThemePalette, useAppSettings } from '@/context/AppSettingsContext';
