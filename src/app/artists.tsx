import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fontStyle, Radius, Spacing, ThemePalette } from '@/constants/theme';
import { useThemePalette } from '@/context/AppSettingsContext';
import { ArtistListCardSkeletonList } from '@/components/Skeleton';
import { ArtistListCard } from '@/components/ArtistListCard';
import { ScalePressable } from '@/components/ScalePressable';
import { triggerLightHaptic, triggerSelectionHaptic } from '@/utils/haptics';
import { getTopArtists, toggleFavoriteArtist, Artist } from '@/services/database';

interface CategoryItem {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  colorKey: 'primary' | 'secondary';
}

const CATEGORIES: CategoryItem[] = [
  { id: 'rehetra', name: 'Rehetra', icon: 'people', colorKey: 'primary' },
  { id: 'ankafiziko', name: 'Ankafiziko', icon: 'heart', colorKey: 'primary' },
  { id: 'folk', name: 'Folk & Acoustic', icon: 'musical-notes', colorKey: 'primary' },
  { id: 'rock', name: 'Pop & Rock', icon: 'flash', colorKey: 'secondary' },
  { id: 'fiderana', name: 'Hira Fiderana', icon: 'sparkles', colorKey: 'secondary' },
  { id: 'kalos', name: "Kalon'ny Fahiny", icon: 'disc', colorKey: 'primary' },
  { id: 'vakodrazana', name: 'Vakodrazana', icon: 'flame', colorKey: 'secondary' },
];

