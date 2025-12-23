import React, { useState, ReactNode } from 'react';
import { Tabs } from '../Tabs/Tabs';
import './TabView.css';

export interface TabPanelProps {
  header: string;
  icon?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
}

export const TabPanel: React.FC<TabPanelProps> = ({ children }) => {
  return <>{children}</>;
};

export interface TabViewProps {
  activeIndex?: number;
  onTabChange?: (e: { index: number }) => void;
  children: ReactNode;
  className?: string;
}

export const TabView: React.FC<TabViewProps> = ({
  activeIndex: controlledActiveIndex,
  onTabChange,
  children,
  className = '',
}) => {
  const [internalActiveIndex, setInternalActiveIndex] = useState(0);
  const activeIndex = controlledActiveIndex !== undefined ? controlledActiveIndex : internalActiveIndex;

  // Извлекаем заголовки из TabPanel
  const tabPanels = React.Children.toArray(children) as React.ReactElement<TabPanelProps>[];
  const tabOptions = tabPanels.map((panel, index) => ({
    label: panel.props.header,
    value: String(index),
    icon: panel.props.icon,
  }));

  const handleTabChange = (value: string) => {
    const newIndex = parseInt(value, 10);
    if (controlledActiveIndex === undefined) {
      setInternalActiveIndex(newIndex);
    }
    onTabChange?.({ index: newIndex });
  };

  return (
    <div className={`tab-view ${className}`}>
      <Tabs
        options={tabOptions}
        value={String(activeIndex)}
        onChange={handleTabChange}
        variant="default"
        size="md"
      />
      <div className="tab-view-content">
        {tabPanels[activeIndex]?.props.children}
      </div>
    </div>
  );
};

export default TabView;

