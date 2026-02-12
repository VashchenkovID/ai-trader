import React from 'react';
import { Card } from '../ui';
import './StopLossCard.css';

interface StopLossCardProps {
  stopLossPrice: number;
  currentPrice: number;
  currency: string;
  distance?: number;
  distancePercent?: number;
}

const StopLossCard: React.FC<StopLossCardProps> = ({
  stopLossPrice,
  currentPrice,
  currency,
  distance,
  distancePercent
}) => {
  // Вычисляем расстояние, если не передано
  const calculatedDistance = distance ?? (currentPrice - stopLossPrice);
  const calculatedDistancePercent = distancePercent ?? ((calculatedDistance / currentPrice) * 100);

  // Определяем уровень опасности
  const getDangerLevel = (percent: number): 'safe' | 'warning' | 'danger' => {
    if (percent > 10) return 'safe';
    if (percent > 5) return 'warning';
    return 'danger';
  };

  const dangerLevel = getDangerLevel(Math.abs(calculatedDistancePercent));
  const isClose = dangerLevel !== 'safe';

  return (
    <Card className={`stop-loss-card stop-loss-card--${dangerLevel}`}>
      <div className="stop-loss-card__header">
        <h3 className="stop-loss-card__title">
          <span className="stop-loss-card__icon">⚠️</span>
          Стоп-лосс
        </h3>
        {isClose && (
          <span className="stop-loss-card__warning-badge">Близко!</span>
        )}
      </div>
      
      <div className="stop-loss-card__content">
        <div className="stop-loss-card__price">
          {stopLossPrice.toLocaleString('ru-RU', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
          })}
          <span className="stop-loss-card__currency"> {currency}</span>
        </div>
        
        <div className="stop-loss-card__distance">
          <div className="stop-loss-card__distance-label">Расстояние:</div>
          <div className="stop-loss-card__distance-value">
            {Math.abs(calculatedDistance).toLocaleString('ru-RU', { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            })} {currency}
            <span className="stop-loss-card__distance-percent">
              ({Math.abs(calculatedDistancePercent).toFixed(2)}%)
            </span>
          </div>
        </div>
        
        <div className="stop-loss-card__progress">
          <div className="stop-loss-card__progress-bar">
            <div 
              className={`stop-loss-card__progress-fill stop-loss-card__progress-fill--${dangerLevel}`}
              style={{ width: `${Math.min(Math.abs(calculatedDistancePercent), 20)}%` }}
            ></div>
          </div>
          <div className="stop-loss-card__progress-labels">
            <span>0%</span>
            <span>20%</span>
          </div>
        </div>
        
        {isClose && (
          <div className="stop-loss-card__alert">
            ⚠️ Стоп-лосс находится слишком близко к текущей цене!
          </div>
        )}
      </div>
    </Card>
  );
};

export default StopLossCard;

