/**
 * Spacing и Layout система
 * Основана на 4px grid системе
 */

export const spacing = {
  // Отступы (4px grid)
  0: '0',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  9: '36px',
  10: '40px',
  11: '44px',
  12: '48px',
  14: '56px',
  16: '64px',
  20: '80px',
  24: '96px',
  28: '112px',
  32: '128px',
  36: '144px',
  40: '160px',
  44: '176px',
  48: '192px',
  52: '208px',
  56: '224px',
  60: '240px',
  64: '256px',
} as const;

export const borderRadius = {
  none: '0',
  sm: '4px',
  base: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
  full: '9999px',
} as const;

export const layout = {
  // Grid система
  grid: {
    columns: 12,
    gap: spacing[4], // 16px
    gapSmall: spacing[2], // 8px
    gapLarge: spacing[6], // 24px
  },
  
  // Контейнеры
  container: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
    full: '100%',
  },
  
  // Breakpoints
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
  
  // Z-index слои
  zIndex: {
    base: 0,
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
    notification: 1080,
  },
  
  // Высоты элементов
  heights: {
    input: {
      sm: '32px',
      md: '40px',
      lg: '48px',
    },
    button: {
      sm: '32px',
      md: '40px',
      lg: '48px',
    },
  },
} as const;

export type Spacing = typeof spacing;
export type BorderRadius = typeof borderRadius;
