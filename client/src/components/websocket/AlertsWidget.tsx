import React from 'react';
import { Card } from 'primereact/card';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { Badge } from 'primereact/badge';
import { Button } from 'primereact/button';
import { useWebSocketData, Alert } from '../WebSocketDataProvider';

interface AlertsWidgetProps {
  className?: string;
  maxAlerts?: number;
  showClearButton?: boolean;
}

const AlertsWidget: React.FC<AlertsWidgetProps> = ({ 
  className = '',
  maxAlerts = 20,
  showClearButton = true
}) => {
  const { alerts, isConnected, clearAlerts } = useWebSocketData();

  const displayedAlerts = alerts.slice(0, maxAlerts);

  const typeTemplate = (rowData: Alert) => {
    const severityMap: Record<string, 'success' | 'info' | 'warning' | 'danger'> = {
      success: 'success',
      info: 'info',
      warning: 'warning',
      error: 'danger'
    };
    
    return (
      <Tag 
        value={rowData.type.toUpperCase()} 
        severity={severityMap[rowData.type] || 'info'} 
      />
    );
  };

  const severityTemplate = (rowData: Alert) => {
    const severityMap: Record<string, 'success' | 'info' | 'warning' | 'danger'> = {
      low: 'info',
      medium: 'warning',
      high: 'warning',
      critical: 'danger'
    };
    
    const labels: Record<string, string> = {
      low: 'Низкий',
      medium: 'Средний',
      high: 'Высокий',
      critical: 'Критический'
    };
    
    return (
      <Badge 
        value={labels[rowData.severity] || rowData.severity}
        severity={severityMap[rowData.severity] || 'info'}
      />
    );
  };

  const timeTemplate = (rowData: Alert) => {
    const date = new Date(rowData.timestamp);
    return (
      <span className="text-sm text-600">
        {date.toLocaleString('ru-RU')}
      </span>
    );
  };

  const categoryTemplate = (rowData: Alert) => {
    if (!rowData.category) return <span className="text-500">—</span>;
    
    const categoryLabels: Record<string, string> = {
      system: 'Система',
      trading: 'Торговля',
      training: 'Обучение',
      cache: 'Кеш'
    };
    
    return (
      <span className="text-sm text-600">
        {categoryLabels[rowData.category] || rowData.category}
      </span>
    );
  };

  return (
    <Card 
      title={
        <div className="flex align-items-center justify-content-between">
          <span>🚨 Системные алерты</span>
          <div className="flex align-items-center gap-2">
            {alerts.length > 0 && (
              <Badge 
                value={alerts.length} 
                severity={
                  alerts.some(a => a.severity === 'critical' || a.severity === 'high') 
                    ? 'danger' 
                    : 'warning'
                }
              />
            )}
            {showClearButton && alerts.length > 0 && (
              <Button
                icon="pi pi-trash"
                size="small"
                severity="secondary"
                text
                tooltip="Очистить алерты"
                onClick={clearAlerts}
                className="p-button-sm"
              />
            )}
          </div>
        </div>
      }
      className={className}
    >
      {!isConnected && (
        <div className="text-center p-3 text-500">
          <i className="pi pi-exclamation-triangle mr-2"></i>
          Нет подключения к серверу
        </div>
      )}
      
      {isConnected && displayedAlerts.length === 0 && (
        <div className="text-center p-4 text-500">
          <i className="pi pi-check-circle text-2xl mb-2 text-green-500"></i>
          <p>Нет активных алертов</p>
        </div>
      )}

      {isConnected && displayedAlerts.length > 0 && (
        <DataTable
          value={displayedAlerts}
          paginator={displayedAlerts.length > 10}
          rows={10}
          size="small"
          emptyMessage="Нет алертов"
        >
          <Column 
            field="type" 
            header="Тип" 
            body={typeTemplate}
            style={{ minWidth: '100px' }}
          />
          <Column 
            field="severity" 
            header="Важность" 
            body={severityTemplate}
            style={{ minWidth: '120px' }}
          />
          <Column 
            field="category" 
            header="Категория" 
            body={categoryTemplate}
            style={{ minWidth: '100px' }}
          />
          <Column 
            field="message" 
            header="Сообщение" 
            style={{ minWidth: '200px' }}
          />
          <Column 
            field="timestamp" 
            header="Время" 
            body={timeTemplate}
            style={{ minWidth: '150px' }}
          />
        </DataTable>
      )}
    </Card>
  );
};

export default AlertsWidget;

