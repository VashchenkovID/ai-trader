import React, { useState } from 'react';
import { Button } from 'primereact/button';
import { useRef } from 'react';
import { Toast } from 'primereact/toast';
import { Divider } from 'primereact/divider';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiService } from '../services/apiService';
import WebSocketStatus from './WebSocketStatus';
import NotificationPanel from './NotificationPanel';

interface NavigationProps {
  className?: string;
}

const Navigation: React.FC<NavigationProps> = ({ className = '' }) => {
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const toast = useRef<Toast>(null);

  // Загрузка статуса системы
  const loadSystemStatus = async () => {
    try {
      const response = await apiService.getSystemStatus();
      setSystemStatus(response);
    } catch (error) {
      console.error('Error loading system status:', error);
    }
  };

  // Загрузка статуса при монтировании
  React.useEffect(() => {
    loadSystemStatus();
    const interval = setInterval(loadSystemStatus, 30000); // Обновляем каждые 30 секунд
    return () => clearInterval(interval);
  }, []);


  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = [
    { path: '/', label: 'Главная', icon: 'pi pi-home' },
    { path: '/portfolio', label: 'Портфель', icon: 'pi pi-briefcase' },
    { path: '/neural-networks', label: 'Нейросети', icon: 'pi pi-brain' },
    { path: '/recommendations', label: 'Рекомендации', icon: 'pi pi-star' },
    { path: '/strategies', label: 'Стратегии', icon: 'pi pi-sitemap' },
    { path: '/trading-requests', label: 'Торговые заявки', icon: 'pi pi-list-check' },
    { path: '/trading-mode', label: 'Режимы торговли', icon: 'pi pi-cog' },
    { path: '/training-debug', label: 'Отладка обучения', icon: 'pi pi-cog' },
    { path: '/instrument-stats', label: 'Статистика инструментов', icon: 'pi pi-chart-bar' },
    { path: '/metrics', label: 'Метрики', icon: 'pi pi-chart-line' },
    { path: '/advanced-metrics', label: 'Продвинутые метрики', icon: 'pi pi-chart-bar' },
    { path: '/settings', label: 'Настройки', icon: 'pi pi-wrench' }
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className={`w-16rem h-full bg-white border-right-1 border-200 ${className}`}>
      <Toast ref={toast} />
      
      {/* Заголовок */}
      <div className="p-3 border-bottom-1 border-200">
        <div className="flex align-items-center gap-2 mb-2">
          <i className="pi pi-chart-line text-2xl text-primary"></i>
          <span className="text-lg font-bold text-primary">IvashkaTradeHelper</span>
        </div>
        
        {/* WebSocket статус */}
        <div className="mb-2">
          <WebSocketStatus compact={true} />
        </div>
        
        <div className="flex align-items-center justify-content-between">
          <small className="text-500">
            {systemStatus?.timestamp && new Date(systemStatus.timestamp).toLocaleTimeString()}
          </small>
          <div className="flex align-items-center gap-1">
            <NotificationPanel />
            <Button
              icon="pi pi-refresh"
              className="p-button-rounded p-button-text p-button-sm"
              tooltip="Обновить статус"
              onClick={loadSystemStatus}
            />
          </div>
        </div>
      </div>

      {/* Навигационные кнопки */}
      <div className="p-2">
        {menuItems.map((item) => (
          <Button
            key={item.path}
            icon={item.icon}
            label={item.label}
            className={`w-full justify-content-start mb-1 ${
              isActive(item.path) ? 'p-button-outlined' : 'p-button-text'
            }`}
            onClick={() => navigate(item.path)}
          />
        ))}
      </div>

      <Divider />
    </div>
  );
};

export default Navigation;
