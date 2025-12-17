import React from 'react';
import { useNavigate } from 'react-router-dom';
import { translateRecommendation } from '../../utils/recommendationTranslator';
import { Card } from 'primereact/card';
import { Skeleton } from 'primereact/skeleton';
import { Button } from 'primereact/button';
import { TradingStats } from '../WebSocketDataProvider';

interface TradingSummaryCardProps {
  tradingStats: TradingStats | null;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(
    value || 0
  );

export const TradingSummaryCard: React.FC<TradingSummaryCardProps> = ({ tradingStats }) => {
  const navigate = useNavigate();
  
  return (
    <Card title="📈 Торговая сводка" className="h-full">
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
        <div className="grid">
          {/* Баланс и PnL */}
          <div className="col-12 md:col-6">
            <div className="text-center p-3 border-round surface-100 h-full flex flex-column align-items-center justify-content-center">
              <div className="text-600 text-sm mb-1">Баланс портфеля</div>
              <div className="text-2xl font-bold mb-1">
                {formatCurrency(tradingStats.portfolioValue || 0)}
              </div>
              <div className="text-sm text-600 mb-2">
                Свободные средства: {formatCurrency(tradingStats.cash || 0)}
              </div>
              <div
                className={`text-sm font-semibold ${
                  (tradingStats.totalPnL || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                }`}
              >
                Прибыль по сделкам: {tradingStats.totalPnL >= 0 ? '+' : ''}
                {formatCurrency(tradingStats.totalPnL || 0)}
                {(() => {
                  // Рассчитываем процент прибыли
                  const initialCapital = tradingStats.initialCapital || 1000000;
                  const totalPnL = tradingStats.totalPnL || 0;
                  const totalPnLPercent = initialCapital > 0 ? (totalPnL / initialCapital) * 100 : 0;
                  
                  if (totalPnLPercent !== 0) {
                    return (
                      <span className="ml-2">
                        ({totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%)
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          </div>

          {/* Топ-3 рекомендаций */}
          <div className="col-12 md:col-6">
            <div className="p-3 border-round surface-100 h-full">
              <div className="text-600 mb-2">Топ-3 рекомендации (BUY)</div>
              {!tradingStats.recommendations || tradingStats.recommendations.length === 0 ? (
                <div className="text-500 text-sm text-center">Нет активных рекомендаций</div>
              ) : (
                <div className="flex flex-column gap-2">
                  {tradingStats.recommendations.slice(0, 3).map((rec) => {
                    const strategyNames: { [key: string]: string } = {
                      aggressive: 'Агрессивная',
                      moderate: 'Умеренная',
                      conservative: 'Консервативная'
                    };
                    const strategyName = rec.strategyType ? strategyNames[rec.strategyType] || rec.strategyType : '';
                    
                    return (
                      <div
                        key={rec.figi}
                        className="flex align-items-center justify-content-between text-sm border-round surface-0 px-2 py-1"
                      >
                        <div 
                          className="cursor-pointer hover:text-primary transition-colors flex-1"
                          onClick={() => navigate(`/stock/${rec.figi}`)}
                          title="Нажмите для просмотра детальной информации"
                        >
                          <div className="font-medium">
                            {rec.ticker} <span className="text-500">• {rec.name}</span>
                          </div>
                          <div className="text-xs text-500">
                            {strategyName && <span className="text-primary font-semibold">{strategyName}</span>}
                            {strategyName && ' • '}
                            FIGI: {rec.figi}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-green-500 font-semibold text-xs">{translateRecommendation('BUY')}</div>
                          <div className="text-500 text-xs">
                            conf: {(rec.confidence * 100).toFixed(0)}% / score: {rec.score.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Кнопка запуска анализа */}
          <div className="col-12">
            <div className="flex justify-content-end mt-2">
              <Button
                icon="pi pi-chart-line"
                label="Запустить анализ рынка"
                size="small"
                className="p-button-text"
                onClick={async () => {
                  try {
                    // Сначала активируем нейросеть, если она была выключена
                    await fetch('/api/neural-network/activate', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                    });

                    const response = await fetch('/api/system/market-analysis', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                    });
                    const result = await response.json();
                    // eslint-disable-next-line no-alert
                    alert(result?.message || 'Анализ запущен');
                  } catch (e) {
                    console.error('Ошибка запуска анализа рынка:', e);
                    // eslint-disable-next-line no-alert
                    alert('Ошибка запуска анализа рынка');
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default TradingSummaryCard;

