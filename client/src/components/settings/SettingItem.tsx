import React, { useState } from 'react';
import { Input } from '../ui/Input/Input';
import { InputNumber } from '../ui/InputNumber/InputNumber';
import { Select } from '../ui/Select/Select';
import { InputSwitch } from 'primereact/inputswitch';
import './SettingItem.css';

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

interface SettingItemProps {
  setting: Setting;
  onUpdate: (value: any) => void;
}

const SettingItem: React.FC<SettingItemProps> = ({ setting, onUpdate }) => {
  const [value, setValue] = useState(setting.value);
  const [isEditing, setIsEditing] = useState(false);

  const handleChange = (newValue: any) => {
    setValue(newValue);
    setIsEditing(true);
  };

  const handleBlur = () => {
    if (isEditing) {
      onUpdate(value);
      setIsEditing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
  };

  const renderInput = () => {
    switch (setting.type) {
      case 'number':
        return (
          <InputNumber
            value={value}
            onValueChange={(e) => handleChange(e.value)}
            min={setting.min}
            max={setting.max}
            fullWidth
          />
        );
      case 'boolean':
        return (
          <div className="setting-item-switch">
            <InputSwitch
              checked={value}
              onChange={(e) => {
                handleChange(e.value);
                onUpdate(e.value);
              }}
            />
          </div>
        );
      case 'select':
        return (
          <Select
            value={value}
            onChange={(e) => {
              handleChange(e.target.value);
              onUpdate(e.target.value);
            }}
            options={setting.options?.map(opt => ({ label: opt, value: opt })) || []}
            fullWidth
          />
        );
      case 'string':
      default:
        return (
          <Input
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            onKeyPress={handleKeyPress}
            fullWidth
          />
        );
    }
  };

  return (
    <div className="setting-item">
      <div className="setting-item-content">
        <div className="setting-item-header">
          <div className="setting-item-key">{setting.key}</div>
          {isEditing && (
            <span className="setting-item-editing">Редактирование...</span>
          )}
        </div>
        {setting.description && (
          <div className="setting-item-description">{setting.description}</div>
        )}
        <div className="setting-item-input">
          {renderInput()}
        </div>
      </div>
    </div>
  );
};

export default SettingItem;

