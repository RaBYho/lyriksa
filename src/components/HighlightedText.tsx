import React from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';
import { fontStyle } from '@/constants/theme';
import { useThemePalette } from '@/context/AppSettingsContext';

interface HighlightedTextProps {
  text: string;
  highlight?: string;
  style?: StyleProp<TextStyle>;
  highlightStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

/**
 * Renders text with case-insensitive inline highlighting for matched search terms.
 */
export function HighlightedText({
  text,
  highlight,
  style,
  highlightStyle,
  numberOfLines,
}: HighlightedTextProps) {
  const colors = useThemePalette();
  const query = (highlight || '').trim();
  if (!query) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <Text
            key={index}
            style={[
              { color: colors.primary, ...fontStyle('extraBold') },
              highlightStyle,
            ]}>
            {part}
          </Text>
        ) : (
          part
        )
      )}
    </Text>
  );
}
