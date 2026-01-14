import React, { InputHTMLAttributes, forwardRef, useState, useRef, useEffect } from 'react';
import './Checkbox.css';

export type CheckboxSize = 'sm' | 'md' | 'lg';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  size?: CheckboxSize;
  label?: string;
  error?: string;
  helperText?: string;
  indeterminate?: boolean;
  fullWidth?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      size = 'md',
      label,
      error,
      helperText,
      indeterminate = false,
      fullWidth = false,
      className = '',
      id,
      checked,
      disabled,
      onChange,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);
    const [isChecked, setIsChecked] = useState(checked || false);
    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (ref || internalRef) as React.RefObject<HTMLInputElement>;
    const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;

    // Синхронизация checked состояния
    useEffect(() => {
      if (checked !== undefined) {
        setIsChecked(checked);
      }
    }, [checked]);

    // Установка indeterminate состояния
    useEffect(() => {
      if (inputRef.current) {
        inputRef.current.indeterminate = indeterminate;
      }
    }, [indeterminate, inputRef]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setIsChecked(e.target.checked);
      onChange?.(e);
    };

    const baseClasses = 'checkbox-wrapper';
    const sizeClass = `checkbox-${size}`;
    const errorClass = error ? 'checkbox-error' : '';
    const focusedClass = isFocused ? 'checkbox-focused' : '';
    const checkedClass = isChecked ? 'checkbox-checked' : '';
    const indeterminateClass = indeterminate ? 'checkbox-indeterminate' : '';
    const disabledClass = disabled ? 'checkbox-disabled' : '';
    const fullWidthClass = fullWidth ? 'checkbox-full-width' : '';

    const wrapperClasses = [
      baseClasses,
      sizeClass,
      errorClass,
      focusedClass,
      checkedClass,
      indeterminateClass,
      disabledClass,
      fullWidthClass,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={wrapperClasses}>
        <label
          htmlFor={checkboxId}
          className={`checkbox-label ${disabled ? 'checkbox-label-disabled' : ''}`}
        >
          <input
            ref={inputRef}
            type="checkbox"
            id={checkboxId}
            className="checkbox-input"
            checked={isChecked}
            disabled={disabled}
            onChange={handleChange}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
            {...props}
          />
          <span className="checkbox-box">
            <span className="checkbox-checkmark">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10 3L4.5 8.5L2 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="checkbox-indeterminate-mark">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2 6H10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </span>
          {label && (
            <span className="checkbox-label-text">{label}</span>
          )}
        </label>
        {(error || helperText) && (
          <div className={`checkbox-helper ${error ? 'checkbox-helper-error' : ''}`}>
            {error || helperText}
          </div>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export default Checkbox;

