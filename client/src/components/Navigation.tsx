import React, { useState, useEffect } from 'react';
import { useRef } from 'react';
import { Toast } from 'primereact/toast';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiService } from '../services/apiService';
import { authService } from '../services/authService';
import { Button } from './ui/Button/Button';
import WebSocketStatus from './WebSocketStatus';
import NotificationPanel from './NotificationPanel';
import './Navigation.css';

interface NavigationProps {
  className?: string;
}

const Navigation: React.FC<NavigationProps> = ({ className = '' }) => {
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
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

  // Загрузка информации о пользователе
  useEffect(() => {
    const currentUser = authService.getUser();
    setUser(currentUser);
  }, []);

  // Обработка выхода
  const handleLogout = async () => {
    try {
      await authService.logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
      // Всё равно перенаправляем на логин
      navigate('/login');
    }
  };


  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = [
    { path: '/', label: 'Главная', icon: 'pi pi-home' },
    { path: '/portfolio', label: 'Портфель', icon: 'pi pi-briefcase' },
    { path: '/performance', label: 'Производительность', icon: 'pi pi-chart-line' },
    { path: '/recommendations', label: 'Рекомендации', icon: 'pi pi-star' },
    { path: '/trading-requests', label: 'Торговые заявки', icon: 'pi pi-list-check' },
    { path: '/training-debug', label: 'Отладка обучения', icon: 'pi pi-cog' },
    { path: '/design-system-test', label: '🎨 Тест дизайн-системы', icon: 'pi pi-palette' },
    { path: '/settings', label: 'Настройки', icon: 'pi pi-wrench' }
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className={`navigation-sidebar ${className}`}>
      <Toast ref={toast} />
      
      {/* Заголовок */}
      <div className="navigation-header">
        <div className="navigation-header-content">
          <div className="navigation-logo">
            <span className="navigation-logo-text">TradeForge Insights</span>
          </div>
          
          {/* WebSocket статус */}
          <div className="navigation-status-section">
            <div className="mb-2">
              <WebSocketStatus compact={true} />
            </div>
            
            <div className="navigation-status-row">
              <small className="navigation-timestamp">
                {systemStatus?.timestamp && new Date(systemStatus.timestamp).toLocaleTimeString()}
              </small>
              <div className="navigation-actions">
                <NotificationPanel />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<i className="pi pi-refresh"></i>}
                  onClick={loadSystemStatus}
                  title="Обновить статус"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Навигационные кнопки */}
      <div className="navigation-menu">
        {menuItems.map((item) => (
          <button
            key={item.path}
            className={`navigation-menu-item ${isActive(item.path) ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <i className={`${item.icon} navigation-menu-item-icon`}></i>
            <span className="navigation-menu-item-label">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Информация о пользователе и выход */}
      <div className="navigation-footer">
        {user && (
          <div className="navigation-user-info">
            <div className="navigation-user-name">{user.fullName}</div>
            <div className="navigation-user-username">@{user.username}</div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon={<i className="pi pi-sign-out"></i>}
          onClick={handleLogout}
          className="navigation-logout-button"
          title="Выйти"
        >
          Выйти
        </Button>
      </div>
    </div>
  );
};

export default Navigation;
