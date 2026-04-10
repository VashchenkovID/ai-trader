/** Визуальные токены (dark + neon). Дублируются в MUI theme — единый источник для SCSS при необходимости. */
export const tokens = {
  bg: '#0b0e11',
  surface: '#12161c',
  surfaceElevated: '#1a1f28',
  accentPrimary: '#00e5ff',
  accentSecondary: '#ff007a',
  textMuted: 'rgba(255, 255, 255, 0.65)',
  borderSubtle: 'rgba(255, 255, 255, 0.08)',
  drawerWidth: 260,
  breakpoints: {
    mobileMax: 640,
    tabletMax: 1024,
  },
} as const
