/**
 * Темы дизайн-системы
 */

import { darkColors, lightColors } from './colors';
import { typography } from './typography';
import { spacing, borderRadius, layout } from './spacing';
import { shadows } from './shadows';
import { animations } from './animations';

export const themes = {
  dark: {
    colors: darkColors,
    typography,
    spacing,
    borderRadius,
    layout,
    shadows,
    animations,
    name: 'dark' as const,
  },
  light: {
    colors: lightColors,
    typography,
    spacing,
    borderRadius,
    layout,
    shadows,
    animations,
    name: 'light' as const,
  },
} as const;

// Текущая тема (по умолчанию темная)
export const currentTheme = themes.dark;

export type Theme = typeof themes.dark;
export type ThemeName = 'dark' | 'light';

// Хелперы для получения значений темы
export const getTheme = (themeName: ThemeName = 'dark'): Theme => {
  return <Theme>themes[themeName];
};

// CSS переменные для темы (для использования в CSS)
export const getThemeCSSVariables = (theme: Theme) => {
  return {
    '--color-bg-primary': theme.colors.background.primary,
    '--color-bg-secondary': theme.colors.background.secondary,
    '--color-bg-tertiary': theme.colors.background.tertiary,
    '--color-surface-default': theme.colors.surface.default,
    '--color-surface-hover': theme.colors.surface.hover,
    '--color-text-primary': theme.colors.text.primary,
    '--color-text-secondary': theme.colors.text.secondary,
    '--color-accent-primary': theme.colors.accent.primary,
    '--color-accent-success': theme.colors.accent.success,
    '--color-accent-error': theme.colors.accent.error,
    '--color-border-default': theme.colors.border.default,
    '--font-family-primary': theme.typography.fontFamily.primary,
    '--font-family-mono': theme.typography.fontFamily.mono,
  };
};
