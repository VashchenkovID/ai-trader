import React from 'react';
import { TabPanel } from '../ui/TabView/TabView';
import SettingsGroup from './SettingsGroup';
import './SettingsTabs.css';

interface Setting {
  key: string;
  value: any;
  type: string;
  module: string;
  description?: string;
  min?: number;
  max?: number;
  options?: string[];
}

interface SettingsTabsProps {
  settingsByModule: Record<string, Setting[]>;
  filteredSettings: Setting[];
  onUpdateSetting: (key: string, value: any) => void;
}

const SettingsTabs: React.FC<SettingsTabsProps> = ({
  settingsByModule,
  filteredSettings,
  onUpdateSetting
}) => {
  const moduleNames: { [key: string]: string } = {
    system: 'Система',
    neural_networks: 'Нейросети',
    trading: 'Торговля',
    portfolio: 'Портфель',
    risk: 'Риски',
    notifications: 'Уведомления',
    other: 'Прочее'
  };

  const modules = Object.keys(settingsByModule).sort();

  return (
    <>
      {modules.map((module) => {
        const moduleSettings = settingsByModule[module];
        const displayName = moduleNames[module] || module;

        return (
          <TabPanel key={module} header={displayName}>
            <SettingsGroup
              module={module}
              settings={moduleSettings}
              onUpdate={onUpdateSetting}
            />
          </TabPanel>
        );
      })}
    </>
  );
};

export default SettingsTabs;

