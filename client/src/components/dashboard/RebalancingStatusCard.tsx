import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../ui/Card/Card';
import { Button } from '../ui/Button/Button';
import { Badge } from '../ui/Badge/Badge';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { Toast } from 'primereact/toast';
import './RebalancingStatusCard.css';

interface RebalancingStatusCardProps {
  className?: string;
}

interface RebalancingStatus {
  initialized: boolean;
  enabled: boolean;
  lastCheck: string | null;
  lastRebalance: string | null;
}

interface RebalancingCheck {
  needsRebalancing: boolean;
  deviations: Array<{
    figi: string;
    ticker: string;
    name: string;
    currentWeight: number;
    targetWeight: number;
    deviation: number;
    deviationPercent: number;
    needsRebalancing: boolean;
  }>;
  nextCheckIn?: number;
}

export const RebalancingStatusCard: React.FC<RebalancingStatusCardProps> = ({ className = '' }) => {
  const toast = useRef<Toast>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<RebalancingStatus | null>(null);
  const [checkResult, setCheckResult] = useState<RebalancingCheck | null>(null);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        setLoading(true);
        const { apiService } = await import('../../services/apiService');
        const result = await apiService.getRebalancingStatus();
        if (result.success) {
          setStatus(result.data);
        }
      } catch (error) {
        console.error('Error loading rebalancing status:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStatus();
  }, []);

  const handleCheckRebalancing = async () => {
    try {
      setChecking(true);
      const { apiService } = await import('../../services/apiService');
      const result = await apiService.checkRebalancingNeeded();
      if (result.success) {
        setCheckResult(result.data);
        if (result.data.needsRebalancing) {
          toast.current?.show({
            severity: 'warn',
            summary: 'Требуется ребалансировка',
            detail: `Найдено ${result.data.deviations?.length || 0} позиций, требующих корректировки`,
            life: 5000
          });
        } else {
          toast.current?.show({
            severity: 'success',
            summary: 'Ребалансировка не требуется',
            detail: 'Портфель соответствует целевым весам',
            life: 3000
          });
        }
      }
    } catch (error: any) {
      console.error('Error checking rebalancing:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: error.message || 'Не удалось проверить необходимость ребалансировки',
        life: 5000
      });
    } finally {
      setChecking(false);
    }
  };

  const formatTimeAgo = (dateString: string | null) => {
    if (!dateString) return 'Никогда';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Только что';
    if (diffMins < 60) return `${diffMins} мин назад`;
    if (diffHours < 24) return `${diffHours} ч назад`;
    return `${diffDays} дн назад`;
  };

  const needsRebalancing = checkResult?.needsRebalancing || false;
  const deviationsCount = checkResult?.deviations?.filter(d => d.needsRebalancing).length || 0;

  return (
    <>
      <Card 
        variant="glass"
        header={<span><i className="pi pi-balance-scale mr-2"></i>Статус ребалансировки</span>}
        className={`h-full rebalancing-status-card ${className}`}
        footer={
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            icon={checking ? <i className="pi pi-spin pi-spinner"></i> : <i className="pi pi-refresh"></i>}
            onClick={handleCheckRebalancing}
            disabled={checking || loading}
            loading={checking}
          >
            {checking ? 'Проверка...' : 'Проверить сейчас'}
          </Button>
        }
      >
        {loading ? (
          <div className="flex flex-column gap-3">
            <Skeleton variant="rectangular" size="md" style={{ width: '100%', height: '2rem' }} />
            <Skeleton variant="text" size="md" style={{ width: '80%' }} />
            <Skeleton variant="text" size="sm" style={{ width: '60%' }} />
          </div>
        ) : (
          <div className="flex flex-column gap-3">
            {/* Статус сервиса */}
            <div 
              className="flex align-items-center justify-content-between p-2 border-round transition-default"
              style={{ 
                background: 'var(--color-surface-hover)', 
                border: '1px solid var(--color-border-default)',
                transition: 'all 0.2s ease'
              }}
            >
              <div className="flex align-items-center gap-2">
                <i 
                  className={`pi ${status?.enabled ? 'pi-check-circle' : 'pi-times-circle'} ${status?.enabled ? 'number-success' : 'number-error'}`}
                />
                <span className="text-sm font-medium number-text-primary">
                  {status?.enabled ? 'Включена' : 'Выключена'}
                </span>
              </div>
              <Badge variant={status?.enabled ? 'success' : 'error'} size="sm">
                {status?.enabled ? 'Активна' : 'Неактивна'}
              </Badge>
            </div>

            {/* Последняя проверка */}
            <div className="status-item flex align-items-center justify-content-between">
              <div className="text-sm number-text-tertiary">Последняя проверка</div>
              <div className="text-sm font-medium number-text-primary">
                {formatTimeAgo(status?.lastCheck || null)}
              </div>
            </div>

            {/* Последняя ребалансировка */}
            {status?.lastRebalance && (
              <div className="status-item flex align-items-center justify-content-between">
                <div className="text-sm number-text-tertiary">Последняя ребалансировка</div>
                <div className="text-sm font-medium number-text-primary">
                  {formatTimeAgo(status.lastRebalance)}
                </div>
              </div>
            )}

            {/* Результат проверки */}
            {checkResult && (
              <div 
                className={`rebalancing-result ${needsRebalancing ? 'needs-rebalancing' : 'no-rebalancing'}`}
              >
                <div className="flex align-items-center justify-content-between mb-2">
                  <div className="flex align-items-center gap-2">
                    <i 
                      className={`pi ${needsRebalancing ? 'pi-exclamation-triangle' : 'pi-check-circle'} ${needsRebalancing ? 'number-warning' : 'number-success'}`}
                    />
                    <span className="font-medium number-text-primary">
                      {needsRebalancing ? 'Требуется ребалансировка' : 'Ребалансировка не требуется'}
                    </span>
                  </div>
                </div>
                {needsRebalancing && deviationsCount > 0 && (
                  <div className="text-sm number-text-secondary">
                    {deviationsCount} позиций требуют корректировки
                  </div>
                )}
              </div>
            )}

            {/* Индикатор загрузки при проверке */}
            {checking && (
              <div className="flex align-items-center justify-content-center p-3">
                <div className="animate-spin" style={{ width: '30px', height: '30px', border: '3px solid var(--color-border-default)', borderTopColor: 'var(--color-accent-primary)', borderRadius: '50%' }}></div>
              </div>
            )}
          </div>
        )}
      </Card>
      <Toast ref={toast} />
    </>
  );
};

export default RebalancingStatusCard;
