import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Cross-platform safe haptic triggers (no-op on Web or unsupported hardware).
 */
export function triggerLightHaptic() {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function triggerMediumHaptic() {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function triggerSelectionHaptic() {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => {});
}
