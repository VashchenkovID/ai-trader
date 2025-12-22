import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Skeleton } from 'primereact/skeleton';
import { Tooltip } from 'primereact/tooltip';
import { apiService } from '../../services/apiService';

interface AdvancedMetricsPreviewProps {
  className?: string;
}

interface AdvancedMetricsData {
  sortinoRatio?: number | null;
  calmarRatio?: number | null;
  maxDrawdown?: number | null;
}

const formatNumber = (value: number | null | undefined, decimals: number = 2) => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return value.toFixed(decimals);
};

const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `${value.toFixed(2)}%`;
};

const getMetricColor = (value: number | null | undefined, thresholds: { good: number; excellent: number }) => {
  if (value === null || value === undefined || isNaN(value)) return 'text-500';
  if (value >= thresholds.excellent) return 'text-green-500';
  if (value >= thresholds.good) return 'text-yellow-500';
  return 'text-red-500';
};

export const AdvancedMetricsPreview: React.FC<AdvancedMetricsPreviewProps> = ({ className = '' }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<AdvancedMetricsData>({});

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        setLoading(true);
        // Загружаем продвинутые метрики
        const [sortinoResponse, calmarResponse, summaryResponse] = await Promise.allSettled([
          apiService.getSortinoRatio('daily', 30),
          apiService.getCalmarRatio('daily', 30),
          apiService.getAdvancedMetricsSummary('daily', 30)
        ]);

        const newMetrics: AdvancedMetricsData = {};

        if (sortinoResponse.status === 'fulfilled' && sortinoResponse.value.success) {
          const sortinoValue = sortinoResponse.value.data?.sortinoRatio;
          // Проверяем что значение не 0 и не null
          if (sortinoValue != null && sortinoValue !== 0 && !isNaN(sortinoValue) && isFinite(sortinoValue)) {
            newMetrics.sortinoRatio = sortinoValue;
          } else {
            console.warn('Sortino Ratio is 0 or invalid, no data available');
            newMetrics.sortinoRatio = null;
          }
        }

        if (calmarResponse.status === 'fulfilled' && calmarResponse.value.success) {
          const calmarValue = calmarResponse.value.data?.calmarRatio;
          // Проверяем что значение не 0 и не null
          if (calmarValue != null && calmarValue !== 0 && !isNaN(calmarValue) && isFinite(calmarValue)) {
            newMetrics.calmarRatio = calmarValue;
          } else {
            console.warn('Calmar Ratio is 0 or invalid, no data available');
            newMetrics.calmarRatio = null;
          }
        }

        if (summaryResponse.status === 'fulfilled' && summaryResponse.value.success) {
          const summary = summaryResponse.value.data;
          const maxDrawdownValue = summary?.baseMetrics?.maxDrawdown || summary?.maxDrawdown;
          // Проверяем что значение не 0 и не null
          if (maxDrawdownValue != null && maxDrawdownValue !== 0 && !isNaN(maxDrawdownValue)) {
            newMetrics.maxDrawdown = maxDrawdownValue;
          } else {
            console.warn('Max Drawdown is 0 or invalid, no data available');
            newMetrics.maxDrawdown = null;
          }
        }

        setMetrics(newMetrics);
      } catch (error) {
        console.error('Error loading advanced metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMetrics();
  }, []);

  return (
    <Card 
      title={<span><i className="pi pi-chart-bar mr-2"></i>Продвинутые метрики</span>}
      className={`h-full ${className}`}
      footer={
        <Button
          label="Подробные метрики"
          icon="pi pi-arrow-right"
          className="p-button-text w-full"
          onClick={() => navigate('/advanced-metrics')}
        />
      }
    >
      {loading ? (
        <div className="flex flex-column gap-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="flex align-items-center justify-content-between">
              <Skeleton width="40%" height="1.5rem" />
              <Skeleton width="30%" height="2rem" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-column gap-3">
          {/* Sortino Ratio */}
          <div className="flex align-items-center justify-content-between p-2 border-round surface-100">
            <div className="flex align-items-center gap-2">
              <i className="pi pi-chart-line text-primary" />
              <div>
                <div className="text-sm font-medium">Sortino Ratio</div>
                <Tooltip target=".sortino-tooltip" />
                <small className="text-500 sortino-tooltip" data-pr-tooltip="Риск-скорректированная доходность (учитывает только негативную волатильность)">
                  Риск-скорректированная доходность
                </small>
              </div>
            </div>
            <div className={`text-xl font-bold ${getMetricColor(metrics.sortinoRatio, { good: 1.0, excellent: 1.5 })}`}>
              {formatNumber(metrics.sortinoRatio)}
            </div>
          </div>

          {/* Calmar Ratio */}
          <div className="flex align-items-center justify-content-between p-2 border-round surface-100">
            <div className="flex align-items-center gap-2">
              <i className="pi pi-chart-bar text-primary" />
              <div>
                <div className="text-sm font-medium">Calmar Ratio</div>
                <Tooltip target=".calmar-tooltip" />
                <small className="text-500 calmar-tooltip" data-pr-tooltip="Отношение доходности к максимальной просадке">
                  Доходность / Макс. просадка
                </small>
              </div>
            </div>
            <div className={`text-xl font-bold ${getMetricColor(metrics.calmarRatio, { good: 0.5, excellent: 1.0 })}`}>
              {formatNumber(metrics.calmarRatio)}
            </div>
          </div>

          {/* Max Drawdown */}
          <div className="flex align-items-center justify-content-between p-2 border-round surface-100">
            <div className="flex align-items-center gap-2">
              <i className="pi pi-arrow-down text-primary" />
              <div>
                <div className="text-sm font-medium">Макс. просадка</div>
                <Tooltip target=".drawdown-tooltip" />
                <small className="text-500 drawdown-tooltip" data-pr-tooltip="Максимальное падение стоимости портфеля от пика">
                  Максимальное падение
                </small>
              </div>
            </div>
            <div className={`text-xl font-bold ${metrics.maxDrawdown && metrics.maxDrawdown < -10 ? 'text-red-500' : 'text-yellow-500'}`}>
              {formatPercent(metrics.maxDrawdown)}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default AdvancedMetricsPreview;
