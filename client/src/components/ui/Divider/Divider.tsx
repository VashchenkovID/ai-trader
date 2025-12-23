import React from 'react';
import './Divider.css';

export type DividerOrientation = 'horizontal' | 'vertical';
export type DividerVariant = 'default' | 'dashed' | 'dotted';

export interface DividerProps {
  orientation?: DividerOrientation;
  variant?: DividerVariant;
  className?: string;
  spacing?: 'sm' | 'md' | 'lg';
}

export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  variant = 'default',
  className = '',
  spacing = 'md',
}) => {
  const baseClasses = 'divider';
  const orientationClass = `divider-${orientation}`;
  const variantClass = `divider-${variant}`;
  const spacingClass = `divider-spacing-${spacing}`;

  const dividerClasses = [
    baseClasses,
    orientationClass,
    variantClass,
    spacingClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={dividerClasses} role="separator" aria-orientation={orientation} />;
};

export default Divider;
