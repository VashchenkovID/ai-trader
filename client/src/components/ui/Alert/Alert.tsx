import React, { ReactNode } from 'react';
import './Alert.css';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';
export type AlertSize = 'sm' | 'md' | 'lg';

export interface AlertProps {
  variant?: AlertVariant;
  size?: AlertSize;
  title?: string;
  children?: ReactNode;
  onClose?: () => void;
  className?: string;
  icon?: ReactNode;
}

export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  size = 'md',
  title,
  children,
  onClose,
  className = '',
  icon,
}) => {
  const baseClasses = 'alert';
  const variantClass = `alert-${variant}`;
  const sizeClass = `alert-${size}`;
  const closableClass = onClose ? 'alert-closable' : '';

  const alertClasses = [
    baseClasses,
    variantClass,
    sizeClass,
    closableClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const getDefaultIcon = () => {
    switch (variant) {
      case 'success':
        return <i className="pi pi-check-circle"></i>;
      case 'warning':
        return <i className="pi pi-exclamation-triangle"></i>;
      case 'error':
        return <i className="pi pi-times-circle"></i>;
      case 'info':
      default:
        return <i className="pi pi-info-circle"></i>;
    }
  };

  return (
    <div className={alertClasses} role="alert">
      <div className="alert-content">
        {(icon || getDefaultIcon()) && (
          <div className="alert-icon">
            {icon || getDefaultIcon()}
          </div>
        )}
        <div className="alert-body">
          {title && <div className="alert-title">{title}</div>}
          {(children || title) && <div className="alert-message">{children || title}</div>}
        </div>
      </div>
      {onClose && (
        <button
          type="button"
          className="alert-close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          <i className="pi pi-times"></i>
        </button>
      )}
    </div>
  );
};

export default Alert;
