import React from 'react';
import { Card } from 'primereact/card';
import { Skeleton } from 'primereact/skeleton';
import { Badge } from 'primereact/badge';
import { Button } from 'primereact/button';
import { apiService } from '../../services/apiService';
import { CacheStatus } from '../WebSocketDataProvider';

interface CacheStatusCardProps {
  cacheStatus: CacheStatus | null;
}

export const CacheStatusCard: React.FC<CacheStatusCardProps> = ({ cacheStatus }) => {
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
    <Card title="💾 Статус кеша" className="h-full">
      {!cacheStatus ? (
        <div className="grid">
          {[1, 2, 3].map((item) => (
            <div key={item} className="col-12">
              <div className="text-center p-3 border-round surface-100">
                <Skeleton width="100%" height="1.5rem" className="mb-2" />
                <Skeleton width="60%" height="1rem" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid">
          <div className="col-12">
            <div className="text-center p-3 border-round surface-100">
              <div className="text-900 font-medium mb-2">🕐 Последнее обновление</div>
              <div className="text-600 text-sm">
                {cacheStatus.lastUpdate
                  ? new Date(cacheStatus.lastUpdate).toLocaleString('ru-RU')
                  : 'Никогда'}
              </div>
            </div>
          </div>
          <div className="col-6">
            <div className="text-center p-3 border-round surface-100">
              <div className="text-900 font-medium mb-2">⏱️ Время с обновления</div>
              <div className="text-600 text-sm">
                {cacheStatus.timeSinceLastUpdate
                  ? `${cacheStatus.timeSinceLastUpdate} мин`
                  : 'Неизвестно'}
              </div>
            </div>
          </div>
          <div className="col-6">
            <div className="text-center p-3 border-round surface-100">
              <div className="text-900 font-medium mb-2">🔄 Интервал обновления</div>
              <div className="text-600 text-sm">{cacheStatus.updateInterval} мин</div>
            </div>
          </div>
          <div className="col-6">
            <div className="text-center p-3 border-round surface-100">
              <div className="text-900 font-medium mb-2">⏰ Следующее обновление</div>
              <div className="text-600 text-sm">
                {cacheStatus.nextUpdateIn
                  ? `через ${cacheStatus.nextUpdateIn} мин`
                  : 'Неизвестно'}
              </div>
            </div>
          </div>
          <div className="col-6">
            <div className="text-center p-3 border-round surface-100">
              <div className="text-900 font-medium mb-2">📊 Статус</div>
              {cacheStatus.needsUpdate ? (
                <Badge value="Требует обновления" severity="warning" />
              ) : (
                <Badge value="Актуален" severity="success" />
              )}
            </div>
          </div>
          <div className="col-12">
            <div className="text-center p-3 border-round surface-100">
              <Button
                icon="pi pi-refresh"
                label="Обновить кеш"
                size="small"
                severity="info"
                className="w-full"
                onClick={handleRefreshCache}
              />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default CacheStatusCard;


