import React from 'react';
import { Card } from 'primereact/card';
import { Skeleton } from 'primereact/skeleton';
import { ProgressBar } from 'primereact/progressbar';
import { TradingStats } from '../WebSocketDataProvider';

interface HeroMetricsCardProps {
  tradingStats: TradingStats | null;
  sharpeRatio?: number | null;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(
    value || 0
  );

const formatPercent = (value: number, decimals: number = 2) => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
};

const formatNumber = (value: number | null | undefined, decimals: number = 2) => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return value.toFixed(decimals);
};

export const HeroMetricsCard: React.FC<HeroMetricsCardProps> = ({ tradingStats, sharpeRatio }) => {
  // Рассчитываем процент прибыли
  const initialCapital = tradingStats?.initialCapital || 1000000;
  const totalPnL = tradingStats?.totalPnL || 0;
  const totalPnLPercent = initialCapital > 0 ? (totalPnL / initialCapital) * 100 : 0;
  
  // Win Rate
  const winRate = tradingStats?.winRate || 0;
  const winRateColor = winRate >= 60 ? 'text-green-500' : winRate >= 40 ? 'text-yellow-500' : 'text-red-500';
  
  // Sharpe Ratio оценка
  const getSharpeRating = (value: number | null | undefined) => {
    if (value === null || value === undefined || isNaN(value)) return { text: 'N/A', color: 'text-500', quality: '' };
    if (value > 1.5) return { text: 'Отлично', color: 'text-green-500', quality: 'excellent' };
    if (value > 1.0) return { text: 'Хорошо', color: 'text-yellow-500', quality: 'good' };
    return { text: 'Плохо', color: 'text-red-500', quality: 'poor' };
  };
  
  const sharpeRating = getSharpeRating(sharpeRatio);

  return (
    <Card className="h-full">
      {!tradingStats ? (
        <div className="grid">
          {[1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="col-12 md:col-6 lg:col">
              <div className="text-center p-3">
                <Skeleton width="60%" height="2rem" className="mb-2" />
                <Skeleton width="80%" height="1rem" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid">
          {/* Баланс портфеля */}
          <div className="col-12 md:col-6 lg:col">
            <div className="text-center p-2 border-round surface-100 h-full flex flex-column align-items-center justify-content-center">
              <div className="text-600 text-xs mb-1">Баланс</div>
              <div className={`text-2xl font-bold mb-1 ${totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatCurrency(tradingStats.portfolioValue || 0)}
              </div>
              <div className={`text-xs font-semibold ${totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {totalPnL >= 0 ? '↑' : '↓'} {formatPercent(totalPnLPercent)}
              </div>
            </div>
          </div>

          {/* Прибыль/Убыток */}
          <div className="col-12 md:col-6 lg:col">
            <div className="text-center p-2 border-round surface-100 h-full flex flex-column align-items-center justify-content-center">
              <div className="text-600 text-xs mb-1">PnL</div>
              <div className={`text-2xl font-bold mb-1 ${totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatCurrency(totalPnL)}
              </div>
              <div className="w-full">
                <ProgressBar 
                  value={Math.min(Math.abs(totalPnLPercent), 100)} 
                  showValue={false}
                  color={totalPnL >= 0 ? '#22c55e' : '#ef4444'}
                  style={{ height: '4px' }}
                />
              </div>
            </div>
          </div>

          {/* Win Rate */}
          <div className="col-12 md:col-6 lg:col">
            <div className="text-center p-2 border-round surface-100 h-full flex flex-column align-items-center justify-content-center">
              <div className="text-600 text-xs mb-1">Win Rate</div>
              <div className={`text-2xl font-bold mb-1 ${winRateColor}`}>
                {formatNumber(winRate, 1)}%
              </div>
              <div className="text-xs text-500 mb-1">
                {tradingStats.successfulTrades || 0}/{tradingStats.totalTrades || 0}
              </div>
              <div className="w-full">
                <ProgressBar 
                  value={winRate} 
                  showValue={false}
                  color={winRate >= 60 ? '#22c55e' : winRate >= 40 ? '#eab308' : '#ef4444'}
                  style={{ height: '4px' }}
                />
              </div>
            </div>
          </div>

          {/* Sharpe Ratio */}
          <div className="col-12 md:col-6 lg:col">
            <div className="text-center p-2 border-round surface-100 h-full flex flex-column align-items-center justify-content-center">
              <div className="text-600 text-xs mb-1">Sharpe</div>
              <div className={`text-2xl font-bold mb-1 ${sharpeRating.color}`}>
                {formatNumber(sharpeRatio)}
              </div>
              <div className={`text-xs font-semibold ${sharpeRating.color}`}>
                {sharpeRating.text}
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default HeroMetricsCard;
