import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card/Card';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { Button } from '../ui/Button/Button';
import { Select } from '../ui/Select/Select';
import { Chart } from '../ui/Chart/Chart';
import { workerMonitoringApi, WorkerStats } from '../../services/workerMonitoringApi';
import { translateWorkerType } from '../../utils/workerTypeTranslator';
import './WorkerStatsPanel.css';

interface WorkerStatsPanelProps {
  className?: string;
}

const formatPercent = (value: number): string => {
  return `${value.toFixed(2)}%`;
};

const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}ч ${minutes % 60}м`;
  } else if (minutes > 0) {
    return `${minutes}м ${seconds % 60}с`;
  } else {
    return `${seconds}с`;
  }
};

export const WorkerStatsPanel: React.FC<WorkerStatsPanelProps> = ({ className = '' }) => {
  const [stats, setStats] = useState<WorkerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'1h' | '24h' | '7d' | '30d'>('24h');

  const periodOptions = [
    { value: '1h', label: '1 час' },
    { value: '24h', label: '24 часа' },
    { value: '7d', label: '7 дней' },
    { value: '30d', label: '30 дней' },
  ];

  useEffect(() => {
    loadStats();
    
    // Автообновление каждые 10 секунд
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, [period]);

  const loadStats = async () => {
    try {
      setError(null);
      const data = await workerMonitoringApi.getWorkerStats(period);
      setStats(data);
    } catch (err: any) {
      console.error('Error loading stats:', err);
      setError(err.message || 'Ошибка загрузки статистики');
    } finally {
      setLoading(false);
    }
  };

  // Данные для графика по типам
  const typeChartData = stats ? {
    labels: Object.keys(stats.active.byType).map(type => translateWorkerType(type)),
    datasets: [{
      label: 'Количество воркеров',
      data: Object.values(stats.active.byType),
      backgroundColor: [
        'rgba(59, 130, 246, 0.8)',
        'rgba(16, 185, 129, 0.8)',
        'rgba(245, 158, 11, 0.8)',
        'rgba(239, 68, 68, 0.8)',
        'rgba(139, 92, 246, 0.8)',
      ],
      borderColor: [
        '#3B82F6',
        '#10B981',
        '#F59E0B',
        '#EF4444',
        '#8B5CF6',
      ],
      borderWidth: 2,
    }]
  } : null;

  // Данные для графика по статусам
  const statusChartData = stats ? {
    labels: Object.keys(stats.active.byStatus),
    datasets: [{
      label: 'Количество воркеров',
      data: Object.values(stats.active.byStatus),
      backgroundColor: [
        'rgba(16, 185, 129, 0.8)', // running - зеленый
        'rgba(245, 158, 11, 0.8)', // paused - желтый
        'rgba(59, 130, 246, 0.8)', // completed - синий
        'rgba(239, 68, 68, 0.8)', // error - красный
        'rgba(107, 114, 128, 0.8)', // idle - серый
      ],
      borderColor: [
        '#10B981',
        '#F59E0B',
        '#3B82F6',
        '#EF4444',
        '#6B7280',
      ],
      borderWidth: 2,
    }]
  } : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#FFFFFF',
          padding: 15,
          usePointStyle: true,
          font: {
            size: 12,
            weight: '500' as const,
          },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(26, 26, 36, 0.95)',
        titleColor: '#FFFFFF',
        bodyColor: '#FFFFFF',
        borderColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#FFFFFF',
          font: {
            size: 11,
          },
        },
        grid: {
          color: 'var(--color-border-default)',
        },
      },
      y: {
        ticks: {
          color: '#FFFFFF',
          font: {
            size: 11,
          },
          beginAtZero: true,
        },
        grid: {
          color: 'var(--color-border-default)',
        },
      },
    },
  };

  if (loading) {
    return (
      <div className={`worker-stats-panel ${className}`}>
        <Card variant="glass">
          <Skeleton width="100%" height={400} />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`worker-stats-panel ${className}`}>
        <Card variant="glass">
          <div className="error-message">
            <p>Ошибка загрузки: {error}</p>
            <Button onClick={loadStats} variant="primary">
              Повторить
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className={`worker-stats-panel ${className}`}>
        <Card variant="glass">
          <div className="empty-state">
            <p>Нет данных статистики</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={`worker-stats-panel ${className}`}>
      <Card variant="glass" className="stats-card">
        <div className="stats-header">
          <h3 className="stats-title">Статистика воркеров</h3>
          <div className="stats-controls">
            <Select
              value={period}
              onChange={(e) => setPeriod(e.target.value as '1h' | '24h' | '7d' | '30d')}
              options={periodOptions}
              size="sm"
            />
            <Button onClick={loadStats} variant="secondary" size="sm">
              Обновить
            </Button>
          </div>
        </div>

        {/* Основные метрики */}
        <div className="stats-metrics">
          <div className="metric-card">
            <div className="metric-label">Активных воркеров</div>
            <div className="metric-value number-primary">{stats.active.total}</div>
            <div className="metric-description">Сейчас работают</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Завершено</div>
            <div className="metric-value number-text-primary">{stats.completed.total}</div>
            <div className="metric-description">За период</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Успешность</div>
            <div className={`metric-value ${stats.completed.successRate >= 80 ? 'number-positive' : stats.completed.successRate >= 50 ? 'number-warning' : 'number-negative'}`}>
              {formatPercent(stats.completed.successRate)}
            </div>
            <div className="metric-description">Успешных выполнений</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Средняя длительность</div>
            <div className="metric-value number-text-primary">
              {formatDuration(stats.completed.avgDuration)}
            </div>
            <div className="metric-description">Время выполнения</div>
          </div>
        </div>

        {/* Графики */}
        <div className="stats-charts">
          {typeChartData && Object.keys(stats.active.byType).length > 0 && (
            <div className="chart-container">
              <h4 className="chart-title">Распределение по типам</h4>
              <Chart
                type="doughnut"
                data={typeChartData}
                options={chartOptions}
                height={300}
              />
            </div>
          )}

          {statusChartData && Object.keys(stats.active.byStatus).length > 0 && (
            <div className="chart-container">
              <h4 className="chart-title">Распределение по статусам</h4>
              <Chart
                type="doughnut"
                data={statusChartData}
                options={chartOptions}
                height={300}
              />
            </div>
          )}
        </div>

        {/* Детальная статистика */}
        <div className="stats-details">
          <div className="details-section">
            <h4 className="details-title">По типам</h4>
            <div className="details-list">
              {Object.entries(stats.active.byType).map(([type, count]) => (
                <div key={type} className="detail-item">
                  <span className="detail-label">{translateWorkerType(type)}:</span>
                  <span className="detail-value">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="details-section">
            <h4 className="details-title">По статусам</h4>
            <div className="details-list">
              {Object.entries(stats.active.byStatus).map(([status, count]) => (
                <div key={status} className="detail-item">
                  <span className="detail-label">{status}:</span>
                  <span className="detail-value">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="details-section">
            <h4 className="details-title">Завершенные</h4>
            <div className="details-list">
              <div className="detail-item">
                <span className="detail-label">Успешных:</span>
                <span className="detail-value number-positive">{stats.completed.successful}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">С ошибками:</span>
                <span className="detail-value number-negative">{stats.completed.failed}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default WorkerStatsPanel;

