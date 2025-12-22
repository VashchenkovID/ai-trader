/**
 * Тени и эффекты
 */

export const shadows = {
  // Тени для depth
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
  base: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)',
  md: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
  lg: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
  xl: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
  '2xl': '0 30px 60px -12px rgba(0, 0, 0, 0.5)',
  
  // Glow эффекты для акцентов
  glow: {
    primary: '0 0 20px rgba(59, 130, 246, 0.3), 0 0 40px rgba(59, 130, 246, 0.1)',
    primaryStrong: '0 0 30px rgba(59, 130, 246, 0.5), 0 0 60px rgba(59, 130, 246, 0.2)',
    success: '0 0 20px rgba(16, 185, 129, 0.3), 0 0 40px rgba(16, 185, 129, 0.1)',
    successStrong: '0 0 30px rgba(16, 185, 129, 0.5), 0 0 60px rgba(16, 185, 129, 0.2)',
    error: '0 0 20px rgba(239, 68, 68, 0.3), 0 0 40px rgba(239, 68, 68, 0.1)',
    errorStrong: '0 0 30px rgba(239, 68, 68, 0.5), 0 0 60px rgba(239, 68, 68, 0.2)',
    warning: '0 0 20px rgba(245, 158, 11, 0.3), 0 0 40px rgba(245, 158, 11, 0.1)',
    warningStrong: '0 0 30px rgba(245, 158, 11, 0.5), 0 0 60px rgba(245, 158, 11, 0.2)',
    info: '0 0 20px rgba(6, 182, 212, 0.3), 0 0 40px rgba(6, 182, 212, 0.1)',
    infoStrong: '0 0 30px rgba(6, 182, 212, 0.5), 0 0 60px rgba(6, 182, 212, 0.2)',
  },
  
  // Внутренние тени
  inner: {
    sm: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.2)',
    md: 'inset 0 4px 6px -1px rgba(0, 0, 0, 0.3)',
  },
  
  // Тени для поднятых элементов (lift effect)
  lift: {
    sm: '0 2px 4px rgba(0, 0, 0, 0.2), 0 0 8px rgba(59, 130, 246, 0.1)',
    md: '0 4px 8px rgba(0, 0, 0, 0.2), 0 0 16px rgba(59, 130, 246, 0.15)',
    lg: '0 8px 16px rgba(0, 0, 0, 0.3), 0 0 24px rgba(59, 130, 246, 0.2)',
  },
  
  // Glassmorphism blur
  glass: {
    backdrop: 'blur(12px)',
    backdropStrong: 'blur(20px)',
    backdropLight: 'blur(8px)',
  },
} as const;

export type Shadows = typeof shadows;
