import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../ui/Card/Card';
import { Badge } from '../ui/Badge/Badge';
import { Button } from '../ui/Button/Button';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { ProgressBar } from '../ui/ProgressBar/ProgressBar';
import { Select } from '../ui/Select/Select';
import { workerMonitoringApi, Worker } from '../../services/workerMonitoringApi';
import useWebSocket from '../../hooks/useWebSocket';
import { translateWorkerType, translateWorkerName } from '../../utils/workerTypeTranslator';
import './WorkerStatusDashboard.css';

interface WorkerStatusDashboardProps {
  className?: string;
}

const getStatusColor = (status: Worker['status']): string => {
  switch (status) {
    case 'running':
      return 'success';
    case 'paused':
      return 'warning';
    case 'completed':
      return 'info';
    case 'error':
      return 'error';
    case 'idle':
      return 'secondary';
    default:
      return 'secondary';
  }
};

const getStatusLabel = (status: Worker['status']): string => {
  switch (status) {
    case 'running':
      return 'Работает';
    case 'paused':
      return 'На паузе';
    case 'completed':
      return 'Завершен';
    case 'error':
      return 'Ошибка';
    case 'idle':
      return 'Ожидание';
    default:
      return status;
  }
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

export const WorkerStatusDashboard: React.FC<WorkerStatusDashboardProps> = ({ className = '' }) => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());

  // Получение данных
  const loadWorkers = useCallback(async () => {
    try {
      setError(null);
      const data = await workerMonitoringApi.getWorkersStatus();
      setWorkers(data.workers || []);
    } catch (err: any) {
      console.error('Error loading workers:', err);
      setError(err.message || 'Ошибка загрузки воркеров');
    } finally {
      setLoading(false);
    }
  }, []);

  // Загрузка при монтировании
  useEffect(() => {
    loadWorkers();
    
    // Автообновление каждые 5 секунд
    const interval = setInterval(loadWorkers, 5000);
    return () => clearInterval(interval);
  }, [loadWorkers]);

  // WebSocket подписка на события воркеров
  useWebSocket({
    onMessage: (message) => {
      // Обновляем список воркеров при событиях воркеров
      if (message.type && message.type.startsWith('worker_')) {
        loadWorkers();
      }
    },
    autoConnect: true,
  });

  // Фильтрация воркеров
  const filteredWorkers = workers.filter(worker => {
    if (filterType !== 'all' && worker.type !== filterType) return false;
    if (filterStatus !== 'all' && worker.status !== filterStatus) return false;
    return true;
  });

  // Получение уникальных типов с переводами
  const workerTypes = Array.from(new Set(workers.map(w => w.type)));
  const workerTypeOptions = workerTypes.map(type => ({
    value: type,
    label: translateWorkerType(type)
  }));

  // Обработка паузы
  const handlePause = async (workerId: string) => {
    setActionLoading(prev => new Set(prev).add(workerId));
    try {
      await workerMonitoringApi.pauseWorker(workerId);
      await loadWorkers();
    } catch (err: any) {
      console.error('Error pausing worker:', err);
      alert(`Ошибка: ${err.message || 'Не удалось поставить воркер на паузу'}`);
    } finally {
      setActionLoading(prev => {
        const next = new Set(prev);
        next.delete(workerId);
        return next;
      });
    }
  };

  // Обработка возобновления
  const handleResume = async (workerId: string) => {
    setActionLoading(prev => new Set(prev).add(workerId));
    try {
      await workerMonitoringApi.resumeWorker(workerId);
      await loadWorkers();
    } catch (err: any) {
      console.error('Error resuming worker:', err);
      alert(`Ошибка: ${err.message || 'Не удалось возобновить воркер'}`);
    } finally {
      setActionLoading(prev => {
        const next = new Set(prev);
        next.delete(workerId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className={`worker-status-dashboard ${className}`}>
        <Card variant="glass">
          <Skeleton width="100%" height={400} />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`worker-status-dashboard ${className}`}>
        <Card variant="glass">
          <div className="error-message">
            <p>Ошибка загрузки: {error}</p>
            <Button onClick={loadWorkers} variant="primary">
              Повторить
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={`worker-status-dashboard ${className}`}>
      <Card variant="glass" className="workers-card">
        <div className="workers-header">
          <h3 className="workers-title">Мониторинг воркеров</h3>
          <div className="workers-controls">
            <Select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              options={[
                { value: 'all', label: 'Все типы' },
                ...workerTypeOptions
              ]}
              size="sm"
            />
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              options={[
                { value: 'all', label: 'Все статусы' },
                { value: 'running', label: 'Работает' },
                { value: 'paused', label: 'На паузе' },
                { value: 'completed', label: 'Завершен' },
                { value: 'error', label: 'Ошибка' },
              ]}
              size="sm"
            />
            <Button onClick={loadWorkers} variant="secondary" size="sm">
              Обновить
            </Button>
          </div>
        </div>

        <div className="workers-stats">
          <div className="stat-item">
            <span className="stat-label">Всего:</span>
            <span className="stat-value">{workers.length}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Работает:</span>
            <span className="stat-value number-positive">
              {workers.filter(w => w.status === 'running').length}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">На паузе:</span>
            <span className="stat-value number-warning">
              {workers.filter(w => w.status === 'paused').length}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Ошибки:</span>
            <span className="stat-value number-negative">
              {workers.filter(w => w.status === 'error').length}
            </span>
          </div>
        </div>

        <div className="workers-list">
          {filteredWorkers.length === 0 ? (
            <div className="empty-state">
              <p>Нет активных воркеров</p>
            </div>
          ) : (
            filteredWorkers.map(worker => (
              <div key={worker.workerId} className="worker-card">
                <div className="worker-header">
                  <div className="worker-info">
                    <h4 className="worker-name">{translateWorkerName(worker.name)}</h4>
                    <div className="worker-meta">
                      <Badge variant={getStatusColor(worker.status) as any}>
                        {getStatusLabel(worker.status)}
                      </Badge>
                      <span className="worker-type">{translateWorkerType(worker.type)}</span>
                      <span className="worker-duration">
                        {formatDuration(worker.duration)}
                      </span>
                    </div>
                  </div>
                  <div className="worker-actions">
                    {worker.status === 'running' && (
                      <Button
                        onClick={() => handlePause(worker.workerId)}
                        variant="warning"
                        size="sm"
                        disabled={actionLoading.has(worker.workerId)}
                      >
                        Пауза
                      </Button>
                    )}
                    {worker.status === 'paused' && (
                      <Button
                        onClick={() => handleResume(worker.workerId)}
                        variant="primary"
                        size="sm"
                        disabled={actionLoading.has(worker.workerId)}
                      >
                        Возобновить
                      </Button>
                    )}
                  </div>
                </div>

                {worker.status === 'running' && (
                  <div className="worker-progress">
                    <ProgressBar
                      value={worker.progress}
                      showLabel
                      label={`${Math.round(worker.progress)}%`}
                    />
                  </div>
                )}

                <div className="worker-details">
                  {/* Стадия обучения - приоритетная информация для полного обучения */}
                  {worker?.metadata?.currentStage && (
                    <div className="detail-item highlight">
                      <span className="detail-label">Стадия:</span>
                      <span className="detail-value stage-value">{worker.metadata.currentStage}</span>
                    </div>
                  )}
                  {/* Информация о прогрессе для полного обучения */}
                  {worker.metadata.trainingStage && worker.metadata.totalStages && (
                    <div className="detail-item">
                      <span className="detail-label">Этап обучения:</span>
                      <span className="detail-value">
                        {worker.metadata.trainingStage} / {worker.metadata.totalStages}
                      </span>
                    </div>
                  )}
                  {/* Текущий инструмент */}
                  {worker.metadata.currentTicker && (
                    <div className="detail-item">
                      <span className="detail-label">Инструмент:</span>
                      <span className="detail-value">{worker.metadata.currentTicker}</span>
                    </div>
                  )}
                  {/* Прогресс по инструментам */}
                  {worker.metadata.currentInstrument !== undefined && worker.metadata.totalInstruments !== undefined && (
                    <div className="detail-item">
                      <span className="detail-label">Прогресс:</span>
                      <span className="detail-value">
                        {worker.metadata.currentInstrument} / {worker.metadata.totalInstruments} инструментов
                      </span>
                    </div>
                  )}
                  {/* Оставшиеся операции */}
                  {worker.metadata.remainingOperations !== undefined && (
                    <div className="detail-item">
                      <span className="detail-label">Осталось операций:</span>
                      <span className="detail-value">{worker.metadata.remainingOperations}</span>
                    </div>
                  )}
                  {worker.metadata.figi && (
                    <div className="detail-item">
                      <span className="detail-label">FIGI:</span>
                      <span className="detail-value">{worker.metadata.figi}</span>
                    </div>
                  )}
                  {worker.metadata.epoch !== undefined && (
                    <div className="detail-item">
                      <span className="detail-label">Эпоха:</span>
                      <span className="detail-value">{worker.metadata.epoch}</span>
                    </div>
                  )}
                  {worker.metadata.accuracy !== undefined && (
                    <div className="detail-item">
                      <span className="detail-label">Точность:</span>
                      <span className="detail-value">
                        {(worker.metadata.accuracy * 100).toFixed(2)}%
                      </span>
                    </div>
                  )}
                  {worker.metadata.loss !== undefined && (
                    <div className="detail-item">
                      <span className="detail-label">Потери:</span>
                      <span className="detail-value">
                        {worker.metadata.loss.toFixed(4)}
                      </span>
                    </div>
                  )}
                  {worker.metadata.error && (
                    <div className="detail-item error">
                      <span className="detail-label">Ошибка:</span>
                      <span className="detail-value">{worker.metadata.error}</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};

export default WorkerStatusDashboard;

