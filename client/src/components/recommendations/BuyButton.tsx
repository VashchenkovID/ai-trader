import React, { useState } from 'react';
import { Button, Modal, InputNumber, Select, Alert } from '../ui';
import { apiService } from '../../services/apiService';
import './BuyButton.css';

interface Horizon {
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  score: number;
  confidence: number;
  name: string;
  description: string;
  strategies?: {
    aggressive?: {
      recommendation: 'BUY' | 'SELL' | 'HOLD';
      explanation?: string;
    };
    moderate?: {
      recommendation: 'BUY' | 'SELL' | 'HOLD';
      explanation?: string;
    };
    conservative?: {
      recommendation: 'BUY' | 'SELL' | 'HOLD';
      explanation?: string;
    };
  };
}

interface Recommendation {
  figi: string;
  ticker: string;
  name: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  score: number;
  priceAtAnalysis: number;
  targetPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  explanation?: {
    details?: {
      ensemble?: {
        horizons?: {
          shortTerm?: Horizon;
          mediumTerm?: Horizon;
          longTerm?: Horizon;
        };
      };
      horizons?: {
        shortTerm?: Horizon;
        mediumTerm?: Horizon;
        longTerm?: Horizon;
      };
    };
    horizons?: {
      shortTerm?: Horizon;
      mediumTerm?: Horizon;
      longTerm?: Horizon;
    };
  };
  horizons?: {
    shortTerm?: Horizon;
    mediumTerm?: Horizon;
    longTerm?: Horizon;
  };
  strategy?: {
    id: number;
    name: string;
    type: 'conservative' | 'moderate' | 'aggressive';
  };
  suggestedStrategy?: {
    id: number;
    name: string;
    type: 'conservative' | 'moderate' | 'aggressive';
  };
}

interface Strategy {
  id: number;
  name: string;
  type: 'conservative' | 'moderate' | 'aggressive';
  timeframe: string;
}

interface BuyButtonProps {
  rowData: Recommendation;
  onRequestCreated?: () => void;
  onModalOpen?: () => void;
}

