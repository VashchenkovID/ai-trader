import React from 'react';
import { Badge } from '../ui';
import './SignalCard.css';

interface SignalItem {
  signalId: string;
  strategyId?: string;
  direction: string | 'SIGNAL_DIRECTION_BUY' | 'SIGNAL_DIRECTION_SELL' | 'SIGNAL_DIRECTION_UNSPECIFIED';
  strategyName: string;
  probability?: number;
  name?: string;
  createDt: string;
  endDt: string;
  initialPrice?: number | null;
  targetPrice?: number | null;
  stoploss?: number | null;
  info?: string;
  isActive: boolean;
}

interface SignalCardProps {
  signal: SignalItem;
  formatDate: (date: string) => string;
  formatCurrency: (price: number) => string;
}

export const SignalCard: React.FC<SignalCardProps> = ({
  signal,
  formatDate,
  formatCurrency,
}) => {
  const directionText = signal.direction === 'SIGNAL_DIRECTION_BUY' 
    ? 'ПОКУПКА' 
    : signal.direction === 'SIGNAL_DIRECTION_SELL' 
    ? 'ПРОДАЖА' 
    : 'НЕОПРЕДЕЛЕНО';
  
  const directionVariant = signal.direction === 'SIGNAL_DIRECTION_BUY' 
    ? 'success' 
    : signal.direction === 'SIGNAL_DIRECTION_SELL' 
    ? 'error' 
    : 'neutral';

  return (
    <div className="signal-card">
      <div className="signal-card-header">
        <Badge variant={directionVariant} size="md">{directionText}</Badge>
        {signal.isActive && (
          <Badge variant="success" size="sm">Активен</Badge>
        )}
      </div>
      <div className="signal-card-strategy">
        {signal.strategyName}
        {signal.probability && ` • Вероятность: ${signal.probability}%`}
      </div>
      {signal.name && (
        <div className="signal-card-name">{signal.name}</div>
      )}
      <div className="signal-card-details">
        <div>Создан: {formatDate(signal.createDt)}</div>
        <div>Действует до: {formatDate(signal.endDt)}</div>
        {signal.initialPrice && (
          <div>Начальная цена: {formatCurrency(signal.initialPrice)}</div>
        )}
        {signal.targetPrice && (
          <div>Целевая цена: {formatCurrency(signal.targetPrice)}</div>
        )}
        {signal.stoploss && (
          <div>Стоп-лосс: {formatCurrency(signal.stoploss)}</div>
        )}
      </div>
      {signal.info && (
        <div className="signal-card-info">{signal.info}</div>
      )}
    </div>
  );
};

export default SignalCard;

