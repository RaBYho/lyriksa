import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Share,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { fontStyle, Radius, Spacing, ThemePalette } from '@/constants/theme';
import { useThemePalette } from '@/context/AppSettingsContext';
import { ScalePressable } from '@/components/ScalePressable';
import { triggerLightHaptic, triggerMediumHaptic, triggerSelectionHaptic } from '@/utils/haptics';

interface QuoteShareModalProps {
  visible: boolean;
  stanza: string | null;
  songTitle: string;
  artistName: string;
  category?: string;
  onClose: () => void;
}

type CardVariant = 'dark' | 'light';

export function QuoteShareModal({
  visible,
  stanza,
  songTitle,
  artistName,
  category,
  onClose,
}: QuoteShareModalProps) {
  const colors = useThemePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [cardVariant, setCardVariant] = useState<CardVariant>(
    colors.isDark ? 'dark' : 'light'
  );

  if (!stanza) return null;

  const trimmedStanza = stanza.trim();
  const isLongStanza = trimmedStanza.length > 180;
  const stanzaFontSize = isLongStanza ? 15.5 : 18;
  const stanzaLineHeight = Math.round(stanzaFontSize * 1.58);

  const isDarkCard = cardVariant === 'dark';
  const cardGradient: [string, string] = isDarkCard
    ? ['#26211D', '#12100E']
    : ['#FFFDF8', '#EDE4D5'];
  const cardTextColor = isDarkCard ? '#F5F0E8' : '#1E1A16';
  const cardSubTextColor = isDarkCard ? '#A69E92' : '#6B6359';
  const cardAccent = isDarkCard ? '#E06C44' : '#C85028';
  const cardDivider = isDarkCard
    ? 'rgba(245, 240, 232, 0.12)'
    : 'rgba(30, 26, 22, 0.10)';
  const cardBorder = isDarkCard
    ? 'rgba(224, 108, 68, 0.28)'
    : 'rgba(200, 80, 40, 0.22)';

  const handleShareStanza = async () => {
    triggerMediumHaptic();
    try {
      await Share.share({
        title: `${songTitle} — ${artistName}`,
        message: `« ${trimmedStanza} »\n\n— ${songTitle} (${artistName})\nLyriksa — Tononkira Malagasy`,
      });
    } catch (err) {
      console.warn('Quote share error:', err);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View
          entering={FadeInDown.springify().damping(20).stiffness(240).reduceMotion(ReduceMotion.Never)}
          style={styles.sheet}>
          {/* Modal Top Header */}
          <View style={styles.topRow}>
            <View>
              <Text style={styles.eyebrow}>HIZARA ANDININY</Text>
              <Text style={styles.title}>Karatra Tononkira</Text>
            </View>
            <ScalePressable
              style={styles.closeIconBtn}
              scaleTo={0.9}
              onPress={() => {
                triggerLightHaptic();
                onClose();
              }}
              accessibilityLabel="Hidio"
              hitSlop={8}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </ScalePressable>
          </View>

          {/* Card Theme Switcher */}
          <View style={styles.variantRow}>
            <ScalePressable
              scaleTo={0.95}
              style={[
                styles.variantChip,
                cardVariant === 'dark' && styles.variantChipActive,
              ]}
              onPress={() => {
                if (cardVariant !== 'dark') {
                  triggerSelectionHaptic();
                  setCardVariant('dark');
                }
              }}>
              <Ionicons
                name="moon"
                size={13}
                color={cardVariant === 'dark' ? colors.onPrimary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.variantChipText,
                  cardVariant === 'dark' && styles.variantChipTextActive,
                ]}>
                Maizina
              </Text>
            </ScalePressable>

            <ScalePressable
              scaleTo={0.95}
              style={[
                styles.variantChip,
                cardVariant === 'light' && styles.variantChipActive,
              ]}
              onPress={() => {
                if (cardVariant !== 'light') {
                  triggerSelectionHaptic();
                  setCardVariant('light');
                }
              }}>
              <Ionicons
                name="sunny"
                size={13}
                color={cardVariant === 'light' ? colors.onPrimary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.variantChipText,
                  cardVariant === 'light' && styles.variantChipTextActive,
                ]}>
                Mazava
              </Text>
            </ScalePressable>
          </View>

          {/* Double-Bezel Editorial Quote Card */}
          <View style={styles.cardOuterBezel}>
            <LinearGradient
              colors={cardGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.quoteCard, { borderColor: cardBorder }]}>
              <View style={styles.cardTopMeta}>
                <Text style={[styles.cardBrand, { color: cardAccent }]}>
                  LYRIKSA
                </Text>
                {category ? (
                  <View
                    style={[
                      styles.cardCatBadge,
                      {
                        borderColor: cardDivider,
                        backgroundColor: isDarkCard
                          ? 'rgba(255,255,255,0.05)'
                          : 'rgba(0,0,0,0.04)',
                      },
                    ]}>
                    <Text style={[styles.cardCatText, { color: cardSubTextColor }]}>
                      {category}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text style={[styles.quoteGlyph, { color: cardAccent }]}>“</Text>

              <ScrollView
                style={styles.quoteBodyScroll}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled>
                <Text
                  style={[
                    styles.quoteText,
                    {
                      color: cardTextColor,
                      fontSize: stanzaFontSize,
                      lineHeight: stanzaLineHeight,
                    },
                  ]}>
                  {trimmedStanza}
                </Text>
              </ScrollView>

              <View style={[styles.cardFooter, { borderTopColor: cardDivider }]}>
                <View style={styles.cardFooterText}>
                  <Text
                    style={[styles.cardSongTitle, { color: cardTextColor }]}
                    numberOfLines={1}>
                    {songTitle}
                  </Text>
                  <Text
                    style={[styles.cardArtistName, { color: cardSubTextColor }]}
                    numberOfLines={1}>
                    {artistName}
                  </Text>
                </View>

                <View style={styles.waveDecor}>
                  <View style={[styles.waveBar, { height: 10, backgroundColor: cardAccent }]} />
                  <View style={[styles.waveBar, { height: 18, backgroundColor: cardAccent }]} />
                  <View style={[styles.waveBar, { height: 12, backgroundColor: cardAccent }]} />
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Bottom Actions */}
          <View style={styles.actionsRow}>
            <ScalePressable
              scaleTo={0.96}
              style={styles.cancelBtn}
              onPress={() => {
                triggerLightHaptic();
                onClose();
              }}>
              <Text style={styles.cancelBtnText}>Hidio</Text>
            </ScalePressable>

            <ScalePressable
              scaleTo={0.96}
              style={styles.shareBtnOuter}
              onPress={handleShareStanza}>
              <LinearGradient
                colors={[colors.primary, colors.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.shareBtn}>
                <Ionicons name="share-outline" size={18} color={colors.onPrimary} />
                <Text style={styles.shareBtnText}>Hizara andininy</Text>
              </LinearGradient>
            </ScalePressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(10, 9, 8, 0.72)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
    },
    sheet: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: colors.surfaceContainer,
      borderRadius: Radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: Spacing.lg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.35,
      shadowRadius: 28,
      elevation: 16,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.md,
    },
    eyebrow: {
      color: colors.primary,
      fontSize: 10,
      letterSpacing: 1.6,
      marginBottom: 2,
      ...fontStyle('bold'),
    },
    title: {
      color: colors.text,
      fontSize: 20,
      letterSpacing: -0.3,
      ...fontStyle('extraBold'),
    },
    closeIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    variantRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: Spacing.md,
    },
    variantChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.border,
    },
    variantChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    variantChipText: {
      color: colors.textSecondary,
      fontSize: 12,
      ...fontStyle('bold'),
    },
    variantChipTextActive: {
      color: colors.onPrimary,
    },
    cardOuterBezel: {
      padding: 6,
      borderRadius: Radius.xl,
      backgroundColor: colors.bezelOuter,
      borderWidth: 1,
      borderColor: colors.bezelOuterBorder,
      marginBottom: Spacing.lg,
    },
    quoteCard: {
      borderRadius: Radius.lg,
      borderWidth: 1,
      padding: Spacing.lg,
    },
    cardTopMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    cardBrand: {
      fontSize: 11,
      letterSpacing: 2,
      ...fontStyle('extraBold'),
    },
    cardCatBadge: {
      borderWidth: 1,
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: Radius.full,
    },
    cardCatText: {
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      ...fontStyle('bold'),
    },
    quoteGlyph: {
      fontSize: 38,
      lineHeight: 36,
      marginBottom: 2,
      ...fontStyle('extraBold'),
    },
    quoteBodyScroll: {
      maxHeight: 220,
      marginBottom: Spacing.md,
    },
    quoteText: {
      ...fontStyle('semiBold'),
    },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: 12,
      gap: 12,
    },
    cardFooterText: {
      flex: 1,
    },
    cardSongTitle: {
      fontSize: 14,
      letterSpacing: -0.2,
      ...fontStyle('bold'),
    },
    cardArtistName: {
      fontSize: 12,
      marginTop: 2,
      ...fontStyle('medium'),
    },
    waveDecor: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    waveBar: {
      width: 3,
      borderRadius: 2,
      opacity: 0.85,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    cancelBtn: {
      paddingHorizontal: 18,
      paddingVertical: 13,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 46,
    },
    cancelBtnText: {
      color: colors.textSecondary,
      fontSize: 13.5,
      ...fontStyle('bold'),
    },
    shareBtnOuter: {
      flex: 1,
      padding: 3,
      borderRadius: Radius.full,
      backgroundColor: colors.bezelOuter,
      borderWidth: 1,
      borderColor: colors.bezelOuterBorder,
    },
    shareBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 11,
      paddingHorizontal: 16,
      borderRadius: Radius.full,
      minHeight: 44,
    },
    shareBtnText: {
      color: colors.onPrimary,
      fontSize: 14,
      ...fontStyle('bold'),
    },
  });
