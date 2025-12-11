import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from 'primereact/card';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Message } from 'primereact/message';
import { Toast } from 'primereact/toast';
import { Dialog } from 'primereact/dialog';
import { InputNumber } from 'primereact/inputnumber';
import { translateSector } from '../../utils/sectorTranslator';
import { translateRecommendation } from '../../utils/recommendationTranslator';
import apiService from '../../services/apiService';

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
  prediction?: {
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    score?: number;
    confidence?: number;
  };
  strategy?: {
    id: number;
    name: string;
    type: 'conservative' | 'moderate' | 'aggressive';
  };
  positionStrategy?: {
    id: number;
    strategyId: number;
  };
}

interface PortfolioPositionsTableProps {
  positions: Position[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onAnalyze?: () => void;
  analyzing?: boolean;
  className?: string;
  onSellSuccess?: () => void;
}

const PortfolioPositionsTable: React.FC<PortfolioPositionsTableProps> = ({
  positions,
  loading = false,
  error = null,
  onRefresh,
  onAnalyze,
  analyzing = false,
  className = '',
  onSellSuccess
}) => {
  const [sellingFigi, setSellingFigi] = useState<string | null>(null);
  const [showSellDialog, setShowSellDialog] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [sellQuantity, setSellQuantity] = useState<number>(0);
  const toast = React.useRef<Toast>(null);
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

  const formatPercent = (value: number) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const navigate = useNavigate();
  
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

  const marketValueTemplate = (rowData: Position) => {
    const marketValue = typeof rowData.marketValue === 'number' && !isNaN(rowData.marketValue) && isFinite(rowData.marketValue)
      ? rowData.marketValue
      : 0;
    const weight = typeof rowData.weight === 'number' && !isNaN(rowData.weight) && isFinite(rowData.weight)
      ? rowData.weight
      : 0;
    
    return (
      <div className="text-left">
        <div className="font-medium">
          {marketValue > 0 ? formatCurrency(marketValue) : '—'}
        </div>
        <div className="text-sm text-600">{weight > 0 ? `${weight.toFixed(1)}%` : '—'}</div>
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

  const sectorTemplate = (rowData: Position) => {
    const translatedSector = translateSector(rowData.sector);
    return <Tag value={translatedSector} severity="info" />;
  };

  const strategyTemplate = (rowData: Position) => {
    
    if (!rowData.strategy) return <span className="text-500">—</span>;
    
    const typeMap: Record<string, { severity: string }> = {
      conservative: { severity: 'info' },
      moderate: { severity: 'warning' },
      aggressive: { severity: 'danger' }
    };
    const typeInfo = typeMap[rowData.strategy.type] || { severity: 'secondary' };
    
    return (
      <Tag 
        value={rowData.strategy.name} 
        severity={typeInfo.severity as any}
        title={`Тип: ${rowData.strategy.type}`}
      />
    );
  };

  const handleSellClick = (position: Position) => {
    const quantity = position.quantity;
    const currentPrice = position.currentPrice;
    
    if (!quantity || quantity <= 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Ошибка',
        detail: 'Недостаточно акций для продажи',
        life: 3000
      });
      return;
    }

    if (!currentPrice || currentPrice <= 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Ошибка',
        detail: 'Не удалось получить текущую цену',
        life: 3000
      });
      return;
    }

