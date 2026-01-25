import React from 'react';
import { Badge } from '../ui/Badge/Badge';
import './IndicatorLegend.css';

export interface IndicatorInfo {
  name: string;
  value: string | number;
  color: string;
  signal?: 'buy' | 'sell' | 'hold' | 'neutral';
  description?: string;
}

interface IndicatorLegendProps {
  indicators: IndicatorInfo[];
  className?: string;
}

export const IndicatorLegend: React.FC<IndicatorLegendProps> = ({
  indicators,
  className = ''
}) => {
  if (!indicators || indicators.length === 0) {
    return null;
  }

  const getSignalBadge = (signal?: string) => {
    if (!signal) return null;

    const variants: Record<string, 'success' | 'error' | 'warning' | 'info'> = {
      buy: 'success',
      sell: 'error',
      hold: 'warning',
      neutral: 'info',
    };

    const labels: Record<string, string> = {
      buy: 'Покупка',
      sell: 'Продажа',
      hold: 'Удержание',
      neutral: 'Нейтрально',
    };

    return (
      <Badge variant={variants[signal] || 'info'} size="sm">
        {labels[signal] || signal}
      </Badge>
    );
  };

  return (
    <div className={`indicator-legend ${className}`}>
      <h4 className="legend-title">Индикаторы</h4>
      <div className="legend-items">
        {indicators.map((indicator, index) => (
          <div key={index} className="legend-item">
            <div className="legend-color" style={{ backgroundColor: indicator.color }} />
            <div className="legend-content">
              <div className="legend-name-row">
                <span className="legend-name">{indicator.name}</span>
                {indicator.signal && getSignalBadge(indicator.signal)}
              </div>
              <div className="legend-value-row">
                <span className="legend-value">{indicator.value}</span>
                {indicator.description && (
                  <span className="legend-description">{indicator.description}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default IndicatorLegend;

