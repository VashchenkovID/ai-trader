import React from 'react';
import { Card } from '../ui';
import './CurrentPriceCard.css';

interface CurrentPriceCardProps {
  currentPrice: number;
  priceChange?: number;
  priceChangePercent?: number;
  currency: string;
  lastUpdateTime?: string;
  isLive?: boolean;
}

const CurrentPriceCard: React.FC<CurrentPriceCardProps> = ({
  currentPrice,
  priceChange = 0,
  priceChangePercent = 0,
  currency,
  lastUpdateTime,
  isLive = false
}) => {
  const isPositive = priceChange >= 0;

  return (
    <Card variant="default" className="current-price-card">
      <div className="current-price-card__header">
        <h3 className="current-price-card__title">Текущая цена</h3>
        {isLive && (
          <span className="current-price-card__live-indicator" title="Live обновления">
            <span className="current-price-card__live-dot"></span>
            Live
          </span>
        )}
      </div>
      
      <div className="current-price-card__content">
        <div className="current-price-card__price">
          {currentPrice.toLocaleString('ru-RU', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
          })}
          <span className="current-price-card__currency"> {currency}</span>
        </div>
        
        {(priceChange !== 0 || priceChangePercent !== 0) && (
          <div className={`current-price-card__change ${isPositive ? 'positive' : 'negative'}`}>
            <span className="current-price-card__change-arrow">
              {isPositive ? '↑' : '↓'}
            </span>
            <span className="current-price-card__change-amount">
              {Math.abs(priceChange).toLocaleString('ru-RU', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })} {currency}
            </span>
            <span className="current-price-card__change-percent">
              ({isPositive ? '+' : ''}{(priceChangePercent != null && !isNaN(priceChangePercent) ? priceChangePercent : 0).toFixed(2)}%)
            </span>
          </div>
        )}
        
        {lastUpdateTime && (
          <div className="current-price-card__update-time">
            Обновлено: {new Date(lastUpdateTime).toLocaleTimeString('ru-RU')}
          </div>
        )}
      </div>
    </Card>
  );
};

export default CurrentPriceCard;

