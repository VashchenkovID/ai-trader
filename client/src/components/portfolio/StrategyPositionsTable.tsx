import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from 'primereact/card';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { translateRecommendation } from '../../utils/recommendationTranslator';
import { Position } from './PortfolioPositionsTable';

interface StrategyPositionsTableProps {
  strategyId: number;
  strategyName: string;
  strategyType: 'conservative' | 'moderate' | 'aggressive';
  positions: Position[];
  loading?: boolean;
  className?: string;
}

const StrategyPositionsTable: React.FC<StrategyPositionsTableProps> = ({
  strategyId,
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

  const tickerTemplate = (rowData: Position) => {
    const ticker = rowData.ticker && rowData.ticker !== 'Неизвестно' ? rowData.ticker : rowData.figi?.substring(0, 10) || '—';
    const name = rowData.name && rowData.name !== 'Неизвестно' ? rowData.name : 'Название недоступно';
    
    return (
      <div 
        className="flex align-items-center gap-2 cursor-pointer hover:text-primary transition-colors"
        onClick={() => navigate(`/stock/${rowData.figi}`)}
        title="Нажмите для просмотра детальной информации"
      >
        <div>
          <div className="font-medium">{name}</div>
          <div className="text-sm text-600">{ticker}</div>
        </div>
      </div>
    );
  };

  const quantityTemplate = (rowData: Position) => {
    const quantity = typeof rowData.quantity === 'number' && !isNaN(rowData.quantity) && isFinite(rowData.quantity) && rowData.quantity > 0
      ? rowData.quantity
      : 0;
    
    return (
      <div className="text-left">
        <div className="font-medium">{quantity > 0 ? quantity.toLocaleString('ru-RU') : '—'}</div>
        <div className="text-sm text-600">шт.</div>
      </div>
    );
  };

  const priceTemplate = (rowData: Position) => {
    const currentPrice = typeof rowData.currentPrice === 'number' && !isNaN(rowData.currentPrice) && isFinite(rowData.currentPrice) 
      ? rowData.currentPrice 
      : 0;
    
    return (
      <div className="text-left">
        <div className="font-medium">
          {currentPrice > 0 ? formatCurrency(currentPrice, rowData.currency) : '—'}
        </div>
      </div>
    );
  };

  const purchasePriceTemplate = (rowData: Position) => {
    const averagePrice = typeof rowData.averagePrice === 'number' && !isNaN(rowData.averagePrice) && isFinite(rowData.averagePrice)
      ? rowData.averagePrice
      : 0;
    
    return (
      <div className="text-left">
        <div className="font-medium">
          {averagePrice > 0 ? formatCurrency(averagePrice, rowData.currency) : '—'}
        </div>
      </div>
    );
  };

  const priceDifferenceTemplate = (rowData: Position) => {
    const currentPrice = typeof rowData.currentPrice === 'number' && !isNaN(rowData.currentPrice) && isFinite(rowData.currentPrice) 
      ? rowData.currentPrice 
      : 0;
    const averagePrice = typeof rowData.averagePrice === 'number' && !isNaN(rowData.averagePrice) && isFinite(rowData.averagePrice)
      ? rowData.averagePrice
      : 0;
    
    if (averagePrice === 0 || currentPrice === 0) {
      return <div className="text-left">—</div>;
    }
    
    const difference = currentPrice - averagePrice;
    const differencePercent = (difference / averagePrice) * 100;
    const isPositive = difference >= 0;
    
    return (
      <div className="text-left">
        <div className={`font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
          {formatCurrency(difference, rowData.currency)}
        </div>
        <div className={`text-sm ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
          {formatPercent(differencePercent)}
        </div>
      </div>
    );
  };

  const pnlTemplate = (rowData: Position) => (
    <div className="text-left">
      <div className={`font-medium ${rowData.unrealizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
        {formatCurrency(rowData.unrealizedPnL)}
      </div>
      <div className={`text-sm ${rowData.unrealizedPnLPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
        {formatPercent(rowData.unrealizedPnLPercent)}
      </div>
    </div>
  );

  const predictionTemplate = (rowData: Position) => {
    if (!rowData.prediction) return <div className="text-left">—</div>;

    const { recommendation, score, confidence } = rowData.prediction;
    const severity =
      recommendation === 'BUY' ? 'success' :
      recommendation === 'SELL' ? 'danger' : 'info';

    return (
      <div className="text-left">
        <Tag value={translateRecommendation(recommendation)} severity={severity as any} />
        {(score !== undefined || confidence !== undefined) && (
          <div className="text-sm text-600 mt-1">
            {score !== undefined ? `Score: ${(score * 100).toFixed(1)}%` : ''}
            {score !== undefined && confidence !== undefined ? ' · ' : ''}
            {confidence !== undefined ? `Conf: ${(confidence * 100).toFixed(1)}%` : ''}
          </div>
        )}
      </div>
    );
  };

  const getStrategyColor = () => {
    switch (strategyType) {
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

  if (positions.length === 0 && !loading) {
    return null; // Не показываем таблицу, если нет позиций
  }

  return (
    <Card 
      title={
        <div className="flex align-items-center gap-2">
          <Tag value={strategyName} severity={getStrategyColor() as any} />
          <span className="text-sm text-600">({positions.length} позиций)</span>
        </div>
      }
      className={className}
    >
      <DataTable 
        value={positions} 
        loading={loading}
        emptyMessage={`Нет позиций в стратегии "${strategyName}"`}
        paginator={positions.length > 10}
        rows={10}
        sortMode="multiple"
        className="p-datatable-sm"
      >
        <Column 
          field="ticker" 
          header="Инструмент" 
          body={tickerTemplate}
          sortable
          style={{ minWidth: '200px' }}
        />
        <Column 
          field="quantity" 
          header="Количество" 
          body={quantityTemplate}
          sortable
          style={{ minWidth: '120px' }}
        />
        <Column 
          field="currentPrice" 
          header="Текущая цена" 
          body={priceTemplate}
          sortable
          style={{ minWidth: '140px' }}
        />
        <Column 
          field="averagePrice" 
          header="Цена закупки" 
          body={purchasePriceTemplate}
          sortable
          style={{ minWidth: '140px' }}
        />
        <Column 
          field="priceDifference" 
          header="Разница в цене" 
          body={priceDifferenceTemplate}
          sortable
          style={{ minWidth: '160px' }}
        />
        <Column 
          field="unrealizedPnL" 
          header="P&L" 
          body={pnlTemplate}
          sortable
          style={{ minWidth: '140px' }}
        />
        <Column 
          field="prediction" 
          header="Предсказание стратегии" 
          body={predictionTemplate}
          sortable
          style={{ minWidth: '180px' }}
        />
      </DataTable>
    </Card>
  );
};

export default StrategyPositionsTable;

