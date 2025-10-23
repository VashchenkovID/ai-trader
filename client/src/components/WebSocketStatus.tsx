import React from 'react';
import { Badge } from 'primereact/badge';
import { Button } from 'primereact/button';
import { Tooltip } from 'primereact/tooltip';
import { useWebSocketData } from './WebSocketDataProvider';

interface WebSocketStatusProps {
  className?: string;
  showReconnectButton?: boolean;
  compact?: boolean;
}

const WebSocketStatus: React.FC<WebSocketStatusProps> = ({ 
  className = '', 
  showReconnectButton = false,
  compact = false 
}) => {
  const { isConnected, error } = useWebSocketData();
  
  // Функция для переподключения (пока не реализована в новом провайдере)
  const reconnect = () => {
    window.location.reload();
  };

  const getStatusInfo = () => {

    if (isConnected) {
      return {
        severity: 'success' as const,
        icon: 'pi pi-wifi',
        text: compact ? 'Онлайн' : 'Подключен',
        tooltip: 'Соединение с сервером активно. Данные обновляются в реальном времени'
      };
    }

    if (error) {
      return {
        severity: 'danger' as const,
        icon: 'pi pi-exclamation-triangle',
        text: compact ? 'Ошибка' : 'Ошибка подключения',
        tooltip: `Ошибка соединения: ${error}`
      };
    }

    return {
      severity: 'info' as const,
      icon: 'pi pi-times-circle',
      text: compact ? 'Офлайн' : 'Отключен',
      tooltip: 'Нет соединения с сервером. Данные могут быть устаревшими'
    };
  };

  const statusInfo = getStatusInfo();

  return (
    <div className={`websocket-status flex align-items-center gap-2 ${className}`}>
      <div className="flex align-items-center gap-2">
        <i 
          className={`${statusInfo.icon} text-${statusInfo.severity === 'success' ? 'green' : 
                      statusInfo.severity === 'warning' ? 'orange' : 
                      statusInfo.severity === 'danger' ? 'red' : 'gray'}-500`}
          data-pr-tooltip={statusInfo.tooltip}
          data-pr-position="top"
        />
        
        <Badge 
          value={statusInfo.text}
          severity={statusInfo.severity}
          className="websocket-status-badge"
        />
      </div>

      {showReconnectButton && !isConnected && (
        <Button
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          tooltip="Переподключиться"
          onClick={reconnect}
          className="p-button-sm"
        />
      )}

      <Tooltip target=".websocket-status i" />
    </div>
  );
};

export default WebSocketStatus;
