import React from 'react';
import { Card } from '../ui/Card/Card';
import { Badge } from '../ui/Badge/Badge';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import './SystemInfoCard.css';

interface SystemInfoCardProps {
  systemStatus: any;
}

const SystemInfoCard: React.FC<SystemInfoCardProps> = ({ systemStatus }) => {
  if (!systemStatus) {
    return (
      <Card variant="glass" header="🖥️ Системная информация" className="system-info-card">
        <div className="system-info-skeleton">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="system-info-skeleton-item">
              <Skeleton variant="text" size="md" className="system-info-skeleton-large" />
              <Skeleton variant="text" size="sm" className="system-info-skeleton-medium" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const getStatusBadge = (status: any) => {
    if (!status) return <Badge variant="info" size="sm">Неизвестно</Badge>;
    
    if (typeof status === 'string') {
      const statusMap: { [key: string]: 'success' | 'warning' | 'error' | 'info' } = {
        'active': 'success',
        'ready': 'success',
        'connected': 'success',
        'training': 'warning',
        'inactive': 'warning',
        'off': 'error',
        'not_loaded': 'error',
        'unknown': 'info'
      };
      return <Badge variant={statusMap[status] || 'info'} size="sm">{status}</Badge>;
    }
    
    // Обработка объекта статуса
    if (status.status) {
      const statusValue = status.status;
      const statusMap: { [key: string]: 'success' | 'warning' | 'error' | 'info' } = {
        'active': 'success',
        'ready': 'success',
        'connected': 'success',
        'training': 'warning',
        'inactive': 'warning',
        'off': 'error',
        'not_loaded': 'error',
        'unknown': 'info'
      };
      return <Badge variant={statusMap[statusValue] || 'info'} size="sm">{statusValue}</Badge>;
    }
    
    if (status.isActive || status.isConnected) {
      return <Badge variant="success" size="sm">Активен</Badge>;
    } else if (status.isInitialized || status.isLoaded) {
      return <Badge variant="info" size="sm">Инициализирован</Badge>;
    } else {
      return <Badge variant="error" size="sm">Не инициализирован</Badge>;
    }
  };

  return (
    <Card variant="glass" header="🖥️ Системная информация" className="system-info-card">
      <div className="system-info-content">
        <div className="system-info-grid">
          <div className="system-info-item">
            <div className="system-info-item-content">
              <div className="system-info-item-label">Нейросеть</div>
              <div>{getStatusBadge(systemStatus.neuralNetwork)}</div>
            </div>
          </div>
          <div className="system-info-item">
            <div className="system-info-item-content">
              <div className="system-info-item-label">WebSocket</div>
              <div>{getStatusBadge(systemStatus.websocket)}</div>
            </div>
          </div>
          <div className="system-info-item">
            <div className="system-info-item-content">
              <div className="system-info-item-label">Движок</div>
              <div>{getStatusBadge(systemStatus.trading)}</div>
            </div>
          </div>
          <div className="system-info-item">
            <div className="system-info-item-content">
              <div className="system-info-item-label">База данных</div>
              <div>{getStatusBadge(systemStatus.database)}</div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default SystemInfoCard;

