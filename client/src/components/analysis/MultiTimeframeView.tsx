import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card/Card';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { Chart } from '../ui/Chart/Chart';
import { Badge } from '../ui/Badge/Badge';
// import { apiService } from '../../services/apiService'; // Reserved for future use
import './MultiTimeframeView.css';

export type Timeframe = 'H1' | 'D1' | 'W1';

interface MultiTimeframeViewProps {
  figi: string;
  className?: string;
}

interface TimeframeAnalysis {
  timeframe: Timeframe;
  signal: 'buy' | 'sell' | 'hold';
  confidence: number;
  indicators: any;
  consistency?: number;
  weightedSignal?: number;
}

interface MultiTimeframeData {
  timeframes: Record<Timeframe, TimeframeAnalysis>;
  overallSignal: 'buy' | 'sell' | 'hold';
  consistency: number;
  weightedSignal: number;
}

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  H1: 'Час (H1)',
  D1: 'День (D1)',
  W1: 'Неделя (W1)',
};

// const TIMEFRAME_WEIGHTS: Record<Timeframe, number> = { // Reserved for future use
//   H1: 0.2,
//   D1: 0.3,
//   W1: 0.5,
// };

export const MultiTimeframeView: React.FC<MultiTimeframeViewProps> = ({
  figi,
  className = ''
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MultiTimeframeData | null>(null);

  useEffect(() => {
    loadMultiTimeframeData();
  }, [figi]);

  const loadMultiTimeframeData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Используем существующий endpoint для анализа, если есть мультитаймфреймовый
      // Или создаем новый запрос к MultiTimeframeService
      const response = await fetch(
        `${(window as any).env?.REACT_APP_API_URL || 'http://localhost:3001'}/api/analysis/${figi}/multi-timeframe`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch multi-timeframe data');
      }
      
      const result = await response.json();
      setData(result.data || result);
    } catch (err: any) {
      console.error('Error loading multi-timeframe data:', err);
      setError(err.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  // const _getSignalColor = (signal: string) => { // Reserved for future use
  //   switch (signal) {
  //     case 'buy':
  //       return 'var(--color-accent-success)';
  //     case 'sell':
  //       return 'var(--color-accent-error)';
  //     default:
  //       return 'var(--color-text-secondary)';
  //   }
  // };

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

  if (loading) {
    return (
      <Card variant="glass" className={`multi-timeframe-view ${className}`}>
        <Skeleton width="100%" height={600} />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card variant="glass" className={`multi-timeframe-view ${className}`}>
        <div className="error-message">
          <p>{error || 'Данные недоступны'}</p>
        </div>
      </Card>
    );
  }

  const timeframes: Timeframe[] = ['H1', 'D1', 'W1'];

  return (
    <div className={`multi-timeframe-view ${className}`}>
      {/* Сводная панель */}
      <Card variant="glass" className="timeframe-summary">
        <div className="summary-header">
          <h3 className="summary-title">Мультитаймфреймовый анализ</h3>
          <div className="summary-overall">
            <Badge 
              variant={data.overallSignal === 'buy' ? 'success' : data.overallSignal === 'sell' ? 'error' : 'warning'}
              size="lg"
            >
              {getSignalLabel(data.overallSignal)}
            </Badge>
          </div>
        </div>
        <div className="summary-metrics">
          <div className="metric-item">
            <span className="metric-label">Согласованность</span>
            <span 
              className="metric-value"
              style={{ color: getConsistencyColor(data.consistency) }}
            >
              {(data.consistency * 100).toFixed(1)}%
            </span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Взвешенный сигнал</span>
            <span className="metric-value">
              {data.weightedSignal.toFixed(2)}
            </span>
          </div>
        </div>
      </Card>

      {/* Панели для каждого таймфрейма */}
      <div className="timeframe-panels">
        {timeframes.map((timeframe) => {
          const analysis = data.timeframes[timeframe];
          if (!analysis) return null;

          const borderColor = getConsistencyColor(
            analysis.consistency || 0
          );

          return (
            <Card
              key={timeframe}
              variant="glass"
              className="timeframe-panel"
              style={{
                borderLeft: `4px solid ${borderColor}`,
              }}
            >
              <div className="panel-header">
                <div className="panel-title-row">
                  <h4 className="panel-title">{TIMEFRAME_LABELS[timeframe]}</h4>
                  <div className="panel-badges">
                    <Badge
                      variant={analysis.signal === 'buy' ? 'success' : analysis.signal === 'sell' ? 'error' : 'warning'}
                      size="sm"
                    >
                      {getSignalLabel(analysis.signal)}
                    </Badge>
                    <span className="confidence-badge">
                      {(analysis.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                {analysis.consistency !== undefined && (
                  <div className="panel-consistency">
                    <span className="consistency-label">Согласованность:</span>
                    <span 
                      className="consistency-value"
                      style={{ color: getConsistencyColor(analysis.consistency) }}
                    >
                      {(analysis.consistency * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>

              <div className="panel-indicators">
                {analysis.indicators && (
                  <div className="indicators-grid">
                    {Object.entries(analysis.indicators).slice(0, 6).map(([key, value]: [string, any]) => (
                      <div key={key} className="indicator-item">
                        <span className="indicator-name">{key}</span>
                        <span className="indicator-value">
                          {typeof value === 'number' ? value.toFixed(2) : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* График согласованности */}
      <Card variant="glass" className="consistency-chart">
        <h4 className="chart-title">Согласованность сигналов</h4>
        <div className="chart-content">
          <Chart
            type="bar"
            data={{
              labels: timeframes.map(tf => TIMEFRAME_LABELS[tf]),
              datasets: [
                {
                  label: 'Согласованность',
                  data: timeframes.map(tf => {
                    const analysis = data.timeframes[tf];
                    return analysis?.consistency ? analysis.consistency * 100 : 0;
                  }),
                  backgroundColor: timeframes.map(tf => {
                    const analysis = data.timeframes[tf];
                    const consistency = analysis?.consistency || 0;
                    return getConsistencyColor(consistency);
                  }),
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false,
                },
                tooltip: {
                  callbacks: {
                    label: function(context: any) {
                      return `Согласованность: ${context.parsed.y.toFixed(1)}%`;
                    }
                  }
                }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100,
                  ticks: {
                    callback: function(value: any) {
                      return `${value}%`;
                    }
                  }
                }
              }
            }}
            height={200}
          />
        </div>
      </Card>
    </div>
  );
};

export default MultiTimeframeView;

