import React from 'react';
import { Card, Chart } from '../ui';
import './TechnicalIndicatorsPanel.css';

interface TechnicalIndicatorsPanelProps {
  rsi?: number[];
  macd?: {
    macd: number[];
    signal: number[];
    histogram: number[];
  };
  bollingerPosition?: number; // Позиция в Bollinger Bands (0-1)
  sma20?: number;
  ema12?: number;
  atr?: number;
  currency?: string;
  labels?: string[];
}

const TechnicalIndicatorsPanel: React.FC<TechnicalIndicatorsPanelProps> = ({
  rsi,
  macd,
  bollingerPosition,
  sma20,
  ema12,
  atr,
  currency = 'RUB',
  labels = []
}) => {
  const formatCurrency = (price: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  // Форматируем даты для графиков
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // RSI график
  const rsiChartData = rsi && rsi.length > 0 ? {
    labels: labels.length > 0 ? labels.map(formatDate) : rsi.map((_, i) => `День ${i + 1}`),
    datasets: [{
      label: 'RSI',
      data: rsi,
      borderColor: '#8B5CF6',
      backgroundColor: 'rgba(139, 92, 246, 0.1)',
      borderWidth: 2,
      tension: 0.4,
      fill: true,
      pointRadius: 0
    }]
  } : null;

  const rsiChartOptions = rsi ? {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const value = context.parsed.y;
            let status = '';
            if (value > 70) status = ' (Перекупленность)';
            else if (value < 30) status = ' (Перепроданность)';
            return `RSI: ${value.toFixed(2)}${status}`;
          }
        }
      }
    },
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: {
          stepSize: 20,
          color: '#9CA3AF'
        },
        grid: {
          color: (context: any) => {
            if (context.tick.value === 70 || context.tick.value === 30) {
              return '#EF4444';
            }
            return 'rgba(255, 255, 255, 0.1)';
          }
        }
      },
      x: {
        ticks: {
          color: '#9CA3AF'
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      }
    }
  } : null;

  // MACD график
  const macdChartData = macd && macd.macd.length > 0 ? {
    labels: labels.length > 0 ? labels.map(formatDate) : macd.macd.map((_, i) => `День ${i + 1}`),
    datasets: [
      {
        label: 'MACD',
        data: macd.macd,
        borderColor: '#3B82F6',
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0
      },
      {
        label: 'Signal',
        data: macd.signal,
        borderColor: '#EF4444',
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0,
        borderDash: [5, 5]
      },
      {
        label: 'Histogram',
        data: macd.histogram,
        borderColor: '#10B981',
        backgroundColor: macd.histogram.map((val) => val >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'),
        borderWidth: 1,
        type: 'bar' as const,
        order: 2
      }
    ]
  } : null;

  const macdChartOptions = macd ? {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 10
        }
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        ticks: {
          color: '#9CA3AF'
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      },
      x: {
        ticks: {
          color: '#9CA3AF'
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      }
    }
  } : null;

  const getRSIStatus = (value?: number) => {
    if (!value) return { text: 'N/A', color: 'neutral' };
    if (value > 70) return { text: 'Перекупленность', color: 'danger' };
    if (value < 30) return { text: 'Перепроданность', color: 'success' };
    return { text: 'Нейтрально', color: 'neutral' };
  };

  const getBollingerStatus = (position?: number) => {
    if (position === undefined) return { text: 'N/A', color: 'neutral' };
    if (position > 0.8) return { text: 'Верхняя полоса', color: 'warning' };
    if (position < 0.2) return { text: 'Нижняя полоса', color: 'success' };
    return { text: 'Средняя зона', color: 'neutral' };
  };

  const currentRSI = rsi && rsi.length > 0 ? rsi[rsi.length - 1] : undefined;
  const rsiStatus = getRSIStatus(currentRSI);
  const bollingerStatus = getBollingerStatus(bollingerPosition);

  return (
    <Card variant="default" className="technical-indicators-panel">
      <div className="technical-indicators-panel__header">
        <h3 className="technical-indicators-panel__title">Технические индикаторы</h3>
      </div>
      
      <div className="technical-indicators-panel__content">
        {/* Компактные метрики */}
        <div className="technical-indicators-panel__metrics">
          {currentRSI !== undefined && (
            <div className="technical-indicators-panel__metric">
              <div className="technical-indicators-panel__metric-label">RSI (14)</div>
              <div className={`technical-indicators-panel__metric-value technical-indicators-panel__metric-value--${rsiStatus.color}`}>
                {currentRSI.toFixed(2)}
              </div>
              <div className={`technical-indicators-panel__metric-status technical-indicators-panel__metric-status--${rsiStatus.color}`}>
                {rsiStatus.text}
              </div>
            </div>
          )}

          {sma20 !== undefined && (
            <div className="technical-indicators-panel__metric">
              <div className="technical-indicators-panel__metric-label">SMA 20</div>
              <div className="technical-indicators-panel__metric-value">
                {formatCurrency(sma20)}
              </div>
            </div>
          )}

          {ema12 !== undefined && (
            <div className="technical-indicators-panel__metric">
              <div className="technical-indicators-panel__metric-label">EMA 12</div>
              <div className="technical-indicators-panel__metric-value">
                {formatCurrency(ema12)}
              </div>
            </div>
          )}

          {atr !== undefined && (
            <div className="technical-indicators-panel__metric">
              <div className="technical-indicators-panel__metric-label">ATR</div>
              <div className="technical-indicators-panel__metric-value">
                {formatCurrency(atr)}
              </div>
            </div>
          )}

          {bollingerPosition !== undefined && (
            <div className="technical-indicators-panel__metric">
              <div className="technical-indicators-panel__metric-label">Bollinger Bands</div>
              <div className={`technical-indicators-panel__metric-status technical-indicators-panel__metric-status--${bollingerStatus.color}`}>
                {bollingerStatus.text}
              </div>
              <div className="technical-indicators-panel__metric-value">
                {(bollingerPosition * 100).toFixed(0)}%
              </div>
            </div>
          )}
        </div>

        {/* Мини-графики */}
        <div className="technical-indicators-panel__charts">
          {rsiChartData && (
            <div className="technical-indicators-panel__chart">
              <div className="technical-indicators-panel__chart-title">RSI (14)</div>
              <div className="technical-indicators-panel__chart-container" style={{ height: '120px' }}>
                <Chart type="line" data={rsiChartData} options={rsiChartOptions} height={120} />
              </div>
            </div>
          )}

          {macdChartData && (
            <div className="technical-indicators-panel__chart">
              <div className="technical-indicators-panel__chart-title">MACD</div>
              <div className="technical-indicators-panel__chart-container" style={{ height: '120px' }}>
                <Chart type="line" data={macdChartData} options={macdChartOptions} height={120} />
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default TechnicalIndicatorsPanel;

