import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Badge, ProgressBar } from '../ui';
import { WeeklyForecastChart } from '../weekly-forecast/WeeklyForecastChart';
import { WeeklyForecastCandle } from '../../services/weeklyForecastApi';
import './WeeklyForecastRecommendationCard.css';

interface WeeklyForecastRecommendationCardProps {
  forecastPrice?: number;
  priceChange?: number;
  priceChangePercent?: number;
  trend?: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  confidenceScore?: number;
  volatility?: number;
  currency: string;
  figi: string;
  ticker: string;
  forecastData?: WeeklyForecastCandle[]; // Данные для мини-графика
  onGenerate?: () => void; // Callback для генерации прогноза
  isGenerating?: boolean; // Флаг загрузки генерации
}

const WeeklyForecastRecommendationCard: React.FC<WeeklyForecastRecommendationCardProps> = ({
  forecastPrice,
  priceChange,
  priceChangePercent,
  trend,
  confidenceScore,
  volatility,
  currency,
  figi,
  // ticker,
  forecastData,
  onGenerate,
  isGenerating = false
}) => {
  const navigate = useNavigate();
  const isPositive = (priceChangePercent ?? 0) >= 0;

  const getTrendLabel = (t?: string) => {
    switch (t) {
      case 'BULLISH':
        return 'Бычий';
      case 'BEARISH':
        return 'Медвежий';
      case 'SIDEWAYS':
        return 'Боковой';
      default:
        return 'Не определен';
    }
  };

  const getTrendColor = (t?: string) => {
    switch (t) {
      case 'BULLISH':
        return 'positive';
      case 'BEARISH':
        return 'negative';
      case 'SIDEWAYS':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  const trendColor = getTrendColor(trend);
  const trendLabel = getTrendLabel(trend);

  const handleViewDetails = () => {
    navigate(`/weekly-forecast/${figi}`);
  };

  return (
    <Card variant="default" className="weekly-forecast-recommendation-card">
      <div className="weekly-forecast-recommendation-card__header">
        <h3 className="weekly-forecast-recommendation-card__title">
          <span className="weekly-forecast-recommendation-card__icon">📈</span>
          Weekly Forecast (7 дней)
        </h3>
        {onGenerate && (
          <Button
            variant="primary"
            size="sm"
            onClick={onGenerate}
            disabled={isGenerating}
            className="weekly-forecast-recommendation-card__generate-btn"
          >
            {isGenerating ? '⏳ Генерация...' : '🔄 Сгенерировать прогноз'}
          </Button>
        )}
      </div>
      
      <div className="weekly-forecast-recommendation-card__content">
        {forecastPrice ? (
          <>
            <div className="weekly-forecast-recommendation-card__price-group">
              <div className="weekly-forecast-recommendation-card__price-label">Ожидаемая цена:</div>
              <div className="weekly-forecast-recommendation-card__price">
                {(() => {
                  const value = typeof forecastPrice === 'number' ? forecastPrice : parseFloat(String(forecastPrice || 0));
                  return (!isNaN(value) ? value : 0).toLocaleString('ru-RU', { 
                    minimumFractionDigits: 2, 
                    maximumFractionDigits: 2 
                  });
                })()} {currency}
              </div>
              {(priceChange !== undefined || priceChangePercent !== undefined) && (
                <div className={`weekly-forecast-recommendation-card__change ${isPositive ? 'positive' : 'negative'}`}>
                  {priceChange !== undefined && (
                    <span>
                      {isPositive ? '+' : ''}{(() => {
                        const value = typeof priceChange === 'number' ? priceChange : parseFloat(String(priceChange || 0));
                        return (!isNaN(value) ? value : 0).toLocaleString('ru-RU', { 
                          minimumFractionDigits: 2, 
                          maximumFractionDigits: 2 
                        });
                      })()} {currency}
                    </span>
                  )}
                  {priceChangePercent !== undefined && (
                    <span>
                      ({isPositive ? '+' : ''}{(() => {
                        const value = typeof priceChangePercent === 'number' ? priceChangePercent : parseFloat(String(priceChangePercent || 0));
                        return (!isNaN(value) ? value : 0).toFixed(2);
                      })()}%)
                    </span>
                  )}
                </div>
              )}
            </div>
            
            {trend && (
              <div className="weekly-forecast-recommendation-card__trend">
                <div className="weekly-forecast-recommendation-card__trend-label">Тренд:</div>
                <Badge 
                  variant={trendColor === 'positive' ? 'success' : trendColor === 'negative' ? 'error' : 'warning'}
                  className="weekly-forecast-recommendation-card__trend-badge"
                >
                  {trendLabel}
                </Badge>
              </div>
            )}
            
            {confidenceScore !== undefined && (
              <div className="weekly-forecast-recommendation-card__confidence">
                <div className="weekly-forecast-recommendation-card__confidence-label">
                  Уверенность: {(() => {
                    const value = typeof confidenceScore === 'number' ? confidenceScore : parseFloat(String(confidenceScore || 0));
                    return (!isNaN(value) ? value : 0).toFixed(1);
                  })()}%
                </div>
                <ProgressBar 
                  value={confidenceScore} 
                  className="weekly-forecast-recommendation-card__confidence-progress"
                />
              </div>
            )}
            
            {volatility !== undefined && (
              <div className="weekly-forecast-recommendation-card__volatility">
                <div className="weekly-forecast-recommendation-card__volatility-label">Волатильность:</div>
                <div className="weekly-forecast-recommendation-card__volatility-value">
                  {(() => {
                    const value = typeof volatility === 'number' ? volatility : parseFloat(String(volatility || 0));
                    return (!isNaN(value) ? value : 0).toFixed(2);
                  })()}%
                </div>
              </div>
            )}
            
            {/* Мини-график прогноза */}
            {forecastData && forecastData.length > 0 && (
              <div className="weekly-forecast-recommendation-card__chart">
                <WeeklyForecastChart
                  forecastData={forecastData}
                  currency={currency}
                  height={250}
                  className="weekly-forecast-recommendation-card__chart-inner"
                />
              </div>
            )}
          </>
        ) : (
          <div className="weekly-forecast-recommendation-card__no-data">
            Прогноз недоступен
          </div>
        )}
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleViewDetails}
          className="weekly-forecast-recommendation-card__details-btn"
        >
          Подробнее →
        </Button>
      </div>
    </Card>
  );
};

export default WeeklyForecastRecommendationCard;

