import React from 'react';
import { Card } from '../ui/Card/Card';
import SettingItem from './SettingItem';
import './SettingsGroup.css';

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

interface SettingsGroupProps {
  module: string;
  settings: Setting[];
  onUpdate: (key: string, value: any) => void;
}

const SettingsGroup: React.FC<SettingsGroupProps> = ({ module, settings, onUpdate }) => {
  if (settings.length === 0) {
    return (
      <Card variant="glass" className="settings-group">
        <div className="settings-group-empty">
          <p className="settings-group-empty-text">Нет настроек в этом модуле</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="settings-group">
      <Card variant="glass" className="settings-group-card">
        <div className="settings-group-content">
          {settings.map((setting) => (
            <SettingItem
              key={setting.key}
              setting={setting}
              onUpdate={(value) => onUpdate(setting.key, value)}
            />
          ))}
        </div>
      </Card>
    </div>
  );
};

export default SettingsGroup;

