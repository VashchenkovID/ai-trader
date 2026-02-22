import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../ui/Card/Card';
import { Table, TableColumn } from '../ui/Table/Table';
import { Badge } from '../ui/Badge/Badge';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { translateRecommendation } from '../../utils/recommendationTranslator';
import { Position } from './PortfolioPositionsTable';
import './StrategyPositionsTable.css';

interface StrategyPositionsTableProps {
  strategyId: number;
  strategyName: string;
  strategyType: 'conservative' | 'moderate' | 'aggressive';
  positions: Position[];
  loading?: boolean;
  className?: string;
}

const StrategyPositionsTable: React.FC<StrategyPositionsTableProps> = ({
  strategyId: _strategyId,
  strategyName,
  strategyType,
  positions,
  loading = false,
  className = ''
}) => {
  const navigate = useNavigate();

  const formatCurrency = (amount: number, currency: string = 'RUB') => {
    if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
      return '—';
    }
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatPercent = (value: number) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const getStrategyVariant = (): 'info' | 'warning' | 'error' | 'neutral' => {
    switch (strategyType) {
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

  // Определение колонок для таблицы
  const columns: TableColumn<Position>[] = useMemo(() => [
    {
      key: 'ticker',
      header: 'Инструмент',
      sortable: true,
      render: (_value, row) => {
        const ticker = row.ticker && row.ticker !== 'Неизвестно' ? row.ticker : row.figi?.substring(0, 10) || '—';
        const name = row.name && row.name !== 'Неизвестно' ? row.name : 'Название недоступно';
        
        return (
          <div 
            className="strategy-positions-ticker"
            onClick={() => navigate(`/stock/${row.figi}`)}
            title="Нажмите для просмотра детальной информации"
          >
            <div className="strategy-positions-ticker-name">{name}</div>
            <div className="strategy-positions-ticker-symbol">{ticker}</div>
          </div>
        );
      },
    },
    {
      key: 'quantity',
      header: 'Количество',
      sortable: true,
      render: (_value, row) => {
        const quantity = typeof row.quantity === 'number' && !isNaN(row.quantity) && isFinite(row.quantity) && row.quantity > 0
          ? row.quantity
          : 0;
        
        return (
          <div className="strategy-positions-cell">
            <div className="strategy-positions-value">
              {quantity > 0 ? quantity.toLocaleString('ru-RU') : '—'}
            </div>
            <div className="strategy-positions-subtext">шт.</div>
          </div>
        );
      },
    },
    {
      key: 'currentPrice',
      header: 'Текущая цена',
      sortable: true,
      render: (_value, row) => {
        const currentPrice = typeof row.currentPrice === 'number' && !isNaN(row.currentPrice) && isFinite(row.currentPrice) 
          ? row.currentPrice 
          : 0;
        
        return (
          <div className="strategy-positions-cell">
            <div className="strategy-positions-value">
              {currentPrice > 0 ? formatCurrency(currentPrice, row.currency) : '—'}
            </div>
          </div>
        );
      },
    },
    {
      key: 'averagePrice',
      header: 'Цена закупки',
      sortable: true,
      render: (_value, row) => {
        const averagePrice = typeof row.averagePrice === 'number' && !isNaN(row.averagePrice) && isFinite(row.averagePrice)
          ? row.averagePrice
          : 0;
        
        return (
          <div className="strategy-positions-cell">
            <div className="strategy-positions-value">
              {averagePrice > 0 ? formatCurrency(averagePrice, row.currency) : '—'}
            </div>
          </div>
        );
      },
    },
    {
      key: 'priceDifference',
      header: 'Разница в цене',
      sortable: true,
      render: (_value, row) => {
        const currentPrice = typeof row.currentPrice === 'number' && !isNaN(row.currentPrice) && isFinite(row.currentPrice) 
          ? row.currentPrice 
          : 0;
        const averagePrice = typeof row.averagePrice === 'number' && !isNaN(row.averagePrice) && isFinite(row.averagePrice)
          ? row.averagePrice
          : 0;
        
        if (averagePrice === 0 || currentPrice === 0) {
          return <div className="strategy-positions-cell">—</div>;
        }
        
        const difference = currentPrice - averagePrice;
        const differencePercent = (difference / averagePrice) * 100;
        const isPositive = difference >= 0;
        
        return (
          <div className="strategy-positions-cell">
            <div className={`strategy-positions-value ${isPositive ? 'strategy-positions-positive' : 'strategy-positions-negative'}`}>
              {formatCurrency(difference, row.currency)}
            </div>
            <div className={`strategy-positions-subtext ${isPositive ? 'strategy-positions-positive' : 'strategy-positions-negative'}`}>
              {formatPercent(differencePercent)}
            </div>
          </div>
        );
      },
    },
    {
      key: 'unrealizedPnL',
      header: 'P&L',
      sortable: true,
      render: (_value, row) => (
        <div className="strategy-positions-cell">
          <div className={`strategy-positions-value ${row.unrealizedPnL >= 0 ? 'strategy-positions-positive' : 'strategy-positions-negative'}`}>
            {formatCurrency(row.unrealizedPnL)}
          </div>
          <div className={`strategy-positions-subtext ${row.unrealizedPnLPercent >= 0 ? 'strategy-positions-positive' : 'strategy-positions-negative'}`}>
            {formatPercent(row.unrealizedPnLPercent)}
          </div>
        </div>
      ),
    },
    {
      key: 'prediction',
      header: 'Предсказание стратегии',
      sortable: false,
      render: (_value, row) => {
        if (!row.prediction) return <div className="strategy-positions-cell">—</div>;

        const { recommendation, score, confidence } = row.prediction;
        const variant =
          recommendation === 'BUY' ? 'success' :
          recommendation === 'SELL' ? 'error' : 'info';

        return (
          <div className="strategy-positions-cell">
            <Badge variant={variant} size="sm">
              {translateRecommendation(recommendation)}
            </Badge>
            {(score !== undefined || confidence !== undefined) && (
              <div className="strategy-positions-prediction-details">
                {score !== undefined ? `Score: ${(score * 100).toFixed(1)}%` : ''}
                {score !== undefined && confidence !== undefined ? ' · ' : ''}
                {confidence !== undefined ? `Conf: ${(confidence * 100).toFixed(1)}%` : ''}
              </div>
            )}
          </div>
        );
      },
    },
  ], [navigate]);

  // Всегда показываем таблицу, даже если позиций нет

  return (
    <Card 
      header={
        <div className="strategy-positions-header">
          <Badge variant={getStrategyVariant()} size="md">
            {strategyName}
          </Badge>
          <span className="strategy-positions-count">({positions.length} позиций)</span>
        </div>
      }
      className={`strategy-positions-card ${className}`}
    >
      {loading ? (
        <div className="strategy-positions-loading">
          <Skeleton height={200} />
        </div>
      ) : (
        <Table
          data={positions}
          columns={columns}
          size="sm"
          sortable
          hoverable
          emptyMessage={`Нет позиций в стратегии "${strategyName}"`}
          className="strategy-positions-table"
          virtualized={positions.length > 25}
          virtualHeight={500}
          virtualRowHeight={60}
          virtualOverscan={6}
        />
      )}
    </Card>
  );
};

export default StrategyPositionsTable;

