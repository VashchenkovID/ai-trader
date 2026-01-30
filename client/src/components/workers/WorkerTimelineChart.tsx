import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '../ui/Card/Card';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { Button } from '../ui/Button/Button';
import { Select } from '../ui/Select/Select';
import { Chart } from '../ui/Chart/Chart';
import { workerMonitoringApi, WorkerTimelineEvent } from '../../services/workerMonitoringApi';
import { translateWorkerType } from '../../utils/workerTypeTranslator';
import './WorkerTimelineChart.css';

interface WorkerTimelineChartProps {
  className?: string;
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'running':
      return '#10B981'; // Зеленый
    case 'paused':
      return '#F59E0B'; // Желтый
    case 'completed':
      return '#3B82F6'; // Синий
    case 'error':
      return '#EF4444'; // Красный
    default:
      return '#6B7280'; // Серый
  }
};

export const WorkerTimelineChart: React.FC<WorkerTimelineChartProps> = ({ className = '' }) => {
  const [timeline, setTimeline] = useState<WorkerTimelineEvent[]>([]);
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
    loadTimeline();
    
    // Автообновление каждые 10 секунд
    const interval = setInterval(loadTimeline, 10000);
    return () => clearInterval(interval);
  }, [period]);

  const loadTimeline = async () => {
    try {
      setError(null);
      const endDate = new Date();
      const startDate = new Date();
      
      switch (period) {
        case '1h':
          startDate.setHours(startDate.getHours() - 1);
          break;
        case '24h':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
      }

      const data = await workerMonitoringApi.getWorkerTimeline(startDate, endDate);
      setTimeline(data.timeline || []);
    } catch (err: any) {
      console.error('Error loading timeline:', err);
      setError(err.message || 'Ошибка загрузки временной линии');
    } finally {
      setLoading(false);
    }
  };

  // Группируем события по типам для графика
  const chartData = useMemo(() => {
    if (timeline.length === 0) {
      console.log('📊 WorkerTimelineChart: Нет данных для графика');
      return null;
    }

    console.log(`📊 WorkerTimelineChart: Обработка ${timeline.length} событий`);

    // Группируем по типам воркеров
    const types = Array.from(new Set(timeline.map(e => e.type)));
    console.log(`📊 WorkerTimelineChart: Найдено ${types.length} типов воркеров:`, types);

    // Создаем уникальные метки времени из всех событий
    const allLabels = Array.from(new Set(
      timeline.map(e => {
        const date = new Date(e.startTime);
        return date.toLocaleString('ru-RU', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      })
    )).sort();

    console.log(`📊 WorkerTimelineChart: Создано ${allLabels.length} меток времени`);

    // Создаем датасеты для каждого типа воркера
    const datasets = types.map(type => {
      const events = timeline.filter(e => e.type === type);
      const typeLabel = translateWorkerType(type);
      
      console.log(`📊 WorkerTimelineChart: Тип ${typeLabel}: ${events.length} событий`);

      // Создаем массив данных для каждой метки времени
      const data = allLabels.map(label => {
        // Находим событие этого типа, которое соответствует метке времени
        const event = events.find(e => {
          const eventLabel = new Date(e.startTime).toLocaleString('ru-RU', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          return eventLabel === label;
        });
        
        return event ? event.duration / 1000 / 60 : 0; // Длительность в минутах
      });

      return {
        label: typeLabel,
        data: data,
        backgroundColor: getStatusColor(events[0]?.status || 'running'),
        borderColor: getStatusColor(events[0]?.status || 'running'),
        borderWidth: 2,
      };
    });

    const result = {
      labels: allLabels,
      datasets: datasets
    };

    console.log(`📊 WorkerTimelineChart: Данные графика подготовлены:`, {
      labelsCount: allLabels.length,
      datasetsCount: datasets.length,
      totalDataPoints: datasets.reduce((sum, ds) => sum + ds.data.length, 0)
    });

    return result;
  }, [timeline]);

  const chartOptions = useMemo(() => ({
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
        callbacks: {
          label: function(context: any) {
            const minutes = context.parsed.y;
            const hours = Math.floor(minutes / 60);
            const mins = Math.round(minutes % 60);
            return `${context.dataset.label}: ${hours > 0 ? `${hours}ч ` : ''}${mins}м`;
          }
        }
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#FFFFFF',
          font: {
            size: 11,
          },
          maxRotation: 45,
          minRotation: 45,
        },
        grid: {
          color: 'var(--color-border-default)',
        },
        title: {
          display: true,
          text: 'Время',
          color: '#FFFFFF',
          font: {
            size: 12,
          },
        },
      },
      y: {
        ticks: {
          color: '#FFFFFF',
          font: {
            size: 11,
          },
          callback: function(value: any) {
            const minutes = value;
            const hours = Math.floor(minutes / 60);
            const mins = Math.round(minutes % 60);
            return hours > 0 ? `${hours}ч ${mins}м` : `${mins}м`;
          },
        },
        grid: {
          color: 'var(--color-border-default)',
        },
        title: {
          display: true,
          text: 'Длительность работы',
          color: '#FFFFFF',
          font: {
            size: 12,
          },
        },
      },
    },
  }), []);

  if (loading) {
    return (
      <div className={`worker-timeline-chart ${className}`}>
        <Card variant="glass">
          <Skeleton width="100%" height={400} />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`worker-timeline-chart ${className}`}>
        <Card variant="glass">
          <div className="error-message">
            <p>Ошибка загрузки: {error}</p>
            <Button onClick={loadTimeline} variant="primary">
              Повторить
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={`worker-timeline-chart ${className}`}>
      <Card variant="glass" className="timeline-card">
        <div className="timeline-header">
          <h3 className="timeline-title">График работы воркеров</h3>
          <div className="timeline-controls">
            <Select
              value={period}
              onChange={(e) => setPeriod(e.target.value as '1h' | '24h' | '7d' | '30d')}
              options={periodOptions}
              size="sm"
            />
            <Button onClick={loadTimeline} variant="secondary" size="sm">
              Обновить
            </Button>
          </div>
        </div>

        {chartData && timeline.length > 0 ? (
          <div className="timeline-chart-container">
            <Chart
              type="bar"
              data={chartData}
              options={chartOptions}
              height={400}
            />
          </div>
        ) : timeline.length === 0 ? (
          <div className="empty-state">
            <p>Нет данных за выбранный период</p>
          </div>
        ) : (
          <div className="empty-state">
            <p>Ошибка подготовки данных графика</p>
            <p style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '8px' }}>
              Событий: {timeline.length}, chartData: {chartData ? 'есть' : 'нет'}
            </p>
          </div>
        )}

        <div className="timeline-stats">
          <div className="stat-item">
            <span className="stat-label">Всего событий:</span>
            <span className="stat-value">{timeline.length}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Типов воркеров:</span>
            <span className="stat-value">
              {Array.from(new Set(timeline.map(e => e.type))).length}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Средняя длительность:</span>
            <span className="stat-value">
              {timeline.length > 0
                ? formatDuration(
                    timeline.reduce((sum, e) => sum + e.duration, 0) / timeline.length
                  )
                : '—'}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
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

export default WorkerTimelineChart;

