import React from 'react';
import { Card } from '../ui/Card/Card';
import { Badge } from '../ui/Badge/Badge';
import { Button } from '../ui/Button/Button';
import { ProgressBar } from '../ui/ProgressBar/ProgressBar';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { CacheStatus } from '../../services/apiService';
import './CacheManagementCard.css';

interface CacheManagementCardProps {
  cacheStatus: CacheStatus | null;
  cacheUpdating: boolean;
  onRefresh: () => void;
  onFullRefresh: () => void;
  newsUpdating?: boolean;
  onUpdateNews?: () => void;
}

const CacheManagementCard: React.FC<CacheManagementCardProps> = ({
  cacheStatus,
  cacheUpdating,
  onRefresh,
  onFullRefresh,
  newsUpdating = false,
  onUpdateNews
}) => {
  const formatTime = (minutes: number | null) => {
    if (minutes === null) return '—';
    if (minutes < 60) return `${Math.round(minutes)} мин`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}ч ${mins}мин`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleString('ru-RU');
    } catch {
      return '—';
    }
  };

  if (!cacheStatus) {
    return (
      <Card variant="glass" header="💾 Управление кешем" className="cache-management-card">
        <div className="cache-management-skeleton">
          <Skeleton variant="text" size="md" style={{ width: '100%', height: '2rem', marginBottom: '1rem' }} />
          <Skeleton variant="text" size="sm" style={{ width: '80%', marginBottom: '1rem' }} />
          <Skeleton variant="rectangular" size="md" style={{ width: '100%', height: '3rem', marginBottom: '1rem' }} />
        </div>
      </Card>
    );
  }

  return (
    <Card variant="glass" header="💾 Управление кешем" className="cache-management-card">
      <div className="cache-management-content">
        <div className="cache-management-status">
          <div className="cache-management-status-item">
            <div className="cache-management-status-label">Статус</div>
            <Badge variant={cacheStatus.needsUpdate ? 'warning' : 'success'} size="sm">
              {cacheStatus.needsUpdate ? 'Устарел' : 'Актуален'}
            </Badge>
          </div>
          <div className="cache-management-status-item">
            <div className="cache-management-status-label">Последнее обновление</div>
            <div className="cache-management-status-value">{formatDate(cacheStatus.lastUpdate)}</div>
          </div>
          <div className="cache-management-status-item">
            <div className="cache-management-status-label">Время до следующего</div>
            <div className="cache-management-status-value">{formatTime(cacheStatus.nextUpdateIn)}</div>
          </div>
        </div>

        {cacheUpdating && (
          <div className="cache-management-progress">
            <ProgressBar value={0} animated size="sm" />
            <div className="cache-management-progress-text">Обновление кеша...</div>
          </div>
        )}

        {newsUpdating && (
          <div className="cache-management-progress">
            <ProgressBar value={0} animated size="sm" />
            <div className="cache-management-progress-text">Обновление новостей...</div>
          </div>
        )}

        <div className="cache-management-actions">
          <Button
            onClick={onRefresh}
            loading={cacheUpdating}
            disabled={cacheUpdating || newsUpdating}
            size="sm"
            icon={<i className="pi pi-refresh"></i>}
            fullWidth
          >
            Обновить кеш (суточный)
          </Button>
          <Button
            onClick={onFullRefresh}
            loading={cacheUpdating}
            disabled={cacheUpdating || newsUpdating}
            size="sm"
            variant="danger"
            icon={<i className="pi pi-refresh"></i>}
            fullWidth
          >
            Полное обновление
          </Button>
          {onUpdateNews && (
            <Button
              onClick={onUpdateNews}
              loading={newsUpdating}
              disabled={cacheUpdating || newsUpdating}
              size="sm"
              variant="default"
              icon={<i className="pi pi-refresh"></i>}
              fullWidth
            >
              Обновить новости
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};

export default CacheManagementCard;

