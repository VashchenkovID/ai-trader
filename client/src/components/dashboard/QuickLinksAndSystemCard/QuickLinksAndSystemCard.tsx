import React from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { PerformanceMetrics, SystemResources } from '../../WebSocketDataProvider.tsx';
import './QuickLinksAndSystemCard.css';

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
    <Card title="🚀 Быстрые ссылки и система" className={`h-full quick-links-system-card`}>
      <div className="main-grid">
        {/* Быстрые ссылки */}
        <div className="links-col">
          <div className="links-section">
            <div className="links-label">📋 Быстрые переходы</div>
            <div className="links-grid">
              <div className="link-col">
                <Button
                  icon="pi pi-cog"
                  label="Настройки"
                  className="p-button-outlined link-button"
                  onClick={() => (window.location.href = '/settings')}
                />
              </div>
              <div className="link-col">
                <Button
                  icon="pi pi-brain"
                  label="Нейросети"
                  className="p-button-outlined link-button"
                  onClick={() => (window.location.href = '/neural-networks')}
                />
              </div>
              <div className="link-col">
                <Button
                  icon="pi pi-chart-line"
                  label="Аналитика"
                  className="p-button-outlined link-button"
                  onClick={() => (window.location.href = '/metrics')}
                />
              </div>
              <div className="link-col">
                <Button
                  icon="pi pi-shopping-cart"
                  label="Торговые заявки"
                  className="p-button-outlined link-button"
                  onClick={() => (window.location.href = '/trading-requests')}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Системная информация */}
        <div className="system-col">
          <div className="system-section">
            <div className="system-label">💻 Система</div>
            <div className="system-grid">
              <div className="system-col-item">
                <div className="system-item-label">Время работы</div>
                <div className="system-item-value">
                  {uptimeMinutes != null ? `${uptimeMinutes} мин` : '—'}
                </div>
              </div>
              <div className="system-col-item">
                <div className="system-item-label">Память</div>
                <div className="system-item-value">
                  {heapUsedMb != null ? `${heapUsedMb} MB` : '—'}
                </div>
              </div>
              <div className="system-col-item">
                <div className="system-item-label">Кэш</div>
                <div className="system-item-value">
                  {cacheSize != null ? `${cacheSize} записей` : '—'}
                </div>
              </div>
              <div className="system-col-item">
                <div className="system-item-label">Статус</div>
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


