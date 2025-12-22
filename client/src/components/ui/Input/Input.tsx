import React, { InputHTMLAttributes, forwardRef, useState } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import './Input.css';

export type InputSize = 'sm' | 'md' | 'lg';
export type InputVariant = 'default' | 'filled';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: InputSize;
  variant?: InputVariant;
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      size = 'md',
      variant = 'default',
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    const { theme } = useTheme();
    const [isFocused, setIsFocused] = useState(false);
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    const baseClasses = 'input-wrapper';
    const sizeClass = `input-${size}`;
    const variantClass = `input-${variant}`;
    const errorClass = error ? 'input-error' : '';
    const focusedClass = isFocused ? 'input-focused' : '';
    const fullWidthClass = fullWidth ? 'input-full-width' : '';

    const wrapperClasses = [
      baseClasses,
      sizeClass,
      variantClass,
      errorClass,
      focusedClass,
      fullWidthClass,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={wrapperClasses}>
        {label && (
          <label htmlFor={inputId} className="input-label">
            {label}
          </label>
        )}
        
        <div className="input-container">
          {leftIcon && (
            <span className="input-icon-left">
              {leftIcon}
            </span>
          )}
          
          <input
            ref={ref}
            id={inputId}
            className="input"
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
            {...props}
            style={{
              ...props.style,
              paddingLeft: leftIcon ? '40px' : undefined,
              paddingRight: rightIcon ? '40px' : undefined,
            }}
          />
          
          {rightIcon && (
            <span className="input-icon-right">
              {rightIcon}
            </span>
          )}
        </div>
        
        {(error || helperText) && (
          <div className={`input-helper ${error ? 'input-helper-error' : ''}`}>
            {error || helperText}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
