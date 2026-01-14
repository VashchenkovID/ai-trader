import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../Button/Button';
import './SplitButton.css';

export interface SplitButtonItem {
  label: string;
  icon?: string;
  command?: () => void;
  disabled?: boolean;
  className?: string;
}

import { ButtonVariant, ButtonSize } from '../Button/Button';

export interface SplitButtonProps {
  label: string;
  icon?: string;
  onClick?: () => void;
  model?: SplitButtonItem[];
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export const SplitButton: React.FC<SplitButtonProps> = ({
  label,
  onClick,
  model = [],
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPosition = () => {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updateMenuPosition();
      
      const handleResize = () => {
        updateMenuPosition();
      };
      
      const handleScroll = () => {
        updateMenuPosition();
      };

      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);
      
      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current && 
        !wrapperRef.current.contains(event.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      // Небольшая задержка, чтобы не закрыть меню сразу после открытия
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  const handleItemClick = (item: SplitButtonItem) => {
    if (item.disabled) return;
    item.command?.();
    setIsOpen(false);
  };

  const menuContent = isOpen && model.length > 0 ? (
    <div
      ref={menuRef}
      className="split-button-menu"
      style={{
        position: 'absolute',
        top: `${menuPosition.top}px`,
        left: `${menuPosition.left}px`,
        width: `${menuPosition.width}px`,
        zIndex: 9999
      }}
    >
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
  ) : null;

  return (
    <>
      <div className={`split-button-wrapper ${className}`} ref={wrapperRef}>
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
            <Button
              variant={variant}
              size={size}
              onClick={() => {
                setIsOpen(!isOpen);
                if (!isOpen) {
                  // Обновляем позицию при открытии
                  setTimeout(updateMenuPosition, 0);
                }
              }}
              disabled={disabled}
              className="split-button-toggle"
            >
              ▼
            </Button>
          )}
        </div>
      </div>
      {menuContent && createPortal(menuContent, document.body)}
    </>
  );
};

export default SplitButton;

