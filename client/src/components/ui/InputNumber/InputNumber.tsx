import React, { useState, useRef, useEffect } from 'react';
import { Input } from '../Input/Input';
import { Button } from '../Button/Button';
import './InputNumber.css';

export type InputNumberSize = 'sm' | 'md' | 'lg';
export type InputNumberButtonLayout = 'horizontal' | 'vertical' | 'none';

export interface InputNumberProps {
  value?: number | null;
  onValueChange?: (e: { value: number | null }) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: InputNumberSize;
  showButtons?: boolean;
  buttonLayout?: InputNumberButtonLayout;
  disabled?: boolean;
  className?: string;
  id?: string;
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  incrementButtonIcon?: React.ReactNode;
  decrementButtonIcon?: React.ReactNode;
  incrementButtonClassName?: string;
  decrementButtonClassName?: string;
}

export const InputNumber: React.FC<InputNumberProps> = ({
  value = null,
  onValueChange,
  min,
  max,
  step = 1,
  size = 'md',
  showButtons = false,
  buttonLayout = 'horizontal',
  disabled = false,
  className = '',
  id,
  label,
  error,
  helperText,
  fullWidth = false,
  incrementButtonIcon = <i className="pi pi-plus"></i>,
  decrementButtonIcon = <i className="pi pi-minus"></i>,
  incrementButtonClassName = '',
  decrementButtonClassName = '',
}) => {
  const [internalValue, setInternalValue] = useState<string>(
    value !== null && value !== undefined ? String(value) : ''
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value !== null && value !== undefined) {
      setInternalValue(String(value));
    } else {
      setInternalValue('');
    }
  }, [value]);

  const updateValue = (newValue: number | null) => {
    if (newValue === null) {
      setInternalValue('');
      onValueChange?.({ value: null });
      return;
    }

    let finalValue = newValue;

    if (min !== undefined && finalValue < min) {
      finalValue = min;
    }
    if (max !== undefined && finalValue > max) {
      finalValue = max;
    }

    setInternalValue(String(finalValue));
    onValueChange?.({ value: finalValue });
  };

  const handleIncrement = () => {
    const currentValue = value !== null && value !== undefined ? value : 0;
    updateValue(currentValue + step);
  };

  const handleDecrement = () => {
    const currentValue = value !== null && value !== undefined ? value : 0;
    updateValue(currentValue - step);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;

    if (inputValue === '' || inputValue === '-') {
      setInternalValue(inputValue);
      onValueChange?.({ value: null });
      return;
    }

    const numValue = parseFloat(inputValue);
    if (!isNaN(numValue)) {
      updateValue(numValue);
    } else {
      setInternalValue(inputValue);
    }
  };

  const handleBlur = () => {
    const numValue = parseFloat(internalValue);
    if (!isNaN(numValue)) {
      updateValue(numValue);
    } else {
      updateValue(null);
    }
  };

  const canIncrement = max === undefined || (value !== null && value !== undefined && value < max);
  const canDecrement = min === undefined || (value !== null && value !== undefined && value > min);

  const wrapperClasses = [
    'input-number-wrapper',
    `input-number-${size}`,
    showButtons && buttonLayout !== 'none' ? `input-number-buttons-${buttonLayout}` : '',
    fullWidth ? 'input-number-full-width' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (showButtons && buttonLayout !== 'none') {
    return (
      <div className={wrapperClasses}>
        {label && (
          <label htmlFor={id} className="input-number-label">
            {label}
          </label>
        )}
        <div className="input-number-container">
          {buttonLayout === 'horizontal' && (
            <Button
              variant="ghost"
              size={size}
              icon={decrementButtonIcon}
              onClick={handleDecrement}
              disabled={disabled || !canDecrement}
              className={`input-number-button input-number-button-decrement ${decrementButtonClassName}`}
              type="button"
            />
          )}
          <Input
            ref={inputRef}
            id={id}
            type="number"
            value={internalValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            min={min}
            max={max}
            step={step}
            size={size}
            disabled={disabled}
            error={error}
            helperText={helperText}
            fullWidth
            className="input-number-input"
          />
          {buttonLayout === 'horizontal' && (
            <Button
              variant="ghost"
              size={size}
              icon={incrementButtonIcon}
              onClick={handleIncrement}
              disabled={disabled || !canIncrement}
              className={`input-number-button input-number-button-increment ${incrementButtonClassName}`}
              type="button"
            />
          )}
        </div>
        {buttonLayout === 'vertical' && (
          <div className="input-number-vertical-buttons">
            <Button
              variant="ghost"
              size={size}
              icon={incrementButtonIcon}
              onClick={handleIncrement}
              disabled={disabled || !canIncrement}
              className={`input-number-button input-number-button-increment ${incrementButtonClassName}`}
              type="button"
            />
            <Button
              variant="ghost"
              size={size}
              icon={decrementButtonIcon}
              onClick={handleDecrement}
              disabled={disabled || !canDecrement}
              className={`input-number-button input-number-button-decrement ${decrementButtonClassName}`}
              type="button"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <Input
      ref={inputRef}
      id={id}
      type="number"
      value={internalValue}
      onChange={handleInputChange}
      onBlur={handleBlur}
      min={min}
      max={max}
      step={step}
      size={size}
      disabled={disabled}
      error={error}
      helperText={helperText}
      label={label}
      fullWidth={fullWidth}
      className={className}
    />
  );
};

export default InputNumber;
