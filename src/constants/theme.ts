export const colors = {
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

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const typography = {
  heading: {
    fontSize: 28,
    fontWeight: '600' as const,
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: 18,
    fontWeight: '500' as const,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 18,
  },
  script: {
    fontSize: 15,
    fontStyle: 'italic' as const,
    lineHeight: 22,
  },
};
