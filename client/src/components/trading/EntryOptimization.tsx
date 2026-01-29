import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card/Card';
import { Badge } from '../ui/Badge/Badge';
import { Button } from '../ui/Button/Button';
import { Skeleton } from '../ui/Skeleton/Skeleton';
// import { Chart } from '../ui/Chart/Chart'; // Reserved for future use
// import { apiService } from '../../services/apiService'; // Reserved for future use
import './EntryOptimization.css';

export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LIMIT';

interface EntryOptimizationData {
  entryPrediction: {
    success: boolean;
    probability: number;
    optimalTime: 'now' | 'wait' | number; // number = минут до входа
    confidence: number;
    reason?: string;
  };
  orderSize: {
    baseSize: number;
    liquidityAdjustment: number;
    volatilityAdjustment: number;
    finalSize: number;
    maxSize: number;
    recommendation: string;
  };
  orderType: {
    recommendation: OrderType;
    confidence: number;
    reason: string;
    suggestedPrice?: number;
  };
  spread: {
    current: number;
    historical: {
      mean: number;
      median: number;
      percentile25: number;
      percentile75: number;
    };
    status: 'low' | 'medium' | 'high';
  };
}

interface EntryOptimizationProps {
  figi: string;
  ticker?: string;
  currentPrice?: number;
  className?: string;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value || 0);

const formatPercent = (value: number, decimals: number = 2) => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
};

