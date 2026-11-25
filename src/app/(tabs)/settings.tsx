import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Linking,
  Alert,
  Share,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { fontStyle, Radius, Spacing, ThemePalette } from '@/constants/theme';
import { useAppSettings } from '@/context/AppSettingsContext';
import { ScalePressable } from '@/components/ScalePressable';
import { triggerLightHaptic, triggerMediumHaptic, triggerSelectionHaptic } from '@/utils/haptics';
import {
  getStats,
  getUserDataCounts,
  clearSongHistory,
  clearSearchHistory,
  getFavoriteSongs,
  getFavoriteArtistsList,
  ThemeMode,
  LyricsAlign,
  UserDataCounts,
} from '@/services/database';

const THEME_OPTIONS: {
  id: ThemeMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'system', label: 'Rafitra', icon: 'phone-portrait-outline' },
  { id: 'light', label: 'Mazava', icon: 'sunny-outline' },
  { id: 'dark', label: 'Maizina', icon: 'moon-outline' },
];

const SCROLL_SPEEDS = [0.5, 1, 1.5, 2];

function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void
) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: 'Tsia', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

function showFeedback(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
    }
    return;
  }
  Alert.alert(title, message);
}

export default function SettingsScreen() {
  const router = useRouter();
  const { settings, updateSettings, resolvedScheme, colors } = useAppSettings();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [stats, setStats] = useState({ totalSongs: 0, totalArtists: 0 });
  const [counts, setCounts] = useState<UserDataCounts>({
    favoriteSongs: 0,
    favoriteArtists: 0,
    songHistory: 0,
    searchHistory: 0,
  });
  const [themeTrackWidth, setThemeTrackWidth] = useState(0);

  const themeIndex =
    settings.themeMode === 'system' ? 0 : settings.themeMode === 'light' ? 1 : 2;
  const themeProgress = useSharedValue(themeIndex);

  useEffect(() => {
    themeProgress.value = withSpring(themeIndex, {
      damping: 20,
      stiffness: 240,
      mass: 0.72,
      reduceMotion: ReduceMotion.Never,
    });
  }, [themeIndex, themeProgress]);

  const themeThumbWidth = Math.max(0, (themeTrackWidth - 8) / 3);
  const themeThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: themeProgress.value * themeThumbWidth }],
  }));

  const loadOverview = useCallback(() => {
    Promise.all([getStats(), getUserDataCounts()])
      .then(([s, c]) => {
        setStats(s);
        setCounts(c);
      })
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOverview();
    }, [loadOverview])
  );

  const platformLabel =
    Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web';
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  const themeHint =
    settings.themeMode === 'system'
      ? `Miankina amin’ny finday (${resolvedScheme === 'dark' ? 'Maizina' : 'Mazava'} ankehitriny)`
      : settings.themeMode === 'light'
        ? 'Fisehoana mazava mandrakariva'
        : 'Fisehoana maizina (Dark Stage)';

  const handleClearSongHistory = () => {
    if (counts.songHistory === 0) return;
    triggerMediumHaptic();
    confirmAction(
      'Hamafa ny tantara',
      `Hofafana ve ireo hira ${counts.songHistory} tao amin’ny « Hira nosokafana farany » ?`,
      'Fafao',
      async () => {
        await clearSongHistory();
        setCounts(prev => ({ ...prev, songHistory: 0 }));
      }
    );
  };

  const handleClearSearchHistory = () => {
    if (counts.searchHistory === 0) return;
    triggerMediumHaptic();
    confirmAction(
      'Hamafa ny fikarohana',
      `Hofafana ve ireo teny ${counts.searchHistory} tao amin’ny « Notadiavina farany » ?`,
      'Fafao',
      async () => {
        await clearSearchHistory();
        setCounts(prev => ({ ...prev, searchHistory: 0 }));
      }
    );
  };

  const handleExportFavorites = async () => {
    triggerLightHaptic();
    try {
      const [favSongs, favArtists] = await Promise.all([
        getFavoriteSongs(),
        getFavoriteArtistsList(),
      ]);

      if (favSongs.length === 0 && favArtists.length === 0) {
        showFeedback(
          'Tsy mbola misy ankafiziko',
          "Manampia hira na mpihira ankafizinao aloha ao amin'ny Tahiry vao afaka mizara na mitahiry azy."
        );
        return;
      }

      const lines: string[] = ['LYRIKSA — Ny Tahiriko'];
      if (favArtists.length > 0) {
        lines.push('', `Mpihira ankafiziko (${favArtists.length}) :`);
        favArtists.forEach(a => lines.push(`• ${a.name} (${a.song_count} hira)`));
      }
      if (favSongs.length > 0) {
        lines.push('', `Hira ankafiziko (${favSongs.length}) :`);
        favSongs.forEach(s => lines.push(`• ${s.title} — ${s.artist_name}`));
      }

      await Share.share({
        title: 'Lyriksa — Ny Tahiriko',
        message: lines.join('\n'),
      });
    } catch (err) {
      console.warn('Export favorites error:', err);
    }
  };

  const handleShareApp = async () => {
    triggerLightHaptic();
    try {
      await Share.share({
        title: 'Lyriksa — Tononkira Malagasy',
        message:
          'Lyriksa : tononkira malagasy maherin’ny 17 000 azo vakiana tsy mila aterineto !',
      });
    } catch (err) {
      console.warn('Share app error:', err);
    }
  };

  const openSerasera = () => {
    triggerLightHaptic();
    Linking.openURL('https://tononkira.serasera.org').catch(err => {
      console.warn('Failed to open external URL:', err);
    });
  };

  const previewBg = settings.highContrast
    ? colors.isDark
      ? '#000000'
      : '#FFFFFF'
    : colors.surfaceContainerLow;
  const previewTextColor = settings.highContrast
    ? colors.isDark
      ? '#FFFFFF'
      : '#000000'
    : colors.text;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Editorial Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoOuterBezel}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.logo}
            />
          </View>
          <View>
            <Text style={styles.brandSubtitle}>LYRIKSA</Text>
            <Text style={styles.headerTitle}>Fikirana</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Section 1: Theme / Appearance Mode */}
        <Animated.View entering={FadeInDown.duration(300).reduceMotion(ReduceMotion.Never)} style={styles.section}>
          <Text style={styles.sectionHeaderTitle}>FISEHOANA</Text>
          <View style={styles.cardGroup}>
            <View style={styles.themeBlock}>
              <View style={styles.themeHeader}>
                <View style={styles.iconCircle}>
                  <Ionicons name="color-palette-outline" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Endrika sy Loko</Text>
                  <Text style={styles.rowSubtitle}>{themeHint}</Text>
                </View>
              </View>

              <View
                style={styles.segmentedTrack}
                onLayout={e => setThemeTrackWidth(e.nativeEvent.layout.width)}>
                {themeThumbWidth > 0 && (
                  <Animated.View
                    style={[
                      styles.segmentedThumb,
                      { width: themeThumbWidth },
                      themeThumbStyle,
                    ]}
                  />
                )}
                {THEME_OPTIONS.map(opt => {
                  const isActive = settings.themeMode === opt.id;
                  return (
                    <ScalePressable
                      key={opt.id}
                      scaleTo={0.96}
                      style={[
                        styles.segmentBtn,
                        themeThumbWidth === 0 && isActive && styles.segmentBtnFallbackActive,
                      ]}
                      onPress={() => {
                        if (settings.themeMode !== opt.id) {
                          triggerSelectionHaptic();
                          updateSettings({ themeMode: opt.id });
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityState={isActive ? { selected: true } : {}}>
                      <Ionicons
                        name={opt.icon}
                        size={15}
                        color={isActive ? colors.onPrimary : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.segmentText,
                          isActive && styles.segmentTextActive,
                        ]}>
                        {opt.label}
                      </Text>
                    </ScalePressable>
                  );
                })}
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Section 2: Lyrics Reader Preferences */}
        <Animated.View entering={FadeInDown.delay(50).duration(300).reduceMotion(ReduceMotion.Never)} style={styles.section}>
          <Text style={styles.sectionHeaderTitle}>FAMAKIANA TONONKIRA</Text>

          <View style={styles.cardGroup}>
            {/* Keep Screen Awake */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="sunny" size={20} color={colors.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Aza avela maty ny ecran</Text>
                  <Text style={styles.rowSubtitle}>
                    Mihazona ny ecran hirehitra mandritra ny fihirana
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.keepAwake}
                onValueChange={val => {
                  triggerSelectionHaptic();
                  updateSettings({ keepAwake: val });
                }}
                trackColor={{
                  false: colors.surfaceContainerHighest,
                  true: colors.primary,
                }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.separator} />

            {/* High Contrast Mode */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="contrast" size={20} color={colors.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Loko miavaka kokoa</Text>
                  <Text style={styles.rowSubtitle}>
                    Fifanohitam-bolon-tsoratra mafy ho an’ny sehatra na masoandro
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.highContrast}
                onValueChange={val => {
                  triggerSelectionHaptic();
                  updateSettings({ highContrast: val });
                }}
                trackColor={{
                  false: colors.surfaceContainerHighest,
                  true: colors.primary,
                }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.separator} />

            {/* Default Font Size */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="text" size={19} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Haben’ny soratra</Text>
                  <Text style={styles.rowSubtitle}>Habe voafidy mialoha rehefa mamaky</Text>
                </View>
              </View>
              <View style={styles.stepper}>
                <ScalePressable
                  scaleTo={0.9}
                  style={[
                    styles.stepperBtn,
                    settings.defaultFontSize <= 14 && styles.stepperBtnDisabled,
                  ]}
                  disabled={settings.defaultFontSize <= 14}
                  onPress={() => {
                    triggerLightHaptic();
                    updateSettings({
                      defaultFontSize: Math.max(14, settings.defaultFontSize - 2),
                    });
                  }}>
                  <Ionicons name="remove" size={16} color={colors.text} />
                </ScalePressable>
                <Text style={styles.stepperValue}>{settings.defaultFontSize}px</Text>
                <ScalePressable
                  scaleTo={0.9}
                  style={[
                    styles.stepperBtn,
                    settings.defaultFontSize >= 28 && styles.stepperBtnDisabled,
                  ]}
                  disabled={settings.defaultFontSize >= 28}
                  onPress={() => {
                    triggerLightHaptic();
                    updateSettings({
                      defaultFontSize: Math.min(28, settings.defaultFontSize + 2),
                    });
                  }}>
                  <Ionicons name="add" size={16} color={colors.text} />
                </ScalePressable>
              </View>
            </View>

            <View style={styles.separator} />

            {/* Lyrics Alignment */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="reorder-three" size={20} color={colors.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Filaharan’ny soratra</Text>
                  <Text style={styles.rowSubtitle}>Fomba fandaharana ny andininy</Text>
                </View>
              </View>
              <View style={styles.compactPills}>
                {(['left', 'center'] as LyricsAlign[]).map(align => {
                  const isActive = settings.lyricsAlign === align;
                  return (
                    <ScalePressable
                      key={align}
                      scaleTo={0.94}
                      style={[
                        styles.compactPill,
                        isActive && styles.compactPillActive,
                      ]}
                      onPress={() => {
                        if (settings.lyricsAlign !== align) {
                          triggerSelectionHaptic();
                          updateSettings({ lyricsAlign: align });
                        }
                      }}>
                      <Text
                        style={[
                          styles.compactPillText,
                          isActive && styles.compactPillTextActive,
                        ]}>
                        {align === 'left' ? 'Ankavia' : 'Afovoany'}
                      </Text>
                    </ScalePressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.separator} />

            {/* Default Auto-Scroll Speed */}
            <View style={styles.speedBlock}>
              <View style={styles.rowLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="speedometer-outline" size={19} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Hafainganam-pandeha</Text>
                  <Text style={styles.rowSubtitle}>Fihodinana mandeha ho azy (Auto-scroll)</Text>
                </View>
              </View>
              <View style={styles.speedPillsRow}>
                {SCROLL_SPEEDS.map(spd => {
                  const isActive = settings.defaultScrollSpeed === spd;
                  return (
                    <ScalePressable
                      key={spd}
                      scaleTo={0.94}
                      style={[
                        styles.speedPill,
                        isActive && styles.compactPillActive,
                      ]}
                      onPress={() => {
                        if (settings.defaultScrollSpeed !== spd) {
                          triggerSelectionHaptic();
                          updateSettings({ defaultScrollSpeed: spd });
                        }
                      }}>
                      <Text
                        style={[
                          styles.compactPillText,
                          isActive && styles.compactPillTextActive,
                        ]}>
                        {spd}x
                      </Text>
                    </ScalePressable>
                  );
                })}
              </View>
            </View>

            {/* Double-Bezel Live Typography Preview */}
            <View style={styles.previewOuterBezel}>
              <View
                style={[
                  styles.previewCard,
                  { backgroundColor: previewBg },
                ]}>
                <Text style={styles.previewLabel}>TARATRA FAMAKIANA</Text>
                <Text
                  style={[
                    styles.previewLyrics,
                    fontStyle(settings.highContrast ? 'bold' : 'medium'),
                    {
                      fontSize: settings.defaultFontSize,
                      lineHeight: Math.round(settings.defaultFontSize * 1.55),
                      textAlign: settings.lyricsAlign,
                      color: previewTextColor,
                    },
                  ]}>
                  {'Izay tia no mahay mihira,\nNa amin’ny alina mangina aza...'}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Section 3: History & User Data */}
        <Animated.View entering={FadeInDown.delay(100).duration(300).reduceMotion(ReduceMotion.Never)} style={styles.section}>
          <Text style={styles.sectionHeaderTitle}>TANTARA SY DATA</Text>

          <View style={styles.cardGroup}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="time-outline" size={20} color={colors.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Hira nosokafana farany</Text>
                  <Text style={styles.rowSubtitle}>
                    {counts.songHistory} hira voatahiry ao amin’ny tantara
                  </Text>
                </View>
              </View>
              <ScalePressable
                scaleTo={0.94}
                style={[
                  styles.actionChipBtn,
                  counts.songHistory === 0 && styles.actionChipBtnDisabled,
                ]}
                disabled={counts.songHistory === 0}
                onPress={handleClearSongHistory}>
                <Text
                  style={[
                    styles.actionChipText,
                    counts.songHistory === 0 && styles.actionChipTextDisabled,
                  ]}>
                  Fafao
                </Text>
              </ScalePressable>
            </View>

            <View style={styles.separator} />

            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="search-outline" size={19} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Notadiavina farany</Text>
                  <Text style={styles.rowSubtitle}>
                    {counts.searchHistory} teny fikarohana voatahiry
                  </Text>
                </View>
              </View>
              <ScalePressable
                scaleTo={0.94}
                style={[
                  styles.actionChipBtn,
                  counts.searchHistory === 0 && styles.actionChipBtnDisabled,
                ]}
                disabled={counts.searchHistory === 0}
                onPress={handleClearSearchHistory}>
                <Text
                  style={[
                    styles.actionChipText,
                    counts.searchHistory === 0 && styles.actionChipTextDisabled,
                  ]}>
                  Fafao
                </Text>
              </ScalePressable>
            </View>

            <View style={styles.separator} />

            <ScalePressable
              scaleTo={0.985}
              style={styles.row}
              onPress={handleExportFavorites}>
              <View style={styles.rowLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="download-outline" size={20} color={colors.tertiary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Hizara / Hitahiry ny ankafiziko</Text>
                  <Text style={styles.rowSubtitle}>
                    Lisitr’ireo hira ({counts.favoriteSongs}) sy mpihira ({counts.favoriteArtists})
                  </Text>
                </View>
              </View>
              <Ionicons name="share-outline" size={18} color={colors.textSecondary} />
            </ScalePressable>
          </View>
        </Animated.View>

        {/* Section 4: Local Storage & Catalog Info */}
        <Animated.View entering={FadeInDown.delay(140).duration(300).reduceMotion(ReduceMotion.Never)} style={styles.section}>
          <Text style={styles.sectionHeaderTitle}>TAHIRY AN-TOERANA</Text>

          <View style={styles.cardGroup}>
            <ScalePressable
              scaleTo={0.985}
              style={styles.row}
              onPress={() => {
                triggerLightHaptic();
                router.push('/songs' as any);
              }}>
              <View style={styles.rowLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="musical-notes" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Isan’ny hira</Text>
                  <Text style={styles.rowSubtitle}>
                    {stats.totalSongs.toLocaleString()} hira malagasy
                  </Text>
                </View>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.valueText}>{stats.totalSongs.toLocaleString()}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.outline} />
              </View>
            </ScalePressable>

            <View style={styles.separator} />

            <ScalePressable
              scaleTo={0.985}
              style={styles.row}
              onPress={() => {
                triggerLightHaptic();
                router.push('/artists' as any);
              }}>
              <View style={styles.rowLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="people" size={20} color={colors.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Isan’ny mpihira</Text>
                  <Text style={styles.rowSubtitle}>
                    {stats.totalArtists.toLocaleString()} mpihira / tarika
                  </Text>
                </View>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.valueText}>{stats.totalArtists.toLocaleString()}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.outline} />
              </View>
            </ScalePressable>

            <View style={styles.separator} />

            <ScalePressable
              scaleTo={0.985}
              style={styles.row}
              onPress={() => {
                triggerLightHaptic();
                router.push('/(tabs)/songbook' as any);
              }}>
              <View style={styles.rowLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="heart" size={19} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Ny Tahiriko (Ankafiziko)</Text>
                  <Text style={styles.rowSubtitle}>
                    {counts.favoriteSongs} hira — {counts.favoriteArtists} mpihira
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.outline} />
            </ScalePressable>

            <View style={styles.separator} />

            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="cloud-offline-outline" size={20} color={colors.tertiary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Fampiasana</Text>
                  <Text style={styles.rowSubtitle}>Tahiry voatahiry an-toerana daholo</Text>
                </View>
              </View>
              <View style={styles.offlineBadge}>
                <Ionicons name="checkmark-circle" size={13} color={colors.tertiary} />
                <Text style={styles.badgeText}>100% Tsy mila aterineto</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Section 5: About & Credits */}
        <Animated.View entering={FadeInDown.delay(180).duration(300).reduceMotion(ReduceMotion.Never)} style={styles.section}>
          <Text style={styles.sectionHeaderTitle}>MOMBA NY LYRIKSA</Text>

          <View style={styles.cardGroup}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="information-circle" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Kinova</Text>
                  <Text style={styles.rowSubtitle}>
                    Version {appVersion} ({platformLabel})
                  </Text>
                </View>
              </View>
              <Text style={styles.valueText}>v{appVersion}</Text>
            </View>

            <View style={styles.separator} />

            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="person-outline" size={20} color={colors.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Mpamorona</Text>
                  <Text style={styles.rowSubtitle}>
                    ANDRINASOLONIRINA Hoby Senny
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.separator} />

            <ScalePressable
              scaleTo={0.985}
              style={styles.row}
              onPress={openSerasera}>
              <View style={styles.rowLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="globe-outline" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Loharano</Text>
                  <Text style={styles.rowSubtitle}>tononkira.serasera.org</Text>
                </View>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
            </ScalePressable>

            <View style={styles.separator} />

            <ScalePressable
              scaleTo={0.985}
              style={styles.row}
              onPress={handleShareApp}>
              <View style={styles.rowLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="share-social-outline" size={19} color={colors.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Hizara ny Lyriksa</Text>
                  <Text style={styles.rowSubtitle}>
                    Ampahafantaro ny namanao ny fampiharana
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.outline} />
            </ScalePressable>
          </View>
        </Animated.View>

        <Text style={styles.footerNote}>
          Lyriksa dia fitaovana natokana ho an’ny mpankafy mozika sy hira malagasy.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    logoOuterBezel: {
      padding: 3,
      borderRadius: 15,
      backgroundColor: colors.bezelOuter,
      borderWidth: 1,
      borderColor: colors.bezelOuterBorder,
    },
    logo: {
      width: 34,
      height: 34,
      borderRadius: 11,
      resizeMode: 'contain',
    },
    brandSubtitle: {
      fontSize: 10,
      color: colors.primary,
      letterSpacing: 1.8,
      ...fontStyle('bold'),
    },
    headerTitle: {
      fontSize: 23,
      color: colors.text,
      letterSpacing: -0.5,
      ...fontStyle('extraBold'),
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
      paddingBottom: 112,
      gap: Spacing.lg,
    },
    section: {
      gap: 8,
    },
    sectionHeaderTitle: {
      fontSize: 11,
      color: colors.textSecondary,
      letterSpacing: 1.2,
      marginLeft: Spacing.xs,
      ...fontStyle('bold'),
    },
    cardGroup: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: Radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    themeBlock: {
      padding: Spacing.md,
      gap: 14,
    },
    themeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    segmentedTrack: {
      position: 'relative',
      flexDirection: 'row',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: Radius.full,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segmentedThumb: {
      position: 'absolute',
      top: 4,
      left: 4,
      bottom: 4,
      borderRadius: Radius.full,
      backgroundColor: colors.primary,
    },
    segmentBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 9,
      borderRadius: Radius.full,
      zIndex: 1,
    },
    segmentBtnFallbackActive: {
      backgroundColor: colors.primary,
    },
    segmentText: {
      fontSize: 12.5,
      color: colors.textSecondary,
      ...fontStyle('bold'),
    },
    segmentTextActive: {
      color: colors.onPrimary,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: Spacing.md,
      minHeight: 60,
      gap: Spacing.sm,
    },
    rowLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    rowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    iconCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTitle: {
      fontSize: 14.5,
      color: colors.text,
      ...fontStyle('semiBold'),
    },
    rowSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
      lineHeight: 16,
      ...fontStyle('regular'),
    },
    valueText: {
      fontSize: 14,
      color: colors.textSecondary,
      ...fontStyle('bold'),
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: 66,
      marginRight: Spacing.md,
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
      gap: 4,
    },
    stepperBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperBtnDisabled: {
      opacity: 0.35,
    },
    stepperValue: {
      fontSize: 13,
      color: colors.text,
      minWidth: 42,
      textAlign: 'center',
      ...fontStyle('bold'),
    },
    compactPills: {
      flexDirection: 'row',
      gap: 6,
    },
    compactPill: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.border,
    },
    compactPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    compactPillText: {
      fontSize: 12,
      color: colors.textSecondary,
      ...fontStyle('bold'),
    },
    compactPillTextActive: {
      color: colors.onPrimary,
    },
    speedBlock: {
      paddingVertical: 14,
      paddingHorizontal: Spacing.md,
      gap: 12,
    },
    speedPillsRow: {
      flexDirection: 'row',
      gap: 8,
      paddingLeft: 50,
    },
    speedPill: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewOuterBezel: {
      marginHorizontal: Spacing.md,
      marginBottom: Spacing.md,
      marginTop: 2,
      padding: 5,
      borderRadius: Radius.lg,
      backgroundColor: colors.bezelOuter,
      borderWidth: 1,
      borderColor: colors.bezelOuterBorder,
    },
    previewCard: {
      padding: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    previewLabel: {
      fontSize: 10,
      letterSpacing: 1.4,
      color: colors.primary,
      ...fontStyle('bold'),
    },
    previewLyrics: {},
    actionChipBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: Radius.full,
      backgroundColor: colors.primaryWash,
      borderWidth: 1,
      borderColor: colors.primaryBorderWash,
    },
    actionChipBtnDisabled: {
      backgroundColor: colors.surfaceContainerLow,
      borderColor: colors.border,
      opacity: 0.5,
    },
    actionChipText: {
      fontSize: 12,
      color: colors.primary,
      ...fontStyle('bold'),
    },
    actionChipTextDisabled: {
      color: colors.textMuted,
    },
    offlineBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.tertiaryWash,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: colors.border,
    },
    badgeText: {
      fontSize: 11,
      color: colors.tertiary,
      ...fontStyle('bold'),
    },
    footerNote: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 18,
      marginTop: Spacing.xs,
      ...fontStyle('regular'),
    },
  });