    setSelectedPosition(position);
    setSellQuantity(quantity); // По умолчанию все акции
    setShowSellDialog(true);
  };

  const handleSellConfirm = async () => {
    if (!selectedPosition) return;

    const quantity = Math.floor(sellQuantity);
    const maxQuantity = selectedPosition.quantity;
    const currentPrice = selectedPosition.currentPrice;

    if (!quantity || quantity <= 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Ошибка',
        detail: 'Укажите количество акций для продажи',
        life: 3000
      });
      return;
    }

    if (quantity > maxQuantity) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Ошибка',
        detail: `Нельзя продать больше ${maxQuantity} шт.`,
        life: 3000
      });
      return;
    }

    try {
      setSellingFigi(selectedPosition.figi);
      setShowSellDialog(false);
      
      // Создаем торговую заявку на продажу
      const recommendationData = {
        figi: selectedPosition.figi,
        ticker: selectedPosition.ticker,
        name: selectedPosition.name,
        recommendation: 'SELL',
        confidence: selectedPosition.prediction?.confidence || 0.5,
        score: selectedPosition.prediction?.score || 0.5,
        priceAtAnalysis: currentPrice,
        price: currentPrice,
        explanation: selectedPosition.prediction ? {
          summary: `Продажа позиции из портфеля`,
          keyFactors: ['Ручная продажа из портфеля'],
          risks: [],
          opportunities: [],
          timeframe: 'Немедленно'
        } : undefined
      };

      await apiService.createTradingRequest(
        selectedPosition.figi,
        { quantity, autoApprove: true }, // Автоматически одобряем ручные продажи из портфеля
        recommendationData
      );

      toast.current?.show({
        severity: 'success',
        summary: 'Заявка создана',
        detail: `Заявка на продажу ${quantity} шт. ${selectedPosition.ticker} успешно создана`,
        life: 3000
      });

      // Вызываем callback для обновления данных
      if (onSellSuccess) {
        onSellSuccess();
      }

      // Сбрасываем состояние
      setSelectedPosition(null);
      setSellQuantity(0);
    } catch (error: any) {
      console.error('Error creating sell request:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: error.response?.data?.message || error.message || 'Не удалось создать заявку на продажу',
        life: 5000
      });
    } finally {
      setSellingFigi(null);
    }
  };

  const handleSellDialogHide = () => {
    setShowSellDialog(false);
    setSelectedPosition(null);
    setSellQuantity(0);
  };

  const sellButtonTemplate = (rowData: Position) => {
    const isSelling = sellingFigi === rowData.figi;
    const quantity = rowData.quantity;
    const canSell = quantity && quantity > 0;

    return (
      <Button
        icon="pi pi-arrow-down"
        label="Продать"
        size="small"
        severity="danger"
        loading={isSelling}
        disabled={!canSell || isSelling}
        onClick={() => handleSellClick(rowData)}
        tooltip={canSell ? `Продать ${quantity} шт.` : 'Нет акций для продажи'}
        tooltipOptions={{ position: 'top' }}
      />
    );
  };

  const sellDialogFooter = (
    <div>
      <Button 
        label="Отмена" 
        icon="pi pi-times" 
        onClick={handleSellDialogHide} 
        className="p-button-text" 
      />
      <Button 
        label="Продать" 
        icon="pi pi-check" 
        onClick={handleSellConfirm} 
        severity="danger"
        disabled={!sellQuantity || sellQuantity <= 0 || sellQuantity > (selectedPosition?.quantity || 0)}
      />
    </div>
  );

  return (
    <>
      <Toast ref={toast} />
      <Dialog
        header="Продажа акций"
        visible={showSellDialog}
        style={{ width: '450px' }}
        footer={sellDialogFooter}
        onHide={handleSellDialogHide}
        modal
      >
        {selectedPosition && (
          <div className="flex flex-column gap-3">
            <div>
              <label className="block mb-2 font-medium">
                Инструмент: <strong>{selectedPosition.name} ({selectedPosition.ticker})</strong>
              </label>
            </div>
            <div>
              <label className="block mb-2 font-medium">
                Доступно для продажи: <strong>{selectedPosition.quantity} шт.</strong>
              </label>
            </div>
            <div>
              <label className="block mb-2 font-medium">
                Текущая цена: <strong>{formatCurrency(selectedPosition.currentPrice, selectedPosition.currency)}</strong>
              </label>
            </div>
            <div>
              <label htmlFor="sellQuantity" className="block mb-2 font-medium">
                Количество для продажи:
              </label>
              <InputNumber
                id="sellQuantity"
                value={sellQuantity}
                onValueChange={(e) => setSellQuantity(e.value || 0)}
                min={1}
                max={selectedPosition.quantity}
                showButtons
                buttonLayout="horizontal"
                decrementButtonClassName="p-button-danger"
                incrementButtonClassName="p-button-success"
                incrementButtonIcon="pi pi-plus"
                decrementButtonIcon="pi pi-minus"
                className="w-full"
              />
            </div>
            {sellQuantity > 0 && (
              <div className="mt-2 p-3 bg-blue-50 border-round">
                <div className="text-sm text-600 mb-1">Сумма продажи:</div>
                <div className="text-xl font-bold text-blue-600">
                  {formatCurrency(sellQuantity * selectedPosition.currentPrice, selectedPosition.currency)}
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>
      <Card title="📋 Позиции" className={className}>
        <div className="flex justify-content-between align-items-center mb-3">
          <h3 className="m-0">Текущие позиции</h3>
          <div className="flex gap-2">
            {onAnalyze && (
              <Button
                icon="pi pi-chart-line"
                label="Предсказание"
                size="small"
                loading={analyzing}
                onClick={onAnalyze}
                severity="info"
                tooltip="Проанализировать портфель и получить рекомендации по продаже/удержанию"
                tooltipOptions={{ position: 'bottom' }}
              />
            )}
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
        <Column 
          field="strategy" 
          header="Стратегия" 
          body={strategyTemplate}
          sortable
          style={{ minWidth: '150px' }}
        />
        <Column 
          field="prediction" 
          header="Предсказание" 
          body={predictionTemplate}
          sortable
          style={{ minWidth: '160px' }}
        />
        <Column 
          field="action" 
          header="Действия" 
          body={sellButtonTemplate}
          style={{ minWidth: '120px' }}
          frozen
          alignFrozen="right"
        />
      </DataTable>
    </Card>
    </>
  );
};

export default PortfolioPositionsTable;

