import React, { useState, useRef } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputNumber } from 'primereact/inputnumber';
import { InputTextarea } from 'primereact/inputtextarea';
import { Dropdown } from 'primereact/dropdown';
import { Message } from 'primereact/message';
import { Toast } from 'primereact/toast';
import { apiService } from '../../services/apiService';

interface Horizon {
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  score: number;
  confidence: number;
  name: string;
  description: string;
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
}

const BuyButton: React.FC<BuyButtonProps> = ({ rowData, onRequestCreated }) => {
  const [showDialog, setShowDialog] = useState(false);
  const [quantity, setQuantity] = useState<number>(0);
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState<number | null>(null);
  const [userReason, setUserReason] = useState<string>('');
  const [showHoldWarning, setShowHoldWarning] = useState(false);
  const [strategyWarning, setStrategyWarning] = useState<string | null>(null);
  const toast = useRef<Toast>(null);

  // Проверяем, есть ли хотя бы один прогноз BUY или HOLD в горизонтах или общая рекомендация
  const hasBuyOrHoldHorizon = (): boolean => {
    // Сначала проверяем общую рекомендацию - если она BUY или HOLD, кнопка доступна
    if (rowData.recommendation === 'BUY' || rowData.recommendation === 'HOLD') {
      return true;
    }

    // Затем проверяем горизонты, если они есть
    // Проверяем разные возможные пути к горизонтам
    let horizons = null;
    
    // Путь 1: explanation.details.ensemble.horizons
    if (rowData.explanation?.details?.ensemble?.horizons) {
      horizons = rowData.explanation.details.ensemble.horizons;
    }
    // Путь 2: explanation.details.horizons
    else if (rowData.explanation?.details?.horizons) {
      horizons = rowData.explanation.details.horizons;
    }
    // Путь 3: explanation.horizons
    else if (rowData.explanation?.horizons) {
      horizons = rowData.explanation.horizons;
    }
    // Путь 4: прямое поле horizons (если оно было извлечено при загрузке)
    else if (rowData.horizons) {
      horizons = rowData.horizons;
    }
    
    if (!horizons || typeof horizons !== 'object') {
      // Если горизонтов нет, уже проверили общую рекомендацию выше
      return false;
    }

    const { shortTerm, mediumTerm, longTerm } = horizons;
    const horizonRecommendations = [
      shortTerm?.recommendation,
      mediumTerm?.recommendation,
      longTerm?.recommendation
    ].filter(Boolean) as string[];

    // Если есть хотя бы один BUY или HOLD в горизонтах, кнопка доступна
    return horizonRecommendations.some(rec => rec === 'BUY' || rec === 'HOLD');
  };

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
  const buttonSeverity = 
    rowData.recommendation === 'BUY' ? 'success' :
    rowData.recommendation === 'SELL' ? 'warning' : 'info';
  
  const tooltipText = rowData.recommendation === 'HOLD'
    ? 'Создать заявку на покупку (AI рекомендует удержание)'
    : 'Создать заявку на покупку';

  const isButtonDisabled = !rowData.priceAtAnalysis || rowData.priceAtAnalysis <= 0 || !hasBuyOrHoldHorizon();

  const handleBuyClick = async () => {
    try {
      // Загружаем список стратегий
      const allStrategies = await apiService.getAllStrategies();
      setStrategies(allStrategies || []);

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
    } catch (error) {
      console.error('Error loading strategies:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить список стратегий',
        life: 3000
      });
    }
  };

  const handleConfirm = async () => {
    if (!quantity || quantity <= 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Предупреждение',
        detail: 'Укажите количество акций',
        life: 3000
      });
      return;
    }

    if (!selectedStrategyId) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Предупреждение',
        detail: 'Выберите стратегию',
        life: 3000
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

      toast.current?.show({
        severity: response?.strategyWarning ? 'warn' : 'success',
        summary: response?.strategyWarning ? 'Заявка создана с предупреждением' : 'Успешно',
        detail: response?.strategyWarning 
          ? `Заявка создана, но: ${response.strategyWarning.message || response.strategyWarning.warnings?.join('; ')}`
          : `Заявка на покупку ${quantity} акций ${rowData.ticker} создана`,
        life: response?.strategyWarning ? 8000 : 5000
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
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: error.response?.data?.message || error.message || 'Не удалось создать заявку на покупку',
        life: 5000
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
  };

  const strategyOptions = [
    { label: 'Выберите стратегию', value: null },
    ...strategies.map((s: Strategy) => ({
      label: `${s.name} (${s.type === 'conservative' ? 'Консервативная' : s.type === 'moderate' ? 'Умеренная' : 'Агрессивная'})`,
      value: s.id
    }))
  ];

  return (
    <>
      <Toast ref={toast} />
      <div className="flex flex-column gap-1">
        {strategyWarning && (
          <Message
            severity="warn"
            text={strategyWarning}
            className="text-xs p-2"
            style={{ fontSize: '0.75rem', padding: '0.5rem' }}
          />
        )}
        <Button
          icon="pi pi-shopping-cart"
          label={buttonLabel}
          size="small"
          severity={buttonSeverity}
          onClick={handleBuyClick}
          disabled={isButtonDisabled}
          tooltip={isButtonDisabled ? 'Нет доступных прогнозов для покупки (требуется BUY или HOLD)' : tooltipText}
          tooltipOptions={{ position: 'top' }}
        />
      </div>

      <Dialog
        header={`Покупка акций ${rowData.ticker}`}
        visible={showDialog}
        style={{ width: '500px' }}
        footer={
          <div>
            <Button
              label="Отмена"
              icon="pi pi-times"
              onClick={handleCancel}
              className="p-button-text"
              disabled={creatingRequest}
            />
            <Button
              label="Создать заявку"
              icon="pi pi-check"
              onClick={handleConfirm}
              severity="success"
              loading={creatingRequest}
              disabled={!quantity || quantity <= 0 || !selectedStrategyId}
            />
          </div>
        }
        onHide={handleCancel}
      >
        <div className="flex flex-column gap-3">
          <div>
            <label className="block mb-2 font-medium">Инструмент</label>
            <div className="p-2 bg-gray-50 border-round">
              <div className="font-medium">{rowData.name}</div>
              <div className="text-sm text-600">{rowData.ticker}</div>
            </div>
          </div>

          <div>
            <label className="block mb-2 font-medium">
              Стратегия <span className="text-red-500">*</span>
            </label>
            <Dropdown
              value={selectedStrategyId}
              options={strategyOptions}
              onChange={(e) => setSelectedStrategyId(e.value)}
              placeholder="Выберите стратегию"
              className="w-full"
              disabled={creatingRequest}
            />
            {(() => {
              const bestHorizon = getBestHorizon();
              if (bestHorizon) {
                return (
                  <small className="text-600 mt-1 block">
                    Стратегия выбрана на основе лучшего прогноза: {bestHorizon.name} 
                    ({bestHorizon.recommendation === 'BUY' ? 'Покупка' : bestHorizon.recommendation === 'SELL' ? 'Продажа' : 'Удержание'}, 
                    уверенность: {(bestHorizon.confidence * 100).toFixed(0)}%, 
                    оценка: {(bestHorizon.score * 100).toFixed(0)}%)
                  </small>
                );
              } else if (rowData.strategy) {
                return (
                  <small className="text-600 mt-1 block">
                    Рекомендуемая стратегия: {rowData.strategy.name}
                  </small>
                );
              }
              return null;
            })()}
          </div>

          <div>
            <label className="block mb-2 font-medium">
              Количество акций <span className="text-red-500">*</span>
            </label>
            <InputNumber
              value={quantity}
              onValueChange={(e) => setQuantity(e.value || 0)}
              min={1}
              className="w-full"
              disabled={creatingRequest}
            />
          </div>

          <div>
            <label className="block mb-2 font-medium">Цена за акцию</label>
            <div className="p-2 bg-gray-50 border-round">
              {new Intl.NumberFormat('ru-RU', {
                style: 'currency',
                currency: 'RUB',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              }).format(rowData.priceAtAnalysis)}
            </div>
          </div>

          {showHoldWarning && (
            <Message
              severity="warn"
              text="AI рекомендует удержание позиции. Убедитесь, что покупка соответствует вашей стратегии."
              className="w-full"
            />
          )}

          <div>
            <label className="block mb-2 font-medium">Комментарий (необязательно)</label>
            <InputTextarea
              value={userReason}
              onChange={(e) => setUserReason(e.target.value)}
              rows={3}
              className="w-full"
              placeholder="Укажите причину покупки, если AI рекомендует HOLD"
              disabled={creatingRequest}
            />
          </div>

          {quantity > 0 && rowData.priceAtAnalysis > 0 && (
            <div className="p-3 bg-blue-50 border-round">
              <div className="font-medium text-blue-900">
                Общая сумма: {new Intl.NumberFormat('ru-RU', {
                  style: 'currency',
                  currency: 'RUB',
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                }).format(quantity * rowData.priceAtAnalysis)}
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
};

export default BuyButton;

