import React from 'react';

interface RealTimeNotificationsProps {
  className?: string;
  showToasts?: boolean;
  maxVisibleAlerts?: number;
}

const RealTimeNotifications: React.FC<RealTimeNotificationsProps> = ({ 
  className = ''
}) => {
  // Временно отключено - требует рефакторинга для нового WebSocketDataProvider
  return (
    <div className={`real-time-notifications ${className}`}>
      <div className="text-center p-4">
        <i className="pi pi-info-circle text-blue-500 text-2xl mb-2"></i>
        <p className="text-600">Компонент уведомлений временно отключен</p>
        <small className="text-500">Требуется рефакторинг для нового WebSocket провайдера</small>
      </div>
    </div>
  );
};

export default RealTimeNotifications;