import React from 'react';
import { Card } from '../ui/Card/Card';
import { ProgressBar } from '../ui/ProgressBar/ProgressBar';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import './PerformanceMetricsCard.css';

interface PerformanceMetrics {
  responseTime: number;
  throughput: number;
  errorRate: number;
  cacheHitRate: number;
}

interface PerformanceMetricsCardProps {
  metrics: PerformanceMetrics | null;
}

const PerformanceMetricsCard: React.FC<PerformanceMetricsCardProps> = ({ metrics }) => {
  if (!metrics) {
    return (
      <Card variant="glass" header="📊 Метрики производительности" className="performance-metrics-card">
        <div className="performance-metrics-skeleton">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="performance-metrics-skeleton-item">
              <Skeleton variant="text" size="md" className="performance-metrics-skeleton-large" />
              <Skeleton variant="rectangular" size="sm" style={{ height: '8px', marginTop: '0.5rem' }} />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const getVariant = (value: number, thresholds: { good: number; warning: number }) => {
    if (value <= thresholds.good) return 'success';
    if (value <= thresholds.warning) return 'warning';
    return 'error';
  };

  return (
    <Card variant="glass" header="📊 Метрики производительности" className="performance-metrics-card">
      <div className="performance-metrics-content">
        <div className="performance-metrics-item">
          <div className="performance-metrics-label-row">
            <span className="performance-metrics-label">Время отклика</span>
            <span className="performance-metrics-value">{metrics.responseTime.toFixed(2)} мс</span>
          </div>
          <ProgressBar
            value={Math.min(metrics.responseTime / 10, 100)}
            variant={getVariant(metrics.responseTime, { good: 100, warning: 500 })}
            size="sm"
            showLabel={false}
          />
        </div>

        <div className="performance-metrics-item">
          <div className="performance-metrics-label-row">
            <span className="performance-metrics-label">Пропускная способность</span>
            <span className="performance-metrics-value">{metrics.throughput.toFixed(2)} req/s</span>
          </div>
          <ProgressBar
            value={Math.min(metrics.throughput / 10, 100)}
            variant={getVariant(metrics.throughput, { good: 50, warning: 20 })}
            size="sm"
            showLabel={false}
          />
        </div>

        <div className="performance-metrics-item">
          <div className="performance-metrics-label-row">
            <span className="performance-metrics-label">Частота ошибок</span>
            <span className="performance-metrics-value">{metrics.errorRate.toFixed(2)}%</span>
          </div>
          <ProgressBar
            value={metrics.errorRate}
            variant={getVariant(metrics.errorRate, { good: 1, warning: 5 })}
            size="sm"
            showLabel={false}
          />
        </div>

        <div className="performance-metrics-item">
          <div className="performance-metrics-label-row">
            <span className="performance-metrics-label">Cache Hit Rate</span>
            <span className="performance-metrics-value">{metrics.cacheHitRate.toFixed(2)}%</span>
          </div>
          <ProgressBar
            value={metrics.cacheHitRate}
            variant={getVariant(metrics.cacheHitRate, { good: 80, warning: 50 })}
            size="sm"
            showLabel={false}
          />
        </div>
      </div>
    </Card>
  );
};

export default PerformanceMetricsCard;

