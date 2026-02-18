import React from 'react';
import { Card, Chart } from '../ui';
import './TechnicalAnalysisTab.css';

interface TechnicalAnalysisTabProps {
  figi: string;
  technicalIndicators?: {
    rsi?: number[];
    macd?: {
      macd: number[];
      signal: number[];
      histogram: number[];
    };
    bollingerUpper?: number[];
    bollingerLower?: number[];
    bollingerPosition?: number;
    sma20?: number[];
    ema12?: number[];
    atr?: number;
    supportLevels?: number[];
    resistanceLevels?: number[];
  };
  labels?: string[];
  currency?: string;
}

const TechnicalAnalysisTab: React.FC<TechnicalAnalysisTabProps> = ({
  // figi,
  technicalIndicators,
  labels = [],
  currency = 'RUB'
}) => {
  if (!technicalIndicators) {
    return (
      <div className="technical-analysis-tab__empty">
        <p>Данные технического анализа недоступны</p>
        <p className="technical-analysis-tab__empty-hint">
          Запустите анализ для получения технических индикаторов
        </p>
      </div>
    );
  }

  // RSI график
  const rsiChartData = technicalIndicators?.rsi && technicalIndicators.rsi.length > 0 ? {
    labels: labels.length > 0 ? labels : (technicalIndicators?.rsi || []).map((_, i) => `День ${i + 1}`),
    datasets: [{
      label: 'RSI',
      data: technicalIndicators?.rsi || [],
      borderColor: '#8B5CF6',
      backgroundColor: 'rgba(139, 92, 246, 0.1)',
      borderWidth: 2,
      tension: 0.4,
      fill: true,
      pointRadius: 0
    }]
  } : null;

  const rsiChartOptions = rsiChartData ? {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: {
          stepSize: 20
        },
        grid: {
          color: (context: any) => {
            if (context.tick.value === 70 || context.tick.value === 30) {
              return '#EF4444';
            }
            return '#E5E7EB';
          }
        }
      }
    }
  } : null;

  // MACD график
  const macdChartData = technicalIndicators?.macd && technicalIndicators.macd.macd.length > 0 ? {
    labels: labels.length > 0 ? labels : (technicalIndicators?.macd?.macd || []).map((_, i) => `День ${i + 1}`),
    datasets: [
      {
        label: 'MACD',
        data: technicalIndicators?.macd?.macd || [],
        borderColor: '#3B82F6',
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0
      },
      {
        label: 'Signal',
        data: technicalIndicators?.macd?.signal || [],
        borderColor: '#EF4444',
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0,
        borderDash: [5, 5]
      },
      {
        label: 'Histogram',
        data: technicalIndicators?.macd?.histogram || [],
        borderColor: '#10B981',
        backgroundColor: (technicalIndicators?.macd?.histogram || []).map((val) => val >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'),
        borderWidth: 1,
        type: 'bar' as const,
        order: 2
      }
    ]
  } : null;

  const macdChartOptions = macdChartData ? {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const
      }
    }
  } : null;

  return (
    <div className="technical-analysis-tab">
      {/* Убрали TechnicalIndicatorsPanel, так как он уже отображается выше на странице */}
      
      <div className="technical-analysis-tab__charts">
        {rsiChartData && (
          <Card className="technical-analysis-tab__chart-card">
            <h4 className="technical-analysis-tab__chart-title">RSI (Relative Strength Index)</h4>
            <div style={{ height: '300px' }}>
              <Chart type="line" data={rsiChartData} options={rsiChartOptions} height={300} />
            </div>
            <div className="technical-analysis-tab__chart-description">
              <p><strong>RSI выше 70:</strong> Перекупленность - возможна коррекция вниз</p>
              <p><strong>RSI ниже 30:</strong> Перепроданность - возможен отскок вверх</p>
              <p><strong>RSI 30-70:</strong> Нейтральная зона</p>
            </div>
          </Card>
        )}

        {macdChartData && (
          <Card className="technical-analysis-tab__chart-card">
            <h4 className="technical-analysis-tab__chart-title">MACD (Moving Average Convergence Divergence)</h4>
            <div style={{ height: '300px' }}>
              <Chart type="line" data={macdChartData} options={macdChartOptions} height={300} />
            </div>
            <div className="technical-analysis-tab__chart-description">
              <p><strong>MACD выше Signal:</strong> Бычий сигнал - возможен рост</p>
              <p><strong>MACD ниже Signal:</strong> Медвежий сигнал - возможен спад</p>
              <p><strong>Histogram положительный:</strong> Усиление бычьего тренда</p>
              <p><strong>Histogram отрицательный:</strong> Усиление медвежьего тренда</p>
            </div>
          </Card>
        )}

        {(technicalIndicators?.supportLevels || technicalIndicators?.resistanceLevels) && (
          <Card className="technical-analysis-tab__levels-card">
            <h4 className="technical-analysis-tab__chart-title">Уровни поддержки и сопротивления</h4>
            <div className="technical-analysis-tab__levels">
              {technicalIndicators?.supportLevels && technicalIndicators.supportLevels.length > 0 && (
                <div className="technical-analysis-tab__levels-group">
                  <div className="technical-analysis-tab__levels-label">Поддержка:</div>
                  <div className="technical-analysis-tab__levels-values">
                    {technicalIndicators.supportLevels.map((level, i) => (
                      <span key={i} className="technical-analysis-tab__level-value technical-analysis-tab__level-value--support">
                        {level.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {technicalIndicators?.resistanceLevels && technicalIndicators.resistanceLevels.length > 0 && (
                <div className="technical-analysis-tab__levels-group">
                  <div className="technical-analysis-tab__levels-label">Сопротивление:</div>
                  <div className="technical-analysis-tab__levels-values">
                    {technicalIndicators.resistanceLevels.map((level, i) => (
                      <span key={i} className="technical-analysis-tab__level-value technical-analysis-tab__level-value--resistance">
                        {level.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default TechnicalAnalysisTab;

