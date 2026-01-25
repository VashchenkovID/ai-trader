import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../ui/Card/Card.tsx';
import { Skeleton } from '../../ui/Skeleton/Skeleton.tsx';
import { Button } from '../../ui/Button/Button.tsx';
import { Badge } from '../../ui/Badge/Badge.tsx';
import { apiService } from '../../../services/apiService.ts';
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
        <div className="card-grid">
          {[1, 2, 3].map((item) => (
            <div key={item} className="col-half">
              <div className="text-center padding-sm">
                <Skeleton variant="rectangular" size="md" className="margin-bottom-sm skeleton-primary" />
                <Skeleton variant="text" size="sm" className="skeleton-secondary" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="error-container">
          <div className="error-message">{error}</div>
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
        <div className="card-flex">
          {/* Основные метрики */}
          <div className="metrics-block">
            <div className="card-grid">
              <div className="col-half">
                <div className="stats-label">Ожидают</div>
                <div className="card-flex-row">
                  <Badge variant="warning" size="md">
                    {stats.pending}
                  </Badge>
                </div>
              </div>
              <div className="col-half">
                <div className="stats-label">Одобрены</div>
                <div className="card-flex-row">
                  <Badge variant="info" size="md">
                    {stats.approved}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Дополнительная статистика */}
          <div className="card-grid">
            <div className="col-third">
              <div className="stats-block">
                <div className="stats-label">Всего</div>
                <div className="stats-value">{stats.total}</div>
              </div>
            </div>
            <div className="col-third">
              <div className="stats-block">
                <div className="stats-label">Исполнено</div>
                <div className="stats-value number-success">{stats.executed}</div>
              </div>
            </div>
            <div className="col-third">
              <div className="stats-block">
                <div className="stats-label">Отклонено</div>
                <div className="stats-value number-error">{stats.rejected}</div>
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
            className="margin-top-sm"
          >
            {hasActiveRequests ? `Управление (${activeCount})` : 'Торговые заявки'}
          </Button>
        </div>
      ) : (
        <div className="empty-container">
          <div className="empty-message">Нет данных о заявках</div>
        </div>
      )}
    </Card>
  );
};

export default ActiveTradingRequestsCard;

