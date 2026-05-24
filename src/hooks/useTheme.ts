import { useColorScheme } from 'react-native';

export type ColorScheme = 'light' | 'dark';

const lightColors = {
  background: '#FFFFFF',
  surface: '#F7F7F5',
  text: {
    primary: '#1A1A1A',
    secondary: '#6B6B6B',
    tertiary: '#A0A0A0',
    narrator: '#8C8C8C',
  },
  separator: '#F0F0EE',
  accent: '#E8E4DD',
};

const darkColors = {
  background: '#000000',
  surface: '#0A0A0A',
  text: {
    primary: '#D1D5DB',
    secondary: '#9CA3AF',
    tertiary: '#6B7280',
    narrator: '#6B7280',
  },
  separator: '#1F1F1F',
  accent: '#1A1A1A',
};

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = isDark ? darkColors : lightColors;
  return { colors, isDark, scheme };
}
