import React from 'react';
import { Card } from '../ui/Card/Card';
import { Badge } from '../ui/Badge/Badge';
import './OrderSizeCalculator.css';

interface OrderSizeData {
  baseSize: number;
  liquidityAdjustment: number;
  volatilityAdjustment: number;
  finalSize: number;
  maxSize: number;
  recommendation: string;
}

interface OrderSizeCalculatorProps {
  data: OrderSizeData;
  className?: string;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value || 0);

const formatPercent = (value: number, decimals: number = 1) => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
};

export const OrderSizeCalculator: React.FC<OrderSizeCalculatorProps> = ({
  data,
  className = ''
}) => {
  const liquidityChange = (data.liquidityAdjustment - 1) * 100;
  const volatilityChange = (data.volatilityAdjustment - 1) * 100;

  return (
    <Card variant="glass" className={`order-size-calculator ${className}`}>
      <div className="calculator-header">
        <h3 className="calculator-title">Калькулятор размера ордера</h3>
      </div>

      <div className="calculator-breakdown">
        <div className="breakdown-step">
          <div className="step-label">Базовый размер</div>
          <div className="step-value">{formatCurrency(data.baseSize)}</div>
        </div>

        <div className="breakdown-arrow">→</div>

        <div className="breakdown-step">
          <div className="step-label">
            Корректировка ликвидности
            <Badge 
              variant={liquidityChange >= 0 ? 'success' : 'warning'} 
              size="sm"
            >
              {formatPercent(liquidityChange)}
            </Badge>
          </div>
          <div className="step-value">
            {formatCurrency(data.baseSize * data.liquidityAdjustment)}
          </div>
        </div>

        <div className="breakdown-arrow">→</div>

        <div className="breakdown-step">
          <div className="step-label">
            Корректировка волатильности
            <Badge 
              variant={volatilityChange >= 0 ? 'success' : 'warning'} 
              size="sm"
            >
              {formatPercent(volatilityChange)}
            </Badge>
          </div>
          <div className="step-value">
            {formatCurrency(data.baseSize * data.liquidityAdjustment * data.volatilityAdjustment)}
          </div>
        </div>

        <div className="breakdown-arrow">→</div>

        <div className="breakdown-step breakdown-final">
          <div className="step-label">Итоговый размер</div>
          <div className="step-value step-final-value">
            {formatCurrency(data.finalSize)}
          </div>
        </div>
      </div>

      <div className="calculator-limits">
        <div className="limit-item">
          <span className="limit-label">Максимальный размер</span>
          <span className="limit-value">{formatCurrency(data.maxSize)}</span>
        </div>
        <div className="limit-status">
          {data.finalSize <= data.maxSize ? (
            <Badge variant="success" size="sm">В пределах лимита</Badge>
          ) : (
            <Badge variant="error" size="sm">Превышен лимит</Badge>
          )}
        </div>
      </div>

      <div className="calculator-recommendation">
        <p>{data.recommendation}</p>
      </div>
    </Card>
  );
};

export default OrderSizeCalculator;

