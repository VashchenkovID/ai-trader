import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../ui/Card/Card';
import { Badge } from '../ui/Badge/Badge';
import { Button } from '../ui/Button/Button';
import { useWebSocketData } from '../WebSocketDataProvider';
import './CriticalAlertsCard.css';

interface CriticalAlertsCardProps {
  className?: string;
  maxAlerts?: number;
}

export const CriticalAlertsCard: React.FC<CriticalAlertsCardProps> = ({ 
  className = '',
  maxAlerts = 3
}) => {
  const { alerts, clearAlerts } = useWebSocketData();
  const navigate = useNavigate();

  // Фильтруем только критические и высокие алерты
  const criticalAlerts = alerts
    .filter(alert => alert.severity === 'critical' || alert.severity === 'high')
    .slice(0, maxAlerts);

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '🔴';
      case 'high':
        return '🟠';
      default:
        return '⚠️';
    }
  };

  const getSeverityVariant = (severity: string): 'error' | 'warning' | 'info' => {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'warning';
      default:
        return 'info';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Только что';
    if (diffMins < 60) return `${diffMins} мин назад`;
    if (diffHours < 24) return `${diffHours} ч назад`;
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  };

  if (criticalAlerts.length === 0) {
    return null; // Не показываем виджет, если нет критических алертов
  }

  return (
    <Card 
      variant="glass" 
      header={
        <div className="flex align-items-center justify-content-between">
          <span>🚨 Критические алерты</span>
          <Badge variant="error" size="sm">{criticalAlerts.length}</Badge>
        </div>
      } 
      className={`h-full critical-alerts-card ${className}`}
    >
      <div className="flex flex-column gap-2">
        {criticalAlerts.map((alert, index) => (
          <div
            key={alert.id || index}
            className="critical-alert-item p-2 border-round"
            style={{ 
              background: 'var(--color-surface-hover)', 
              border: '1px solid var(--color-border-error)',
              borderLeft: '4px solid var(--color-accent-error)'
            }}
          >
            <div className="flex align-items-start gap-2">
              <div className="critical-alert-icon">
                {getSeverityIcon(alert.severity)}
              </div>
              <div className="flex-1">
                <div className="flex align-items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{alert.title || alert.message}</span>
                  <Badge variant={getSeverityVariant(alert.severity)} size="xs">
                    {alert.severity === 'critical' ? 'Критично' : 'Высокий'}
                  </Badge>
                </div>
                {alert.title && (
                  <div className="text-xs text-500 mb-1">{alert.message}</div>
                )}
                <div className="text-xs text-500">
                  {formatTimeAgo(alert.timestamp)}
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {alerts.length > maxAlerts && (
          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              icon={<i className="pi pi-arrow-right"></i>}
              iconPosition="right"
              onClick={() => navigate('/settings')}
            >
              Показать все ({alerts.length})
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};

export default CriticalAlertsCard;

