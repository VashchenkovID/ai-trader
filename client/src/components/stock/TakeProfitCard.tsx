import React from 'react';
import { Card } from '../ui';
import './TakeProfitCard.css';

interface TakeProfitCardProps {
  takeProfitPrice: number;
  currentPrice: number;
  currency: string;
  distance?: number;
  distancePercent?: number;
  riskRewardRatio?: number;
}

const TakeProfitCard: React.FC<TakeProfitCardProps> = ({
  takeProfitPrice,
  currentPrice,
  currency,
  distance,
  distancePercent,
  riskRewardRatio
}) => {
  // Вычисляем расстояние, если не передано
  const calculatedDistance = distance ?? (takeProfitPrice - currentPrice);
  const calculatedDistancePercent = distancePercent ?? ((calculatedDistance / currentPrice) * 100);
  const potentialProfit = calculatedDistance;
  const potentialProfitPercent = calculatedDistancePercent;

  return (
    <Card className="take-profit-card">
      <div className="take-profit-card__header">
        <h3 className="take-profit-card__title">
          <span className="take-profit-card__icon">✅</span>
          Тейк-профит
        </h3>
      </div>
      
      <div className="take-profit-card__content">
        <div className="take-profit-card__price">
          {takeProfitPrice.toLocaleString('ru-RU', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
          })}
          <span className="take-profit-card__currency"> {currency}</span>
        </div>
        
        <div className="take-profit-card__profit">
          <div className="take-profit-card__profit-label">Потенциальная прибыль:</div>
          <div className="take-profit-card__profit-value">
            {potentialProfit.toLocaleString('ru-RU', { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            })} {currency}
            <span className="take-profit-card__profit-percent">
              (+{potentialProfitPercent.toFixed(2)}%)
            </span>
          </div>
        </div>
        
        <div className="take-profit-card__progress">
          <div className="take-profit-card__progress-bar">
            <div 
              className="take-profit-card__progress-fill"
              style={{ width: `${Math.min(Math.abs(potentialProfitPercent), 100)}%` }}
            ></div>
          </div>
          <div className="take-profit-card__progress-label">
            Прогресс: {Math.min(Math.abs(potentialProfitPercent), 100).toFixed(1)}%
          </div>
        </div>
        
        {riskRewardRatio !== undefined && (
          <div className="take-profit-card__risk-reward">
            <div className="take-profit-card__risk-reward-label">Risk/Reward:</div>
            <div className={`take-profit-card__risk-reward-value ${
              riskRewardRatio >= 1 ? 'good' : riskRewardRatio >= 0.5 ? 'moderate' : 'poor'
            }`}>
              1:{riskRewardRatio.toFixed(2)}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default TakeProfitCard;

