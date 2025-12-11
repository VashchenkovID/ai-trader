import React, { useState, useEffect, useRef } from 'react';
import { Button } from 'primereact/button';
import { OverlayPanel } from 'primereact/overlaypanel';
import { Badge } from 'primereact/badge';
import { ScrollPanel } from 'primereact/scrollpanel';
import { useWebSocketData, Alert, TradingSignal, TrainingProgress } from './WebSocketDataProvider';
import './NotificationPanel.css';

interface NotificationItem {
  id: string;
  type: 'analysis' | 'training' | 'alert' | 'signal' | 'system';
  title: string;
  message: string;
  timestamp: Date;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  icon: string;
  read: boolean;
  data?: any;
}

const NotificationPanel: React.FC = () => {
  const overlayPanelRef = useRef<OverlayPanel>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readNotifications, setReadNotifications] = useState<Set<string>>(new Set());
  
  const {
    alerts,
    tradingSignals,
    trainingProgress,
    analysisStatus,
    clearAlerts
  } = useWebSocketData();

  // Преобразуем данные из WebSocket в уведомления
  useEffect(() => {
    const newNotifications: NotificationItem[] = [];

    // Обработка алертов
    alerts.forEach((alert: Alert) => {
      // Показываем только важные алерты (medium и выше)
      if (alert.severity === 'high' || alert.severity === 'critical' || alert.severity === 'medium') {
        newNotifications.push({
          id: alert.id,
          type: 'alert',
          title: alert.title || getAlertTitle(alert.type, alert.severity),
          message: alert.message,
          timestamp: new Date(alert.timestamp),
          severity: alert.severity,
          icon: getAlertIcon(alert.type, alert.severity),
          read: readNotifications.has(alert.id),
          data: alert
        });
      }
    });

    // Обработка статуса анализа
    if (analysisStatus) {
      if (analysisStatus.isAnalyzing) {
        // Показываем уведомление о начале анализа только если его еще нет
        const analysisStartId = `analysis_start_${analysisStatus.lastRunAt || Date.now()}`;
        if (!readNotifications.has(analysisStartId)) {
          newNotifications.push({
            id: analysisStartId,
            type: 'analysis',
            title: 'Анализ портфеля начат',
            message: 'Система начала анализ портфеля. Результаты будут доступны после завершения.',
            timestamp: new Date(),
            severity: 'medium',
            icon: 'pi pi-spin pi-spinner',
            read: false,
            data: analysisStatus
          });
        }
      } else if (analysisStatus.lastRunAt) {
        // Показываем уведомление о завершении анализа
        const analysisCompleteId = `analysis_complete_${analysisStatus.lastRunAt}`;
        newNotifications.push({
          id: analysisCompleteId,
          type: 'analysis',
          title: 'Анализ портфеля завершен',
          message: `Анализ завершен в ${new Date(analysisStatus.lastRunAt).toLocaleTimeString('ru-RU')}. Проверьте рекомендации.`,
          timestamp: new Date(analysisStatus.lastRunAt),
          severity: 'medium',
          icon: 'pi pi-check-circle',
          read: readNotifications.has(analysisCompleteId),
          data: analysisStatus
        });
      }
    }

    // Обработка прогресса обучения
    if (trainingProgress) {
      const progressPercent = trainingProgress.totalEpochs > 0
        ? Math.round((trainingProgress.currentEpoch / trainingProgress.totalEpochs) * 100)
        : 0;

      // Уведомление о начале обучения
      if (trainingProgress.currentEpoch === 1) {
        newNotifications.push({
          id: `training_start_${trainingProgress.modelType}_${trainingProgress.timestamp}`,
          type: 'training',
          title: `Обучение ${getModelTypeName(trainingProgress.modelType)} начато`,
          message: `Начато обучение модели ${trainingProgress.modelType}${trainingProgress.instrument ? ` для ${trainingProgress.instrument}` : ''}`,
          timestamp: new Date(trainingProgress.timestamp),
          severity: 'medium',
          icon: 'pi pi-play-circle',
          read: readNotifications.has(`training_start_${trainingProgress.modelType}_${trainingProgress.timestamp}`),
          data: trainingProgress
        });
      }

      // Уведомление о завершении обучения
      if (trainingProgress.currentEpoch === trainingProgress.totalEpochs && trainingProgress.totalEpochs > 0) {
        newNotifications.push({
          id: `training_complete_${trainingProgress.modelType}_${trainingProgress.timestamp}`,
          type: 'training',
          title: `Обучение ${getModelTypeName(trainingProgress.modelType)} завершено`,
          message: `Обучение завершено. Точность: ${trainingProgress.accuracy ? (trainingProgress.accuracy * 100).toFixed(1) + '%' : 'N/A'}`,
          timestamp: new Date(trainingProgress.timestamp),
          severity: 'high',
          icon: 'pi pi-check-circle',
          read: readNotifications.has(`training_complete_${trainingProgress.modelType}_${trainingProgress.timestamp}`),
          data: trainingProgress
        });
      }
    }

    // Обработка важных торговых сигналов (высокая уверенность)
    tradingSignals.forEach((signal: TradingSignal) => {
      if (signal.confidence > 0.75) {
        newNotifications.push({
          id: `signal_${signal.figi}_${signal.timestamp}`,
          type: 'signal',
          title: `Новый торговый сигнал: ${signal.signalType}`,
          message: `${signal.ticker} (${signal.name}): ${signal.signalType} с уверенностью ${(signal.confidence * 100).toFixed(1)}%`,
          timestamp: new Date(signal.timestamp),
          severity: signal.confidence > 0.85 ? 'high' : 'medium',
          icon: signal.signalType === 'BUY' ? 'pi pi-arrow-up' : 'pi pi-arrow-down',
          read: readNotifications.has(`signal_${signal.figi}_${signal.timestamp}`),
          data: signal
        });
      }
    });

    // Сортируем по времени (новые сверху)
    newNotifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    setNotifications(newNotifications);
  }, [alerts, tradingSignals, trainingProgress, analysisStatus, readNotifications]);

  // Подсчет непрочитанных уведомлений
  const unreadCount = notifications.filter(n => !n.read).length;

  const togglePanel = (event: React.MouseEvent) => {
    if (isOpen) {
      overlayPanelRef.current?.hide();
      setIsOpen(false);
    } else {
      overlayPanelRef.current?.toggle(event);
      setIsOpen(true);
    }
  };

  const markAsRead = (id: string) => {
    setReadNotifications(prev => new Set([...prev, id]));
  };

  const markAllAsRead = () => {
    const allIds = notifications.map(n => n.id);
    setReadNotifications(prev => new Set([...prev, ...allIds]));
  };

  const clearAll = () => {
    setReadNotifications(new Set());
    clearAlerts();
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'только что';
    if (minutes < 60) return `${minutes} мин назад`;
    if (hours < 24) return `${hours} ч назад`;
    if (days < 7) return `${days} дн назад`;
    return date.toLocaleDateString('ru-RU');
  };

  const getSeverityClass = (severity?: string) => {
    switch (severity) {
      case 'critical': return 'notification-critical';
      case 'high': return 'notification-high';
      case 'medium': return 'notification-medium';
      case 'low': return 'notification-low';
      default: return '';
    }
  };

  return (
    <>
      <Button
        icon="pi pi-bell"
        className="p-button-rounded p-button-text p-button-sm notification-button"
        onClick={togglePanel}
        badge={unreadCount > 0 ? unreadCount.toString() : undefined}
        tooltip="Уведомления"
        tooltipOptions={{ position: 'bottom' }}
      />
      <OverlayPanel
        ref={overlayPanelRef}
        className="notification-panel"
        style={{ width: '400px', maxHeight: '600px' }}
        onHide={() => setIsOpen(false)}
      >
        <div className="notification-panel-header">
          <div className="flex align-items-center justify-content-between">
            <h3 className="m-0">Уведомления</h3>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <Button
                  label="Прочитать все"
                  className="p-button-text p-button-sm"
                  onClick={markAllAsRead}
                />
              )}
              <Button
                label="Очистить"
                className="p-button-text p-button-sm"
                onClick={clearAll}
              />
            </div>
          </div>
          {unreadCount > 0 && (
            <div className="text-sm text-500 mt-2">
              {unreadCount} непрочитанных
            </div>
          )}
        </div>

        <ScrollPanel style={{ width: '100%', height: '500px' }}>
          {notifications.length === 0 ? (
            <div className="text-center p-4 text-500">
              <i className="pi pi-bell-slash text-4xl mb-3"></i>
              <p>Нет уведомлений</p>
            </div>
          ) : (
            <div className="notification-list">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${getSeverityClass(notification.severity)} ${notification.read ? 'read' : ''}`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex gap-3">
                    <div className={`notification-icon ${getSeverityClass(notification.severity)}`}>
                      <i className={notification.icon}></i>
                    </div>
                    <div className="flex-1">
                      <div className="flex align-items-center justify-content-between mb-1">
                        <h4 className="m-0 text-sm font-semibold">{notification.title}</h4>
                        {!notification.read && (
                          <Badge value="" severity="info" className="notification-dot" />
                        )}
                      </div>
                      <p className="m-0 text-sm text-600 mb-2">{notification.message}</p>
                      <div className="flex align-items-center justify-content-between">
                        <small className="text-500">{formatTime(notification.timestamp)}</small>
                        <span className={`notification-type-badge ${notification.type}`}>
                          {getTypeLabel(notification.type)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollPanel>
      </OverlayPanel>
    </>
  );
};

// Вспомогательные функции
function getAlertTitle(type: string, severity: string): string {
  const titles: Record<string, Record<string, string>> = {
    error: {
      critical: 'Критическая ошибка',
      high: 'Ошибка',
      medium: 'Предупреждение',
      low: 'Информация'
    },
    warning: {
      critical: 'Критическое предупреждение',
      high: 'Важное предупреждение',
      medium: 'Предупреждение',
      low: 'Уведомление'
    },
    success: {
      critical: 'Успешное завершение',
      high: 'Успешно',
      medium: 'Завершено',
      low: 'Информация'
    },
    info: {
      critical: 'Важная информация',
      high: 'Информация',
      medium: 'Уведомление',
      low: 'Информация'
    }
  };
  return titles[type]?.[severity] || 'Уведомление';
}

function getAlertIcon(type: string, severity: string): string {
  if (type === 'error' || severity === 'critical') return 'pi pi-exclamation-triangle';
  if (type === 'warning') return 'pi pi-exclamation-circle';
  if (type === 'success') return 'pi pi-check-circle';
  return 'pi pi-info-circle';
}

function getModelTypeName(type: string): string {
  const names: Record<string, string> = {
    neural_network: 'Традиционной нейросети',
    ensemble: 'Ансамбля моделей',
    meta_learning: 'Meta-Learning',
    reinforcement_learning: 'RL агента'
  };
  return names[type] || type;
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    analysis: 'Анализ',
    training: 'Обучение',
    alert: 'Алерт',
    signal: 'Сигнал',
    system: 'Система'
  };
  return labels[type] || type;
}

export default NotificationPanel;

