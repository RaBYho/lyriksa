import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Appearance, Platform } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { DarkPalette, LightPalette, ThemePalette } from '@/constants/theme';
import {
  AppSettings,
  DEFAULT_APP_SETTINGS,
  getAppSettings,
  saveAppSettings,
} from '@/services/database';

interface AppSettingsContextValue {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  resolvedScheme: 'light' | 'dark';
  colors: ThemePalette;
  isLoaded: boolean;
}

const AppSettingsContext = createContext<AppSettingsContextValue>({
  settings: DEFAULT_APP_SETTINGS,
  updateSettings: async () => {},
  resolvedScheme: 'dark',
  colors: DarkPalette,
  isLoaded: false,
});

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    getAppSettings()
      .then(loaded => {
        setSettings(loaded);
      })
      .catch(() => {})
      .finally(() => {
        setIsLoaded(true);
      });
  }, []);

  const resolvedScheme: 'light' | 'dark' = useMemo(() => {
    if (settings.themeMode === 'light') return 'light';
    if (settings.themeMode === 'dark') return 'dark';
    return systemScheme === 'light' ? 'light' : 'dark';
  }, [settings.themeMode, systemScheme]);

  const colors = useMemo(
    () => (resolvedScheme === 'dark' ? DarkPalette : LightPalette),
    [resolvedScheme]
  );

  // Sync native appearance override, root background, and web colorScheme
  useEffect(() => {
    if (Platform.OS !== 'web' && typeof Appearance?.setColorScheme === 'function') {
      try {
        const target =
          settings.themeMode === 'system' ? 'auto' : settings.themeMode;
        Appearance.setColorScheme(target as any);
      } catch {}
    }

    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      try {
        document.documentElement.style.colorScheme = resolvedScheme;
        document.body.style.backgroundColor = colors.background;
      } catch {}
    }
  }, [settings.themeMode, resolvedScheme, colors.background]);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
    try {
      const saved = await saveAppSettings(patch);
      setSettings(saved);
    } catch (err) {
      console.warn('Failed to persist settings:', err);
    }
  }, []);

  const value = useMemo(
    () => ({
      settings,
      updateSettings,
      resolvedScheme,
      colors,
      isLoaded,
    }),
    [settings, updateSettings, resolvedScheme, colors, isLoaded]
  );

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}

export function useThemePalette(): ThemePalette {
  return useContext(AppSettingsContext).colors;
}
