import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Card } from '../ui/Card/Card';
import { Button } from '../ui/Button/Button';
import { Badge } from '../ui/Badge/Badge';
import { Alert } from '../ui/Alert/Alert';
import { Toolbar } from '../ui/Toolbar/Toolbar';
import { ProgressBar } from '../ui/ProgressBar/ProgressBar';
import { Table, TableColumn } from '../ui/Table/Table';
import { Modal } from '../ui/Modal/Modal';
import { InputNumber } from '../ui/InputNumber/InputNumber';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { apiService } from '../../services/apiService';
import { Toast } from 'primereact/toast';
import { ConfirmDialog } from 'primereact/confirmdialog';
import './StrategiesSection.css';

interface Strategy {
  id: number;
  name: string;
  type: 'conservative' | 'moderate' | 'aggressive';
  timeframe: 'long' | 'medium' | 'short';
  budgetAllocation: number;
  minConfidence: number;
  minScore: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxPositions: number | null;
  isActive: boolean;
  priority: number;
  allocation?: {
    allocatedAmount: number;
    usedAmount: number;
    availableAmount: number;
    realUsedAmount?: number;
    positionsCount?: number;
  };
  stats?: {
    totalPositions: number;
    closedPositions: number;
    winRate: number;
    averageResult: number;
    winCount: number;
    lossCount: number;
  };
}

interface StrategiesSectionProps {
  className?: string;
}

