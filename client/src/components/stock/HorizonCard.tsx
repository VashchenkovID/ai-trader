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

  // const getStrategyVariant = (strategyType: string): 'success' | 'error' | 'warning' | 'neutral' => { // Reserved for future use
  //   if (strategyType === 'aggressive') return 'error';
  //   if (strategyType === 'moderate') return 'warning';
  //   return 'success';
  // };

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
        {horizon.strategies && (() => {
          const strategies = [
            { type: 'aggressive', data: horizon.strategies.aggressive, name: 'Агрессивная', variant: 'error' as const },
            { type: 'moderate', data: horizon.strategies.moderate, name: 'Умеренная', variant: 'warning' as const },
            { type: 'conservative', data: horizon.strategies.conservative, name: 'Консервативная', variant: 'success' as const }
          ].filter(s => s.data);

          if (strategies.length === 0) return null;

          // Группируем стратегии по рекомендациям
          const groupedByRecommendation = strategies.reduce((acc, strategy) => {
            const rec = strategy.data?.recommendation || 'HOLD';
            if (!acc[rec]) {
              acc[rec] = [];
            }
            acc[rec].push(strategy);
            return acc;
          }, {} as Record<string, typeof strategies>);

          const recommendationGroups = Object.entries(groupedByRecommendation);

          // Если все стратегии дают одинаковую рекомендацию, показываем компактно
          if (recommendationGroups.length === 1) {
            const [recommendation, groupStrategies] = recommendationGroups[0];
            const explanation = groupStrategies.find(s => s.data?.explanation)?.data?.explanation || 
                              `Все стратегии рекомендуют ${translateRecommendation(recommendation).toLowerCase()}`;

            return (
              <div className="horizon-card-strategies">
                <div className="horizon-card-strategies-title">
                  Рекомендации по стратегиям:
                </div>
                <div className="horizon-card-strategies-unified">
                  <div className="horizon-card-strategy-unified-header">
                    <div className="horizon-card-strategy-badges">
                      {groupStrategies.map((s, idx) => (
                        <Badge key={idx} variant={s.variant} size="sm">
                          {s.name}
                        </Badge>
                      ))}
                    </div>
                    <Badge 
                      variant={getRecommendationVariant(recommendation)} 
                      size="sm"
                    >
                      {translateRecommendation(recommendation)}
                    </Badge>
                  </div>
                  <p className="horizon-card-strategy-explanation">
                    {explanation}
                  </p>
                </div>
              </div>
            );
          }

          // Если стратегии дают разные рекомендации, группируем и показываем только различия
          return (
            <div className="horizon-card-strategies">
              <div className="horizon-card-strategies-title">
                Рекомендации по стратегиям:
              </div>
              <div className="horizon-card-strategies-list">
                {recommendationGroups.map(([recommendation, groupStrategies], groupIdx) => {
                  // Берем объяснение из первой стратегии в группе
                  const explanation = groupStrategies.find(s => s.data?.explanation)?.data?.explanation || 
                                    `${groupStrategies.length === 1 ? groupStrategies[0].name : 'Эти стратегии'} рекомендуют ${translateRecommendation(recommendation).toLowerCase()}`;

                  return (
                    <div 
                      key={groupIdx} 
                      className={`horizon-card-strategy horizon-card-strategy-grouped horizon-card-strategy-${getRecommendationVariant(recommendation)}`}
                    >
                      <div className="horizon-card-strategy-header">
                        <div className="horizon-card-strategy-badges">
                          {groupStrategies.map((s, idx) => (
                            <Badge key={idx} variant={s.variant} size="sm">
                              {s.name}
                            </Badge>
                          ))}
                        </div>
                        <Badge 
                          variant={getRecommendationVariant(recommendation)} 
                          size="sm"
                        >
                          {translateRecommendation(recommendation)}
                        </Badge>
                      </div>
                      <p className="horizon-card-strategy-explanation">
                        {explanation}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </Card>
  );
};

export default HorizonCard;

