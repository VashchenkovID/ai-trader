import React from 'react';
import { useNavigate } from 'react-router-dom';
import { translateRecommendation } from '../../../utils/recommendationTranslator.ts';
import { Card } from '../../ui/Card/Card.tsx';
import { Skeleton } from '../../ui/Skeleton/Skeleton.tsx';
import { Button } from '../../ui/Button/Button.tsx';
import { ProgressBar } from '../../ui/ProgressBar/ProgressBar.tsx';
import { TradingStats } from '../../WebSocketDataProvider.tsx';
import { apiService } from '../../../services/apiService.ts';
import './TradingSummaryCard.css';

interface TradingSummaryCardProps {
  tradingStats: TradingStats | null;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(
    value || 0
  );

export const TradingSummaryCard: React.FC<TradingSummaryCardProps> = ({ tradingStats }) => {
  const navigate = useNavigate();
  
  const handleMarketAnalysis = async () => {
    try {
      // Сначала активируем нейросеть, если она была выключена
      await apiService.activateNeuralNetwork();

      const response = await apiService.startMarketAnalysis();
      // eslint-disable-next-line no-alert
      alert(response?.message || 'Анализ запущен');
    } catch (e: any) {
      console.error('Ошибка запуска анализа рынка:', e);
      // eslint-disable-next-line no-alert
      alert('Ошибка запуска анализа рынка: ' + (e.message || 'Неизвестная ошибка'));
    }
  };
  
  // Определяем variant для ProgressBar на основе confidence
  const getProgressVariant = (confidence: number): 'success' | 'warning' | 'error' => {
    if (confidence >= 0.7) return 'success';
    if (confidence >= 0.5) return 'warning';
    return 'error';
  };

  return (
    <Card 
      variant="glass" 
      header={<span>Торговая активность</span>} 
      className="h-full animate-slide-up trading-summary-card"
      style={{ animationDelay: '0.2s', animationFillMode: 'both' }}
    >
      {!tradingStats ? (
        <div className="skeleton-grid">
          {[1, 2].map((item) => (
            <div key={item} className="skeleton-col">
              <div className="skeleton-wrapper">
                <Skeleton variant="rectangular" size="md" className="skeleton-primary" />
                <Skeleton variant="text" size="sm" className="skeleton-secondary" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="content-wrapper">
          {/* Активные позиции - компактный вид */}
          <div className="positions-block">
            <div className="positions-label">Активные позиции</div>
            <div className="positions-grid">
              <div className="positions-col">
                <div className="positions-label-small">Количество</div>
                <div className="positions-value">
                  {tradingStats.recommendations?.length || 0}
                </div>
              </div>
              <div className="positions-col">
                <div className="positions-label-small">Стоимость</div>
                <div className="positions-value">
                  {formatCurrency((tradingStats.portfolioValue || 0) - (tradingStats.cash || 0))}
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              icon={<i className="pi pi-arrow-right"></i>}
              iconPosition="right"
              onClick={() => navigate('/portfolio')}
              style={{ marginTop: 'var(--spacing-2)' }}
            >
              Портфель
            </Button>
          </div>

          {/* Топ-3 рекомендаций */}
          <div className="recommendations-section">
            <div className="recommendations-label">Топ рекомендации</div>
            {!tradingStats.recommendations || tradingStats.recommendations.length === 0 ? (
              <div className="recommendations-empty">Нет рекомендаций</div>
            ) : (
              <div className="recommendations-list">
                {tradingStats.recommendations.slice(0, 3).map((rec, index) => {
                  const strategyNames: { [key: string]: string } = {
                    aggressive: 'Агр.',
                    moderate: 'Умер.',
                    conservative: 'Конс.'
                  };
                  const strategyName = rec.strategyType ? strategyNames[rec.strategyType] || rec.strategyType : '';
                  const confidencePercent = (rec.confidence * 100).toFixed(0);
                  
                  const isBuy = rec.recommendation === 'BUY';
                  return (
                    <div
                      key={rec.figi}
                      className={`recommendation-item ${isBuy ? 'buy' : 'sell'} animate-fade-in`}
                      style={{ 
                        animationDelay: `${index * 0.1}s`,
                        animationFillMode: 'both'
                      }}
                      onClick={() => navigate(`/stock/${rec.figi}`)}
                    >
                      <div className="item-header">
                        <div className="item-left">
                          <div className="item-ticker">
                            {rec.ticker}
                          </div>
                          {strategyName && (
                            <div className="item-strategy">
                              {strategyName}
                            </div>
                          )}
                        </div>
                        <div className="item-right">
                          <div className="item-action">
                            {translateRecommendation(rec.recommendation)}
                          </div>
                          <div className="item-confidence">{confidencePercent}%</div>
                        </div>
                      </div>
                      <ProgressBar 
                        value={rec.confidence * 100} 
                        variant={getProgressVariant(rec.confidence)}
                        size="sm"
                        showLabel={false}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Кнопка запуска анализа */}
          <Button
            variant="primary"
            size="sm"
            fullWidth
            icon={<i className="pi pi-chart-line"></i>}
            onClick={handleMarketAnalysis}
          >
            Анализ рынка
          </Button>
        </div>
      )}
    </Card>
  );
};

export default TradingSummaryCard;

