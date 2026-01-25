import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card/Card';
import { Badge } from '../ui/Badge/Badge';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { apiService } from '../../services/apiService';
import './MarketRegimeIndicator.css';

export type MarketRegime = 'trend' | 'flat' | 'volatile' | 'normal';

interface MarketRegimeData {
  regime: MarketRegime;
  confidence: number;
  volatility: number;
  trendStrength: number;
  trendDirection: 'up' | 'down' | 'none';
  indicators: {
    rsi?: number;
    macd?: number;
    bb_position?: number;
    atr?: number;
  };
  thresholds: {
    buyScore: number;
    buyConfidence: number;
    sellScore: number;
    sellConfidence: number;
  };
  strategies: {
    preferredStrategies: string[];
    avoidStrategies: string[];
    positionSizeMultiplier: number;
    stopLossMultiplier: number;
  };
  timestamp: string;
}

interface MarketRegimeIndicatorProps {
  figi: string;
  className?: string;
  showDetails?: boolean;
}

const REGIME_LABELS: Record<MarketRegime, string> = {
  trend: 'Тренд',
  flat: 'Флэт',
  volatile: 'Волатильность',
  normal: 'Нормальный',
};

const REGIME_COLORS: Record<MarketRegime, string> = {
  trend: 'var(--color-accent-success)',
  flat: 'var(--color-text-secondary)',
  volatile: 'var(--color-accent-error)',
  normal: 'var(--color-accent-primary)',
};

const REGIME_ICONS: Record<MarketRegime, string> = {
  trend: '📈',
  flat: '➡️',
  volatile: '⚡',
  normal: '📊',
};

export const MarketRegimeIndicator: React.FC<MarketRegimeIndicatorProps> = ({
  figi,
  className = '',
  showDetails = false
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regimeData, setRegimeData] = useState<MarketRegimeData | null>(null);

  useEffect(() => {
    if (figi) {
      loadRegimeData();
    }
  }, [figi]);

  const loadRegimeData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Используем существующий API или создаем новый endpoint
      const response = await fetch(
        `${(window as any).env?.REACT_APP_API_URL || 'http://localhost:3001'}/api/market-regime/${figi}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch market regime');
      }
      
      const result = await response.json();
      setRegimeData(result.data || result);
    } catch (err: any) {
      console.error('Error loading market regime:', err);
      setError(err.message || 'Ошибка загрузки режима');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card variant="glass" className={`market-regime-indicator ${className}`}>
        <Skeleton width="100%" height={showDetails ? 200 : 60} />
      </Card>
    );
  }

  if (error || !regimeData) {
    return (
      <Card variant="glass" className={`market-regime-indicator ${className}`}>
        <div className="error-message">
          <p>{error || 'Данные недоступны'}</p>
        </div>
      </Card>
    );
  }

  const regimeColor = REGIME_COLORS[regimeData.regime];
  const regimeLabel = REGIME_LABELS[regimeData.regime];
  const regimeIcon = REGIME_ICONS[regimeData.regime];

  return (
    <Card 
      variant="glass" 
      className={`market-regime-indicator ${className}`}
      style={{
        borderLeft: `4px solid ${regimeColor}`
      }}
    >
      <div className="regime-header">
        <div className="regime-main">
          <span className="regime-icon">{regimeIcon}</span>
          <div className="regime-info">
            <h3 className="regime-title">Рыночный режим</h3>
            <div className="regime-badge-container">
              <Badge 
                variant={regimeData.regime === 'trend' ? 'success' : 
                        regimeData.regime === 'volatile' ? 'error' : 
                        regimeData.regime === 'flat' ? 'warning' : 'info'}
                size="lg"
              >
                {regimeLabel}
              </Badge>
              <span className="regime-confidence">
                Уверенность: {(regimeData.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
        {regimeData.trendDirection !== 'none' && (
          <div className="trend-direction">
            <span className={`trend-arrow ${regimeData.trendDirection === 'up' ? 'trend-up' : 'trend-down'}`}>
              {regimeData.trendDirection === 'up' ? '↑' : '↓'}
            </span>
            <span className="trend-label">
              {regimeData.trendDirection === 'up' ? 'Восходящий' : 'Нисходящий'}
            </span>
          </div>
        )}
      </div>

      {showDetails && (
        <div className="regime-details">
          <div className="details-grid">
            <div className="detail-item">
              <span className="detail-label">Волатильность</span>
              <span className="detail-value">
                {(regimeData.volatility * 100).toFixed(2)}%
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Сила тренда</span>
              <span className="detail-value">
                {(regimeData.trendStrength * 100).toFixed(2)}%
              </span>
            </div>
          </div>

          <div className="thresholds-section">
            <h4 className="section-title">Адаптивные пороги</h4>
            <div className="thresholds-grid">
              <div className="threshold-item">
                <span className="threshold-label">Покупка (Score)</span>
                <span className="threshold-value">
                  {(regimeData.thresholds.buyScore * 100).toFixed(0)}%
                </span>
              </div>
              <div className="threshold-item">
                <span className="threshold-label">Покупка (Confidence)</span>
                <span className="threshold-value">
                  {(regimeData.thresholds.buyConfidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="threshold-item">
                <span className="threshold-label">Продажа (Score)</span>
                <span className="threshold-value">
                  {(regimeData.thresholds.sellScore * 100).toFixed(0)}%
                </span>
              </div>
              <div className="threshold-item">
                <span className="threshold-label">Продажа (Confidence)</span>
                <span className="threshold-value">
                  {(regimeData.thresholds.sellConfidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          <div className="strategies-section">
            <h4 className="section-title">Рекомендуемые стратегии</h4>
            <div className="strategies-list">
              <div className="strategies-preferred">
                <span className="strategies-label">Предпочтительные:</span>
                <div className="strategies-tags">
                  {regimeData.strategies.preferredStrategies.map((strategy, index) => (
                    <Badge key={index} variant="success" size="sm">
                      {strategy}
                    </Badge>
                  ))}
                </div>
              </div>
              {regimeData.strategies.avoidStrategies.length > 0 && (
                <div className="strategies-avoid">
                  <span className="strategies-label">Избегать:</span>
                  <div className="strategies-tags">
                    {regimeData.strategies.avoidStrategies.map((strategy, index) => (
                      <Badge key={index} variant="error" size="sm">
                        {strategy}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="strategies-multipliers">
              <span className="multiplier-item">
                Размер позиции: x{regimeData.strategies.positionSizeMultiplier.toFixed(2)}
              </span>
              <span className="multiplier-item">
                Стоп-лосс: x{regimeData.strategies.stopLossMultiplier.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default MarketRegimeIndicator;

