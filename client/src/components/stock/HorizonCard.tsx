import React from 'react';
import { Card, Badge } from '../ui';
import { translateRecommendation } from '../../utils/recommendationTranslator';
import './HorizonCard.css';

interface Strategy {
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  explanation?: string;
  score?: number;
  confidence?: number;
}

interface Horizon {
  name: string;
  description: string;
  model?: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  score: number;
  confidence: number;
  explanation?: string;
  strategies?: {
    aggressive?: Strategy;
    moderate?: Strategy;
    conservative?: Strategy;
  };
}

interface HorizonCardProps {
  horizon: Horizon;
  type: 'shortTerm' | 'mediumTerm' | 'longTerm';
}

export const HorizonCard: React.FC<HorizonCardProps> = ({ horizon, type }) => {
  const getRecommendationVariant = (recommendation: string): 'success' | 'error' | 'neutral' => {
    if (recommendation === 'BUY') return 'success';
    if (recommendation === 'SELL') return 'error';
    return 'neutral';
  };

  const getConfidenceVariant = (confidence: number): 'success' | 'warning' | 'error' => {
    if (confidence >= 0.7) return 'success';
    if (confidence >= 0.5) return 'warning';
    return 'error';
  };

  const getStrategyVariant = (strategyType: string): 'success' | 'error' | 'warning' | 'neutral' => {
    if (strategyType === 'aggressive') return 'error';
    if (strategyType === 'moderate') return 'warning';
    return 'success';
  };

  const getHorizonIcon = (type: string) => {
    switch (type) {
      case 'shortTerm':
        return '⚡';
      case 'mediumTerm':
        return '📅';
      case 'longTerm':
        return '📈';
      default:
        return '📊';
    }
  };

  const scorePercent = Math.round(horizon.score * 100);
  const confidencePercent = Math.round(horizon.confidence * 100);

  return (
    <Card variant="glass" className="horizon-card">
      <div className="horizon-card-header">
        <div className="horizon-card-title">
          <span className="horizon-card-icon">{getHorizonIcon(type)}</span>
          <div>
            <h3 className="horizon-card-name">{horizon.name}</h3>
            <p className="horizon-card-description">{horizon.description}</p>
          </div>
        </div>
        {horizon.model && (
          <Badge variant="info" size="sm">
            {horizon.model}
          </Badge>
        )}
      </div>

      <div className="horizon-card-body">
        {/* Основная рекомендация */}
        <div className="horizon-card-recommendation">
          <Badge 
            variant={getRecommendationVariant(horizon.recommendation)} 
            size="lg"
          >
            {translateRecommendation(horizon.recommendation)}
          </Badge>
        </div>

        {/* Метрики */}
        <div className="horizon-card-metrics">
          <div className="horizon-card-metric">
            <span className="horizon-card-metric-label">Сила сигнала:</span>
            <span className={`horizon-card-metric-value ${getRecommendationVariant(horizon.recommendation)}`}>
              {scorePercent}%
            </span>
          </div>
          <div className="horizon-card-metric">
            <span className="horizon-card-metric-label">Уверенность:</span>
            <Badge variant={getConfidenceVariant(horizon.confidence)} size="sm">
              {confidencePercent}%
            </Badge>
          </div>
        </div>

        {/* Объяснение */}
        {horizon.explanation && (
          <div className="horizon-card-explanation">
            <p>{horizon.explanation}</p>
          </div>
        )}

        {/* Стратегии */}
        {horizon.strategies && (
          <div className="horizon-card-strategies">
            <div className="horizon-card-strategies-title">
              Рекомендации по стратегиям:
            </div>
            <div className="horizon-card-strategies-list">
              {horizon.strategies.aggressive && (
                <div className="horizon-card-strategy horizon-card-strategy-aggressive">
                  <div className="horizon-card-strategy-header">
                    <Badge variant="error" size="sm">Агрессивная</Badge>
                    <Badge 
                      variant={getRecommendationVariant(horizon.strategies.aggressive.recommendation)} 
                      size="sm"
                    >
                      {translateRecommendation(horizon.strategies.aggressive.recommendation)}
                    </Badge>
                  </div>
                  {horizon.strategies.aggressive.explanation && (
                    <p className="horizon-card-strategy-explanation">
                      {horizon.strategies.aggressive.explanation}
                    </p>
                  )}
                </div>
              )}
              {horizon.strategies.moderate && (
                <div className="horizon-card-strategy horizon-card-strategy-moderate">
                  <div className="horizon-card-strategy-header">
                    <Badge variant="warning" size="sm">Умеренная</Badge>
                    <Badge 
                      variant={getRecommendationVariant(horizon.strategies.moderate.recommendation)} 
                      size="sm"
                    >
                      {translateRecommendation(horizon.strategies.moderate.recommendation)}
                    </Badge>
                  </div>
                  {horizon.strategies.moderate.explanation && (
                    <p className="horizon-card-strategy-explanation">
                      {horizon.strategies.moderate.explanation}
                    </p>
                  )}
                </div>
              )}
              {horizon.strategies.conservative && (
                <div className="horizon-card-strategy horizon-card-strategy-conservative">
                  <div className="horizon-card-strategy-header">
                    <Badge variant="success" size="sm">Консервативная</Badge>
                    <Badge 
                      variant={getRecommendationVariant(horizon.strategies.conservative.recommendation)} 
                      size="sm"
                    >
                      {translateRecommendation(horizon.strategies.conservative.recommendation)}
                    </Badge>
                  </div>
                  {horizon.strategies.conservative.explanation && (
                    <p className="horizon-card-strategy-explanation">
                      {horizon.strategies.conservative.explanation}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default HorizonCard;

