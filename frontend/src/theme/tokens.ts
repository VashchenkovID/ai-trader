/** Визуальные токены (dark + neon). Дублируются в MUI theme — единый источник для SCSS при необходимости. */
export const tokens = {
  bg: '#080d17',
  surface: '#0f141f',
  surfaceElevated: '#151c2e',
  accentPrimary: '#00f2ff',
  accentSecondary: '#ff007f',
  textMuted: '#94a3b8',
  borderSubtle: 'rgba(148, 163, 184, 0.12)',
  /** Текст на сплошной primary-кнопке (циан по референсу). */
  buttonOnPrimaryText: '#050a14',
  drawerWidth: 260,
  breakpoints: {
    mobileMax: 640,
    tabletMax: 1024,
  },
} as const
