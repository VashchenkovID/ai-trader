import React, { ReactNode } from 'react';
import './Toolbar.css';

export interface ToolbarProps {
  start?: ReactNode;
  center?: ReactNode;
  end?: ReactNode;
  className?: string;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  start,
  center,
  end,
  className = '',
}) => {
  return (
    <div className={`toolbar ${className}`}>
      {start && <div className="toolbar-start">{start}</div>}
      {center && <div className="toolbar-center">{center}</div>}
      {end && <div className="toolbar-end">{end}</div>}
    </div>
  );
};

export default Toolbar;

