import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { Skeleton } from 'primereact/skeleton';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Toast } from 'primereact/toast';
import { useRef } from 'react';

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
        title={<span><i className="pi pi-balance-scale mr-2"></i>Статус ребалансировки</span>}
        className={`h-full ${className}`}
        footer={
          <Button
            label={checking ? 'Проверка...' : 'Проверить сейчас'}
            icon={checking ? undefined : 'pi pi-refresh'}
            className="p-button-outlined w-full"
            onClick={handleCheckRebalancing}
            disabled={checking || loading}
            loading={checking}
          />
        }
      >
        {loading ? (
          <div className="flex flex-column gap-3">
            <Skeleton width="100%" height="2rem" />
            <Skeleton width="80%" height="1.5rem" />
            <Skeleton width="60%" height="1rem" />
          </div>
        ) : (
          <div className="flex flex-column gap-3">
            {/* Статус сервиса */}
            <div className="flex align-items-center justify-content-between p-2 border-round surface-100">
              <div className="flex align-items-center gap-2">
                <i className={`pi ${status?.enabled ? 'pi-check-circle text-green-500' : 'pi-times-circle text-red-500'}`} />
                <span className="text-sm font-medium">
                  {status?.enabled ? 'Включена' : 'Выключена'}
                </span>
              </div>
              <Badge 
                value={status?.enabled ? 'Активна' : 'Неактивна'} 
                severity={status?.enabled ? 'success' : 'danger'} 
              />
            </div>

            {/* Последняя проверка */}
            <div className="flex align-items-center justify-content-between p-2 border-round surface-100">
              <div className="text-sm text-500">Последняя проверка</div>
              <div className="text-sm font-medium">
                {formatTimeAgo(status?.lastCheck || null)}
              </div>
            </div>

            {/* Последняя ребалансировка */}
            {status?.lastRebalance && (
              <div className="flex align-items-center justify-content-between p-2 border-round surface-100">
                <div className="text-sm text-500">Последняя ребалансировка</div>
                <div className="text-sm font-medium">
                  {formatTimeAgo(status.lastRebalance)}
                </div>
              </div>
            )}

            {/* Результат проверки */}
            {checkResult && (
              <div className={`p-3 border-round ${needsRebalancing ? 'surface-orange-50 border-2 border-orange-200' : 'surface-green-50 border-2 border-green-200'}`}>
                <div className="flex align-items-center justify-content-between mb-2">
                  <div className="flex align-items-center gap-2">
                    <i className={`pi ${needsRebalancing ? 'pi-exclamation-triangle text-orange-500' : 'pi-check-circle text-green-500'}`} />
                    <span className="font-medium">
                      {needsRebalancing ? 'Требуется ребалансировка' : 'Ребалансировка не требуется'}
                    </span>
                  </div>
                </div>
                {needsRebalancing && deviationsCount > 0 && (
                  <div className="text-sm text-500">
                    {deviationsCount} позиций требуют корректировки
                  </div>
                )}
              </div>
            )}

            {/* Индикатор загрузки при проверке */}
            {checking && (
              <div className="flex align-items-center justify-content-center p-3">
                <ProgressSpinner style={{ width: '30px', height: '30px' }} />
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
