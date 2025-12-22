import React from 'react';
import { useNavigate } from 'react-router-dom';
import { translateRecommendation } from '../../utils/recommendationTranslator';
import { Card } from 'primereact/card';
import { Skeleton } from 'primereact/skeleton';
import { Button } from 'primereact/button';
import { ProgressBar } from 'primereact/progressbar';
import { Panel } from 'primereact/panel';
import { TradingStats } from '../WebSocketDataProvider';
import { apiService } from '../../services/apiService';

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
  
  return (
    <Card title={<span><i className="pi pi-chart-line mr-2"></i>Торговая активность</span>} className="h-full">
      {!tradingStats ? (
        <div className="grid">
          {[1, 2].map((item) => (
            <div key={item} className="col-6">
              <div className="text-center p-3">
                <Skeleton width="60%" height="2rem" className="mb-2" />
                <Skeleton width="80%" height="1rem" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-column gap-2">
          {/* Активные позиции - компактный вид */}
          <div className="p-2 border-round surface-100">
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
              label="Портфель"
              icon="pi pi-arrow-right"
              className="p-button-text p-button-sm w-full mt-2"
              onClick={() => navigate('/portfolio')}
            />
          </div>

          {/* Топ-3 рекомендаций - компактный вид с сворачиваемой панелью */}
          <Panel header="Топ рекомендации" toggleable collapsed={false} className="text-xs">
            {!tradingStats.recommendations || tradingStats.recommendations.length === 0 ? (
              <div className="text-500 text-xs text-center py-2">Нет рекомендаций</div>
            ) : (
              <div className="flex flex-column gap-1">
                {tradingStats.recommendations.slice(0, 3).map((rec) => {
                  const strategyNames: { [key: string]: string } = {
                    aggressive: 'Агр.',
                    moderate: 'Умер.',
                    conservative: 'Конс.'
                  };
                  const strategyName = rec.strategyType ? strategyNames[rec.strategyType] || rec.strategyType : '';
                  const confidencePercent = (rec.confidence * 100).toFixed(0);
                  
                  return (
                    <div
                      key={rec.figi}
                      className="p-2 border-round surface-0 border-1 border-200 hover:border-primary transition-colors cursor-pointer"
                      onClick={() => navigate(`/stock/${rec.figi}`)}
                    >
                      <div className="flex align-items-center justify-content-between mb-1">
                        <div className="flex-1">
                          <div className="font-medium text-xs">
                            {rec.ticker}
                          </div>
                          {strategyName && (
                            <div className="text-xs text-primary font-semibold">
                              {strategyName}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-green-500 font-semibold text-xs">
                            {translateRecommendation(rec.recommendation)}
                          </div>
                          <div className="text-xs text-500">{confidencePercent}%</div>
                        </div>
                      </div>
                      <ProgressBar 
                        value={rec.confidence * 100} 
                        showValue={false}
                        color={rec.confidence >= 0.7 ? '#22c55e' : rec.confidence >= 0.5 ? '#eab308' : '#ef4444'}
                        style={{ height: '4px' }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Кнопка запуска анализа */}
          <Button
            icon="pi pi-chart-line"
            label="Анализ рынка"
            className="p-button-sm w-full"
            onClick={handleMarketAnalysis}
          />
        </div>
      )}
    </Card>
  );
};

export default TradingSummaryCard;

