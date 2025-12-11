import React from 'react';
import { Card } from 'primereact/card';
import { Badge } from 'primereact/badge';
import { Skeleton } from 'primereact/skeleton';
import { ProgressBar } from 'primereact/progressbar';
import { Tag } from 'primereact/tag';

export interface PortfolioSummary {
  totalValue: number;
  cash: number;
  investedAmount: number;
  totalPnL: number;
  totalPnLPercent: number;
  positionsCount: number;
  dayChange: number;
  dayChangePercent: number;
}

interface StrategyAllocation {
  id: number;
  name: string;
  type: 'conservative' | 'moderate' | 'aggressive';
  budgetAllocation?: number; // Процент от общей стоимости портфеля
  allocation?: {
    allocatedAmount: number;
    usedAmount: number;
    availableAmount: number;
    realUsedAmount?: number;
    positionsCount?: number;
  };
}

interface PortfolioSummaryCardProps {
  portfolio: PortfolioSummary | null;
  loading?: boolean;
  isConnected?: boolean;
  className?: string;
  strategies?: StrategyAllocation[];
}

const PortfolioSummaryCard: React.FC<PortfolioSummaryCardProps> = ({
  portfolio,
  loading = false,
  isConnected = false,
  className = '',
  strategies = []
}) => {
  const formatCurrency = (amount: number, currency: string = 'RUB') => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatPercent = (value: number) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  // Отладочный вывод
  React.useEffect(() => {
    console.log('📊 PortfolioSummaryCard - strategies:', strategies, 'isArray:', Array.isArray(strategies), 'length:', Array.isArray(strategies) ? strategies.length : 0);
  }, [strategies]);

  if (loading && !portfolio) {
    return (
      <Card title="💼 Сводка портфеля" className={className}>
        <div className="grid">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="col-12 md:col-3">
              <Skeleton width="100%" height="4rem" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (!portfolio) {
    return (
      <Card title="💼 Сводка портфеля" className={className}>
        <div className="text-center p-4 text-600">
          Нет данных о портфеле
        </div>
      </Card>
    );
  }

  // Проверяем корректность подсчета общих активов
  const calculatedTotalValue = portfolio.cash + portfolio.investedAmount;
  const totalValueMismatch = Math.abs(calculatedTotalValue - portfolio.totalValue) > 0.01;

  return (
    <Card title="💼 Сводка портфеля" className={className}>
      <div className="grid">
        <div className="col-12 md:col-2">
          <div className="text-center p-3 border-round surface-100">
            <div className="text-2xl font-bold text-primary mb-2">
              {formatCurrency(portfolio.totalValue)}
            </div>
            <div className="text-600">Общая стоимость</div>
            {isConnected && (
              <Badge value="LIVE" severity="success" className="mt-2" />
            )}
            {totalValueMismatch && (
              <div className="text-xs text-orange-500 mt-1">
                ⚠️ Несоответствие
              </div>
            )}
          </div>
        </div>
        
        <div className="col-12 md:col-2">
          <div className="text-center p-3 border-round surface-100">
            <div className="text-2xl font-bold text-green-600 mb-2">
              {formatCurrency(portfolio.cash)}
            </div>
            <div className="text-600">Наличные</div>
            <div className="text-sm text-600 mt-1">
              {portfolio.totalValue > 0 
                ? `${((portfolio.cash / portfolio.totalValue) * 100).toFixed(1)}% от портфеля`
                : '—'
              }
            </div>
          </div>
        </div>
        
        <div className="col-12 md:col-2">
          <div className="text-center p-3 border-round surface-100">
            <div className="text-2xl font-bold text-blue-600 mb-2">
              {formatCurrency(portfolio.investedAmount)}
            </div>
            <div className="text-600">В акциях</div>
            <div className="text-sm text-600 mt-1">
              {portfolio.totalValue > 0 
                ? `${((portfolio.investedAmount / portfolio.totalValue) * 100).toFixed(1)}% от портфеля`
                : '—'
              }
            </div>
          </div>
        </div>
        
        <div className="col-12 md:col-2">
          <div className="text-center p-3 border-round surface-100">
            <div className={`text-2xl font-bold mb-2 ${
              portfolio.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {formatCurrency(portfolio.totalPnL)}
            </div>
            <div className="text-600">Прибыль/убыток</div>
            <div className={`text-sm ${
              portfolio.totalPnLPercent >= 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {formatPercent(portfolio.totalPnLPercent)}
            </div>
          </div>
        </div>
        
        <div className="col-12 md:col-2">
          <div className="text-center p-3 border-round surface-100">
            <div className={`text-2xl font-bold mb-2 ${
              portfolio.dayChange >= 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {formatCurrency(portfolio.dayChange)}
            </div>
            <div className="text-600">Изменение за день</div>
            <div className={`text-sm ${
              portfolio.dayChangePercent >= 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {formatPercent(portfolio.dayChangePercent)}
            </div>
          </div>
        </div>
        
        <div className="col-12 md:col-2">
          <div className="text-center p-3 border-round surface-100">
            <div className="text-2xl font-bold text-blue-500 mb-2">
              {portfolio.positionsCount}
            </div>
            <div className="text-600">Позиций</div>
            <div className="text-sm text-600 mt-1">
              Активных позиций
            </div>
          </div>
        </div>
      </div>
      
      {/* Карточки распределения по стратегиям */}
      {Array.isArray(strategies) && strategies.length > 0 && (
        <div className="mt-4 pt-4 border-top-1 surface-border">
          <div className="text-lg font-semibold mb-3">💰 Распределение по стратегиям</div>
          <div className="grid">
            {strategies.map((strategy) => {
              const allocation = strategy.allocation;
              
              if (!allocation) {
                console.log('⚠️ Strategy without allocation:', strategy);
                return null;
              }

              // Пересчитываем выделенный бюджет на основе текущей стоимости портфеля
              const budgetAllocationPercent = strategy.budgetAllocation || 0;
              const allocatedAmount = portfolio.totalValue > 0
                ? (portfolio.totalValue * budgetAllocationPercent) / 100
                : (allocation.allocatedAmount || 0);
              
              const usedAmount = allocation.realUsedAmount !== undefined 
                ? allocation.realUsedAmount 
                : allocation.usedAmount || 0;
              const availableAmount = allocatedAmount - usedAmount;
              const usedPercent = allocatedAmount > 0 
                ? (usedAmount / allocatedAmount) * 100 
                : 0;
              const positionsCount = allocation.positionsCount || 0;

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

              return (
                <div key={strategy.id} className="col-12 md:col-4">
                  <div className="p-3 border-round surface-100 h-full">
                    <div className="flex align-items-center justify-content-between mb-3">
                      <div className="flex align-items-center gap-2">
                        <span className="text-xl">{getStrategyIcon(strategy.type)}</span>
                        <Tag 
                          value={strategy.name} 
                          severity={getStrategyColor(strategy.type) as any}
                        />
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="text-sm text-600 mb-1">Выделено</div>
                      <div className="text-lg font-bold text-primary">
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
                        <span className="text-base font-bold text-blue-500">
                          {positionsCount}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Проверка подсчета */}
      {totalValueMismatch && (
        <div className="mt-3 p-2 border-round surface-200">
          <div className="text-sm text-orange-600">
            <strong>⚠️ Обнаружено несоответствие в подсчете:</strong>
            <div className="mt-1">
              Наличные: {formatCurrency(portfolio.cash)} + В акциях: {formatCurrency(portfolio.investedAmount)} = {formatCurrency(calculatedTotalValue)}
            </div>
            <div>
              Общая стоимость (из API): {formatCurrency(portfolio.totalValue)}
            </div>
            <div className="text-xs text-600 mt-1">
              Разница: {formatCurrency(Math.abs(calculatedTotalValue - portfolio.totalValue))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default PortfolioSummaryCard;

