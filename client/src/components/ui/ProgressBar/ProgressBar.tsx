import React, { HTMLAttributes } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import './ProgressBar.css';

export type ProgressBarVariant = 'default' | 'success' | 'error' | 'warning' | 'info';
export type ProgressBarSize = 'sm' | 'md' | 'lg';

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number; // 0-100
  variant?: ProgressBarVariant;
  size?: ProgressBarSize;
  showLabel?: boolean;
  label?: string;
  animated?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  variant = 'default',
  size = 'md',
  showLabel = false,
  label,
  animated = true,
  className = '',
  ...props
}) => {
  const { theme } = useTheme();

  const baseClasses = 'progress-bar';
  const variantClass = `progress-bar-${variant}`;
  const sizeClass = `progress-bar-${size}`;
  const animatedClass = animated ? 'progress-bar-animated' : '';

  const classes = [
    baseClasses,
    variantClass,
    sizeClass,
    animatedClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // Ограничиваем значение от 0 до 100
  const clampedValue = Math.min(100, Math.max(0, value));
  const displayLabel = label || `${Math.round(clampedValue)}%`;

  return (
    <div
      className={classes}
      {...props}
      role="progressbar"
      aria-valuenow={clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="progress-bar-track">
        <div
          className="progress-bar-fill"
          style={{
            width: `${clampedValue}%`,
            // Применяем цвета из темы
            ...(variant === 'success' && {
              background: theme.colors.gradients.success,
            }),
            ...(variant === 'error' && {
              background: theme.colors.gradients.error,
            }),
            ...(variant === 'warning' && {
              background: `linear-gradient(135deg, ${theme.colors.accent.warning} 0%, ${theme.colors.accent.warning}Hover 100%)`,
            }),
            ...(variant === 'info' && {
              background: `linear-gradient(135deg, ${theme.colors.accent.info} 0%, ${theme.colors.accent.info}Hover 100%)`,
            }),
            ...(variant === 'default' && {
              background: theme.colors.gradients.primary,
            }),
          }}
        />
      </div>
      {showLabel && (
        <div className="progress-bar-label">
          {displayLabel}
        </div>
      )}
    </div>
  );
};

export default ProgressBar;
