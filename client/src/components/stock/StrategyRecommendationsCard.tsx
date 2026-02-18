import React, { useState } from 'react';
import { Card, Badge, ProgressBar, Button } from '../ui';
import './StrategyRecommendationsCard.css';

interface StrategyRecommendation {
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence?: number;
  explanation?: string;
  targetPrice?: number;
  score?: number;
  strategyConfidence?: number;
}

interface StrategyRecommendationsCardProps {
  aggressive?: StrategyRecommendation;
  moderate?: StrategyRecommendation;
  conservative?: StrategyRecommendation;
  currency: string;
}

const StrategyRecommendationsCard: React.FC<StrategyRecommendationsCardProps> = ({
  aggressive,
  moderate,
  conservative,
  currency
}) => {
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);

  const getRecommendationColor = (rec: string) => {
    switch (rec) {
      case 'BUY':
        return 'positive';
      case 'SELL':
        return 'negative';
      case 'HOLD':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  const getRecommendationLabel = (rec: string) => {
    switch (rec) {
      case 'BUY':
        return 'ПОКУПКА';
      case 'SELL':
        return 'ПРОДАЖА';
      case 'HOLD':
        return 'УДЕРЖАНИЕ';
      default:
        return rec;
    }
  };

  const toggleStrategy = (strategy: string) => {
    setExpandedStrategy(expandedStrategy === strategy ? null : strategy);
  };

  const renderStrategy = (
    label: string,
    icon: string,
    color: string,
    strategy: StrategyRecommendation | undefined,
    strategyKey: string
  ) => {
    if (!strategy) return null;

    const recColor = getRecommendationColor(strategy.recommendation);
    const recLabel = getRecommendationLabel(strategy.recommendation);
    const isExpanded = expandedStrategy === strategyKey;
    const confidence = strategy.confidence ?? strategy.strategyConfidence ?? 0;

    return (
      <div className={`strategy-recommendations-card__strategy strategy-recommendations-card__strategy--${color}`}>
        <div 
          className="strategy-recommendations-card__strategy-header"
          onClick={() => toggleStrategy(strategyKey)}
        >
          <div className="strategy-recommendations-card__strategy-title">
            <span className="strategy-recommendations-card__strategy-icon">{icon}</span>
            <span>{label}</span>
          </div>
          <div className="strategy-recommendations-card__strategy-badges">
            <Badge 
              variant={recColor === 'positive' ? 'success' : recColor === 'negative' ? 'error' : 'warning'}
              className="strategy-recommendations-card__strategy-badge"
            >
              {recLabel}
            </Badge>
            <span className="strategy-recommendations-card__strategy-confidence">
              {confidence.toFixed(0)}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="strategy-recommendations-card__strategy-toggle"
            >
              {isExpanded ? '▼' : '▶'}
            </Button>
          </div>
        </div>
        
        {isExpanded && (
          <div className="strategy-recommendations-card__strategy-details">
            <div className="strategy-recommendations-card__strategy-confidence-bar">
              <ProgressBar 
                value={confidence} 
                className={`strategy-recommendations-card__progress strategy-recommendations-card__progress--${recColor}`}
              />
            </div>
            
            {strategy.explanation && (
              <div className="strategy-recommendations-card__strategy-explanation">
                <div className="strategy-recommendations-card__strategy-explanation-label">Обоснование:</div>
                <div className="strategy-recommendations-card__strategy-explanation-text">
                  {strategy.explanation}
                </div>
              </div>
            )}
            
            {strategy.targetPrice && (
              <div className="strategy-recommendations-card__strategy-target">
                <div className="strategy-recommendations-card__strategy-target-label">Целевая цена:</div>
                <div className="strategy-recommendations-card__strategy-target-value">
                  {strategy.targetPrice.toLocaleString('ru-RU', { 
                    minimumFractionDigits: 2, 
                    maximumFractionDigits: 2 
                  })} {currency}
                </div>
              </div>
            )}
            
            {strategy.score !== undefined && (
              <div className="strategy-recommendations-card__strategy-score">
                <div className="strategy-recommendations-card__strategy-score-label">Балл:</div>
                <div className={`strategy-recommendations-card__strategy-score-value strategy-recommendations-card__strategy-score-value--${recColor}`}>
                  {strategy.score > 0 ? '+' : ''}{strategy.score.toFixed(2)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card 
      variant="default" 
      className="strategy-recommendations-card"
      header={
        <h3 className="strategy-recommendations-card__title">
          <span className="strategy-recommendations-card__icon">📊</span>
          Рекомендации по стратегиям
        </h3>
      }
    >
      <div className="strategy-recommendations-card__content">
        {renderStrategy('Агрессивная', '🔴', 'red', aggressive, 'aggressive')}
        {renderStrategy('Умеренная', '🟡', 'yellow', moderate, 'moderate')}
        {renderStrategy('Консервативная', '🟢', 'green', conservative, 'conservative')}
        
        {!aggressive && !moderate && !conservative && (
          <div className="strategy-recommendations-card__no-data">
            Рекомендации по стратегиям недоступны
          </div>
        )}
      </div>
    </Card>
  );
};

export default StrategyRecommendationsCard;

