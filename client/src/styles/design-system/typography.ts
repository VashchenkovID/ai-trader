/**
 * Типографика дизайн-системы
 */

export const typography = {
  // Шрифты
  fontFamily: {
    primary: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
    mono: "'JetBrains Mono', 'Courier New', 'Courier', monospace", // Для чисел
  },
  
  // Размеры
  fontSize: {
    xs: '12px',
    sm: '14px',
    base: '16px',
    lg: '18px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '30px',
    '4xl': '36px',
    '5xl': '48px',
    '6xl': '64px',
    '7xl': '72px',
  },
  
  // Веса
  fontWeight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
  
  // Высота строк
  lineHeight: {
    none: 1,
    tight: 1.2,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.75,
    loose: 2,
  },
  
  // Letter spacing
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
  
  // Стили для чисел (моноширинный)
  number: {
    fontFamily: "'JetBrains Mono', 'Courier New', 'Courier', monospace",
    fontWeight: 500,
    letterSpacing: '0.02em',
  },
  
  // Предопределенные стили
  styles: {
    h1: {
      fontSize: '48px',
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontSize: '36px',
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontSize: '30px',
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h4: {
      fontSize: '24px',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '20px',
      fontWeight: 600,
      lineHeight: 1.5,
    },
    h6: {
      fontSize: '18px',
      fontWeight: 600,
      lineHeight: 1.5,
    },
    body: {
      fontSize: '16px',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    bodyLarge: {
      fontSize: '18px',
      fontWeight: 400,
      lineHeight: 1.6,
    },
    bodySmall: {
      fontSize: '14px',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    caption: {
      fontSize: '12px',
      fontWeight: 400,
      lineHeight: 1.4,
    },
    // Для финансовых чисел
    number: {
      fontSize: '16px',
      fontFamily: "'JetBrains Mono', monospace",
      fontWeight: 500,
      letterSpacing: '0.02em',
      lineHeight: 1.5,
    },
    numberLarge: {
      fontSize: '24px',
      fontFamily: "'JetBrains Mono', monospace",
      fontWeight: 600,
      letterSpacing: '0.02em',
      lineHeight: 1.2,
    },
    numberXLarge: {
      fontSize: '36px',
      fontFamily: "'JetBrains Mono', monospace",
      fontWeight: 700,
      letterSpacing: '0.02em',
      lineHeight: 1.2,
    },
  },
} as const;

export type Typography = typeof typography;
