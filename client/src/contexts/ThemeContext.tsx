import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getTheme, type ThemeName, type Theme } from '../styles/design-system/themes';

interface ThemeContextType {
  theme: Theme;
  themeName: ThemeName;
  toggleTheme: () => void;
  setTheme: (themeName: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: ThemeName;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ 
  children, 
  defaultTheme = 'dark' 
}) => {
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    // Загружаем сохраненную тему из localStorage
    const savedTheme = localStorage.getItem('theme') as ThemeName;
    return savedTheme || defaultTheme;
  });

  const [theme, setThemeState] = useState<Theme>(getTheme(themeName));

  // Применяем тему к документу
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeName);
    
    // Применяем CSS переменные
    const root = document.documentElement;
    root.style.setProperty('--color-bg-primary', theme.colors.background.primary);
    root.style.setProperty('--color-bg-secondary', theme.colors.background.secondary);
    root.style.setProperty('--color-bg-tertiary', theme.colors.background.tertiary);
    root.style.setProperty('--color-surface-default', theme.colors.surface.default);
    root.style.setProperty('--color-surface-hover', theme.colors.surface.hover);
    root.style.setProperty('--color-text-primary', theme.colors.text.primary);
    root.style.setProperty('--color-text-secondary', theme.colors.text.secondary);
    root.style.setProperty('--color-accent-primary', theme.colors.accent.primary);
    root.style.setProperty('--color-accent-success', theme.colors.accent.success);
    root.style.setProperty('--color-accent-error', theme.colors.accent.error);
    root.style.setProperty('--color-border-default', theme.colors.border.default);
  }, [themeName, theme]);

  const toggleTheme = () => {
    const newTheme: ThemeName = themeName === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  };

  const setTheme = (newTheme: ThemeName) => {
    setThemeName(newTheme);
    setThemeState(getTheme(newTheme));
    localStorage.setItem('theme', newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, themeName, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
