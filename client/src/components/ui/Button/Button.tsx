import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconPosition = 'left',
      fullWidth = false,
      children,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const { theme } = useTheme();

    const baseClasses = 'btn';
    const variantClass = `btn-${variant}`;
    const sizeClass = `btn-${size}`;
    const loadingClass = loading ? 'btn-loading' : '';
    const fullWidthClass = fullWidth ? 'btn-full-width' : '';
    const disabledClass = (disabled || loading) ? 'btn-disabled' : '';

    const classes = [
      baseClasses,
      variantClass,
      sizeClass,
      loadingClass,
      fullWidthClass,
      disabledClass,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        {...props}
        style={{
          ...props.style,
          // Применяем цвета из темы
          ...(variant === 'primary' && {
            background: theme.colors.gradients.primary,
            color: theme.colors.text.primary,
          }),
          ...(variant === 'secondary' && {
            background: 'transparent',
            borderColor: theme.colors.border.default,
            color: theme.colors.text.primary,
          }),
          ...(variant === 'ghost' && {
            background: 'transparent',
            color: theme.colors.text.primary,
          }),
          ...(variant === 'danger' && {
            background: theme.colors.gradients.error,
            color: theme.colors.text.primary,
          }),
          ...(variant === 'success' && {
            background: theme.colors.gradients.success,
            color: theme.colors.text.primary,
          }),
        }}
      >
        {loading && (
          <span className="btn-spinner" aria-hidden="true">
            <svg
              className="spinner"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </span>
        )}
        {!loading && icon && iconPosition === 'left' && (
          <span className="btn-icon-left">{icon}</span>
        )}
        {children && <span className="btn-content">{children}</span>}
        {!loading && icon && iconPosition === 'right' && (
          <span className="btn-icon-right">{icon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
