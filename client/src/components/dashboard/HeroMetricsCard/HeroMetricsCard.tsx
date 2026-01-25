import React, { useEffect, useRef } from 'react';
import { Card } from '../../ui/Card/Card.tsx';
import { Skeleton } from '../../ui/Skeleton/Skeleton.tsx';
import { ProgressBar } from '../../ui/ProgressBar/ProgressBar.tsx';
import { TradingStats } from '../../WebSocketDataProvider.tsx';
import './HeroMetricsCard.css';

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

// Компонент для анимированного числа
const AnimatedNumber: React.FC<{ value: string | number; className?: string; style?: React.CSSProperties }> = ({ 
  value, 
  className = '', 
  style = {} 
}) => {
  const prevValueRef = useRef<string | number>(value);
  const [isAnimating, setIsAnimating] = React.useState(false);

  useEffect(() => {
    if (prevValueRef.current !== value) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 500);
      prevValueRef.current = value;
      return () => clearTimeout(timer);
    }
  }, [value]);

  return (
    <span 
      className={`${className} ${isAnimating ? 'animate-number-update' : ''}`}
      style={style}
    >
      {value}
    </span>
  );
};

export const HeroMetricsCard: React.FC<HeroMetricsCardProps> = ({ tradingStats, sharpeRatio }) => {
  // Рассчитываем процент прибыли
  const initialCapital = tradingStats?.initialCapital || 1000000;
  const totalPnL = tradingStats?.totalPnL || 0;
  const totalPnLPercent = initialCapital > 0 ? (totalPnL / initialCapital) * 100 : 0;
  
  // Win Rate
  const winRate = tradingStats?.winRate || 0;
  
  // Sharpe Ratio оценка
  const getSharpeRating = (value: number | null | undefined) => {
    if (value === null || value === undefined || isNaN(value)) return { text: 'N/A', color: 'text-500', quality: '' };
    if (value > 1.5) return { text: 'Отлично', color: 'text-green-500', quality: 'excellent' };
    if (value > 1.0) return { text: 'Хорошо', color: 'text-yellow-500', quality: 'good' };
    return { text: 'Плохо', color: 'text-red-500', quality: 'poor' };
  };
  
  const sharpeRating = getSharpeRating(sharpeRatio);

  return (
    <Card variant="default" className="h-full hero-metrics-card hero-metric-wrapper">
      {!tradingStats ? (
        <div className="skeleton-container">
          {[1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="skeleton-col">
              <div className="skeleton-wrapper">
                <Skeleton variant="rectangular" size="lg" className="hero-metric-skeleton-large" />
                <Skeleton variant="text" size="sm" className="hero-metric-skeleton-small" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="metrics-grid">
          {/* Баланс портфеля */}
          <div className="metric-col">
            <div className="metric-col-wrapper animate-slide-up hero-metric-animate-delay-1">
              <div 
                className="hero-metric-item hero-metric-balance animated-gradient metric-item-content"
              >
                <div className="hero-metric-content">
                  <div className="text-xs mb-2 number-text-secondary">Баланс</div>
                  <div className={`number-xlarge mb-1 ${totalPnL >= 0 ? 'number-positive' : 'number-negative'}`}>
                    <AnimatedNumber 
                      value={formatCurrency(tradingStats.portfolioValue || 0)}
                    />
                  </div>
                  <div className={`text-sm font-semibold ${totalPnL >= 0 ? 'number-positive' : 'number-negative'}`}>
                    {totalPnL >= 0 ? '↑' : '↓'} <AnimatedNumber value={formatPercent(totalPnLPercent)} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Прибыль/Убыток */}
          <div className="metric-col">
            <div className={`metric-col-wrapper animate-slide-up hero-metric-animate-delay-2 ${totalPnL < 0 ? 'pnl-negative' : ''}`}>
              <div 
                className={`hero-metric-item hero-metric-pnl ${totalPnL < 0 ? 'negative' : ''} animated-gradient metric-item-content`}
              >
                <div className="hero-metric-content">
                  <div className="text-xs mb-2 number-text-secondary">PnL</div>
                  <div className={`number-xlarge mb-2 ${totalPnL >= 0 ? 'number-positive' : 'number-negative'}`}>
                    <AnimatedNumber value={formatCurrency(totalPnL)} />
                  </div>
                  <div className="hero-metric-progress-container">
                    <ProgressBar 
                      value={Math.min(Math.abs(totalPnLPercent), 100)} 
                      variant={totalPnL >= 0 ? 'success' : 'error'}
                      size="sm"
                      showLabel={false}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Win Rate */}
          <div className="metric-col">
            <div className="metric-col-wrapper animate-slide-up hero-metric-animate-delay-3">
              <div 
                className="hero-metric-item hero-metric-winrate animated-gradient metric-item-content"
              >
                <div className="hero-metric-content">
                  <div className="text-xs mb-2 number-text-secondary">Win Rate</div>
                  <div 
                    className={`number-xlarge mb-1 ${
                      winRate >= 60 ? 'number-success' : 
                      winRate >= 40 ? 'number-warning' : 
                      'number-error'
                    }`}
                  >
                    <AnimatedNumber value={`${formatNumber(winRate, 1)}%`} />
                  </div>
                  <div className="text-xs mb-2 number-text-tertiary">
                    {tradingStats.successfulTrades || 0}/{tradingStats.totalTrades || 0}
                  </div>
                  <div className="hero-metric-progress-container">
                    <ProgressBar 
                      value={winRate} 
                      variant={winRate >= 60 ? 'success' : winRate >= 40 ? 'warning' : 'error'}
                      size="sm"
                      showLabel={false}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sharpe Ratio */}
          <div className="metric-col">
            <div className="metric-col-wrapper animate-slide-up hero-metric-animate-delay-4">
              <div 
                className="hero-metric-item hero-metric-sharpe animated-gradient metric-item-content"
              >
                <div className="hero-metric-content">
                  <div className="text-xs mb-2 number-text-secondary">Sharpe</div>
                  <div 
                    className={`number-xlarge mb-1 ${
                      sharpeRatio && sharpeRatio > 1.5 ? 'number-success' : 
                      sharpeRatio && sharpeRatio > 1.0 ? 'number-warning' : 
                      'number-error'
                    }`}
                  >
                    <AnimatedNumber value={formatNumber(sharpeRatio)} />
                  </div>
                  <div 
                    className={`text-sm font-semibold ${
                      sharpeRatio && sharpeRatio > 1.5 ? 'number-success' : 
                      sharpeRatio && sharpeRatio > 1.0 ? 'number-warning' : 
                      'number-error'
                    }`}
                  >
                    {sharpeRating.text}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default HeroMetricsCard;