const BuyButton: React.FC<BuyButtonProps> = ({ rowData, onRequestCreated, onModalOpen }) => {
  const [showDialog, setShowDialog] = useState(false);
  const [quantity, setQuantity] = useState<number>(0);
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState<number | null>(null);
  const [userReason, setUserReason] = useState<string>('');
  const [showHoldWarning, setShowHoldWarning] = useState(false);
  const [strategyWarning, setStrategyWarning] = useState<string | null>(null);
  const [inlineMessage, setInlineMessage] = useState<{ variant: 'success' | 'warning' | 'error'; text: string } | null>(null);

  // Получаем детальное объяснение, почему кнопка заблокирована
  // Находим лучший прогноз (с максимальным confidence и score)
  const getBestHorizon = (): Horizon | null => {
    const explanationObj = rowData.explanation?.details?.ensemble;
    const horizons = explanationObj?.horizons;
    
    if (!horizons) return null;

    const { shortTerm, mediumTerm, longTerm } = horizons;
    const allHorizons: Horizon[] = [shortTerm, mediumTerm, longTerm].filter(Boolean) as Horizon[];

    if (allHorizons.length === 0) return null;

    // Сортируем по комбинации confidence и score (приоритет BUY > HOLD > SELL)
    const sorted = allHorizons.sort((a, b) => {
      // Приоритет рекомендаций
      const priority = { 'BUY': 3, 'HOLD': 2, 'SELL': 1 };
      const aPriority = priority[a.recommendation] || 0;
      const bPriority = priority[b.recommendation] || 0;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      // Если приоритет одинаковый, сравниваем по комбинации confidence и score
      const aScore = (a.confidence * 0.6) + (a.score * 0.4);
      const bScore = (b.confidence * 0.6) + (b.score * 0.4);
      
      return bScore - aScore;
    });

    return sorted[0] || null;
  };

  const buttonLabel = 'Купить';
  
  // Покупка должна быть доступна всегда, если известна цена
  const isButtonDisabled = !rowData.priceAtAnalysis || rowData.priceAtAnalysis <= 0;
  
  const tooltipText = isButtonDisabled 
    ? 'Покупка недоступна: цена не определена'
    : 'Создать заявку на покупку';

  const handleBuyClick = async () => {
    try {
      // Загружаем список стратегий
      const allStrategies = await apiService.getAllStrategies();
      setStrategies(allStrategies || []);
      setInlineMessage(null);
      setStrategyWarning(null);

      // Определяем стратегию по умолчанию на основе лучшего прогноза
      let defaultStrategyId = null;
      const bestHorizon = getBestHorizon();
      
      // Используем данные лучшего горизонта, если он есть
      const confidence = bestHorizon?.confidence ?? rowData.confidence;
      const score = bestHorizon?.score ?? rowData.score;
      const recommendation = bestHorizon?.recommendation ?? rowData.recommendation;

      if (rowData.strategy) {
        defaultStrategyId = rowData.strategy.id;
      } else if (rowData.suggestedStrategy) {
        defaultStrategyId = rowData.suggestedStrategy.id;
      } else if (allStrategies && allStrategies.length > 0) {
        // Определяем стратегию на основе лучшего прогноза
        if (confidence > 0.8 && score > 0.75 && recommendation === 'BUY') {
          const aggressive = allStrategies.find((s: Strategy) => s.type === 'aggressive');
          if (aggressive) defaultStrategyId = aggressive.id;
        } else if (confidence >= 0.6 && score >= 0.6) {
          const moderate = allStrategies.find((s: Strategy) => s.type === 'moderate');
          if (moderate) defaultStrategyId = moderate.id;
        } else if (confidence >= 0.5 && score >= 0.5) {
          const conservative = allStrategies.find((s: Strategy) => s.type === 'conservative');
          if (conservative) defaultStrategyId = conservative.id;
        } else {
          // Если показатели низкие, используем консервативную стратегию
          const conservative = allStrategies.find((s: Strategy) => s.type === 'conservative');
          if (conservative) defaultStrategyId = conservative.id;
        }
      }

      setSelectedStrategyId(defaultStrategyId);
      const bestHorizonRec = getBestHorizon();
      setShowHoldWarning(recommendation === 'HOLD' || (bestHorizonRec !== null && bestHorizonRec.recommendation === 'HOLD'));
      setStrategyWarning(null); // Очищаем предыдущее предупреждение при открытии диалога
      setShowDialog(true);
      // Уведомляем родителя, что модалка открылась (для сброса лоадера)
      if (onModalOpen) {
        onModalOpen();
      }
    } catch (error) {
      console.error('Error loading strategies:', error);
      setInlineMessage({
        variant: 'error',
        text: 'Не удалось загрузить список стратегий',
      });
    }
  };

  const handleConfirm = async () => {
    if (!quantity || quantity <= 0) {
      setInlineMessage({
        variant: 'warning',
        text: 'Укажите количество акций',
      });
      return;
    }

    if (!selectedStrategyId) {
      setInlineMessage({
        variant: 'warning',
        text: 'Выберите стратегию',
      });
      return;
    }

    try {
      setCreatingRequest(true);


      // Проверяем наличие предупреждения в ответе
      const response = await apiService.createTradingRequest(
        rowData.figi,
        {
          quantity: quantity,
          comment: userReason || undefined,
          strategyId: selectedStrategyId
        },
        {
          figi: rowData.figi,
          ticker: rowData.ticker,
          name: rowData.name,
          recommendation: rowData.recommendation,
          confidence: rowData.confidence,
          score: rowData.score,
          priceAtAnalysis: rowData.priceAtAnalysis,
          price: rowData.priceAtAnalysis,
          targetPrice: rowData.targetPrice,
          stopLoss: rowData.stopLoss,
          takeProfit: rowData.takeProfit
        }
      );

      // Если есть предупреждение о стратегии, сохраняем его
      if (response?.strategyWarning) {
        setStrategyWarning(response.strategyWarning.message || response.strategyWarning.warnings?.join('; ') || null);
      } else {
        setStrategyWarning(null);
      }

      setInlineMessage({
        variant: response?.strategyWarning ? 'warning' : 'success',
        text: response?.strategyWarning
          ? `Заявка создана, но: ${response.strategyWarning.message || response.strategyWarning.warnings?.join('; ')}`
          : `Заявка на покупку ${quantity} акций ${rowData.ticker} создана`,
      });

      setShowDialog(false);
      setQuantity(0);
      setUserReason('');
      setShowHoldWarning(false);
      setSelectedStrategyId(null);

      if (onRequestCreated) {
        onRequestCreated();
      }
    } catch (error: any) {
      console.error('Error creating buy request:', error);
      setInlineMessage({
        variant: 'error',
        text: error.response?.data?.message || error.message || 'Не удалось создать заявку на покупку',
      });
    } finally {
      setCreatingRequest(false);
    }
  };

  const handleCancel = () => {
    setShowDialog(false);
    setQuantity(0);
    setUserReason('');
    setShowHoldWarning(false);
    setSelectedStrategyId(null);
    setStrategyWarning(null); // Очищаем предупреждение при закрытии
    setInlineMessage(null);
  };

  const strategyOptions = [
    { label: 'Выберите стратегию', value: '' },
    ...strategies.map((s: Strategy) => ({
      label: `${s.name} (${s.type === 'conservative' ? 'Консервативная' : s.type === 'moderate' ? 'Умеренная' : 'Агрессивная'})`,
      value: s.id
    }))
  ];

  return (
    <>
      <div className="flex flex-column gap-1">
        {strategyWarning && (
          <Alert variant="warning" size="sm">
            {strategyWarning}
          </Alert>
        )}
        {inlineMessage && (
          <Alert variant={inlineMessage.variant} size="sm">
            {inlineMessage.text}
          </Alert>
        )}
        <div 
          title={tooltipText} 
          style={{ display: 'inline-block', cursor: isButtonDisabled ? 'not-allowed' : 'pointer' }}
        >
          <Button
            icon="🛒"
            size="sm"
            variant={rowData.recommendation === 'SELL' ? 'secondary' : 'primary'}
            onClick={handleBuyClick}
            disabled={isButtonDisabled}
            data-buy-trigger="true"
          >
            {buttonLabel}
          </Button>
        </div>
      </div>

      <Modal
        isOpen={showDialog}
        onClose={handleCancel}
        title={`Покупка акций ${rowData.ticker}`}
        size="md"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              onClick={handleCancel}
              disabled={creatingRequest}
            >
              Отмена
            </Button>
            <Button
              variant="success"
              onClick={handleConfirm}
              loading={creatingRequest}
              disabled={!quantity || quantity <= 0 || !selectedStrategyId}
            >
              Создать заявку
            </Button>
          </div>
        }
      >
        <div className="buy-modal-body">
          <div className="buy-field">
            <div className="buy-label">Инструмент</div>
            <div className="buy-instrument">
              <div className="buy-instrument-name">{rowData.name}</div>
              <div className="buy-instrument-ticker">{rowData.ticker}</div>
            </div>
          </div>

          <div className="buy-field">
            <div className="buy-label">
              Стратегия <span className="buy-required">*</span>
            </div>
            <Select
              value={selectedStrategyId ?? ''}
              options={strategyOptions}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedStrategyId(val === '' ? null : Number(val));
              }}
              placeholder="Выберите стратегию"
              fullWidth
              disabled={creatingRequest}
            />
            {(() => {
              const bestHorizon = getBestHorizon();
              if (bestHorizon) {
                return (
                  <div className="buy-helper">
                    Стратегия выбрана на основе лучшего прогноза: {bestHorizon.name} (
                    {bestHorizon.recommendation === 'BUY' ? 'Покупка' : bestHorizon.recommendation === 'SELL' ? 'Продажа' : 'Удержание'}, 
                    уверенность: {(bestHorizon.confidence * 100).toFixed(0)}%, 
                    оценка: {(bestHorizon.score * 100).toFixed(0)}%)
                  </div>
                );
              } else if (rowData.strategy) {
                return <div className="buy-helper">Рекомендуемая стратегия: {rowData.strategy.name}</div>;
              }
              return null;
            })()}
          </div>

          <div className="buy-field">
            <div className="buy-label">
              Количество акций <span className="buy-required">*</span>
            </div>
            <InputNumber
              value={quantity}
              onValueChange={(e) => setQuantity(e.value || 0)}
              min={1}
              fullWidth
              showButtons
              buttonLayout="horizontal"
              disabled={creatingRequest}
            />
          </div>

          <div className="buy-field">
            <div className="buy-label">Цена за акцию</div>
            <div className="buy-price">
              {new Intl.NumberFormat('ru-RU', {
                style: 'currency',
                currency: 'RUB',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              }).format(rowData.priceAtAnalysis)}
            </div>
          </div>

          {showHoldWarning && (
            <Alert variant="warning" size="sm">
              AI рекомендует удержание позиции. Убедитесь, что покупка соответствует вашей стратегии.
            </Alert>
          )}

          <div className="buy-field">
            <div className="buy-label">Комментарий (необязательно)</div>
            <textarea
              value={userReason}
              onChange={(e) => setUserReason(e.target.value)}
              rows={3}
              className="buy-textarea"
              placeholder="Укажите причину покупки, если AI рекомендует HOLD"
              disabled={creatingRequest}
            />
          </div>

          {quantity > 0 && rowData.priceAtAnalysis > 0 && (
            <div className="buy-summary">
              <div className="buy-summary-title">Общая сумма</div>
              <div className="buy-summary-value">
                {new Intl.NumberFormat('ru-RU', {
                  style: 'currency',
                  currency: 'RUB',
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                }).format(quantity * rowData.priceAtAnalysis)}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};

export default BuyButton;

