import React from 'react';
import { Card } from '../ui/Card/Card';
import { Badge } from '../ui/Badge/Badge';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { ProgressBar } from '../ui/ProgressBar/ProgressBar';
import './PortfolioSummaryCard.css';

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
  strategyPositions?: Record<number, any[]>; // Позиции по стратегиям для пересчета использованных средств
}

const PortfolioSummaryCard: React.FC<PortfolioSummaryCardProps> = ({
  portfolio,
  loading = false,
  isConnected = false,
  className = '',
  strategies = [],
  strategyPositions = {}
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
      <Card 
        header={<h3 className="portfolio-summary-title">💼 Сводка портфеля</h3>}
        className={`portfolio-summary-card ${className}`}
      >
        <div className="portfolio-summary-grid">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div key={item} className="portfolio-summary-metric">
              <Skeleton variant="rectangular" height="120px" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (!portfolio) {
    return (
      <Card 
        header={<h3 className="portfolio-summary-title">💼 Сводка портфеля</h3>}
        className={`portfolio-summary-card ${className}`}
      >
        <div className="portfolio-summary-empty">
          Нет данных о портфеле
        </div>
      </Card>
    );
  }

  // Проверяем корректность подсчета общих активов
  const calculatedTotalValue = portfolio.cash + portfolio.investedAmount;
  const totalValueMismatch = Math.abs(calculatedTotalValue - portfolio.totalValue) > 0.01;

  return (
    <Card 
      header={<h3 className="portfolio-summary-title">💼 Сводка портфеля</h3>}
      className={`portfolio-summary-card ${className}`}
    >
      <div className="portfolio-summary-grid">
        <div className="portfolio-summary-metric portfolio-summary-metric-total">
          <div className="portfolio-summary-metric-content">
            <div className="portfolio-summary-metric-value portfolio-summary-metric-primary">
              {formatCurrency(portfolio.totalValue)}
            </div>
            <div className="portfolio-summary-metric-label">Общая стоимость</div>
            {isConnected && (
              <Badge variant="success" size="sm" className="portfolio-summary-live-badge">
                LIVE
              </Badge>
            )}
            {totalValueMismatch && (
              <div className="portfolio-summary-mismatch">
                ⚠️ Несоответствие
              </div>
            )}
          </div>
        </div>
        
        <div className="portfolio-summary-metric portfolio-summary-metric-cash">
          <div className="portfolio-summary-metric-content">
            <div className="portfolio-summary-metric-value portfolio-summary-metric-success">
              {formatCurrency(portfolio.cash)}
            </div>
            <div className="portfolio-summary-metric-label">Наличные</div>
            <div className="portfolio-summary-metric-subtext">
              {portfolio.totalValue > 0 
                ? `${((portfolio.cash / portfolio.totalValue) * 100).toFixed(1)}% от портфеля`
                : '—'
              }
            </div>
          </div>
        </div>
        
        <div className="portfolio-summary-metric portfolio-summary-metric-invested">
          <div className="portfolio-summary-metric-content">
            <div className="portfolio-summary-metric-value portfolio-summary-metric-info">
              {formatCurrency(portfolio.investedAmount)}
            </div>
            <div className="portfolio-summary-metric-label">В акциях</div>
            <div className="portfolio-summary-metric-subtext">
              {portfolio.totalValue > 0 
                ? `${((portfolio.investedAmount / portfolio.totalValue) * 100).toFixed(1)}% от портфеля`
                : '—'
              }
            </div>
          </div>
        </div>
        
        <div className="portfolio-summary-metric portfolio-summary-metric-pnl">
          <div className="portfolio-summary-metric-content">
            <div className={`portfolio-summary-metric-value ${
              portfolio.totalPnL >= 0 ? 'portfolio-summary-metric-success' : 'portfolio-summary-metric-error'
            }`}>
              {formatCurrency(portfolio.totalPnL)}
            </div>
            <div className="portfolio-summary-metric-label">Прибыль/убыток</div>
            <div className={`portfolio-summary-metric-subtext ${
              portfolio.totalPnLPercent >= 0 ? 'portfolio-summary-metric-success' : 'portfolio-summary-metric-error'
            }`}>
              {formatPercent(portfolio.totalPnLPercent)}
            </div>
          </div>
        </div>
        
        <div className="portfolio-summary-metric portfolio-summary-metric-positions">
          <div className="portfolio-summary-metric-content">
            <div className="portfolio-summary-metric-value portfolio-summary-metric-info">
              {portfolio.positionsCount}
            </div>
            <div className="portfolio-summary-metric-label">Позиций</div>
            <div className="portfolio-summary-metric-subtext">
              Активных позиций
            </div>
          </div>
        </div>
      </div>
      
      {/* Карточки распределения по стратегиям */}
      {Array.isArray(strategies) && strategies.length > 0 && (
        <div className="portfolio-summary-strategies">
          <div className="portfolio-summary-strategies-title">💰 Распределение по стратегиям</div>
          <div className="portfolio-summary-strategies-grid">
            {strategies.map((strategy) => {
              const allocation = strategy.allocation;
              
              if (!allocation) {
                console.log('⚠️ Strategy without allocation:', strategy);
                return null;
              }

              // Для виртуального портфеля используем allocatedAmount из бэкенда напрямую
              // (он уже правильно рассчитан на основе totalValue портфеля)
              const allocatedAmount = allocation.allocatedAmount || 0;
              
              // Используем реальные данные из позиций для расчета использованных средств и количества позиций
              const strategyPositionsList = strategyPositions[strategy.id] || [];
              const positionsCount = strategyPositionsList.length;
              
              // Рассчитываем использованные средства как сумму marketValue всех позиций стратегии
              // ВАЖНО: marketValue в позициях - это общая стоимость позиции (не по стратегии)
              // Но quantity - это количество для конкретной стратегии
              // Поэтому для расчета usedAmount нужно использовать: currentPrice * quantity (для стратегии)
              let usedAmount = 0;
              if (strategyPositionsList.length > 0) {
                usedAmount = strategyPositionsList.reduce((sum, pos) => {
                  // Используем currentPrice * quantity для этой стратегии
                  // Если currentPrice нет, используем averagePrice * quantity
                  const currentPrice = pos.currentPrice || pos.averagePrice || 0;
                  const quantity = pos.quantity || 0;
                  const positionValue = currentPrice > 0 && quantity > 0 
                    ? currentPrice * quantity
                    : (pos.marketValue !== undefined && pos.marketValue !== null
                    ? pos.marketValue
                        : ((pos.averagePrice || 0) * (pos.quantity || 0)));
                  return sum + (positionValue || 0);
                }, 0);
              } else {
                // Если позиций нет, используем данные из allocation
                usedAmount = allocation.realUsedAmount !== undefined && allocation.realUsedAmount !== null
                  ? allocation.realUsedAmount
                  : (allocation.usedAmount || 0);
              }
              
              const availableAmount = allocatedAmount - usedAmount;
              
              // Рассчитываем процент использования с точностью до 2 знаков
              const usedPercent = allocatedAmount > 0 
                ? Math.round((usedAmount / allocatedAmount) * 10000) / 100  // Округляем до 2 знаков
                : 0;

              const getStrategyVariant = (type: string): 'info' | 'warning' | 'error' | 'neutral' => {
                switch (type) {
                  case 'conservative':
                    return 'info';
                  case 'moderate':
                    return 'warning';
                  case 'aggressive':
                    return 'error';
                  default:
                    return 'neutral';
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

              const getProgressVariant = (percent: number): 'success' | 'warning' | 'error' => {
                if (percent > 90) return 'error';
                if (percent > 70) return 'warning';
                return 'success';
              };

              return (
                <div key={strategy.id} className="portfolio-summary-strategy-card">
                  <div className="portfolio-summary-strategy-header">
                    <div className="portfolio-summary-strategy-icon">{getStrategyIcon(strategy.type)}</div>
                    <Badge variant={getStrategyVariant(strategy.type)} size="sm">
                      {strategy.name}
                    </Badge>
                  </div>

                  <div className="portfolio-summary-strategy-allocated">
                    <div className="portfolio-summary-strategy-label">Выделено</div>
                    <div className="portfolio-summary-strategy-amount">
                      {formatCurrency(allocatedAmount)}
                    </div>
                  </div>

                  <div className="portfolio-summary-strategy-progress">
                    <div className="portfolio-summary-strategy-progress-header">
                      <span className="portfolio-summary-strategy-label">Использовано</span>
                      <span className="portfolio-summary-strategy-percent">
                        {usedPercent.toFixed(1)}%
                      </span>
                    </div>
                    <ProgressBar 
                      value={usedPercent} 
                      variant={getProgressVariant(usedPercent)}
                      size="sm"
                    />
                    <div className="portfolio-summary-strategy-progress-footer">
                      <span className="portfolio-summary-strategy-text">
                        {formatCurrency(usedAmount)}
                      </span>
                      <span className="portfolio-summary-strategy-text">
                        Доступно: {formatCurrency(availableAmount)}
                      </span>
                    </div>
                  </div>

                  <div className="portfolio-summary-strategy-positions">
                    <span className="portfolio-summary-strategy-label">Позиций:</span>
                    <span className="portfolio-summary-strategy-positions-count">
                      {positionsCount}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Проверка подсчета */}
      {totalValueMismatch && (
        <div className="portfolio-summary-mismatch-warning">
          <div className="portfolio-summary-mismatch-title">
            <strong>⚠️ Обнаружено несоответствие в подсчете:</strong>
          </div>
          <div className="portfolio-summary-mismatch-details">
            Наличные: {formatCurrency(portfolio.cash)} + В акциях: {formatCurrency(portfolio.investedAmount)} = {formatCurrency(calculatedTotalValue)}
          </div>
          <div className="portfolio-summary-mismatch-details">
            Общая стоимость (из API): {formatCurrency(portfolio.totalValue)}
          </div>
          <div className="portfolio-summary-mismatch-diff">
            Разница: {formatCurrency(Math.abs(calculatedTotalValue - portfolio.totalValue))}
          </div>
        </div>
      )}
    </Card>
  );
};

export default PortfolioSummaryCard;

