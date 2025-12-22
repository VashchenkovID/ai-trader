import React, { HTMLAttributes, ReactNode } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import './Card.css';

export type CardVariant = 'default' | 'glass' | 'elevated' | 'interactive';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  hover?: boolean;
}

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  header,
  footer,
  children,
  hover = false,
  className = '',
  ...props
}) => {
  const { theme } = useTheme();

  const baseClasses = 'card';
  const variantClass = `card-${variant}`;
  const hoverClass = hover ? 'card-hover' : '';

  const classes = [
    baseClasses,
    variantClass,
    hoverClass,
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
        // Применяем цвета из темы для вариантов
        ...(variant === 'glass' && {
          background: theme.colors.surface.glass,
        }),
        ...(variant === 'elevated' && {
          background: theme.colors.background.elevated,
        }),
      }}
    >
      {header && (
        <div className="card-header">
          {header}
        </div>
      )}
      
      <div className="card-body">
        {children}
      </div>
      
      {footer && (
        <div className="card-footer">
          {footer}
        </div>
      )}
    </div>
  );
};

export default Card;
