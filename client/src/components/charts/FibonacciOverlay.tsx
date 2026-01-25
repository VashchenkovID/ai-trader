import React, { useMemo } from 'react';
import { Card } from '../ui/Card/Card';
import './FibonacciOverlay.css';

export interface FibonacciData {
  levels: Array<{
    level: number;
    price: number;
    percentage: number;
  }>;
  currentLevel: number | null;
  support: number | null;
  resistance: number | null;
  high: number;
  low: number;
}

interface FibonacciOverlayProps {
  data: FibonacciData | null;
  currentPrice: number;
  className?: string;
}

const FIBONACCI_LEVELS = [
  { percentage: 0, label: '0%' },
  { percentage: 23.6, label: '23.6%' },
  { percentage: 38.2, label: '38.2%' },
  { percentage: 50, label: '50%' },
  { percentage: 61.8, label: '61.8%' },
  { percentage: 78.6, label: '78.6%' },
  { percentage: 100, label: '100%' },
];

export const FibonacciOverlay: React.FC<FibonacciOverlayProps> = ({
  data,
  currentPrice,
  className = ''
}) => {
  const currentLevelInfo = useMemo(() => {
    if (!data || data.currentLevel === null) return null;

    const level = data.levels.find(l => l.level === data.currentLevel);
    return level;
  }, [data]);

  if (!data || data.levels.length === 0) {
    return null;
  }

  const range = data.high - data.low;

  return (
    <div className={`fibonacci-overlay ${className}`}>
      <div className="fibonacci-info">
        <div className="fibonacci-range">
          <span className="range-label">Диапазон:</span>
          <span className="range-value">Высокий: {data.high.toFixed(2)}</span>
          <span className="range-value">Низкий: {data.low.toFixed(2)}</span>
        </div>
        {currentLevelInfo && (
          <div className="fibonacci-current">
            <span className="current-label">Текущий уровень:</span>
            <span className="current-value">{currentLevelInfo.label} ({currentLevelInfo.price.toFixed(2)})</span>
          </div>
        )}
        {data.support && (
          <div className="fibonacci-support">
            <span className="support-label">Поддержка:</span>
            <span className="support-value">{data.support.toFixed(2)}</span>
          </div>
        )}
        {data.resistance && (
          <div className="fibonacci-resistance">
            <span className="resistance-label">Сопротивление:</span>
            <span className="resistance-value">{data.resistance.toFixed(2)}</span>
          </div>
        )}
      </div>

      <div className="fibonacci-levels">
        {data.levels.map((level, index) => {
          const isCurrent = level.level === data.currentLevel;
          const isSupport = level.price === data.support;
          const isResistance = level.price === data.resistance;
          
          return (
            <div
              key={index}
              className={`fibonacci-level ${
                isCurrent ? 'fibonacci-level-current' : ''
              } ${
                isSupport ? 'fibonacci-level-support' : ''
              } ${
                isResistance ? 'fibonacci-level-resistance' : ''
              }`}
            >
              <div className="level-line" />
              <div className="level-label">
                <span className="level-percentage">{level.label}</span>
                <span className="level-price">{level.price.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FibonacciOverlay;