export default function AllArtistsScreen() {
  const router = useRouter();
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const params = useLocalSearchParams<{ category?: string; t?: string }>();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    params.category && CATEGORIES.some(c => c.id === params.category)
      ? params.category
      : 'rehetra'
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.category && CATEGORIES.some(c => c.id === params.category)) {
      setSelectedCategory(params.category);
    }
  }, [params.category, params.t]);

  useFocusEffect(
    useCallback(() => {
      getTopArtists()
        .then(setArtists)
        .finally(() => setLoading(false));
    }, [])
  );

  const matchesCategory = (artist: Artist, catId: string): boolean => {
    if (catId === 'rehetra') return true;
    if (catId === 'ankafiziko') return Boolean(artist.is_favorite);
    const c = (artist.category || '').toLowerCase();
    if (catId === 'folk') return c.includes('folk') || c.includes('acoustic');
    if (catId === 'rock') return c.includes('rock') || c.includes('pop');
    if (catId === 'fiderana') return c.includes('fiderana') || c.includes('gospel');
    if (catId === 'kalos') return c.includes('kalo') || c.includes('classique') || c.includes('romantique');
    if (catId === 'vakodrazana') return c.includes('vako');
    return false;
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { rehetra: artists.length };
    CATEGORIES.forEach(cat => {
      if (cat.id !== 'rehetra') {
        counts[cat.id] = artists.filter(a => matchesCategory(a, cat.id)).length;
      }
    });
    return counts;
  }, [artists]);

  const filteredArtists = useMemo(() => {
    return artists.filter(a => {
      const matchesSearch =
        !search.trim() ||
        a.name.toLowerCase().includes(search.toLowerCase().trim()) ||
        (a.category && a.category.toLowerCase().includes(search.toLowerCase().trim()));
      const matchesCat = matchesCategory(a, selectedCategory);
      return matchesSearch && matchesCat;
    });
  }, [artists, search, selectedCategory]);

  const currentCategoryInfo = CATEGORIES.find(c => c.id === selectedCategory) || CATEGORIES[0];

  const handleToggleFavorite = useCallback(async (artistId: string) => {
    const isNowFav = await toggleFavoriteArtist(artistId);
    setArtists(prev =>
      prev.map(a =>
        a.id === artistId || a.slug === artistId ? { ...a, is_favorite: isNowFav } : a
      )
    );
  }, []);

  const renderArtistCard = useCallback(
    ({ item: artist }: { item: Artist }) => (
      <ArtistListCard
        artist={artist}
        onToggleFavorite={handleToggleFavorite}
        highlightText={search}
      />
    ),
    [handleToggleFavorite, search]
  );

  const renderSeparator = useCallback(() => <View style={styles.cardSeparator} />, [styles.cardSeparator]);

  const renderEmpty = () => {
    if (loading && artists.length === 0) {
      return <ArtistListCardSkeletonList count={7} />;
    }
    const isFavEmpty = selectedCategory === 'ankafiziko' && !search.trim();
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconOuter}>
          <View style={styles.emptyIconBg}>
            <Ionicons
              name={isFavEmpty ? 'heart-outline' : 'search-outline'}
              size={34}
              color={isFavEmpty ? colors.primary : colors.outline}
            />
          </View>
        </View>
        <Text style={styles.emptyTitle}>
          {isFavEmpty
            ? 'Mbola tsy misy mpihira ankafizina'
            : "Tsy nisy mpihira mifanaraka amin'ny sivana"}
        </Text>
        <Text style={styles.emptySubtitle}>
          {isFavEmpty
            ? "Tsindrio ny fo kely eo amin'ny mpihira tianao ao amin'ny sokajy « Rehetra »."
            : 'Andramo ovaina ny teny tadiavina na tsindrio ny sokajy « Rehetra ».'}
        </Text>
        <ScalePressable
          style={styles.resetBtn}
          scaleTo={0.96}
          onPress={() => {
            triggerSelectionHaptic();
            setSearch('');
            setSelectedCategory('rehetra');
          }}>
          <Text style={styles.resetBtnText}>Asehoy ny mpihira rehetra</Text>
        </ScalePressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Navigation Header */}
      <View style={styles.header}>
        <ScalePressable
          style={styles.backButton}
          scaleTo={0.95}
          onPress={() => {
            triggerLightHaptic();
            router.back();
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={styles.backLabel}>Hiverina</Text>
        </ScalePressable>
      </View>

      {/* Screen Title */}
      <View style={styles.titleContainer}>
        <Text style={styles.eyebrow}>KATALOGY</Text>
        <Text style={styles.title}>Mpihira Rehetra</Text>
        <Text style={styles.subtitle}>
          {artists.length} mpihira sy tarika malagasy voatahiry
        </Text>
      </View>

      {/* Search Input */}
      <View style={[styles.searchBar, searchFocused && styles.searchBarFocused]}>
        <Ionicons
          name="search"
          size={18}
          color={searchFocused ? colors.primary : colors.textSecondary}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Hitady mpihira na tarika..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          returnKeyType="search"
        />
        {search ? (
          <ScalePressable
            scaleTo={0.88}
            onPress={() => {
              triggerLightHaptic();
              setSearch('');
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </ScalePressable>
        ) : null}
      </View>

      {/* Categories Banners Section */}
      <View style={styles.bannersSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}>
          {CATEGORIES.map(cat => {
            const isActive = selectedCategory === cat.id;
            const count = categoryCounts[cat.id] || 0;

            return (
              <ScalePressable
                key={cat.id}
                scaleTo={0.95}
                style={[
                  styles.categoryBanner,
                  isActive && styles.categoryBannerActive,
                ]}
                onPress={() => {
                  if (selectedCategory !== cat.id) {
                    triggerSelectionHaptic();
                    setSelectedCategory(cat.id);
                  }
                }}>
                <Ionicons
                  name={cat.icon}
                  size={15}
                  color={isActive ? colors.onPrimary : colors[cat.colorKey]}
                />

                <Text
                  style={[
                    styles.categoryText,
                    isActive && styles.categoryTextActive,
                  ]}>
                  {cat.name}
                </Text>

                <View
                  style={[
                    styles.countPill,
                    isActive && styles.countPillActive,
                  ]}>
                  <Text
                    style={[
                      styles.countPillText,
                      isActive && styles.countPillTextActive,
                    ]}>
                    {count}
                  </Text>
                </View>
              </ScalePressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Artists Count & Status Line */}
      <View style={styles.statusRow}>
        <Text style={styles.statusText}>
          {selectedCategory === 'rehetra'
            ? 'Mpihira rehetra'
            : currentCategoryInfo.name}
        </Text>
        <Text style={styles.statusCount}>
          {filteredArtists.length} mpihira
        </Text>
      </View>

      {/* Virtualized Artists List */}
      <FlatList
        data={loading && artists.length === 0 ? [] : filteredArtists}
        keyExtractor={item => item.id}
        renderItem={renderArtistCard}
        ItemSeparatorComponent={renderSeparator}
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
      />
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
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.xs,
      paddingBottom: 6,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 38,
    },
    backLabel: {
      color: colors.primary,
      fontSize: 14,
      ...fontStyle('semiBold'),
    },
    titleContainer: {
      paddingHorizontal: Spacing.lg,
      paddingTop: 6,
      paddingBottom: Spacing.sm,
    },
    eyebrow: {
      color: colors.primary,
      fontSize: 10,
      letterSpacing: 1.8,
      marginBottom: 4,
      ...fontStyle('bold'),
    },
    title: {
      color: colors.text,
      fontSize: 30,
      letterSpacing: -0.6,
      ...fontStyle('extraBold'),
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 13,
      marginTop: 4,
      ...fontStyle('regular'),
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
      marginHorizontal: Spacing.lg,
      marginTop: 6,
      marginBottom: Spacing.md,
      paddingHorizontal: Spacing.md,
      height: 46,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
    },
    searchBarFocused: {
      borderColor: colors.primary,
      backgroundColor: colors.surfaceContainerHigh,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontSize: 14,
      height: '100%',
      ...fontStyle('regular'),
    },
    bannersSection: {
      marginBottom: Spacing.sm,
    },
    categoryScroll: {
      paddingHorizontal: Spacing.lg,
      gap: 8,
      paddingVertical: 4,
    },
    categoryBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radius.full,
      gap: 7,
      minHeight: 38,
    },
    categoryBannerActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    categoryText: {
      color: colors.text,
      fontSize: 13,
      ...fontStyle('semiBold'),
    },
    categoryTextActive: {
      color: colors.onPrimary,
    },
    countPill: {
      backgroundColor: colors.surfaceContainerHigh,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: Radius.full,
    },
    countPillActive: {
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
    },
    countPillText: {
      color: colors.textSecondary,
      fontSize: 11,
      ...fontStyle('bold'),
    },
    countPillTextActive: {
      color: colors.onPrimary,
    },
    statusRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingVertical: 8,
    },
    statusText: {
      color: colors.text,
      fontSize: 15,
      letterSpacing: -0.2,
      ...fontStyle('bold'),
    },
    statusCount: {
      color: colors.textSecondary,
      fontSize: 12,
      ...fontStyle('semiBold'),
    },
    scrollContent: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.xs,
      paddingBottom: 60,
    },
    cardSeparator: {
      height: 10,
    },
    emptyContainer: {
      alignItems: 'center',
      paddingVertical: Spacing.xxl,
      paddingHorizontal: Spacing.lg,
    },
    emptyIconOuter: {
      padding: 6,
      borderRadius: Radius.full,
      backgroundColor: colors.bezelOuter,
      borderWidth: 1,
      borderColor: colors.bezelOuterBorder,
      marginBottom: Spacing.md,
    },
    emptyIconBg: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      color: colors.text,
      fontSize: 17,
      textAlign: 'center',
      ...fontStyle('bold'),
    },
    emptySubtitle: {
      color: colors.textSecondary,
      fontSize: 13,
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 20,
      maxWidth: 290,
      ...fontStyle('regular'),
    },
    resetBtn: {
      marginTop: Spacing.lg,
      backgroundColor: colors.primary,
      paddingHorizontal: Spacing.lg,
      paddingVertical: 11,
      borderRadius: Radius.full,
    },
    resetBtnText: {
      color: colors.onPrimary,
      fontSize: 13,
      ...fontStyle('bold'),
    },
  });
