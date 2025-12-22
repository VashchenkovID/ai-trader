/**
 * Цветовая палитра дизайн-системы
 * Modern Minimal Trading - Темная тема
 */

// Базовые цвета (темная тема)
export const darkColors = {
  // Фоны
  background: {
    primary: '#0A0A0F',      // Основной фон
    secondary: '#0F0F1A',     // Вторичный фон
    tertiary: '#1A1A24',      // Третичный фон (карточки)
    elevated: '#242430',      // Поднятые элементы
  },
  
  // Поверхности
  surface: {
    default: '#1A1A24',
    hover: '#242430',
    active: '#2A2A38',
    glass: 'rgba(26, 26, 36, 0.8)', // Для glassmorphism
    glassStrong: 'rgba(26, 26, 36, 0.95)',
  },
  
  // Текст
  text: {
    primary: '#F9FAFB',       // Основной текст
    secondary: '#9CA3AF',     // Вторичный текст
    tertiary: '#6B7280',      // Третичный текст
    disabled: '#4B5563',      // Отключенный текст
    inverse: '#0A0A0F',       // Текст на светлом фоне
  },
  
  // Акценты
  accent: {
    primary: '#3B82F6',       // Синий (основной)
    primaryHover: '#2563EB',
    primaryActive: '#1D4ED8',
    success: '#10B981',      // Зеленый (прибыль)
    successHover: '#059669',
    error: '#EF4444',         // Красный (убыток)
    errorHover: '#DC2626',
    warning: '#F59E0B',       // Желтый (предупреждение)
    warningHover: '#D97706',
    info: '#06B6D4',          // Голубой (информация)
    infoHover: '#0891B2',
  },
  
  // Границы
  border: {
    default: 'rgba(255, 255, 255, 0.1)',
    hover: 'rgba(255, 255, 255, 0.2)',
    focus: 'rgba(59, 130, 246, 0.5)',
    error: 'rgba(239, 68, 68, 0.5)',
    success: 'rgba(16, 185, 129, 0.5)',
  },
  
  // Градиенты
  gradients: {
    primary: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)',
    primaryHover: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 50%, #1E40AF 100%)',
    primaryAnimated: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 25%, #8B5CF6 50%, #2563EB 75%, #3B82F6 100%)',
    success: 'linear-gradient(135deg, #10B981 0%, #059669 50%, #047857 100%)',
    successAnimated: 'linear-gradient(135deg, #10B981 0%, #059669 25%, #34D399 50%, #059669 75%, #10B981 100%)',
    error: 'linear-gradient(135deg, #EF4444 0%, #DC2626 50%, #B91C1C 100%)',
    errorAnimated: 'linear-gradient(135deg, #EF4444 0%, #DC2626 25%, #F87171 50%, #DC2626 75%, #EF4444 100%)',
    warning: 'linear-gradient(135deg, #F59E0B 0%, #D97706 50%, #B45309 100%)',
    warningAnimated: 'linear-gradient(135deg, #F59E0B 0%, #D97706 25%, #FBBF24 50%, #D97706 75%, #F59E0B 100%)',
    info: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 50%, #0E7490 100%)',
    glass: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(139, 92, 246, 0.1) 50%, rgba(16, 185, 129, 0.15) 100%)',
    glassAnimated: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(139, 92, 246, 0.15) 25%, rgba(16, 185, 129, 0.2) 50%, rgba(139, 92, 246, 0.15) 75%, rgba(59, 130, 246, 0.2) 100%)',
    overlay: 'linear-gradient(180deg, rgba(10, 10, 15, 0) 0%, rgba(10, 10, 15, 0.8) 100%)',
    // Дополнительные интересные градиенты
    sunset: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 50%, #EC4899 100%)',
    ocean: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 50%, #8B5CF6 100%)',
    forest: 'linear-gradient(135deg, #10B981 0%, #059669 50%, #047857 100%)',
    neon: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 50%, #EC4899 100%)',
  },
  
  // Overlay для модальных окон
  overlay: {
    backdrop: 'rgba(0, 0, 0, 0.6)',
    backdropLight: 'rgba(0, 0, 0, 0.4)',
  },
} as const;

// Светлая тема (базовая реализация)
export const lightColors = {
  background: {
    primary: '#FFFFFF',
    secondary: '#F9FAFB',
    tertiary: '#F3F4F6',
    elevated: '#E5E7EB',
  },
  
  surface: {
    default: '#FFFFFF',
    hover: '#F9FAFB',
    active: '#F3F4F6',
    glass: 'rgba(255, 255, 255, 0.9)',
    glassStrong: 'rgba(255, 255, 255, 0.95)',
  },
  
  text: {
    primary: '#111827',
    secondary: '#6B7280',
    tertiary: '#9CA3AF',
    disabled: '#D1D5DB',
    inverse: '#FFFFFF',
  },
  
  accent: {
    primary: '#3B82F6',
    primaryHover: '#2563EB',
    primaryActive: '#1D4ED8',
    success: '#10B981',
    successHover: '#059669',
    error: '#EF4444',
    errorHover: '#DC2626',
    warning: '#F59E0B',
    warningHover: '#D97706',
    info: '#06B6D4',
    infoHover: '#0891B2',
  },
  
  border: {
    default: 'rgba(0, 0, 0, 0.1)',
    hover: 'rgba(0, 0, 0, 0.2)',
    focus: 'rgba(59, 130, 246, 0.5)',
    error: 'rgba(239, 68, 68, 0.5)',
    success: 'rgba(16, 185, 129, 0.5)',
  },
  
  gradients: {
    primary: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)',
    primaryHover: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 50%, #1E40AF 100%)',
    primaryAnimated: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 25%, #8B5CF6 50%, #2563EB 75%, #3B82F6 100%)',
    success: 'linear-gradient(135deg, #10B981 0%, #059669 50%, #047857 100%)',
    successAnimated: 'linear-gradient(135deg, #10B981 0%, #059669 25%, #34D399 50%, #059669 75%, #10B981 100%)',
    error: 'linear-gradient(135deg, #EF4444 0%, #DC2626 50%, #B91C1C 100%)',
    errorAnimated: 'linear-gradient(135deg, #EF4444 0%, #DC2626 25%, #F87171 50%, #DC2626 75%, #EF4444 100%)',
    warning: 'linear-gradient(135deg, #F59E0B 0%, #D97706 50%, #B45309 100%)',
    warningAnimated: 'linear-gradient(135deg, #F59E0B 0%, #D97706 25%, #FBBF24 50%, #D97706 75%, #F59E0B 100%)',
    info: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 50%, #0E7490 100%)',
    glass: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.08) 50%, rgba(16, 185, 129, 0.1) 100%)',
    glassAnimated: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(139, 92, 246, 0.12) 25%, rgba(16, 185, 129, 0.15) 50%, rgba(139, 92, 246, 0.12) 75%, rgba(59, 130, 246, 0.15) 100%)',
    overlay: 'linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.8) 100%)',
    sunset: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 50%, #EC4899 100%)',
    ocean: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 50%, #8B5CF6 100%)',
    forest: 'linear-gradient(135deg, #10B981 0%, #059669 50%, #047857 100%)',
    neon: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 50%, #EC4899 100%)',
  },
  
  overlay: {
    backdrop: 'rgba(0, 0, 0, 0.4)',
    backdropLight: 'rgba(0, 0, 0, 0.2)',
  },
} as const;

// Экспорт текущей темы (по умолчанию темная)
export const colors = darkColors;

// Типы для TypeScript
export type ColorScheme = typeof darkColors;
export type ThemeColors = 'dark' | 'light';
