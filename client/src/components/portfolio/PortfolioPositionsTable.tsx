import React from 'react';
import { Card } from 'primereact/card';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Message } from 'primereact/message';

export interface Position {
  figi: string;
  ticker: string;
  name: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  weight: number;
  sector: string;
  currency: string;
  lastUpdate: string;
}

interface PortfolioPositionsTableProps {
  positions: Position[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  className?: string;
}

const PortfolioPositionsTable: React.FC<PortfolioPositionsTableProps> = ({
  positions,
  loading = false,
  error = null,
  onRefresh,
  className = ''
}) => {
  const formatCurrency = (amount: number, currency: string = 'RUB') => {
    // Проверяем, что amount - это валидное число
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
      <div className="flex align-items-center gap-2">
        <div>
          <div className="font-medium">{ticker}</div>
          <div className="text-sm text-600">{name}</div>
        </div>
      </div>
    );
  };

  const quantityTemplate = (rowData: Position) => (
    <div className="text-right">
      <div className="font-medium">{rowData.quantity.toLocaleString('ru-RU')}</div>
      <div className="text-sm text-600">{rowData.currency}</div>
    </div>
  );

  const priceTemplate = (rowData: Position) => {
    const currentPrice = typeof rowData.currentPrice === 'number' && !isNaN(rowData.currentPrice) && isFinite(rowData.currentPrice) 
      ? rowData.currentPrice 
      : 0;
    const averagePrice = typeof rowData.averagePrice === 'number' && !isNaN(rowData.averagePrice) && isFinite(rowData.averagePrice)
      ? rowData.averagePrice
      : 0;
    
    return (
      <div className="text-right">
        <div className="font-medium">
          {currentPrice > 0 ? formatCurrency(currentPrice, rowData.currency) : '—'}
        </div>
        <div className="text-sm text-600">
          Ср: {averagePrice > 0 ? formatCurrency(averagePrice, rowData.currency) : '—'}
        </div>
      </div>
    );
  };

  const marketValueTemplate = (rowData: Position) => {
    const marketValue = typeof rowData.marketValue === 'number' && !isNaN(rowData.marketValue) && isFinite(rowData.marketValue)
      ? rowData.marketValue
      : 0;
    const weight = typeof rowData.weight === 'number' && !isNaN(rowData.weight) && isFinite(rowData.weight)
      ? rowData.weight
      : 0;
    
    return (
      <div className="text-right">
        <div className="font-medium">
          {marketValue > 0 ? formatCurrency(marketValue) : '—'}
        </div>
        <div className="text-sm text-600">{weight > 0 ? `${weight.toFixed(1)}%` : '—'}</div>
      </div>
    );
  };

  const pnlTemplate = (rowData: Position) => (
    <div className="text-right">
      <div className={`font-medium ${rowData.unrealizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
        {formatCurrency(rowData.unrealizedPnL)}
      </div>
      <div className={`text-sm ${rowData.unrealizedPnLPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
        {formatPercent(rowData.unrealizedPnLPercent)}
      </div>
    </div>
  );

  const sectorTemplate = (rowData: Position) => (
    <Tag value={rowData.sector || 'Неизвестно'} severity="info" />
  );

  return (
    <Card title="📋 Позиции" className={className}>
      <div className="flex justify-content-between align-items-center mb-3">
        <h3 className="m-0">Текущие позиции</h3>
        {onRefresh && (
          <Button
            icon="pi pi-refresh"
            label="Обновить"
            size="small"
            loading={loading}
            onClick={onRefresh}
          />
        )}
      </div>
      
      {error && (
        <div className="mb-3">
          <Message severity="error" text={error} />
        </div>
      )}

      <DataTable 
        value={positions} 
        loading={loading}
        emptyMessage="Нет позиций в портфеле"
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
          header="Цена" 
          body={priceTemplate}
          sortable
          style={{ minWidth: '140px' }}
        />
        <Column 
          field="marketValue" 
          header="Рыночная стоимость" 
          body={marketValueTemplate}
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
          field="sector" 
          header="Сектор" 
          body={sectorTemplate}
          sortable
          style={{ minWidth: '120px' }}
        />
      </DataTable>
    </Card>
  );
};

export default PortfolioPositionsTable;