const StrategiesSection: React.FC<StrategiesSectionProps> = ({ className = '' }) => {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRebalanceDialog, setShowRebalanceDialog] = useState(false);
  const [rebalanceAllocations, setRebalanceAllocations] = useState<Record<number, number>>({});
  const [rebalancing, setRebalancing] = useState(false);
  const toast = useRef<Toast>(null);

  // Загрузка данных
  useEffect(() => {
    loadStrategies();
  }, []);

  useEffect(() => {
    if (strategies.length > 0) {
      loadStats();
    }
  }, [strategies.length]);

  const loadStrategies = async () => {
    try {
      setLoading(true);
      const response = await apiService.getAllStrategies();
      
      // Обрабатываем ответ - может быть массив или объект с data
      let data = [];
      if (Array.isArray(response)) {
        data = response;
      } else if (response?.data && Array.isArray(response.data)) {
        data = response.data;
      } else if (response?.success && Array.isArray(response.data)) {
        data = response.data;
      }
      
      setStrategies(data);
      
      if (data.length === 0) {
        showToast('info', 'Стратегии не найдены. Они будут созданы автоматически при первом запуске.');
      }
    } catch (error: any) {
      showToast('error', error.response?.data?.message || error.message || 'Не удалось загрузить стратегии');
      setStrategies([]);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (strategies.length === 0) {
      return;
    }
    
    try {
      const statsResponse = await apiService.getAllStrategyStats();
      const stats = Array.isArray(statsResponse) ? statsResponse : (statsResponse?.data || []);
      const statsMap = new Map(stats.map((s: any) => [s.strategyId, s]));
      setStrategies(prev => prev.map(s => {
        const stat: any = statsMap.get(s.id);
        return {
          ...s,
          stats: stat ? {
            totalPositions: stat.totalPositions || 0,
            closedPositions: stat.closedPositions || 0,
            winRate: stat.winRate || 0,
            averageResult: stat.averageResult || 0,
            winCount: stat.winCount || 0,
            lossCount: stat.lossCount || 0
          } : undefined
        };
      }));
    } catch (error) {
      // Игнорируем ошибки загрузки статистики
    }
  };

  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }, []);

  const handleRebalance = useCallback(() => {
    const allocations: Record<number, number> = {};
    strategies.forEach(s => {
      allocations[s.id] = s.budgetAllocation;
    });
    setRebalanceAllocations(allocations);
    setShowRebalanceDialog(true);
  }, [strategies]);

  const handleRebalanceConfirm = async () => {
    try {
      setRebalancing(true);
      await apiService.rebalanceStrategies(rebalanceAllocations);
      showToast('success', 'Стратегии перебалансированы');
      setShowRebalanceDialog(false);
      await loadStrategies();
    } catch (error: any) {
      showToast('error', error.response?.data?.message || 'Не удалось перебалансировать стратегии');
    } finally {
      setRebalancing(false);
    }
  };

  const handleAllocationChange = useCallback((strategyId: number, value: number) => {
    setRebalanceAllocations(prev => ({
      ...prev,
      [strategyId]: value
    }));
  }, []);

  const showToast = useCallback((severity: 'success' | 'error' | 'info' | 'warn', message: string) => {
    if (toast.current) {
      toast.current.show({ severity, summary: message, life: 3000 });
    }
  }, []);

  // Колонки таблицы
  const columns: TableColumn<Strategy>[] = useMemo(() => [
    {
      key: 'name',
      header: 'Название',
      sortable: true,
      accessor: (row) => row.name,
    },
    {
      key: 'type',
      header: 'Тип',
      sortable: true,
      render: (_value, row) => {
        const typeMap: Record<string, { label: string; variant: 'info' | 'warning' | 'error' }> = {
          conservative: { label: 'Консервативная', variant: 'info' },
          moderate: { label: 'Умеренная', variant: 'warning' },
          aggressive: { label: 'Агрессивная', variant: 'error' }
        };
        const typeInfo = typeMap[row.type] || { label: row.type, variant: 'info' as const };
        return <Badge variant={typeInfo.variant} size="sm">{typeInfo.label}</Badge>;
      },
    },
    {
      key: 'timeframe',
      header: 'Горизонт',
      sortable: true,
      render: (_value, row) => {
        const timeframeMap: Record<string, string> = {
          long: 'Долгосрочная',
          medium: 'Среднесрочная',
          short: 'Краткосрочная'
        };
        return <span>{timeframeMap[row.timeframe] || row.timeframe}</span>;
      },
    },
    {
      key: 'budgetAllocation',
      header: 'Бюджет %',
      sortable: true,
      accessor: (row) => row.budgetAllocation,
      render: (value) => `${value}%`,
    },
    {
      key: 'allocation',
      header: 'Распределение',
      sortable: false,
      render: (_value, row) => {
        const allocation = row.allocation;
        if (!allocation) return <span>—</span>;
        
        const usedPercent = allocation.allocatedAmount > 0 
          ? (allocation.usedAmount / allocation.allocatedAmount) * 100 
          : 0;

        const showRealUsage = allocation.realUsedAmount !== undefined && 
                             Math.abs(allocation.realUsedAmount - allocation.usedAmount) > 0.01;

        return (
          <div className="strategies-allocation-cell">
            <ProgressBar value={usedPercent} showLabel={false} size="sm" className="strategies-allocation-progress" />
            <div className="strategies-allocation-details">
              <div>Выделено: {formatCurrency(allocation.allocatedAmount)}</div>
              <div>
                Использовано: {formatCurrency(allocation.usedAmount)}
                {showRealUsage && (
                  <span className="strategies-allocation-real">
                    (реально: {formatCurrency(allocation.realUsedAmount || 0)})
                  </span>
                )}
              </div>
              <div className="strategies-allocation-available">Доступно: {formatCurrency(allocation.availableAmount)}</div>
              {allocation.positionsCount !== undefined && allocation.positionsCount > 0 && (
                <div className="strategies-allocation-positions">
                  Активных позиций: {allocation.positionsCount}
                </div>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'minConfidence',
      header: 'Мин. Уверенность',
      sortable: true,
      accessor: (row) => row.minConfidence,
      render: (value) => `${(value * 100).toFixed(0)}%`,
    },
    {
      key: 'minScore',
      header: 'Мин. Оценка',
      sortable: true,
      accessor: (row) => row.minScore,
      render: (value) => `${(value * 100).toFixed(0)}%`,
    },
    {
      key: 'stopLossPercent',
      header: 'Стоп-лосс',
      sortable: true,
      accessor: (row) => row.stopLossPercent,
      render: (value) => `${value}%`,
    },
    {
      key: 'takeProfitPercent',
      header: 'Тейк-профит',
      sortable: true,
      accessor: (row) => row.takeProfitPercent,
      render: (value) => `${value}%`,
    },
    {
      key: 'stats',
      header: 'Статистика',
      sortable: false,
      render: (_value, row) => {
        const stats = row.stats;
        if (!stats || stats.closedPositions === 0) {
          return <span className="strategies-stats-empty">Нет данных</span>;
        }

        return (
          <div className="strategies-stats-cell">
            <div>Позиций: {stats.totalPositions}</div>
            <div>
              Процент побед: <span className={stats.winRate > 0.5 ? 'strategies-stats-positive' : 'strategies-stats-negative'}>
                {(stats.winRate * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              Средний результат: <span className={stats.averageResult > 0 ? 'strategies-stats-positive' : 'strategies-stats-negative'}>
                {stats.averageResult > 0 ? '+' : ''}{stats.averageResult.toFixed(2)}%
              </span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'isActive',
      header: 'Активна',
      sortable: true,
      render: (_value, row) => (
        <Badge variant={row.isActive ? 'success' : 'error'} size="sm">
          {row.isActive ? 'Да' : 'Нет'}
        </Badge>
      ),
    },
  ], [formatCurrency]);

  const totalAllocation = useMemo(() => {
    return Object.values(rebalanceAllocations).reduce((sum, val) => sum + val, 0);
  }, [rebalanceAllocations]);

  const rebalanceDialogFooter = (
    <div className="strategies-rebalance-footer">
      <Button
        variant="ghost"
        onClick={() => setShowRebalanceDialog(false)}
        icon={<i className="pi pi-times"></i>}
      >
        Отмена
      </Button>
      <Button
        variant="primary"
        onClick={handleRebalanceConfirm}
        disabled={rebalancing || Math.abs(totalAllocation - 100) > 0.01}
        loading={rebalancing}
        icon={<i className="pi pi-check"></i>}
      >
        Применить
      </Button>
    </div>
  );

  return (
    <div className={`strategies-section ${className}`}>
      <Toast ref={toast} />
      <ConfirmDialog />

      <Card 
        header={
          <div className="strategies-header">
            <h3 className="strategies-title">Управление торговыми стратегиями</h3>
            <p className="strategies-subtitle">Управляйте распределением капитала между стратегиями</p>
          </div>
        }
        className="strategies-card"
      >
        {strategies.length === 0 && !loading && (
          <Alert 
            variant="info" 
            title="Информация"
            className="strategies-empty-alert"
          >
            Стратегии не найдены. Стратегии будут созданы автоматически при первом запуске сервера.
          </Alert>
        )}

        <Toolbar
          start={
            <div className="strategies-toolbar-content">
              <h4 className="strategies-toolbar-title">Распределение бюджета</h4>
            </div>
          }
          end={
            <Button
              variant="ghost"
              onClick={handleRebalance}
              icon={<i className="pi pi-refresh"></i>}
            >
              Перебалансировать
            </Button>
          }
          className="strategies-toolbar"
        />

        {loading ? (
          <div className="strategies-loading">
            <Skeleton height={200} />
          </div>
        ) : (
          <Table
            data={strategies}
            columns={columns}
            size="md"
            sortable
            hoverable
            striped
            emptyMessage={loading ? "Загрузка стратегий..." : "Стратегии не найдены. Проверьте подключение к серверу и убедитесь, что база данных инициализирована."}
            className="strategies-table"
          />
        )}
      </Card>

      <Modal
        isOpen={showRebalanceDialog}
        onClose={() => setShowRebalanceDialog(false)}
        title="Перебалансировка стратегий"
        size="md"
        footer={rebalanceDialogFooter}
      >
        <div className="strategies-rebalance-content">
          {totalAllocation !== 100 && (
            <Alert
              variant="warning"
              title="Внимание"
              className="strategies-rebalance-warning"
            >
              Сумма распределения должна быть 100%. Текущая сумма: {totalAllocation.toFixed(2)}%
            </Alert>
          )}
          
          <div className="strategies-rebalance-list">
            {strategies.map(strategy => (
              <div key={strategy.id} className="strategies-rebalance-item">
                <div className="strategies-rebalance-item-header">
                  <label className="strategies-rebalance-item-label">{strategy.name}</label>
                  <span className="strategies-rebalance-item-value">
                    {rebalanceAllocations[strategy.id] || strategy.budgetAllocation}%
                  </span>
                </div>
                <div className="strategies-rebalance-item-slider">
                  <InputNumber
                    value={rebalanceAllocations[strategy.id] || strategy.budgetAllocation}
                    onValueChange={(e) => handleAllocationChange(strategy.id, e.value || 0)}
                    min={0}
                    max={100}
                    step={1}
                    showButtons
                    buttonLayout="horizontal"
                    fullWidth
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default StrategiesSection;

