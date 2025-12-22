import React, { HTMLAttributes } from 'react';
import './Skeleton.css';

export type SkeletonVariant = 'text' | 'circular' | 'rectangular';
export type SkeletonSize = 'sm' | 'md' | 'lg';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  size?: SkeletonSize;
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'rectangular',
  size = 'md',
  width,
  height,
  animation = 'pulse',
  className = '',
  ...props
}) => {
  const baseClasses = 'skeleton';
  const variantClass = `skeleton-${variant}`;
  const sizeClass = `skeleton-${size}`;
  const animationClass = animation !== 'none' ? `skeleton-${animation}` : '';

  const classes = [
    baseClasses,
    variantClass,
    sizeClass,
    animationClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // Для круглого варианта убеждаемся, что width и height одинаковые
  const isCircular = variant === 'circular';
  const sizeValue = width || height;
  
  const style: React.CSSProperties = {
    ...props.style,
    ...(isCircular && sizeValue
      ? {
          width: typeof sizeValue === 'number' ? `${sizeValue}px` : sizeValue,
          height: typeof sizeValue === 'number' ? `${sizeValue}px` : sizeValue,
        }
      : {
          ...(width && { width: typeof width === 'number' ? `${width}px` : width }),
          ...(height && { height: typeof height === 'number' ? `${height}px` : height }),
        }),
  };

  return (
    <div
      className={classes}
      {...props}
      style={style}
      aria-busy="true"
      aria-live="polite"
    />
  );
};

export default Skeleton;
