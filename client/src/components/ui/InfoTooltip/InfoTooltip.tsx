import React from 'react';
import { Tooltip } from '../Tooltip/Tooltip';
import './InfoTooltip.css';

export interface InfoTooltipProps {
  explanation: string;
  title?: string;
  variant?: 'default' | 'info' | 'success' | 'warning' | 'error';
  position?: 'top' | 'bottom' | 'left' | 'right';
  children?: React.ReactNode;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  explanation,
  title,
  variant = 'info',
  position = 'top',
  children,
}) => {
  const content = (
    <div className="info-tooltip-content">
      {title && <div className="info-tooltip-title">{title}</div>}
      <div className="info-tooltip-text">{explanation}</div>
    </div>
  );

  return (
    <Tooltip
      content={content}
      position={position}
      variant={variant}
      delay={200}
    >
      {children || (
        <span className="info-tooltip-icon" aria-label="Информация">
          <i className="pi pi-info-circle"></i>
        </span>
      )}
    </Tooltip>
  );
};

export default InfoTooltip;

