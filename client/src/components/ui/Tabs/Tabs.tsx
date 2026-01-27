import React, { HTMLAttributes } from 'react';
// import { useTheme } from '../../../contexts/ThemeContext'; // Reserved for future use
import './Tabs.css';

export interface TabOption {
  label: string;
  value: string;
  icon?: React.ReactNode;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  options: TabOption[];
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'pills' | 'underline';
}

export const Tabs: React.FC<TabsProps> = ({
  options,
  value,
  onChange,
  size = 'md',
  variant = 'default',
  className = '',
  ...props
}) => {
  // const { theme } = useTheme(); // Reserved for future use

  const baseClasses = 'tabs';
  const sizeClass = `tabs-${size}`;
  const variantClass = `tabs-${variant}`;

  const classes = [
    baseClasses,
    sizeClass,
    variantClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      {...props}
      style={{
        ...props.style,
      }}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={`tabs-item ${isActive ? 'tabs-item-active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.icon && <span className="tabs-item-icon">{option.icon}</span>}
            <span className="tabs-item-label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default Tabs;

