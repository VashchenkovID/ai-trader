import React from 'react';
import { useNavigate } from 'react-router-dom';
import { translateRecommendation } from '../../utils/recommendationTranslator';
import { Card } from '../ui/Card/Card';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { Button } from '../ui/Button/Button';
import { ProgressBar } from '../ui/ProgressBar/ProgressBar';
import { TradingStats } from '../WebSocketDataProvider';
import { apiService } from '../../services/apiService';
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
        <div className="grid">
          {[1, 2].map((item) => (
            <div key={item} className="col-6">
              <div className="text-center p-3">
                <Skeleton variant="rectangular" size="md" className="mb-2" style={{ width: '60%', height: '2rem', margin: '0 auto' }} />
                <Skeleton variant="text" size="sm" style={{ width: '80%', margin: '0 auto' }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-column gap-2">
          {/* Активные позиции - компактный вид */}
          <div className="p-2 border-round" style={{ background: 'var(--color-surface-hover)', border: '1px solid var(--color-border-default)' }}>
            <div className="text-600 text-xs mb-1">Активные позиции</div>
            <div className="grid">
              <div className="col-6">
                <div className="text-xs text-500">Количество</div>
                <div className="text-lg font-bold">
                  {tradingStats.recommendations?.length || 0}
                </div>
              </div>
              <div className="col-6">
                <div className="text-xs text-500">Стоимость</div>
                <div className="text-lg font-bold">
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
              className="mt-2"
            >
              Портфель
            </Button>
          </div>

          {/* Топ-3 рекомендаций */}
          <div>
            <div className="text-xs font-semibold mb-2 number-text-secondary">Топ рекомендации</div>
            {!tradingStats.recommendations || tradingStats.recommendations.length === 0 ? (
              <div className="text-500 text-xs text-center py-2">Нет рекомендаций</div>
            ) : (
              <div className="flex flex-column gap-1">
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
                      <div className="flex align-items-center justify-content-between mb-1">
                        <div className="flex-1">
                          <div className="font-medium text-xs">
                            {rec.ticker}
                          </div>
                          {strategyName && (
                            <div className="text-xs font-semibold number-primary">
                              {strategyName}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-xs number-success">
                            {translateRecommendation(rec.recommendation)}
                          </div>
                          <div className="text-xs text-500">{confidencePercent}%</div>
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

