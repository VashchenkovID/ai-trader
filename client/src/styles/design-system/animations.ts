/**
 * Анимации и transitions
 */

export const animations = {
  // Длительности
  duration: {
    instant: '0ms',
    fast: '150ms',
    base: '200ms',
    slow: '300ms',
    slower: '500ms',
    slowest: '700ms',
  },
  
  // Easing функции
  easing: {
    linear: 'linear',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    bounce: 'cubic-bezier(0.68, -0.6, 0.32, 1.6)',
  },
  
  // Стандартные transitions
  transitions: {
    default: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    colors: 'color 200ms ease-in-out, background-color 200ms ease-in-out, border-color 200ms ease-in-out',
    transform: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    opacity: 'opacity 200ms ease-in-out',
    shadow: 'box-shadow 200ms ease-in-out',
    all: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  
  // Keyframes (для использования в CSS)
  keyframes: {
    fadeIn: `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `,
    fadeOut: `
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
    `,
    slideUp: `
      @keyframes slideUp {
        from {
          transform: translateY(10px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
    `,
    slideDown: `
      @keyframes slideDown {
        from {
          transform: translateY(-10px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
    `,
    scaleIn: `
      @keyframes scaleIn {
        from {
          transform: scale(0.95);
          opacity: 0;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }
    `,
    scaleOut: `
      @keyframes scaleOut {
        from {
          transform: scale(1);
          opacity: 1;
        }
        to {
          transform: scale(0.95);
          opacity: 0;
        }
      }
    `,
    pulse: `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `,
    spin: `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `,
    shimmer: `
      @keyframes shimmer {
        0% {
          background-position: -1000px 0;
        }
        100% {
          background-position: 1000px 0;
        }
      }
    `,
    // Для чисел (плавное изменение)
    numberChange: `
      @keyframes numberChange {
        0% {
          transform: scale(1);
          color: inherit;
        }
        50% {
          transform: scale(1.1);
        }
        100% {
          transform: scale(1);
          color: inherit;
        }
      }
    `,
  },
  
  // Готовые анимации для использования
  presets: {
    fadeIn: 'fadeIn 200ms ease-in-out',
    fadeOut: 'fadeOut 200ms ease-in-out',
    slideUp: 'slideUp 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    slideDown: 'slideDown 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    scaleIn: 'scaleIn 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    scaleOut: 'scaleOut 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
    spin: 'spin 1s linear infinite',
    shimmer: 'shimmer 2s infinite linear',
    numberChange: 'numberChange 300ms ease-out',
  },
} as const;

export type Animations = typeof animations;
