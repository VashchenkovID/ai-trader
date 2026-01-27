import React, { SelectHTMLAttributes, forwardRef, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
// import { useTheme } from '../../../contexts/ThemeContext'; // Reserved for future use
import './Select.css';

export type SelectSize = 'sm' | 'md' | 'lg';
export type SelectVariant = 'default' | 'filled';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: SelectSize;
  variant?: SelectVariant;
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
  fullWidth?: boolean;
  searchable?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      size = 'md',
      variant = 'default',
      label,
      error,
      helperText,
      options,
      placeholder = 'Выберите...',
      fullWidth = false,
      searchable = false,
      className = '',
      id,
      value,
      onChange,
      ...props
    },
    ref
  ) => {
    // const { theme } = useTheme(); // Reserved for future use
    const [isOpen, setIsOpen] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [dropdownPosition, setDropdownPosition] = useState<'bottom' | 'top'>('bottom');
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const selectRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;

    const filteredOptions = searchable && searchTerm
      ? options.filter(opt => 
          opt.label.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : options;

    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node;
        if (
          selectRef.current && 
          !selectRef.current.contains(target) &&
          dropdownRef.current &&
          !dropdownRef.current.contains(target)
        ) {
          setIsOpen(false);
          setSearchTerm('');
        }
      };

      if (isOpen) {
        // Используем capture phase для более надежного определения кликов вне компонента
        document.addEventListener('mousedown', handleClickOutside, true);
      }

      return () => {
        document.removeEventListener('mousedown', handleClickOutside, true);
      };
    }, [isOpen]);

    // Автоматическое позиционирование меню с использованием fixed позиционирования
    useEffect(() => {
      if (isOpen && selectRef.current && dropdownRef.current) {
        const updatePosition = () => {
          if (!selectRef.current || !dropdownRef.current) return;
          
          const trigger = selectRef.current.querySelector('.select-trigger') as HTMLElement;
          if (!trigger) return;
          
          const triggerRect = trigger.getBoundingClientRect();
          const dropdownRect = dropdownRef.current.getBoundingClientRect();
          
          // Используем реальную высоту меню, если оно уже отрендерено, иначе оценку
          const dropdownHeight = dropdownRect.height > 0 
            ? dropdownRect.height 
            : Math.min(300, filteredOptions.length * 40 + (searchable ? 50 : 0));
          
          const padding = 8; // Отступ между триггером и меню
          const minTopOffset = 80; // Минимальный отступ от верха экрана
          const minBottomOffset = 16; // Минимальный отступ от низа экрана
          
          const spaceBelow = window.innerHeight - triggerRect.bottom - padding - minBottomOffset;
          const spaceAbove = triggerRect.top - padding - minTopOffset;
          
          let position: 'bottom' | 'top' = 'bottom';
          let top = 0;
          let left = triggerRect.left;
          let width = triggerRect.width;
          
          // Определяем позицию (сверху или снизу)
          // Приоритет: снизу, если есть место. Сверху только если снизу места нет, а сверху есть
          if (spaceBelow >= dropdownHeight) {
            // Достаточно места снизу
            position = 'bottom';
            top = triggerRect.bottom + padding;
          } else if (spaceAbove >= dropdownHeight && spaceAbove > spaceBelow) {
            // Места снизу нет, но сверху достаточно
            position = 'top';
            top = triggerRect.top - dropdownHeight - padding;
            // Убеждаемся, что не выходим за минимальный отступ сверху
            if (top < minTopOffset) {
              top = minTopOffset;
            }
          } else {
            // Места нет ни сверху, ни снизу - открываем там, где больше места
            if (spaceBelow > spaceAbove) {
              position = 'bottom';
              top = triggerRect.bottom + padding;
            } else {
              position = 'top';
              top = Math.max(minTopOffset, triggerRect.top - dropdownHeight - padding);
            }
          }
          
          // Корректируем горизонтальное позиционирование
          // Проверяем правый край
          if (left + width > window.innerWidth - 16) {
            left = window.innerWidth - width - 16;
          }
          
          // Проверяем левый край
          if (left < 16) {
            left = 16;
            // Если меню не помещается, ограничиваем ширину
            if (left + width > window.innerWidth - 16) {
              width = window.innerWidth - left - 16;
            }
          }
          
          setDropdownPosition(position);
          setDropdownStyle({
            position: 'fixed',
            top: `${top}px`,
            left: `${left}px`,
            width: `${width}px`,
            minWidth: `${triggerRect.width}px`,
            maxWidth: `${window.innerWidth - 32}px`,
          });
        };

        // Обновляем позицию сразу
        updatePosition();
        
        // Обновляем после небольшой задержки, когда меню полностью отрендерится
        const timeoutId = setTimeout(() => {
          updatePosition();
        }, 0);
        
        // Также обновляем при скролле или изменении размера окна
        const handleScroll = () => updatePosition();
        const handleResize = () => updatePosition();
        
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', handleResize);

        return () => {
          clearTimeout(timeoutId);
          window.removeEventListener('scroll', handleScroll, true);
          window.removeEventListener('resize', handleResize);
        };
      } else {
        setDropdownPosition('bottom');
        setDropdownStyle({});
      }
    }, [isOpen, filteredOptions.length, searchable]);

    const baseClasses = 'select-wrapper';
    const sizeClass = `select-${size}`;
    const variantClass = `select-${variant}`;
    const errorClass = error ? 'select-error' : '';
    const focusedClass = isFocused ? 'select-focused' : '';
    const fullWidthClass = fullWidth ? 'select-full-width' : '';
    const openClass = isOpen ? 'select-open' : '';

    const wrapperClasses = [
      baseClasses,
      sizeClass,
      variantClass,
      errorClass,
      focusedClass,
      fullWidthClass,
      openClass,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const handleSelectClick = () => {
      setIsOpen(!isOpen);
    };

    const handleOptionClick = (optionValue: string | number) => {
      if (onChange) {
        const syntheticEvent = {
          target: { value: String(optionValue) },
        } as React.ChangeEvent<HTMLSelectElement>;
        onChange(syntheticEvent);
      }
      setIsOpen(false);
      setSearchTerm('');
    };

    return (
      <div className={wrapperClasses} ref={selectRef}>
        {label && (
          <label htmlFor={selectId} className="select-label">
            {label}
          </label>
        )}
        
        <div className="select-container">
          <div
            className="select-trigger"
            onClick={handleSelectClick}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            tabIndex={0}
            role="button"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
          >
            <span className="select-value">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <span className="select-arrow">▼</span>
          </div>

          {isOpen && createPortal(
            <div 
              ref={dropdownRef}
              className={`select-dropdown glass select-dropdown-${dropdownPosition}`}
              style={dropdownStyle}
            >
              {searchable && (
                <div className="select-search">
                  <input
                    type="text"
                    className="select-search-input"
                    placeholder="Поиск..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                </div>
              )}
              
              <div className="select-options">
                {filteredOptions.length === 0 ? (
                  <div className="select-option select-option-empty">
                    Ничего не найдено
                  </div>
                ) : (
                  filteredOptions.map((option) => (
                    <div
                      key={option.value}
                      className={`select-option ${
                        option.value === value ? 'select-option-selected' : ''
                      } ${option.disabled ? 'select-option-disabled' : ''}`}
                      onClick={() => !option.disabled && handleOptionClick(option.value)}
                    >
                      {option.label}
                    </div>
                  ))
                )}
              </div>
            </div>,
            document.body
          )}
        </div>

        {/* Скрытый нативный select для формы */}
        <select
          ref={ref}
          id={selectId}
          value={value}
          onChange={onChange}
          className="select-native"
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        
        {(error || helperText) && (
          <div className={`select-helper ${error ? 'select-helper-error' : ''}`}>
            {error || helperText}
          </div>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Select;
