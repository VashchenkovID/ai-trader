import React from 'react';
import { Card } from '../ui/Card/Card';
import { Badge } from '../ui/Badge/Badge';
import './TimeframeSummary.css';

export type Timeframe = 'H1' | 'D1' | 'W1';

interface TimeframeSignal {
  timeframe: Timeframe;
  signal: 'buy' | 'sell' | 'hold';
  confidence: number;
}

interface TimeframeSummaryProps {
  signals: TimeframeSignal[];
  overallSignal: 'buy' | 'sell' | 'hold';
  consistency: number;
  weightedSignal: number;
  className?: string;
}

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  H1: 'Час',
  D1: 'День',
  W1: 'Неделя',
};

const TIMEFRAME_WEIGHTS: Record<Timeframe, number> = {
  H1: 0.2,
  D1: 0.3,
  W1: 0.5,
};

export const TimeframeSummary: React.FC<TimeframeSummaryProps> = ({
  signals,
  overallSignal,
  consistency,
  weightedSignal,
  className = ''
}) => {
  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'buy':
        return 'var(--color-accent-success)';
      case 'sell':
        return 'var(--color-accent-error)';
      default:
        return 'var(--color-text-secondary)';
    }
  };

  const getSignalLabel = (signal: string) => {
    switch (signal) {
      case 'buy':
        return 'Покупка';
      case 'sell':
        return 'Продажа';
      default:
        return 'Удержание';
    }
  };

  const getConsistencyColor = (consistency: number) => {
    if (consistency >= 0.8) return 'var(--color-accent-success)';
    if (consistency >= 0.5) return 'var(--color-accent-warning)';
    return 'var(--color-accent-error)';
  };

  return (
    <Card variant="glass" className={`timeframe-summary ${className}`}>
      <div className="summary-header">
        <h3 className="summary-title">Сводка по таймфреймам</h3>
        <Badge 
          variant={overallSignal === 'buy' ? 'success' : overallSignal === 'sell' ? 'error' : 'warning'}
          size="lg"
        >
          {getSignalLabel(overallSignal)}
        </Badge>
      </div>

      <div className="summary-table">
        <div className="table-header">
          <div className="table-cell">Таймфрейм</div>
          <div className="table-cell">Сигнал</div>
          <div className="table-cell">Уверенность</div>
          <div className="table-cell">Вес</div>
        </div>
        {signals.map((signal) => (
          <div key={signal.timeframe} className="table-row">
            <div className="table-cell">{TIMEFRAME_LABELS[signal.timeframe]}</div>
            <div className="table-cell">
              <Badge
                variant={signal.signal === 'buy' ? 'success' : signal.signal === 'sell' ? 'error' : 'warning'}
                size="sm"
              >
                {getSignalLabel(signal.signal)}
              </Badge>
            </div>
            <div className="table-cell">
              <span className="confidence-value">
                {(signal.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <div className="table-cell">
              <span className="weight-value">
                {(TIMEFRAME_WEIGHTS[signal.timeframe] * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="summary-metrics">
        <div className="metric-item">
          <span className="metric-label">Согласованность</span>
          <span 
            className="metric-value"
            style={{ color: getConsistencyColor(consistency) }}
          >
            {(consistency * 100).toFixed(1)}%
          </span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Взвешенный сигнал</span>
          <span className="metric-value">
            {weightedSignal.toFixed(2)}
          </span>
        </div>
      </div>
    </Card>
  );
};

export default TimeframeSummary;

