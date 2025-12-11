import React from 'react';
import { Card } from 'primereact/card';
import { ProgressBar } from 'primereact/progressbar';
import { Tag } from 'primereact/tag';
import { Skeleton } from 'primereact/skeleton';

interface StrategyAllocation {
  id: number;
  name: string;
  type: 'conservative' | 'moderate' | 'aggressive';
  allocation?: {
    allocatedAmount: number;
    usedAmount: number;
    availableAmount: number;
    realUsedAmount?: number;
    positionsCount?: number;
  };
}

interface StrategyAllocationCardsProps {
  strategies: StrategyAllocation[];
  loading?: boolean;
  className?: string;
}

const StrategyAllocationCards: React.FC<StrategyAllocationCardsProps> = ({
  strategies,
  loading = false,
  className = ''
}) => {
  const formatCurrency = (amount: number) => {
    if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
      return '—';
    }
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getStrategyColor = (type: string) => {
    switch (type) {
      case 'conservative':
        return 'info';
      case 'moderate':
        return 'warning';
      case 'aggressive':
        return 'danger';
      default:
        return 'secondary';
    }
  };

  const getStrategyIcon = (type: string) => {
    switch (type) {
      case 'conservative':
        return '🛡️';
      case 'moderate':
        return '⚖️';
      case 'aggressive':
        return '⚡';
      default:
        return '📊';
    }
  };

  if (loading) {
    return (
      <Card title="💰 Распределение по стратегиям" className={className}>
        <div className="grid">
          {[1, 2, 3].map((item) => (
            <div key={item} className="col-12 md:col-4">
              <Skeleton width="100%" height="12rem" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  // Проверяем, что strategies - это массив
  const strategiesArray = Array.isArray(strategies) ? strategies : [];
  
  if (strategiesArray.length === 0) {
    return null;
  }

  return (
    <Card title="💰 Распределение по стратегиям" className={className}>
      <div className="grid">
        {strategiesArray.map((strategy) => {
          const allocation = strategy.allocation;
          if (!allocation) return null;

          const allocatedAmount = allocation.allocatedAmount || 0;
          const usedAmount = allocation.realUsedAmount !== undefined 
            ? allocation.realUsedAmount 
            : allocation.usedAmount || 0;
          const availableAmount = allocation.availableAmount || 0;
          const usedPercent = allocatedAmount > 0 
            ? (usedAmount / allocatedAmount) * 100 
            : 0;
          const positionsCount = allocation.positionsCount || 0;

          return (
            <div key={strategy.id} className="col-12 md:col-4">
              <div className="p-3 border-round surface-100 h-full">
                <div className="flex align-items-center justify-content-between mb-3">
                  <div className="flex align-items-center gap-2">
                    <span className="text-2xl">{getStrategyIcon(strategy.type)}</span>
                    <Tag 
                      value={strategy.name} 
                      severity={getStrategyColor(strategy.type) as any}
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <div className="text-sm text-600 mb-1">Выделено</div>
                  <div className="text-xl font-bold text-primary">
                    {formatCurrency(allocatedAmount)}
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex justify-content-between mb-1">
                    <span className="text-sm text-600">Использовано</span>
                    <span className="text-sm font-semibold">
                      {usedPercent.toFixed(1)}%
                    </span>
                  </div>
                  <ProgressBar 
                    value={usedPercent} 
                    showValue={false}
                    color={usedPercent > 90 ? '#ef4444' : usedPercent > 70 ? '#f59e0b' : '#22c55e'}
                  />
                  <div className="flex justify-content-between mt-1">
                    <span className="text-sm text-600">
                      {formatCurrency(usedAmount)}
                    </span>
                    <span className="text-sm text-600">
                      Доступно: {formatCurrency(availableAmount)}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-top-1 surface-border">
                  <div className="flex justify-content-between align-items-center">
                    <span className="text-sm text-600">Позиций:</span>
                    <span className="text-lg font-bold text-blue-500">
                      {positionsCount}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default StrategyAllocationCards;

