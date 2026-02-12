import React from 'react';
import { Card, Button, Badge, ProgressBar } from '../ui';
import './MainRecommendationCard.css';

interface MainRecommendationCardProps {
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  score: number;
  targetPrice?: number;
  analysisDate: string;
  currency: string;
  onRefresh?: () => void;
  isLoading?: boolean;
}

const MainRecommendationCard: React.FC<MainRecommendationCardProps> = ({
  recommendation,
  confidence,
  score,
  targetPrice,
  analysisDate,
  currency,
  onRefresh,
  isLoading = false
}) => {
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

  const colorClass = getRecommendationColor(recommendation);
  const label = getRecommendationLabel(recommendation);

  return (
    <Card className={`main-recommendation-card main-recommendation-card--${colorClass}`}>
      <div className="main-recommendation-card__header">
        <h3 className="main-recommendation-card__title">Общая рекомендация</h3>
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            className="main-recommendation-card__refresh-btn"
            aria-label="Обновить анализ"
          >
            {isLoading ? '⏳' : '🔄'}
          </Button>
        )}
      </div>
      
      <div className="main-recommendation-card__content">
        <div className="main-recommendation-card__recommendation">
          <Badge 
            variant={colorClass === 'positive' ? 'success' : colorClass === 'negative' ? 'error' : 'warning'}
            className="main-recommendation-card__badge"
          >
            {label}
          </Badge>
        </div>
        
        <div className="main-recommendation-card__metrics">
          <div className="main-recommendation-card__metric">
            <div className="main-recommendation-card__metric-label">Уверенность</div>
            <div className="main-recommendation-card__metric-value">
              {confidence.toFixed(1)}%
            </div>
            <ProgressBar 
              value={confidence} 
              className={`main-recommendation-card__progress main-recommendation-card__progress--${colorClass}`}
            />
          </div>
          
          <div className="main-recommendation-card__metric">
            <div className="main-recommendation-card__metric-label">Общий балл</div>
            <div className={`main-recommendation-card__metric-value main-recommendation-card__metric-value--${colorClass}`}>
              {score > 0 ? '+' : ''}{score.toFixed(2)}
            </div>
          </div>
          
          {targetPrice && (
            <div className="main-recommendation-card__metric">
              <div className="main-recommendation-card__metric-label">Целевая цена</div>
              <div className="main-recommendation-card__metric-value">
                {targetPrice.toLocaleString('ru-RU', { 
                  minimumFractionDigits: 2, 
                  maximumFractionDigits: 2 
                })} {currency}
              </div>
            </div>
          )}
        </div>
        
        <div className="main-recommendation-card__footer">
          <div className="main-recommendation-card__date">
            Анализ от {new Date(analysisDate).toLocaleDateString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default MainRecommendationCard;

