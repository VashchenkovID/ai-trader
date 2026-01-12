import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../ui/Card/Card';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { Button } from '../ui/Button/Button';
import { Badge } from '../ui/Badge/Badge';
import { apiService } from '../../services/apiService';
import './ActiveTradingRequestsCard.css';

interface TradingRequestsStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  executed: number;
  cancelled: number;
  expired: number;
}

interface ActiveTradingRequestsCardProps {
  className?: string;
}

export const ActiveTradingRequestsCard: React.FC<ActiveTradingRequestsCardProps> = ({ 
  className = '' 
}) => {
  const [stats, setStats] = useState<TradingRequestsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiService.getTradingRequestsStats();
      
      if (response.success && response.data) {
        setStats(response.data);
      } else {
        setStats(null);
      }
    } catch (err: any) {
      console.error('Error loading trading requests stats:', err);
      setError(err.message || 'Ошибка загрузки статистики');
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    // Обновляем каждые 30 секунд
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const activeCount = (stats?.pending || 0) + (stats?.approved || 0);
  const hasActiveRequests = activeCount > 0;

  return (
    <Card 
      variant="glass" 
      header={<span>Торговые заявки</span>} 
      className={`h-full active-trading-requests-card ${className}`}
    >
      {loading && !stats ? (
        <div className="grid">
          {[1, 2, 3].map((item) => (
            <div key={item} className="col-6">
              <div className="text-center p-2">
                <Skeleton variant="rectangular" size="md" className="mb-1" style={{ width: '80%', height: '1.5rem', margin: '0 auto' }} />
                <Skeleton variant="text" size="sm" style={{ width: '60%', margin: '0 auto' }} />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center p-3">
          <div className="text-xs text-500 mb-2">{error}</div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadStats}
            icon={<i className="pi pi-refresh"></i>}
          >
            Повторить
          </Button>
        </div>
      ) : stats ? (
        <div className="flex flex-column gap-2">
          {/* Основные метрики */}
          <div className="p-2 border-round" style={{ background: 'var(--color-surface-hover)', border: '1px solid var(--color-border-default)' }}>
            <div className="grid">
              <div className="col-6">
                <div className="text-xs text-500 mb-1">Ожидают</div>
                <div className="flex align-items-center gap-2">
                  <Badge variant="warning" size="md">
                    {stats.pending}
                  </Badge>
                </div>
              </div>
              <div className="col-6">
                <div className="text-xs text-500 mb-1">Одобрены</div>
                <div className="flex align-items-center gap-2">
                  <Badge variant="info" size="md">
                    {stats.approved}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Дополнительная статистика */}
          <div className="grid">
            <div className="col-4">
              <div className="text-center p-2 border-round" style={{ background: 'var(--color-surface-hover)' }}>
                <div className="text-xs text-500 mb-1">Всего</div>
                <div className="text-lg font-bold">{stats.total}</div>
              </div>
            </div>
            <div className="col-4">
              <div className="text-center p-2 border-round" style={{ background: 'var(--color-surface-hover)' }}>
                <div className="text-xs text-500 mb-1">Исполнено</div>
                <div className="text-lg font-bold number-success">{stats.executed}</div>
              </div>
            </div>
            <div className="col-4">
              <div className="text-center p-2 border-round" style={{ background: 'var(--color-surface-hover)' }}>
                <div className="text-xs text-500 mb-1">Отклонено</div>
                <div className="text-lg font-bold number-error">{stats.rejected}</div>
              </div>
            </div>
          </div>

          {/* Кнопка перехода */}
          <Button
            variant={hasActiveRequests ? "primary" : "ghost"}
            size="sm"
            fullWidth
            icon={<i className="pi pi-arrow-right"></i>}
            iconPosition="right"
            onClick={() => navigate('/trading-requests')}
            className="mt-1"
          >
            {hasActiveRequests ? `Управление (${activeCount})` : 'Торговые заявки'}
          </Button>
        </div>
      ) : (
        <div className="text-center p-3">
          <div className="text-xs text-500">Нет данных о заявках</div>
        </div>
      )}
    </Card>
  );
};

export default ActiveTradingRequestsCard;

