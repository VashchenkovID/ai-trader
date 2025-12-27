import React from 'react';
import { Card } from '../ui/Card/Card';
import { Badge } from '../ui/Badge/Badge';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import './SchedulerStatusCard.css';

interface SchedulerStatus {
  isRunning?: boolean;
  isInitialized?: boolean;
  tasks?: Array<{
    name: string;
    schedule: string;
    lastRun?: string;
    nextRun?: string;
  }> | Record<string, string>; // Может быть массивом или объектом
  activeWorkers?: number;
  activeIntervals?: number;
  lastCacheUpdate?: string;
  timestamp?: string;
}

interface SchedulerStatusCardProps {
  schedulerStatus: SchedulerStatus | null;
}

const SchedulerStatusCard: React.FC<SchedulerStatusCardProps> = ({ schedulerStatus }) => {
  if (!schedulerStatus) {
    return (
      <Card variant="glass" header="⏰ Статус планировщика" className="scheduler-status-card">
        <div className="scheduler-status-skeleton">
          <Skeleton variant="text" size="md" style={{ width: '100%', marginBottom: '1rem' }} />
          {[1, 2, 3].map((item) => (
            <div key={item} className="scheduler-status-skeleton-item">
              <Skeleton variant="text" size="sm" style={{ width: '60%', marginBottom: '0.5rem' }} />
              <Skeleton variant="text" size="xs" style={{ width: '40%' }} />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  // Преобразуем tasks в массив, если это объект
  const tasksArray = React.useMemo(() => {
    if (!schedulerStatus.tasks) return [];
    
    if (Array.isArray(schedulerStatus.tasks)) {
      return schedulerStatus.tasks;
    }
    
    // Если tasks - объект, преобразуем в массив
    if (typeof schedulerStatus.tasks === 'object') {
      return Object.entries(schedulerStatus.tasks).map(([name, status]) => ({
        name,
        schedule: status as string,
        status: status as string
      }));
    }
    
    return [];
  }, [schedulerStatus.tasks]);

  const isRunning = schedulerStatus.isRunning ?? schedulerStatus.isInitialized ?? false;

  return (
    <Card variant="glass" header="⏰ Статус планировщика" className="scheduler-status-card">
      <div className="scheduler-status-content">
        <div className="scheduler-status-header">
          <Badge variant={isRunning ? 'success' : 'error'} size="md">
            {isRunning ? 'Работает' : 'Остановлен'}
          </Badge>
        </div>

        {schedulerStatus.activeWorkers !== undefined && (
          <div className="scheduler-status-info">
            <div className="scheduler-status-info-item">
              <span className="scheduler-status-info-label">Активные воркеры:</span>
              <span className="scheduler-status-info-value">{schedulerStatus.activeWorkers}</span>
            </div>
            {schedulerStatus.activeIntervals !== undefined && (
              <div className="scheduler-status-info-item">
                <span className="scheduler-status-info-label">Активные интервалы:</span>
                <span className="scheduler-status-info-value">{schedulerStatus.activeIntervals}</span>
              </div>
            )}
          </div>
        )}

        <div className="scheduler-status-tasks">
          {tasksArray.length === 0 ? (
            <div className="scheduler-status-empty">
              <p className="scheduler-status-empty-text">Нет запланированных задач</p>
            </div>
          ) : (
            tasksArray.map((task, index) => (
              <div key={index} className="scheduler-status-task">
                <div className="scheduler-status-task-content">
                  <div className="scheduler-status-task-name">{task.name}</div>
                  {task.schedule && (
                    <div className="scheduler-status-task-schedule">
                      Статус: <Badge variant={task.status === 'active' ? 'success' : 'error'} size="sm">
                        {task.status || task.schedule}
                      </Badge>
                    </div>
                  )}
                  {task.lastRun && (
                    <div className="scheduler-status-task-time">
                      Последний запуск: {new Date(task.lastRun).toLocaleString('ru-RU')}
                    </div>
                  )}
                  {task.nextRun && (
                    <div className="scheduler-status-task-time">
                      Следующий запуск: {new Date(task.nextRun).toLocaleString('ru-RU')}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {schedulerStatus.lastCacheUpdate && (
          <div className="scheduler-status-cache-update">
            <div className="scheduler-status-cache-update-label">Последнее обновление кеша:</div>
            <div className="scheduler-status-cache-update-value">
              {new Date(schedulerStatus.lastCacheUpdate).toLocaleString('ru-RU')}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default SchedulerStatusCard;

