import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../Button/Button';
import './SplitButton.css';

export interface SplitButtonItem {
  label: string;
  icon?: string;
  command?: () => void;
  disabled?: boolean;
  className?: string;
}

export interface SplitButtonProps {
  label: string;
  icon?: string;
  onClick?: () => void;
  model?: SplitButtonItem[];
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export const SplitButton: React.FC<SplitButtonProps> = ({
  label,
  icon,
  onClick,
  model = [],
  variant = 'default',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleItemClick = (item: SplitButtonItem) => {
    if (item.disabled) return;
    item.command?.();
    setIsOpen(false);
  };

  return (
    <div className={`split-button-wrapper ${className}`} ref={dropdownRef}>
      <div className="split-button-group">
        <Button
          variant={variant}
          size={size}
          onClick={onClick}
          disabled={disabled}
          loading={loading}
          className="split-button-main"
        >
          {label}
        </Button>
        {model.length > 0 && (
          <>
            <Button
              variant={variant}
              size={size}
              onClick={() => setIsOpen(!isOpen)}
              disabled={disabled}
              className="split-button-toggle"
            >
              ▼
            </Button>
            {isOpen && (
              <div className="split-button-menu">
                {model.map((item, index) => (
                  <button
                    key={index}
                    className={`split-button-item ${item.disabled ? 'split-button-item-disabled' : ''} ${item.className || ''}`}
                    onClick={() => handleItemClick(item)}
                    disabled={item.disabled}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SplitButton;

