// Lightweight haptic feedback wrapper.
// Falls back silently on web where expo-haptics is not available.
import * as Haptics from 'expo-haptics';

export function lightImpact() {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // web: no haptics available
  }
}

export function mediumImpact() {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // web: no haptics available
  }
}

export function notification(type: 'success' | 'warning' | 'error' = 'success') {
  try {
    switch (type) {
      case 'success':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'warning':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'error':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
    }
  } catch {
    // web: no haptics available
  }
}

export function selection() {
  try {
    Haptics.selectionAsync();
  } catch {
    // web: no haptics available
  }
}
