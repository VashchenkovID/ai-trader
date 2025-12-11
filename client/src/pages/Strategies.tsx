import React, { useState, useEffect, useRef } from 'react';
import { Card } from 'primereact/card';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Dialog } from 'primereact/dialog';
import { Toast } from 'primereact/toast';
import { ProgressBar } from 'primereact/progressbar';
import { Chart } from 'primereact/chart';
import { Slider } from 'primereact/slider';
import { Message } from 'primereact/message';
import { apiService } from '../services/apiService';

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

const Strategies: React.FC = () => {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRebalanceDialog, setShowRebalanceDialog] = useState(false);
  const [rebalanceAllocations, setRebalanceAllocations] = useState<Record<number, number>>({});
  const [rebalancing, setRebalancing] = useState(false);
  const [chartData, setChartData] = useState<any>(null);
  const toast = useRef<Toast>(null);

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
      if (data.length > 0) {
        updateChartData(data);
      }
      
      if (data.length === 0) {
        toast.current?.show({
          severity: 'info',
          summary: 'Информация',
          detail: 'Стратегии не найдены. Они будут созданы автоматически при первом запуске.',
          life: 5000
        });
      }
    } catch (error: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: error.response?.data?.message || error.message || 'Не удалось загрузить стратегии',
        life: 5000
      });
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

  const updateChartData = (strategiesData: Strategy[]) => {
    const labels = strategiesData.map(s => s.name);
    const allocated = strategiesData.map(s => s.allocation?.allocatedAmount || 0);
    const used = strategiesData.map(s => s.allocation?.usedAmount || 0);
    const available = strategiesData.map(s => s.allocation?.availableAmount || 0);

    setChartData({
      labels,
      datasets: [
        {
          label: 'Выделено',
          data: allocated,
          backgroundColor: '#42A5F5'
        },
        {
          label: 'Использовано',
          data: used,
          backgroundColor: '#66BB6A'
        },
        {
          label: 'Доступно',
          data: available,
          backgroundColor: '#EF5350'
        }
      ]
    });
  };

  const typeTemplate = (rowData: Strategy) => {
    const typeMap: Record<string, { label: string; severity: string }> = {
      conservative: { label: 'Консервативная', severity: 'info' },
      moderate: { label: 'Умеренная', severity: 'warning' },
      aggressive: { label: 'Агрессивная', severity: 'danger' }
    };
    const typeInfo = typeMap[rowData.type] || { label: rowData.type, severity: 'secondary' };
    return <Tag value={typeInfo.label} severity={typeInfo.severity as any} />;
  };

  const timeframeTemplate = (rowData: Strategy) => {
    const timeframeMap: Record<string, string> = {
      long: 'Долгосрочная',
      medium: 'Среднесрочная',
      short: 'Краткосрочная'
    };
    return <span>{timeframeMap[rowData.timeframe] || rowData.timeframe}</span>;
  };

  const allocationTemplate = (rowData: Strategy) => {
    const allocation = rowData.allocation;
    if (!allocation) return <span>—</span>;
    
    const usedPercent = allocation.allocatedAmount > 0 
      ? (allocation.usedAmount / allocation.allocatedAmount) * 100 
      : 0;

    // Показываем реальное использование, если оно отличается от usedAmount
    const showRealUsage = allocation.realUsedAmount !== undefined && 
                         Math.abs(allocation.realUsedAmount - allocation.usedAmount) > 0.01;

    return (
      <div>
        <div className="mb-2">
          <ProgressBar value={usedPercent} showValue={false} />
        </div>
        <div className="text-sm">
          <div>Выделено: {formatCurrency(allocation.allocatedAmount)}</div>
          <div>
            Использовано: {formatCurrency(allocation.usedAmount)}
            {showRealUsage && (
              <span className="text-500 ml-2">
                (реально: {formatCurrency(allocation.realUsedAmount || 0)})
              </span>
            )}
          </div>
          <div className="font-semibold">Доступно: {formatCurrency(allocation.availableAmount)}</div>
          {allocation.positionsCount !== undefined && allocation.positionsCount > 0 && (
            <div className="text-500 text-xs mt-1">
              Активных позиций: {allocation.positionsCount}
            </div>
          )}
        </div>
      </div>
    );
  };

  const statsTemplate = (rowData: Strategy) => {
    const stats = rowData.stats;
    if (!stats || stats.closedPositions === 0) {
      return <span className="text-500">Нет данных</span>;
    }

    return (
      <div className="text-sm">
        <div>Позиций: {stats.totalPositions}</div>
        <div>Процент побед: <span className={stats.winRate > 0.5 ? 'text-green-500' : 'text-red-500'}>{(stats.winRate * 100).toFixed(1)}%</span></div>
        <div>Средний результат: <span className={stats.averageResult > 0 ? 'text-green-500' : 'text-red-500'}>{stats.averageResult > 0 ? '+' : ''}{stats.averageResult.toFixed(2)}%</span></div>
      </div>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const handleRebalance = () => {
    const allocations: Record<number, number> = {};
    strategies.forEach(s => {
      allocations[s.id] = s.budgetAllocation;
    });
    setRebalanceAllocations(allocations);
    setShowRebalanceDialog(true);
  };

  const handleRebalanceConfirm = async () => {
    try {
      setRebalancing(true);
      await apiService.rebalanceStrategies(rebalanceAllocations);
      toast.current?.show({
        severity: 'success',
        summary: 'Успешно',
        detail: 'Стратегии перебалансированы',
        life: 3000
      });
      setShowRebalanceDialog(false);
      await loadStrategies();
    } catch (error: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: error.response?.data?.message || 'Не удалось перебалансировать стратегии',
        life: 5000
      });
    } finally {
      setRebalancing(false);
    }
  };

  const handleAllocationChange = (strategyId: number, value: number) => {
    setRebalanceAllocations(prev => ({
      ...prev,
      [strategyId]: value
    }));
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };

  const pieChartData = strategies.length > 0 ? {
    labels: strategies.map(s => s.name),
    datasets: [{
      data: strategies.map(s => s.budgetAllocation),
      backgroundColor: [
        '#42A5F5',
        '#66BB6A',
        '#EF5350'
      ]
    }]
  } : null;

  const totalAllocation = Object.values(rebalanceAllocations).reduce((sum, val) => sum + val, 0);

  return (
    <div className="p-4">
      <Toast ref={toast} />
      
      <Card title="Управление торговыми стратегиями" className="mb-4">
        {strategies.length === 0 && !loading && (
          <Message 
            severity="info" 
            text="Стратегии не найдены. Стратегии будут созданы автоматически при первом запуске сервера." 
            className="mb-3"
          />
        )}
        
        <div className="flex justify-content-between align-items-center mb-4">
          <div>
            <h3 className="mt-0 mb-2">Распределение бюджета</h3>
            <p className="text-600 m-0">Управляйте распределением капитала между стратегиями</p>
          </div>
          <Button 
            label="Перебалансировать" 
            icon="pi pi-refresh" 
            onClick={handleRebalance}
            className="p-button-outlined"
          />
        </div>

        {strategies.length > 0 && (
          <>
            {pieChartData && (
              <div className="mb-4" style={{ height: '300px' }}>
                <Chart type="pie" data={pieChartData} options={{ responsive: true, maintainAspectRatio: false }} />
              </div>
            )}

            {chartData && (
              <div className="mb-4" style={{ height: '300px' }}>
                <Chart type="bar" data={chartData} options={chartOptions} />
              </div>
            )}
          </>
        )}

        <DataTable 
          value={strategies} 
          loading={loading}
          paginator 
          rows={10}
          emptyMessage={loading ? "Загрузка стратегий..." : "Стратегии не найдены. Проверьте подключение к серверу и убедитесь, что база данных инициализирована."}
        >
          <Column field="name" header="Название" sortable />
          <Column field="type" header="Тип" body={typeTemplate} sortable />
          <Column field="timeframe" header="Горизонт" body={timeframeTemplate} sortable />
          <Column field="budgetAllocation" header="Бюджет %" sortable body={(row) => `${row.budgetAllocation}%`} />
          <Column field="allocation" header="Распределение" body={allocationTemplate} />
          <Column field="minConfidence" header="Мин. Уверенность" body={(row) => `${(row.minConfidence * 100).toFixed(0)}%`} />
          <Column field="minScore" header="Мин. Оценка" body={(row) => `${(row.minScore * 100).toFixed(0)}%`} />
          <Column field="stopLossPercent" header="Стоп-лосс" body={(row) => `${row.stopLossPercent}%`} />
          <Column field="takeProfitPercent" header="Тейк-профит" body={(row) => `${row.takeProfitPercent}%`} />
          <Column field="stats" header="Статистика" body={statsTemplate} />
          <Column field="isActive" header="Активна" body={(row) => <Tag value={row.isActive ? 'Да' : 'Нет'} severity={row.isActive ? 'success' : 'danger'} />} />
        </DataTable>
      </Card>

      <Dialog
        header="Перебалансировка стратегий"
        visible={showRebalanceDialog}
        onHide={() => setShowRebalanceDialog(false)}
        style={{ width: '600px' }}
        footer={
          <div>
            <Button 
              label="Отмена" 
              icon="pi pi-times" 
              onClick={() => setShowRebalanceDialog(false)}
              className="p-button-text"
            />
            <Button 
              label="Применить" 
              icon="pi pi-check" 
              onClick={handleRebalanceConfirm}
              disabled={rebalancing || Math.abs(totalAllocation - 100) > 0.01}
              loading={rebalancing}
            />
          </div>
        }
      >
        <div className="mb-4">
          {totalAllocation !== 100 && (
            <Message 
              severity="warn" 
              text={`Сумма распределения должна быть 100%. Текущая сумма: ${totalAllocation.toFixed(2)}%`}
              className="mb-3"
            />
          )}
          
          {strategies.map(strategy => (
            <div key={strategy.id} className="mb-4">
              <div className="flex justify-content-between align-items-center mb-2">
                <label className="font-semibold">{strategy.name}</label>
                <span className="text-600">{rebalanceAllocations[strategy.id] || strategy.budgetAllocation}%</span>
              </div>
              <Slider
                value={rebalanceAllocations[strategy.id] || strategy.budgetAllocation}
                onChange={(e) => handleAllocationChange(strategy.id, e.value as number)}
                min={0}
                max={100}
                step={1}
              />
            </div>
          ))}
        </div>
      </Dialog>
    </div>
  );
};

export default Strategies;

