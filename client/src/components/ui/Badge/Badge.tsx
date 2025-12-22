import React, { HTMLAttributes } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import './Badge.css';

export type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'primary' | 'neutral';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  children,
  icon,
  className = '',
  ...props
}) => {
  const { theme } = useTheme();

  const baseClasses = 'badge';
  const variantClass = `badge-${variant}`;
  const sizeClass = `badge-${size}`;

  const classes = [
    baseClasses,
    variantClass,
    sizeClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={classes}
      {...props}
      style={{
        ...props.style,
        // Применяем цвета из темы
        ...(variant === 'success' && {
          backgroundColor: theme.colors.accent.success + '20',
          color: theme.colors.accent.success,
          borderColor: theme.colors.accent.success + '40',
        }),
        ...(variant === 'error' && {
          backgroundColor: theme.colors.accent.error + '20',
          color: theme.colors.accent.error,
          borderColor: theme.colors.accent.error + '40',
        }),
        ...(variant === 'warning' && {
          backgroundColor: theme.colors.accent.warning + '20',
          color: theme.colors.accent.warning,
          borderColor: theme.colors.accent.warning + '40',
        }),
        ...(variant === 'info' && {
          backgroundColor: theme.colors.accent.info + '20',
          color: theme.colors.accent.info,
          borderColor: theme.colors.accent.info + '40',
        }),
        ...(variant === 'primary' && {
          backgroundColor: theme.colors.accent.primary + '20',
          color: theme.colors.accent.primary,
          borderColor: theme.colors.accent.primary + '40',
        }),
      }}
    >
      {icon && <span className="badge-icon">{icon}</span>}
      {children}
    </span>
  );
};

export default Badge;
