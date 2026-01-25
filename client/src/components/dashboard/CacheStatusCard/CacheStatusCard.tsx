import React, { useEffect, useState } from 'react';
import { Card } from 'primereact/card';
import { Skeleton } from 'primereact/skeleton';
import { Badge } from 'primereact/badge';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { apiService } from '../../../services/apiService.ts';
import { CacheStatus } from '../../WebSocketDataProvider.tsx';
import { useWebSocketData } from '../../WebSocketDataProvider.tsx';
import './CacheStatusCard.css';

interface CacheStatusCardProps {
  cacheStatus: CacheStatus | null;
}

export const CacheStatusCard: React.FC<CacheStatusCardProps> = ({ cacheStatus }) => {
  // Пытаемся получить данные о cacheUpdate из WebSocket, но делаем это опционально
  // чтобы не падать, если провайдер недоступен
  let cacheUpdateData: any = null;
  try {
    const wsData = useWebSocketData();
    // Проверяем наличие cacheUpdate в данных (может быть не экспортировано в типе)
    cacheUpdateData = (wsData as any)?.cacheUpdate || null;
  } catch (error) {
    // Если провайдер недоступен, просто игнорируем - компонент будет работать без WebSocket обновлений
    console.debug('WebSocket data provider not available for cache updates:', error);
  }

  const [cacheUpdateStatus, setCacheUpdateStatus] = useState<{
    status: 'started' | 'completed' | 'failed' | null;
    message?: string;
    timestamp?: string;
    duration?: number;
    totalUpdated?: number;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (cacheUpdateData) {
      setCacheUpdateStatus({
        status: cacheUpdateData.status,
        message: cacheUpdateData.message,
        timestamp: cacheUpdateData.timestamp,
        duration: cacheUpdateData.duration,
        totalUpdated: cacheUpdateData.totalUpdated,
        error: cacheUpdateData.error
      });
      
      // Автоматически скрываем сообщение через 10 секунд после завершения
      if (cacheUpdateData.status === 'completed' || cacheUpdateData.status === 'failed') {
        setTimeout(() => {
          setCacheUpdateStatus(null);
        }, 10000);
      }
    }
  }, [cacheUpdateData]);

  const handleRefreshCache = async () => {
    try {
      await apiService.refreshCache();
      alert('Кеш обновлен!');
    } catch (e) {
      console.error('Cache refresh failed:', e);
      alert('Ошибка обновления кеша');
    }
  };

  return (
    <Card title="💾 Статус кеша" className={`h-full cache-status-card`}>
      {cacheUpdateStatus && (
        <div style={{ marginBottom: 'var(--spacing-3)' }}>
          {cacheUpdateStatus.status === 'started' && (
            <Message severity="info" text={`🔄 Обновление кеша началось: ${cacheUpdateStatus.message || ''}`} />
          )}
          {cacheUpdateStatus.status === 'completed' && (
            <Message 
              severity="success" 
              text={`✅ Обновление кеша завершено: ${cacheUpdateStatus.message || ''}${cacheUpdateStatus.duration ? ` (${Math.round(cacheUpdateStatus.duration / 1000)}с)` : ''}${cacheUpdateStatus.totalUpdated ? ` | Обновлено: ${cacheUpdateStatus.totalUpdated}` : ''}`} 
            />
          )}
          {cacheUpdateStatus.status === 'failed' && (
            <Message 
              severity="error" 
              text={`❌ Ошибка обновления кеша: ${cacheUpdateStatus.error || cacheUpdateStatus.message || 'Неизвестная ошибка'}`} 
            />
          )}
        </div>
      )}
      {!cacheStatus ? (
        <div className="skeleton-grid">
          {[1, 2, 3].map((item) => (
            <div key={item} className="skeleton-col">
              <div className="skeleton-wrapper">
                <Skeleton width="100%" height="1.5rem" style={{ marginBottom: 'var(--spacing-2)' }} />
                <Skeleton width="60%" height="1rem" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="status-grid">
          <div className="status-col-full">
            <div className="status-item">
              <div className="status-label">🕐 Последнее обновление</div>
              <div className="status-value">
                {cacheStatus.lastUpdate
                  ? new Date(cacheStatus.lastUpdate).toLocaleString('ru-RU')
                  : 'Никогда'}
              </div>
            </div>
          </div>
          <div className="status-col-half">
            <div className="status-item">
              <div className="status-label">⏱️ Время с обновления</div>
              <div className="status-value">
                {cacheStatus.timeSinceLastUpdate
                  ? `${cacheStatus.timeSinceLastUpdate} мин`
                  : 'Неизвестно'}
              </div>
            </div>
          </div>
          <div className="status-col-half">
            <div className="status-item">
              <div className="status-label">🔄 Интервал обновления</div>
              <div className="status-value">{cacheStatus.updateInterval} мин</div>
            </div>
          </div>
          <div className="status-col-half">
            <div className="status-item">
              <div className="status-label">⏰ Следующее обновление</div>
              <div className="status-value">
                {cacheStatus.nextUpdateIn
                  ? `через ${cacheStatus.nextUpdateIn} мин`
                  : 'Неизвестно'}
              </div>
            </div>
          </div>
          <div className="status-col-half">
            <div className="status-item">
              <div className="status-label">📊 Статус</div>
              {cacheStatus.needsUpdate ? (
                <Badge value="Требует обновления" severity="warning" />
              ) : (
                <Badge value="Актуален" severity="success" />
              )}
            </div>
          </div>
          <div className="status-col-full">
            <div className="actions-container">
              <Button
                icon="pi pi-refresh"
                label="Обновить кеш"
                size="small"
                severity="info"
                className="action-button"
                onClick={handleRefreshCache}
                tooltip="Инкрементальное обновление (свечи за день, сигналы за день)"
                tooltipOptions={{ position: 'top' }}
              />
              <Button
                icon="pi pi-download"
                label="Полное обновление"
                size="small"
                severity="warning"
                className="action-button"
                onClick={async () => {
                  if (confirm('Запустить полное обновление кеша? Это может занять много времени.\n\n• Инструменты - обновление списка\n• Свечи - за 2 года на каждый инструмент\n• Сигналы - 1000 сигналов на каждый инструмент')) {
                    try {
                      await apiService.fullRefreshCache();
                      alert('Полное обновление кеша запущено!');
                    } catch (e) {
                      console.error('Full cache refresh failed:', e);
                      alert('Ошибка запуска полного обновления кеша');
                    }
                  }
                }}
                tooltip="Полное обновление (инструменты, свечи за 2 года, сигналы 1000)"
                tooltipOptions={{ position: 'top' }}
              />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default CacheStatusCard;


