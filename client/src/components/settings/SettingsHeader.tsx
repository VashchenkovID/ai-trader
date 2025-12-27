import React from 'react';
import { Card } from '../ui/Card/Card';
import { Badge } from '../ui/Badge/Badge';
import { Input } from '../ui/Input/Input';
import { Button } from '../ui/Button/Button';
import './SettingsHeader.css';

interface SettingsHeaderProps {
  isConnected: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onExport?: () => void;
  onImport?: () => void;
}

const SettingsHeader: React.FC<SettingsHeaderProps> = ({
  isConnected,
  searchQuery,
  onSearchChange,
  onExport,
  onImport
}) => {
  return (
    <Card variant="glass" className="settings-header">
      <div className="settings-header-content">
        <div className="settings-header-title-section">
          <div className="settings-header-title-wrapper">
            <h1 className="settings-header-title">⚙️ Настройки</h1>
            {isConnected && (
              <Badge variant="success" size="md">
                LIVE
              </Badge>
            )}
          </div>
          <p className="settings-header-subtitle">
            Управление настройками системы и сервисов
            {isConnected && <span className="settings-header-subtitle-live"> • Данные в реальном времени</span>}
          </p>
        </div>

        <div className="settings-header-actions">
          <div className="settings-header-search">
            <Input
              placeholder="Поиск настроек..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              leftIcon={<i className="pi pi-search"></i>}
              fullWidth
            />
          </div>
          <div className="settings-header-buttons">
            {onExport && (
              <Button
                variant="ghost"
                size="sm"
                icon={<i className="pi pi-download"></i>}
                onClick={onExport}
              >
                Экспорт
              </Button>
            )}
            {onImport && (
              <Button
                variant="ghost"
                size="sm"
                icon={<i className="pi pi-upload"></i>}
                onClick={onImport}
              >
                Импорт
              </Button>
            )}
          </div>
        </div>

        <div className="settings-header-connection-status">
          <div className="settings-header-connection-indicator">
            <div className="settings-header-connection-icon">
              {isConnected ? '🟢' : '🔴'}
            </div>
            <div className="settings-header-connection-text">
              {isConnected ? 'Подключено к серверу' : 'Отключено от сервера'}
            </div>
            <small className="settings-header-connection-hint">
              {isConnected ? 'Данные обновляются в реальном времени' : 'Попытка переподключения...'}
            </small>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default SettingsHeader;