export const EntryOptimization: React.FC<EntryOptimizationProps> = ({
  figi,
  // ticker, // Reserved for future use
  currentPrice,
  className = ''
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EntryOptimizationData | null>(null);

  useEffect(() => {
    if (figi) {
      loadOptimizationData();
    }
  }, [figi]);

  const loadOptimizationData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${(window as any).env?.REACT_APP_API_URL || ''}/api/entry-optimization/${figi}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch entry optimization data');
      }
      
      const result = await response.json();
      setData(result.data || result);
    } catch (err: any) {
      console.error('Error loading entry optimization:', err);
      setError(err.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const getEntryTimeLabel = (optimalTime: 'now' | 'wait' | number) => {
    if (optimalTime === 'now') return 'Входить сейчас';
    if (optimalTime === 'wait') return 'Не входить';
    if (typeof optimalTime === 'number') {
      if (optimalTime < 60) return `Подождать ${optimalTime} минут`;
      const hours = Math.floor(optimalTime / 60);
      const minutes = optimalTime % 60;
      return `Подождать ${hours}ч ${minutes}м`;
    }
    return 'Не определено';
  };

  const getEntryTimeVariant = (optimalTime: 'now' | 'wait' | number) => {
    if (optimalTime === 'now') return 'success';
    if (optimalTime === 'wait') return 'error';
    return 'warning';
  };

  const getOrderTypeLabel = (type: OrderType) => {
    switch (type) {
      case 'MARKET':
        return 'Рыночный';
      case 'LIMIT':
        return 'Лимитный';
      case 'STOP_LIMIT':
        return 'Стоп-лимитный';
      default:
        return type;
    }
  };

  if (loading) {
    return (
      <Card variant="glass" className={`entry-optimization ${className}`}>
        <Skeleton width="100%" height={500} />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card variant="glass" className={`entry-optimization ${className}`}>
        <div className="error-message">
          <p>{error || 'Данные недоступны'}</p>
          <Button onClick={loadOptimizationData} variant="primary" size="sm">
            Повторить
          </Button>
        </div>
      </Card>
    );
  }

  const entryPred = data.entryPrediction;
  const orderSize = data.orderSize;
  const orderType = data.orderType;
  const spread = data.spread;

  return (
    <div className={`entry-optimization ${className}`}>
      {/* Рекомендация времени входа */}
      <Card variant="glass" className="optimization-section">
        <div className="section-header">
          <h3 className="section-title">Оптимальное время входа</h3>
          <Badge
            variant={getEntryTimeVariant(entryPred.optimalTime) as any}
            size="lg"
          >
            {getEntryTimeLabel(entryPred.optimalTime)}
          </Badge>
        </div>
        <div className="entry-details">
          <div className="detail-item">
            <span className="detail-label">Уверенность</span>
            <span className="detail-value">
              {(entryPred.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Вероятность успеха</span>
            <span className="detail-value">
              {(entryPred.probability * 100).toFixed(1)}%
            </span>
          </div>
          {entryPred.reason && (
            <div className="entry-reason">
              <span className="reason-label">Причина:</span>
              <span className="reason-text">{entryPred.reason}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Рекомендуемый размер ордера */}
      <Card variant="glass" className="optimization-section">
        <div className="section-header">
          <h3 className="section-title">Размер ордера</h3>
        </div>
        <div className="order-size-details">
          <div className="size-breakdown">
            <div className="breakdown-item">
              <span className="breakdown-label">Базовый размер</span>
              <span className="breakdown-value">{formatCurrency(orderSize.baseSize)}</span>
            </div>
            <div className="breakdown-item">
              <span className="breakdown-label">Корректировка ликвидности</span>
              <span className="breakdown-value">
                {formatPercent((orderSize.liquidityAdjustment - 1) * 100, 1)}
              </span>
            </div>
            <div className="breakdown-item">
              <span className="breakdown-label">Корректировка волатильности</span>
              <span className="breakdown-value">
                {formatPercent((orderSize.volatilityAdjustment - 1) * 100, 1)}
              </span>
            </div>
            <div className="breakdown-item breakdown-final">
              <span className="breakdown-label">Итоговый размер</span>
              <span className="breakdown-value breakdown-final-value">
                {formatCurrency(orderSize.finalSize)}
              </span>
            </div>
          </div>
          <div className="size-recommendation">
            <p>{orderSize.recommendation}</p>
            <span className="size-limit">
              Максимальный размер: {formatCurrency(orderSize.maxSize)}
            </span>
          </div>
        </div>
      </Card>

      {/* Рекомендуемый тип ордера */}
      <Card variant="glass" className="optimization-section">
        <div className="section-header">
          <h3 className="section-title">Тип ордера</h3>
          <Badge
            variant={orderType.recommendation === 'MARKET' ? 'success' : 
                    orderType.recommendation === 'LIMIT' ? 'warning' : 'error'}
            size="lg"
          >
            {getOrderTypeLabel(orderType.recommendation)}
          </Badge>
        </div>
        <div className="order-type-details">
          <div className="detail-item">
            <span className="detail-label">Уверенность</span>
            <span className="detail-value">
              {(orderType.confidence * 100).toFixed(0)}%
            </span>
          </div>
          {orderType.suggestedPrice && currentPrice && (
            <div className="detail-item">
              <span className="detail-label">Рекомендуемая цена</span>
              <span className="detail-value">
                {formatCurrency(orderType.suggestedPrice)}
                <span className="price-diff">
                  ({formatPercent(((orderType.suggestedPrice - currentPrice) / currentPrice) * 100, 2)})
                </span>
              </span>
            </div>
          )}
          <div className="order-type-reason">
            <span className="reason-label">Обоснование:</span>
            <span className="reason-text">{orderType.reason}</span>
          </div>
        </div>
      </Card>

      {/* Анализ spread'а */}
      <Card variant="glass" className="optimization-section">
        <div className="section-header">
          <h3 className="section-title">Анализ spread'а</h3>
          <Badge
            variant={spread.status === 'low' ? 'success' : 
                    spread.status === 'medium' ? 'warning' : 'error'}
            size="sm"
          >
            {spread.status === 'low' ? 'Низкий' : 
             spread.status === 'medium' ? 'Средний' : 'Высокий'}
          </Badge>
        </div>
        <div className="spread-details">
          <div className="spread-current">
            <span className="spread-label">Текущий spread</span>
            <span className="spread-value">
              {formatPercent(spread.current * 100, 3)}
            </span>
          </div>
          <div className="spread-historical">
            <div className="historical-item">
              <span className="historical-label">Средний</span>
              <span className="historical-value">
                {formatPercent(spread.historical.mean * 100, 3)}
              </span>
            </div>
            <div className="historical-item">
              <span className="historical-label">Медиана</span>
              <span className="historical-value">
                {formatPercent(spread.historical.median * 100, 3)}
              </span>
            </div>
            <div className="historical-item">
              <span className="historical-label">25-й процентиль</span>
              <span className="historical-value">
                {formatPercent(spread.historical.percentile25 * 100, 3)}
              </span>
            </div>
            <div className="historical-item">
              <span className="historical-label">75-й процентиль</span>
              <span className="historical-value">
                {formatPercent(spread.historical.percentile75 * 100, 3)}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default EntryOptimization;

