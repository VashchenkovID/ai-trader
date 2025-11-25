import React from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { PerformanceMetrics, SystemResources } from '../WebSocketDataProvider';

interface QuickLinksAndSystemCardProps {
  performanceMetrics: PerformanceMetrics | null;
  systemResources: SystemResources | null;
}

export const QuickLinksAndSystemCard: React.FC<QuickLinksAndSystemCardProps> = ({
  performanceMetrics,
  systemResources,
}) => {
  const uptimeMinutes =
    performanceMetrics?.system?.uptime != null
      ? Math.round(performanceMetrics.system.uptime / 60)
      : systemResources?.uptime != null
      ? Math.round(systemResources.uptime / 60)
      : null;

  const heapUsedMb =
    performanceMetrics?.system?.memory?.heapUsed != null
      ? (performanceMetrics.system.memory.heapUsed / (1024 * 1024)).toFixed(1)
      : systemResources?.memory?.usage != null
      ? (systemResources.memory.usage / (1024 * 1024)).toFixed(1)
      : null;

  const cacheSize =
    performanceMetrics?.system?.cacheSize != null
      ? performanceMetrics.system.cacheSize
      : null;

  return (
    <Card title="🚀 Быстрые ссылки и система" className="h-full">
      <div className="grid">
        {/* Быстрые ссылки */}
        <div className="col-12 md:col-8">
          <div className="text-600 mb-3">📋 Быстрые переходы</div>
          <div className="grid">
            <div className="col-6 md:col-3">
              <Button
                icon="pi pi-cog"
                label="Настройки"
                className="p-button-outlined w-full"
                onClick={() => (window.location.href = '/settings')}
              />
            </div>
            <div className="col-6 md:col-3">
              <Button
                icon="pi pi-brain"
                label="Нейросети"
                className="p-button-outlined w-full"
                onClick={() => (window.location.href = '/neural-networks')}
              />
            </div>
            <div className="col-6 md:col-3">
              <Button
                icon="pi pi-chart-line"
                label="Аналитика"
                className="p-button-outlined w-full"
                onClick={() => (window.location.href = '/metrics')}
              />
            </div>
            <div className="col-6 md:col-3">
              <Button
                icon="pi pi-shopping-cart"
                label="Торговые заявки"
                className="p-button-outlined w-full"
                onClick={() => (window.location.href = '/trading-requests')}
              />
            </div>
          </div>
        </div>

        {/* Системная информация (пока статичная-заглушка, позже можно связать с реальными метриками) */}
        <div className="col-12 md:col-4">
          <div className="p-3 surface-100 border-round h-full">
            <div className="text-600 mb-3">💻 Система</div>
            <div className="grid">
              <div className="col-6">
                <div className="text-xs text-500 mb-1">Время работы</div>
                <div className="font-medium text-sm">
                  {uptimeMinutes != null ? `${uptimeMinutes} мин` : '—'}
                </div>
              </div>
              <div className="col-6">
                <div className="text-xs text-500 mb-1">Память</div>
                <div className="font-medium text-sm">
                  {heapUsedMb != null ? `${heapUsedMb} MB` : '—'}
                </div>
              </div>
              <div className="col-6">
                <div className="text-xs text-500 mb-1">Кэш</div>
                <div className="font-medium text-sm">
                  {cacheSize != null ? `${cacheSize} записей` : '—'}
                </div>
              </div>
              <div className="col-6">
                <div className="text-xs text-500 mb-1">Статус</div>
                <Badge value="Работает" severity="success" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default QuickLinksAndSystemCard;


