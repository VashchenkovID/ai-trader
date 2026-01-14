import React from 'react';
import { Card } from '../ui';
import { Button } from '../ui';
import { Badge } from '../ui';
import { useNavigate } from 'react-router-dom';
import { translateRecommendation } from '../../utils/recommendationTranslator';
import './RecommendationCard.css';

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
  sector?: string;
  analysisDate: string;
  isActive: boolean;
  horizons?: {
    shortTerm?: {
      recommendation: 'BUY' | 'SELL' | 'HOLD';
      score: number;
      confidence: number;
      name?: string;
      description?: string;
    };
    mediumTerm?: {
      recommendation: 'BUY' | 'SELL' | 'HOLD';
      score: number;
      confidence: number;
      name?: string;
      description?: string;
    };
    longTerm?: {
      recommendation: 'BUY' | 'SELL' | 'HOLD';
      score: number;
      confidence: number;
      name?: string;
      description?: string;
    };
  };
  explanation?: {
    summary?: string;
    horizons?: {
      shortTerm?: {
        recommendation: 'BUY' | 'SELL' | 'HOLD';
        score: number;
        confidence: number;
        name?: string;
        description?: string;
      };
      mediumTerm?: {
        recommendation: 'BUY' | 'SELL' | 'HOLD';
        score: number;
        confidence: number;
        name?: string;
        description?: string;
      };
      longTerm?: {
        recommendation: 'BUY' | 'SELL' | 'HOLD';
        score: number;
        confidence: number;
        name?: string;
        description?: string;
      };
    };
    details?: {
      ensemble?: {
        horizons?: {
          shortTerm?: {
            recommendation?: 'BUY' | 'SELL' | 'HOLD';
            score?: number;
            confidence?: number;
            strategies?: {
              aggressive?: { 
                recommendation: string; 
                explanation?: string;
                score?: number;
                confidence?: number;
                strategyConfidence?: number;
              };
              moderate?: { 
                recommendation: string; 
                explanation?: string;
                score?: number;
                confidence?: number;
                strategyConfidence?: number;
              };
              conservative?: { 
                recommendation: string; 
                explanation?: string;
                score?: number;
                confidence?: number;
                strategyConfidence?: number;
              };
            };
          };
          mediumTerm?: {
            recommendation?: 'BUY' | 'SELL' | 'HOLD';
            score?: number;
            confidence?: number;
            strategies?: {
              aggressive?: { 
                recommendation: string; 
                explanation?: string;
                score?: number;
                confidence?: number;
                strategyConfidence?: number;
              };
              moderate?: { 
                recommendation: string; 
                explanation?: string;
                score?: number;
                confidence?: number;
                strategyConfidence?: number;
              };
              conservative?: { 
                recommendation: string; 
                explanation?: string;
                score?: number;
                confidence?: number;
                strategyConfidence?: number;
              };
            };
          };
          longTerm?: {
            recommendation?: 'BUY' | 'SELL' | 'HOLD';
            score?: number;
            confidence?: number;
            strategies?: {
              aggressive?: { 
                recommendation: string; 
                explanation?: string;
                score?: number;
                confidence?: number;
                strategyConfidence?: number;
              };
              moderate?: { 
                recommendation: string; 
                explanation?: string;
                score?: number;
                confidence?: number;
                strategyConfidence?: number;
              };
              conservative?: { 
                recommendation: string; 
                explanation?: string;
                score?: number;
                confidence?: number;
                strategyConfidence?: number;
              };
            };
          };
        };
      };
    };
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

interface RecommendationCardProps {
  recommendation: Recommendation;
  onBuy?: (figi: string) => void;
  onDetails?: (figi: string) => void;
  loading?: boolean;
  isNew?: boolean;
}

export const RecommendationCard: React.FC<RecommendationCardProps> = ({
  recommendation,
  onBuy,
  onDetails,
  loading = false,
  isNew = false,
}) => {
  const navigate = useNavigate();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);

      if (diffHours < 1) {
        return 'Только что';
      } else if (diffHours < 24) {
        return `${diffHours} ${diffHours === 1 ? 'час' : diffHours < 5 ? 'часа' : 'часов'} назад`;
      } else if (diffDays < 7) {
        return `${diffDays} ${diffDays === 1 ? 'день' : diffDays < 5 ? 'дня' : 'дней'} назад`;
      } else {
        return date.toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
      }
    } catch {
      return '—';
    }
  };

  const getConfidenceVariant = (confidence: number): 'success' | 'warning' | 'error' => {
    if (confidence >= 0.7) return 'success';
    if (confidence >= 0.5) return 'warning';
    return 'error';
  };

  const getRecommendationVariant = (recommendation: string): 'success' | 'error' | 'neutral' => {
    if (recommendation === 'BUY') return 'success';
    if (recommendation === 'SELL') return 'error';
    return 'neutral';
  };

  const handleBuy = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Находим скрытый BuyButton по data-атрибуту и кликаем по кнопке внутри
    const buyButtonContainer = document.querySelector(`[data-buy-button-figi="${recommendation.figi}"]`);
    if (buyButtonContainer) {
      // Ищем кнопку внутри контейнера (UI-kit Button с классом btn)
      // Пробуем разные селекторы для надежности
      const buyButton = buyButtonContainer.querySelector('button[data-buy-trigger]') || 
                        buyButtonContainer.querySelector('button.btn') ||
                        buyButtonContainer.querySelector('button');
      if (buyButton) {
        const btn = buyButton as HTMLButtonElement;
        // Проверяем, что кнопка не disabled
        if (!btn.disabled && !btn.hasAttribute('disabled')) {
          // Используем setTimeout для гарантии, что DOM готов
          setTimeout(() => {
            btn.click();
          }, 0);
          return;
        }
      }
    }
    // Fallback - вызываем callback
    if (onBuy) {
      onBuy(recommendation.figi);
    }
  };

  const handleDetails = () => {
    if (onDetails) {
      onDetails(recommendation.figi);
    } else {
      navigate(`/stock/${recommendation.figi}`);
    }
  };

  const confidencePercent = Math.round(recommendation.confidence * 100);
  const scorePercent = Math.round(recommendation.score * 100);

  // Определяем рекомендуемую стратегию
  const getRecommendedStrategy = () => {
    if (recommendation.strategy) {
      return recommendation.strategy;
    }
    if (recommendation.suggestedStrategy) {
      return recommendation.suggestedStrategy;
    }
    
    // Определяем на основе горизонтов и стратегий
    const horizons = recommendation.explanation?.details?.ensemble?.horizons;
    if (horizons) {
      // Проверяем все горизонты и находим лучшую стратегию
      const strategyScores: Record<string, { count: number; confidence: number }> = {
        aggressive: { count: 0, confidence: 0 },
        moderate: { count: 0, confidence: 0 },
        conservative: { count: 0, confidence: 0 },
      };
      
      [horizons.shortTerm, horizons.mediumTerm, horizons.longTerm].forEach((horizon) => {
        if (horizon?.strategies) {
          Object.entries(horizon.strategies).forEach(([strategyType, strategyData]: [string, any]) => {
            if (strategyData?.recommendation === recommendation.recommendation) {
              strategyScores[strategyType].count++;
              strategyScores[strategyType].confidence += strategyData.strategyConfidence || strategyData.confidence || 0;
            }
          });
        }
      });
      
      // Находим стратегию с наибольшим количеством совпадений
      let bestStrategy: string | null = null;
      let maxCount = 0;
      Object.entries(strategyScores).forEach(([type, data]) => {
        if (data.count > maxCount) {
          maxCount = data.count;
          bestStrategy = type;
        }
      });
      
      if (bestStrategy) {
        const strategyNames: Record<string, string> = {
          aggressive: 'Агрессивная',
          moderate: 'Умеренная',
          conservative: 'Консервативная',
        };
        return {
          type: bestStrategy as 'conservative' | 'moderate' | 'aggressive',
          name: strategyNames[bestStrategy] || bestStrategy,
        };
      }
    }
    
    // Fallback на основе confidence и score
    if (confidencePercent >= 80 && scorePercent >= 75) {
      return { type: 'aggressive' as const, name: 'Агрессивная' };
    } else if (confidencePercent >= 60 && scorePercent >= 60) {
      return { type: 'moderate' as const, name: 'Умеренная' };
    } else {
      return { type: 'conservative' as const, name: 'Консервативная' };
    }
  };

  const recommendedStrategy = getRecommendedStrategy();

  // Генерируем понятное объяснение
  const getSimpleExplanation = (): string => {
    // Используем summary из explanation, если есть и он понятный
    if (recommendation.explanation?.summary) {
      const summary = recommendation.explanation.summary;
      if (typeof summary === 'string' && summary.trim().length > 0) {
        // Берем первую строку или первые 150 символов
        const firstLine = summary.split('\n')[0].trim();
        // Проверяем, что это не техническое объяснение (не содержит много технических терминов)
        const technicalTerms = ['LSTM', 'CNN', 'Transformer', 'ensemble', 'horizon', 'model', 'prediction'];
        const isTechnical = technicalTerms.some(term => firstLine.toLowerCase().includes(term.toLowerCase()));
        
        if (!isTechnical && firstLine.length <= 150) {
          return firstLine;
        } else if (firstLine.length > 150) {
          // Берем первые 150 символов, но стараемся обрезать по предложению
          const truncated = firstLine.substring(0, 147);
          const lastPeriod = truncated.lastIndexOf('.');
          if (lastPeriod > 100) {
            return truncated.substring(0, lastPeriod + 1);
          }
          return truncated + '...';
        }
      }
    }
    
    // Генерируем простое объяснение на основе данных
    const strategyName = recommendedStrategy.name.toLowerCase();
    const potentialProfit = recommendation.targetPrice 
      ? Math.round(((recommendation.targetPrice - recommendation.priceAtAnalysis) / recommendation.priceAtAnalysis) * 100)
      : null;
    
    if (recommendation.recommendation === 'BUY') {
      let explanation = `Подходит для ${strategyName} стратегии. `;
      if (potentialProfit && potentialProfit > 0) {
        explanation += `Потенциальная прибыль до ${potentialProfit}%. `;
      }
      if (confidencePercent >= 80) {
        explanation += 'Высокая уверенность в росте цены.';
      } else if (confidencePercent >= 60) {
        explanation += 'Умеренная уверенность в росте цены.';
      } else {
        explanation += 'Есть признаки роста, но с осторожностью.';
      }
      return explanation;
    } else if (recommendation.recommendation === 'SELL') {
      let explanation = `Подходит для ${strategyName} стратегии. `;
      if (confidencePercent >= 80) {
        explanation += 'Высокая уверенность в падении цены. Рекомендуется продать.';
      } else if (confidencePercent >= 60) {
        explanation += 'Умеренная уверенность в падении цены. Рассмотрите продажу.';
      } else {
        explanation += 'Есть признаки падения, но с осторожностью.';
      }
      return explanation;
    } else {
      return `Подходит для ${strategyName} стратегии. Рекомендуется удержание позиции.`;
    }
  };

  const simpleExplanation = getSimpleExplanation();

  // Вычисляем потенциальную прибыль/убыток
  const getPotentialProfit = () => {
    if (!recommendation.targetPrice || recommendation.recommendation !== 'BUY') {
      return null;
    }
    const profitPercent = ((recommendation.targetPrice - recommendation.priceAtAnalysis) / recommendation.priceAtAnalysis) * 100;
    return {
      percent: Math.round(profitPercent),
      amount: recommendation.targetPrice - recommendation.priceAtAnalysis,
    };
  };

  const potentialProfit = getPotentialProfit();

  // Вычисляем риск (stopLoss)
  const getRisk = () => {
    if (!recommendation.stopLoss || recommendation.recommendation !== 'BUY') {
      return null;
    }
    const riskPercent = ((recommendation.priceAtAnalysis - recommendation.stopLoss) / recommendation.priceAtAnalysis) * 100;
    return {
      percent: Math.round(riskPercent),
      amount: recommendation.priceAtAnalysis - recommendation.stopLoss,
    };
  };

  const risk = getRisk();

  return (
    <Card variant="interactive" hover className="recommendation-card">
      <div className="recommendation-card-header">
        <div className="recommendation-card-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 className="recommendation-card-name">{recommendation.name}</h3>
            {isNew && (
              <Badge variant="success" size="sm">
                Новое
              </Badge>
            )}
          </div>
          <span className="recommendation-card-ticker">{recommendation.ticker}</span>
        </div>
        {recommendation.sector && (
          <Badge variant="info" size="sm">
            {recommendation.sector}
          </Badge>
        )}
      </div>

      <div className="recommendation-card-body">
        {/* Основная рекомендация */}
        <div className="recommendation-card-main-action">
          <Badge variant={getRecommendationVariant(recommendation.recommendation)} size="lg">
            {recommendation.recommendation === 'BUY' && '💰 Покупать'}
            {recommendation.recommendation === 'SELL' && '💸 Продавать'}
            {recommendation.recommendation === 'HOLD' && '⏸️ Держать'}
          </Badge>
          <div className="recommendation-card-confidence">
            <span className="recommendation-card-confidence-label">Уверенность:</span>
            <Badge variant={getConfidenceVariant(recommendation.confidence)} size="md">
              {confidencePercent}%
            </Badge>
          </div>
        </div>

        {/* Понятное объяснение */}
        <div className="recommendation-card-explanation">
          <p className="recommendation-card-explanation-text">{simpleExplanation}</p>
        </div>

        {/* Прогнозы по горизонтам */}
        {(() => {
          // Пробуем найти данные горизонтов в разных местах
          let horizons = null;
          
          // Вариант 1: explanation.details.ensemble.horizons
          if (recommendation.explanation?.details?.ensemble?.horizons) {
            horizons = recommendation.explanation.details.ensemble.horizons;
          }
          // Вариант 2: explanation.horizons
          else if (recommendation.explanation?.horizons) {
            horizons = recommendation.explanation.horizons;
          }
          // Вариант 3: analysis.horizons (если есть)
          else if ((recommendation as any).analysis?.horizons) {
            horizons = (recommendation as any).analysis.horizons;
          }
          // Вариант 4: recommendation.horizons
          else if (recommendation.horizons) {
            horizons = recommendation.horizons;
          }
          
          if (!horizons) return null;
          
          const horizonTypes = [
            { key: 'shortTerm', name: 'Краткосрочный', icon: '📅' },
            { key: 'mediumTerm', name: 'Среднесрочный', icon: '📆' },
            { key: 'longTerm', name: 'Долгосрочный', icon: '📊' }
          ];
          
          return (
            <div className="recommendation-card-horizons">
              <span className="recommendation-card-horizons-label">📈 Прогнозы по горизонтам:</span>
              <div className="recommendation-card-horizons-list">
                {horizonTypes.map(({ key, name, icon }) => {
                  const horizon = horizons[key as 'shortTerm' | 'mediumTerm' | 'longTerm'];
                  if (!horizon) return null;
                  
                  const recVariant = horizon.recommendation === 'BUY' ? 'success' : 
                                    horizon.recommendation === 'SELL' ? 'error' : 'neutral';
                  
                  return (
                    <div key={key} className="recommendation-card-horizon-item">
                      <div className="recommendation-card-horizon-item-header">
                        <span className="recommendation-card-horizon-icon">{icon}</span>
                        <span className="recommendation-card-horizon-name">{name}</span>
                        <Badge variant={recVariant} size="sm">
                          {translateRecommendation(horizon.recommendation)}
                        </Badge>
                        <span className="recommendation-card-horizon-confidence">
                          {Math.round((horizon.confidence || 0) * 100)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Предсказания по стратегиям */}
        {(() => {
          // Пробуем найти данные стратегий в разных местах
          let horizons = null;
          
          // Вариант 1: explanation.details.ensemble.horizons
          if (recommendation.explanation?.details?.ensemble?.horizons) {
            horizons = recommendation.explanation.details.ensemble.horizons;
          }
          // Вариант 2: explanation.horizons
          else if (recommendation.explanation?.horizons) {
            horizons = recommendation.explanation.horizons;
          }
          // Вариант 3: analysis.horizons (если есть)
          else if ((recommendation as any).analysis?.horizons) {
            horizons = (recommendation as any).analysis.horizons;
          }
          
          if (!horizons) return null;
          
          // Берем среднесрочный горизонт как основной (или первый доступный)
          const mainHorizon = horizons.mediumTerm || horizons.shortTerm || horizons.longTerm;
          
          if (!mainHorizon?.strategies) return null;
          
          const strategies = mainHorizon.strategies;
          const strategyTypes = [
            { key: 'conservative', name: 'Консервативная', variant: 'info' as const },
            { key: 'moderate', name: 'Умеренная', variant: 'warning' as const },
            { key: 'aggressive', name: 'Агрессивная', variant: 'error' as const }
          ];
          
          return (
            <div className="recommendation-card-strategies">
              <span className="recommendation-card-strategies-label">📊 Предсказания по стратегиям:</span>
              <div className="recommendation-card-strategies-list">
                {strategyTypes.map(({ key, name, variant }) => {
                  const strategy = strategies[key as 'conservative' | 'moderate' | 'aggressive'];
                  if (!strategy || !strategy.recommendation) return null;
                  
                  const recVariant = strategy.recommendation === 'BUY' ? 'success' : 
                                    strategy.recommendation === 'SELL' ? 'error' : 'neutral';
                  
                  const confidence = strategy.strategyConfidence ?? strategy.confidence ?? 0;
                  
                  return (
                    <div key={key} className="recommendation-card-strategy-item">
                      <div className="recommendation-card-strategy-item-header">
                        <Badge variant={variant} size="sm">
                          {name}
                        </Badge>
                        <Badge variant={recVariant} size="sm">
                          {translateRecommendation(strategy.recommendation)}
                        </Badge>
                        <span className="recommendation-card-strategy-confidence">
                          {Math.round(confidence * 100)}%
                        </span>
                      </div>
                      {strategy.explanation && (
                        <div className="recommendation-card-strategy-explanation">
                          {strategy.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
        
        {/* Рекомендуемая стратегия (fallback, если нет данных по стратегиям) */}
        {!recommendation.explanation?.details?.ensemble?.horizons && (
          <div className="recommendation-card-strategy">
            <span className="recommendation-card-strategy-label">📊 Подходит для:</span>
            <Badge 
              variant={recommendedStrategy.type === 'aggressive' ? 'error' : recommendedStrategy.type === 'moderate' ? 'warning' : 'info'} 
              size="sm"
            >
              {recommendedStrategy.name} стратегия
            </Badge>
          </div>
        )}

        {/* Цена и потенциал */}
        <div className="recommendation-card-price-section">
          <div className="recommendation-card-price">
            <span className="recommendation-card-price-label">Текущая цена:</span>
            <span className="recommendation-card-price-value">
              {formatPrice(recommendation.priceAtAnalysis)}
            </span>
          </div>

          {potentialProfit && potentialProfit.percent > 0 && (
            <div className="recommendation-card-profit">
              <span className="recommendation-card-profit-label">🎯 Потенциальная прибыль:</span>
              <span className="recommendation-card-profit-value" style={{ color: 'var(--color-accent-success)' }}>
                +{potentialProfit.percent}% ({formatPrice(potentialProfit.amount)})
              </span>
            </div>
          )}

          {risk && (
            <div className="recommendation-card-risk">
              <span className="recommendation-card-risk-label">⚠️ Стоп-лосс:</span>
              <span className="recommendation-card-risk-value" style={{ color: 'var(--color-accent-error)' }}>
                -{risk.percent}% ({formatPrice(risk.amount)})
              </span>
            </div>
          )}
        </div>

        {/* Упрощенные метрики */}
        <div className="recommendation-card-simple-metrics">
          <div className="recommendation-card-simple-metric">
            <span className="recommendation-card-simple-metric-icon">💪</span>
            <span className="recommendation-card-simple-metric-label">Сила сигнала:</span>
            <span className="recommendation-card-simple-metric-value">
              {scorePercent >= 75 ? 'Очень сильный' : scorePercent >= 60 ? 'Сильный' : scorePercent >= 50 ? 'Умеренный' : 'Слабый'}
            </span>
          </div>
        </div>

        <div className="recommendation-card-date">
          <span className="recommendation-card-date-icon">📅</span>
          <span className="recommendation-card-date-text">
            Обновлено: {formatDate(recommendation.analysisDate)}
          </span>
        </div>
      </div>

      <div className="recommendation-card-footer">
        <Button
          variant="success"
          size="md"
          fullWidth
          onClick={handleBuy}
          loading={loading}
          icon={<span>💰</span>}
        >
          Купить
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDetails}
          icon={<span>🔍</span>}
        >
          Детали
        </Button>
      </div>
    </Card>
  );
};

export default RecommendationCard;

