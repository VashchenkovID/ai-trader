import React from 'react';
import { Badge } from './ui/Badge/Badge';
import { Button } from './ui/Button/Button';
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
  // Безопасное получение данных из контекста
  let isConnected = false;
  let error: string | null = null;
  
  try {
    const wsData = useWebSocketData();
    isConnected = wsData?.isConnected || false;
    error = wsData?.error || null;
  } catch (err) {
    // Если контекст недоступен, используем значения по умолчанию
    console.warn('WebSocket context not available:', err);
  }
  
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

  const getBadgeVariant = (severity: string): 'success' | 'error' | 'warning' | 'info' => {
    if (severity === 'success') return 'success';
    if (severity === 'danger') return 'error';
    if (severity === 'warning') return 'warning';
    return 'info';
  };

  const getIconColor = (severity: string): string => {
    if (severity === 'success') return 'var(--color-accent-success)';
    if (severity === 'danger') return 'var(--color-accent-error)';
    if (severity === 'warning') return 'var(--color-accent-warning)';
    return 'var(--color-accent-info)';
  };

  return (
    <div className={`websocket-status flex align-items-center gap-2 ${className}`} title={statusInfo.tooltip}>
      <div className="flex align-items-center gap-2">
        <i 
          className={statusInfo.icon}
          style={{ color: getIconColor(statusInfo.severity) }}
        />
        
        <Badge 
          variant={getBadgeVariant(statusInfo.severity)}
          size="sm"
        >
          {statusInfo.text}
        </Badge>
      </div>

      {showReconnectButton && !isConnected && (
        <Button
          variant="ghost"
          size="sm"
          icon={<i className="pi pi-refresh"></i>}
          onClick={reconnect}
          title="Переподключиться"
        />
      )}
    </div>
  );
};

export default WebSocketStatus;
