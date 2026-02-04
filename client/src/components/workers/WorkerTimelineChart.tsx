import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '../ui/Card/Card';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { Button } from '../ui/Button/Button';
import { Select } from '../ui/Select/Select';
import { Chart } from '../ui/Chart/Chart';
import { workerMonitoringApi, WorkerTimelineEvent } from '../../services/workerMonitoringApi';
import './WorkerTimelineChart.css';

interface WorkerTimelineChartProps {
  className?: string;
}

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
      const timelineData = data.timeline || [];
      
      // Проверяем и нормализуем данные
      const normalizedTimeline = timelineData.map(event => ({
        ...event,
        duration: typeof event.duration === 'number' ? event.duration : parseInt(event.duration) || 0,
        startTime: event.startTime || (event as any)?.start_time || new Date().toISOString(),
        type: event.type || 'unknown'
      }));
      
      console.log('📊 WorkerTimelineChart: Получены данные:', {
        count: normalizedTimeline.length,
        sample: normalizedTimeline[0],
        durations: normalizedTimeline.map(e => ({ type: e.type, duration: e.duration }))
      });
      
      setTimeline(normalizedTimeline);
    } catch (err: any) {
      console.error('Error loading timeline:', err);
      setError(err.message || 'Ошибка загрузки временной линии');
    } finally {
      setLoading(false);
    }
  };

  // Группируем события для более информативных графиков
  const chartData = useMemo(() => {
    if (timeline.length === 0) {
      return null;
    }

    // Функция для нормализации даты в строку
    const formatTimeLabel = (date: Date): string => {
      const month = date.toLocaleString('ru-RU', { month: 'short' });
      const day = date.getDate();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day} ${month}, ${hours}:${minutes}`;
    };

    // Создаем временные интервалы (группируем по часам для больших периодов, по минутам для малых)
    const intervalMinutes = period === '1h' ? 5 : period === '24h' ? 30 : period === '7d' ? 4 * 60 : 24 * 60;
    
    // Создаем метки времени с интервалами
    const startDate = new Date(Math.min(...timeline.map(e => new Date(e.startTime).getTime())));
    const endDate = new Date(Math.max(...timeline.map(e => {
      const end = e.endTime ? new Date(e.endTime) : new Date(e.startTime);
      return end.getTime();
    })));
    
    // Создаем массив временных точек
    const timePoints: Date[] = [];
    const currentTime = new Date(startDate);
    while (currentTime <= endDate) {
      timePoints.push(new Date(currentTime));
      currentTime.setMinutes(currentTime.getMinutes() + intervalMinutes);
    }
    
    const allLabels = timePoints.map(t => formatTimeLabel(t));

    // График 1: Количество активных воркеров по времени
    const activeWorkersData = timePoints.map((labelTime) => {
      const intervalEnd = new Date(labelTime.getTime() + intervalMinutes * 60 * 1000);
      
      // Считаем воркеры, которые были активны в этом интервале
      const activeInInterval = timeline.filter(e => {
        const start = new Date(e.startTime);
        const end = e.endTime ? new Date(e.endTime) : new Date();
        return start <= intervalEnd && end >= labelTime;
      }).length;
      
      return activeInInterval;
    });

    // График 2: Успешные vs неуспешные задачи
    const successfulData = timePoints.map((labelTime) => {
      const intervalEnd = new Date(labelTime.getTime() + intervalMinutes * 60 * 1000);
      
      const completed = timeline.filter(e => {
        const start = new Date(e.startTime);
        return start >= labelTime && start < intervalEnd && e.status === 'completed';
      }).length;
      
      return completed;
    });

    const failedData = timePoints.map((labelTime) => {
      const intervalEnd = new Date(labelTime.getTime() + intervalMinutes * 60 * 1000);
      
      const failed = timeline.filter(e => {
        const start = new Date(e.startTime);
        return start >= labelTime && start < intervalEnd && e.status === 'error';
      }).length;
      
      return failed;
    });

    // График 3: Средняя длительность выполнения
    const avgDurationData = timePoints.map((labelTime) => {
      const intervalEnd = new Date(labelTime.getTime() + intervalMinutes * 60 * 1000);
      
      const eventsInInterval = timeline.filter(e => {
        const start = new Date(e.startTime);
        return start >= labelTime && start < intervalEnd;
      });
      
      if (eventsInInterval.length === 0) return 0;
      
      const avgDuration = eventsInInterval.reduce((sum, e) => sum + e.duration, 0) / eventsInInterval.length;
      return avgDuration / 1000 / 60; // В минутах
    });

    return {
      labels: allLabels,
      datasets: [
        {
          label: 'Активных воркеров',
          data: activeWorkersData,
          backgroundColor: 'rgba(59, 130, 246, 0.6)',
          borderColor: '#3B82F6',
          borderWidth: 2,
          yAxisID: 'y',
        },
        {
          label: 'Успешных задач',
          data: successfulData,
          backgroundColor: 'rgba(16, 185, 129, 0.6)',
          borderColor: '#10B981',
          borderWidth: 2,
          yAxisID: 'y1',
        },
        {
          label: 'Неудачных задач',
          data: failedData,
          backgroundColor: 'rgba(239, 68, 68, 0.6)',
          borderColor: '#EF4444',
          borderWidth: 2,
          yAxisID: 'y1',
        },
        {
          label: 'Средняя длительность (мин)',
          data: avgDurationData,
          backgroundColor: 'rgba(245, 158, 11, 0.6)',
          borderColor: '#F59E0B',
          borderWidth: 2,
          type: 'line' as const,
          yAxisID: 'y2',
        },
      ]
    };
  }, [timeline, period]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
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
            const value = context.parsed.y;
            const label = context.dataset.label;
            
            if (label.includes('длительность')) {
              const minutes = Math.round(value);
              const hours = Math.floor(minutes / 60);
              const mins = minutes % 60;
              return `${label}: ${hours > 0 ? `${hours}ч ` : ''}${mins}м`;
            } else if (label.includes('воркеров')) {
              return `${label}: ${value}`;
            } else {
              return `${label}: ${value} задач`;
            }
          }
        }
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#FFFFFF',
          font: {
            size: 10,
          },
          maxRotation: 45,
          minRotation: 45,
          maxTicksLimit: 20,
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
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        ticks: {
          color: '#FFFFFF',
          font: {
            size: 11,
          },
          stepSize: 1,
        },
        grid: {
          color: 'var(--color-border-default)',
        },
        title: {
          display: true,
          text: 'Количество активных воркеров',
          color: '#FFFFFF',
          font: {
            size: 12,
          },
        },
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        ticks: {
          color: '#FFFFFF',
          font: {
            size: 11,
          },
          stepSize: 1,
        },
        grid: {
          drawOnChartArea: false,
        },
        title: {
          display: true,
          text: 'Количество задач',
          color: '#FFFFFF',
          font: {
            size: 12,
          },
        },
      },
      y2: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        ticks: {
          color: '#FFFFFF',
          font: {
            size: 11,
          },
          callback: function(value: any) {
            const minutes = Math.round(value);
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return hours > 0 ? `${hours}ч ${mins}м` : `${mins}м`;
          },
        },
        grid: {
          drawOnChartArea: false,
        },
        title: {
          display: true,
          text: 'Средняя длительность (мин)',
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
          <>
            <div className="timeline-chart-container">
              <Chart
                type="bar"
                data={chartData}
                options={chartOptions}
                height={450}
              />
            </div>
            
            {/* Сводная статистика */}
            <div className="timeline-summary">
              <div className="summary-section">
                <h4 className="summary-title">Сводная статистика</h4>
                <div className="summary-grid">
                  <div className="summary-item">
                    <span className="summary-label">Всего задач:</span>
                    <span className="summary-value">{timeline.length}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Успешных:</span>
                    <span className="summary-value success">
                      {timeline.filter(e => e.status === 'completed').length}
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">С ошибками:</span>
                    <span className="summary-value error">
                      {timeline.filter(e => e.status === 'error').length}
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Успешность:</span>
                    <span className="summary-value">
                      {timeline.length > 0
                        ? ((timeline.filter(e => e.status === 'completed').length / timeline.length) * 100).toFixed(1)
                        : '0'}%
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="summary-section">
                <h4 className="summary-title">Производительность</h4>
                <div className="summary-grid">
                  <div className="summary-item">
                    <span className="summary-label">Средняя длительность:</span>
                    <span className="summary-value">
                      {timeline.length > 0
                        ? formatDuration(
                            timeline.reduce((sum, e) => sum + e.duration, 0) / timeline.length
                          )
                        : '—'}
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Максимальная длительность:</span>
                    <span className="summary-value">
                      {timeline.length > 0
                        ? formatDuration(Math.max(...timeline.map(e => e.duration)))
                        : '—'}
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Минимальная длительность:</span>
                    <span className="summary-value">
                      {timeline.length > 0
                        ? formatDuration(Math.min(...timeline.map(e => e.duration)))
                        : '—'}
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Типов воркеров:</span>
                    <span className="summary-value">
                      {Array.from(new Set(timeline.map(e => e.type))).length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : timeline.length === 0 ? (
          <div className="empty-state">
            <p>Нет данных за выбранный период</p>
          </div>
        ) : (
          <div className="empty-state">
            <p>Ошибка подготовки данных графика</p>
          </div>
        )}
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

