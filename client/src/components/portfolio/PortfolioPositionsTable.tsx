import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../ui/Card/Card';
import { Table, TableColumn } from '../ui/Table/Table';
import { Button } from '../ui/Button/Button';
import { Badge } from '../ui/Badge/Badge';
import { Alert } from '../ui/Alert/Alert';
import { Toast } from 'primereact/toast';
import { Modal } from '../ui/Modal/Modal';
import { InputNumber } from '../ui/InputNumber/InputNumber';
import { translateSector } from '../../utils/sectorTranslator';
import { translateRecommendation } from '../../utils/recommendationTranslator';
import apiService from '../../services/apiService';
import './PortfolioPositionsTable.css';

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
  const [isMobile, setIsMobile] = useState(false);
  const toast = React.useRef<Toast>(null);

  // Определяем, является ли устройство мобильным
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
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
    if (!rowData.prediction) return <div className="portfolio-positions-text-left">—</div>;

    const { recommendation, score, confidence } = rowData.prediction;
    const variant: 'success' | 'error' | 'info' =
      recommendation === 'BUY' ? 'success' :
      recommendation === 'SELL' ? 'error' : 'info';

    return (
      <div className="portfolio-positions-text-left">
        <Badge variant={variant} size="sm">
          {translateRecommendation(recommendation)}
        </Badge>
        {(score !== undefined || confidence !== undefined) && (
          <div className="portfolio-positions-prediction-details">
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
        className="portfolio-positions-ticker"
        onClick={() => navigate(`/stock/${rowData.figi}`)}
        title="Нажмите для просмотра детальной информации"
      >
        <div>
          <div className="portfolio-positions-ticker-name">{name}</div>
          <div className="portfolio-positions-ticker-symbol">{ticker}</div>
        </div>
      </div>
    );
  };

  const quantityTemplate = (rowData: Position) => {
    const quantity = typeof rowData.quantity === 'number' && !isNaN(rowData.quantity) && isFinite(rowData.quantity) && rowData.quantity > 0
      ? rowData.quantity
      : 0;
    
    return (
      <div className="portfolio-positions-text-left">
        <div className="portfolio-positions-value">{quantity > 0 ? quantity.toLocaleString('ru-RU') : '—'}</div>
        <div className="portfolio-positions-subtext">шт.</div>
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
      return <div className="portfolio-positions-text-left">—</div>;
    }
    
    const difference = currentPrice - averagePrice;
    const differencePercent = (difference / averagePrice) * 100;
    const isPositive = difference >= 0;
    
    return (
      <div className="portfolio-positions-text-left">
        <div className={`portfolio-positions-value ${isPositive ? 'portfolio-positions-positive' : 'portfolio-positions-negative'}`}>
          {formatCurrency(difference, rowData.currency)}
        </div>
        <div className={`portfolio-positions-subtext ${isPositive ? 'portfolio-positions-positive' : 'portfolio-positions-negative'}`}>
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
      <div className="portfolio-positions-text-left">
        <div className="portfolio-positions-value">
          {marketValue > 0 ? formatCurrency(marketValue) : '—'}
        </div>
        <div className="portfolio-positions-subtext">{weight > 0 ? `${weight.toFixed(1)}%` : '—'}</div>
      </div>
    );
  };

  const pnlTemplate = (rowData: Position) => (
    <div className="portfolio-positions-text-left">
      <div className={`portfolio-positions-value ${rowData.unrealizedPnL >= 0 ? 'portfolio-positions-positive' : 'portfolio-positions-negative'}`}>
        {formatCurrency(rowData.unrealizedPnL)}
      </div>
      <div className={`portfolio-positions-subtext ${rowData.unrealizedPnLPercent >= 0 ? 'portfolio-positions-positive' : 'portfolio-positions-negative'}`}>
        {formatPercent(rowData.unrealizedPnLPercent)}
      </div>
    </div>
  );

  const sectorTemplate = (rowData: Position) => {
    const translatedSector = translateSector(rowData.sector);
    return <Badge variant="info" size="sm">{translatedSector}</Badge>;
  };

  const strategyTemplate = (rowData: Position) => {
    if (!rowData.strategy) return <span className="portfolio-positions-empty">—</span>;
    
    const variantMap: Record<string, 'info' | 'warning' | 'error' | 'neutral'> = {
      conservative: 'info',
      moderate: 'warning',
      aggressive: 'error'
    };
    const variant = variantMap[rowData.strategy.type] || 'neutral';
    
    return (
      <Badge 
        variant={variant}
        size="sm"
        title={`Тип: ${rowData.strategy.type}`}
      >
        {rowData.strategy.name}
      </Badge>
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
        { 
          quantity, 
          autoApprove: true,
          action: 'SELL', // Явно указываем действие - продажа
          strategyId: selectedPosition.strategy?.id || selectedPosition.positionStrategy?.strategyId, // Передаем стратегию из позиции
          forceEntry: true // Обход валидации входа для продажи из портфеля
        }, // Автоматически одобряем ручные продажи из портфеля
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

  // Определяем колонки таблицы после всех template функций
  const columns = useMemo<TableColumn<Position>[]>(() => [
    {
      key: 'ticker',
      header: 'Инструмент',
      render: (_, row) => tickerTemplate(row),
      sortable: true,
      width: '200px',
    },
    {
      key: 'quantity',
      header: 'Количество',
      render: (_, row) => quantityTemplate(row),
      sortable: true,
      width: '120px',
    },
    {
      key: 'currentPrice',
      header: 'Текущая цена',
      render: (_, row) => priceTemplate(row),
      sortable: true,
      width: '140px',
    },
    {
      key: 'averagePrice',
      header: 'Цена закупки',
      render: (_, row) => purchasePriceTemplate(row),
      sortable: true,
      width: '140px',
    },
    {
      key: 'priceDifference',
      header: 'Разница в цене',
      render: (_, row) => priceDifferenceTemplate(row),
      sortable: true,
      width: '160px',
    },
    {
      key: 'marketValue',
      header: 'Рыночная стоимость',
      render: (_, row) => marketValueTemplate(row),
      sortable: true,
      width: '160px',
    },
    {
      key: 'unrealizedPnL',
      header: 'P&L',
      render: (_, row) => pnlTemplate(row),
      sortable: true,
      width: '140px',
    },
    {
      key: 'sector',
      header: 'Сектор',
      render: (_, row) => sectorTemplate(row),
      sortable: true,
      width: '120px',
    },
    {
      key: 'strategy',
      header: 'Стратегия',
      render: (_, row) => strategyTemplate(row),
      sortable: true,
      width: '150px',
    },
    {
      key: 'prediction',
      header: 'Предсказание',
      render: (_, row) => predictionTemplate(row),
      sortable: true,
      width: '160px',
    },
    {
      key: 'action',
      header: 'Действия',
      render: (_, row) => sellButtonTemplate(row),
      width: '120px',
      align: 'right',
    },
  ], [sellingFigi]);

  const sellButtonTemplate = (rowData: Position) => {
    const isSelling = sellingFigi === rowData.figi;
    const quantity = rowData.quantity;
    const canSell = quantity && quantity > 0;

    return (
      <Button
        variant="error"
        size="sm"
        icon={<i className="pi pi-arrow-down"></i>}
        onClick={() => handleSellClick(rowData)}
        disabled={!canSell || isSelling}
        loading={isSelling}
        title={canSell ? `Продать ${quantity} шт.` : 'Нет акций для продажи'}
      >
        Продать
      </Button>
    );
  };

  const sellDialogFooter = (
    <div className="portfolio-positions-modal-footer">
      <Button 
        variant="ghost"
        size="md"
        icon={<i className="pi pi-times"></i>}
        onClick={handleSellDialogHide}
      >
        Отмена
      </Button>
      <Button 
        variant="error"
        size="md"
        icon={<i className="pi pi-check"></i>}
        onClick={handleSellConfirm}
        disabled={!sellQuantity || sellQuantity <= 0 || sellQuantity > (selectedPosition?.quantity || 0)}
      >
        Продать
      </Button>
    </div>
  );

  return (
    <>
      <Toast ref={toast} />
      <Modal
        isOpen={showSellDialog}
        onClose={handleSellDialogHide}
        title="Продажа акций"
        size="sm"
        footer={sellDialogFooter}
      >
        {selectedPosition && (
          <div className="portfolio-positions-sell-dialog">
            <div className="portfolio-positions-sell-field">
              <label className="portfolio-positions-sell-label">
                Инструмент: <strong>{selectedPosition.name} ({selectedPosition.ticker})</strong>
              </label>
            </div>
            <div className="portfolio-positions-sell-field">
              <label className="portfolio-positions-sell-label">
                Доступно для продажи: <strong>{selectedPosition.quantity} шт.</strong>
              </label>
            </div>
            <div className="portfolio-positions-sell-field">
              <label className="portfolio-positions-sell-label">
                Текущая цена: <strong>{formatCurrency(selectedPosition.currentPrice, selectedPosition.currency)}</strong>
              </label>
            </div>
            <div className="portfolio-positions-sell-field">
              <InputNumber
                id="sellQuantity"
                value={sellQuantity}
                onValueChange={(e) => setSellQuantity(e.value || 0)}
                min={1}
                max={selectedPosition.quantity}
                showButtons
                buttonLayout="horizontal"
                label="Количество для продажи"
                fullWidth
              />
            </div>
            {sellQuantity > 0 && (
              <div className="portfolio-positions-sell-summary">
                <div className="portfolio-positions-sell-summary-label">Сумма продажи:</div>
                <div className="portfolio-positions-sell-summary-value">
                  {formatCurrency(sellQuantity * selectedPosition.currentPrice, selectedPosition.currency)}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
      <Card 
        header={<h3 className="portfolio-positions-title">📋 Позиции</h3>}
        className={`portfolio-positions-card ${className}`}
      >
        <div className="portfolio-positions-header">
          <h3 className="portfolio-positions-subtitle">Текущие позиции</h3>
          <div className="portfolio-positions-actions">
            {onAnalyze && (
              <Button
                variant="primary"
                size="sm"
                icon={<i className="pi pi-chart-line"></i>}
                onClick={onAnalyze}
                loading={analyzing}
                title="Проанализировать портфель и получить рекомендации по продаже/удержанию"
              >
                Предсказание
              </Button>
            )}
            {onRefresh && (
              <Button
                variant="secondary"
                size="sm"
                icon={<i className="pi pi-refresh"></i>}
                onClick={onRefresh}
                loading={loading}
              >
                Обновить
              </Button>
            )}
          </div>
        </div>
        
        {error && (
          <div className="portfolio-positions-error">
            <Alert variant="error" size="sm">
              {error}
            </Alert>
          </div>
        )}

        {loading ? (
          <div className="portfolio-positions-loading">Загрузка...</div>
        ) : isMobile ? (
          /* Карточный вид для мобильных устройств */
          <div className="portfolio-positions-cards">
            {positions.length === 0 ? (
              <div className="portfolio-positions-empty">Нет позиций в портфеле</div>
            ) : (
              positions.map((position, index) => (
                <Card key={position.figi || index} className="portfolio-positions-card-item">
                  <div className="portfolio-positions-card-header">
                    <div className="portfolio-positions-ticker">
                      <div className="portfolio-positions-ticker-name">{position.ticker}</div>
                      <div className="portfolio-positions-ticker-symbol">{position.name}</div>
                    </div>
                    {position.prediction && (
                      <Badge
                        variant={position.prediction.recommendation === 'BUY' ? 'success' : 
                                position.prediction.recommendation === 'SELL' ? 'error' : 'info'}
                        size="sm"
                      >
                        {translateRecommendation(position.prediction.recommendation)}
                      </Badge>
                    )}
                  </div>
                  
                  <div className="portfolio-positions-card-body">
                    <div className="portfolio-positions-card-row">
                      <span className="portfolio-positions-card-label">Количество:</span>
                      <span className="portfolio-positions-value">{position.quantity} шт.</span>
                    </div>
                    <div className="portfolio-positions-card-row">
                      <span className="portfolio-positions-card-label">Текущая цена:</span>
                      <span className="portfolio-positions-value">{formatCurrency(position.currentPrice, position.currency)}</span>
                    </div>
                    <div className="portfolio-positions-card-row">
                      <span className="portfolio-positions-card-label">Рыночная стоимость:</span>
                      <span className="portfolio-positions-value">{formatCurrency(position.marketValue, position.currency)}</span>
                    </div>
                    <div className="portfolio-positions-card-row">
                      <span className="portfolio-positions-card-label">P&L:</span>
                      <span className={`portfolio-positions-value ${position.unrealizedPnL >= 0 ? 'portfolio-positions-positive' : 'portfolio-positions-negative'}`}>
                        {formatCurrency(position.unrealizedPnL, position.currency)} ({position.unrealizedPnLPercent >= 0 ? '+' : ''}{position.unrealizedPnLPercent.toFixed(2)}%)
                      </span>
                    </div>
                    {position.strategy && (
                      <div className="portfolio-positions-card-row">
                        <span className="portfolio-positions-card-label">Стратегия:</span>
                        <span className="portfolio-positions-value">{position.strategy.name}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="portfolio-positions-card-footer">
                    <Button
                      variant="error"
                      size="sm"
                      icon={<i className="pi pi-arrow-down"></i>}
                      onClick={() => handleSellClick(position)}
                      disabled={!position.quantity || position.quantity <= 0 || sellingFigi === position.figi}
                      loading={sellingFigi === position.figi}
                      fullWidth
                    >
                      Продать
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        ) : (
          <Table<Position>
            data={positions}
            columns={columns}
            size="sm"
            hoverable
            emptyMessage="Нет позиций в портфеле"
            className="portfolio-positions-table"
            virtualized={positions.length > 30}
            virtualHeight={560}
            virtualRowHeight={62}
            virtualOverscan={6}
          />
        )}
      </Card>
    </>
  );
};

export default PortfolioPositionsTable;

