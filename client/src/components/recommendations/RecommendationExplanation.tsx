import React, { useMemo } from 'react';
import { Card } from '../ui/Card/Card';
import { Badge } from '../ui/Badge/Badge';
import { Chart } from '../ui/Chart/Chart';
import { IndicatorLegend, IndicatorInfo } from '../charts/IndicatorLegend';
import './RecommendationExplanation.css';

export interface FeatureImportance {
  feature: string;
  importance: number;
  impact: 'positive' | 'negative' | 'neutral';
  description?: string;
}

export interface ReasoningDetail {
  factor: string;
  value: number | string;
  threshold?: number;
  direction: 'confirming' | 'contradicting' | 'neutral';
  explanation: string;
}

interface RecommendationExplanationProps {
  reasoning?: string;
  featureImportance?: FeatureImportance[];
  reasoningDetails?: ReasoningDetail[];
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  className?: string;
}

export const RecommendationExplanation: React.FC<RecommendationExplanationProps> = ({
  reasoning,
  featureImportance = [],
  reasoningDetails = [],
  recommendation,
  confidence,
  className = ''
}) => {
  const indicatorInfo = useMemo<IndicatorInfo[]>(() => {
    return featureImportance.map(fi => ({
      name: fi.feature,
      value: `${(fi.importance * 100).toFixed(1)}%`,
      color: fi.impact === 'positive' 
        ? 'var(--color-accent-success)' 
        : fi.impact === 'negative' 
        ? 'var(--color-accent-error)' 
        : 'var(--color-text-secondary)',
      signal: fi.impact === 'positive' ? 'buy' : fi.impact === 'negative' ? 'sell' : 'hold',
      description: fi.description
    }));
  }, [featureImportance]);

  const chartData = useMemo(() => {
    if (featureImportance.length === 0) return null;

    // Сортируем по важности
    const sorted = [...featureImportance].sort((a, b) => b.importance - a.importance).slice(0, 10);

    return {
      labels: sorted.map(fi => fi.feature),
      datasets: [
        {
          label: 'Важность',
          data: sorted.map(fi => fi.importance * 100),
          backgroundColor: sorted.map(fi => 
            fi.impact === 'positive' 
              ? 'rgba(16, 185, 129, 0.8)' 
              : fi.impact === 'negative' 
              ? 'rgba(239, 68, 68, 0.8)' 
              : 'rgba(156, 163, 175, 0.8)'
          ),
          borderColor: sorted.map(fi => 
            fi.impact === 'positive' 
              ? 'var(--color-accent-success)' 
              : fi.impact === 'negative' 
              ? 'var(--color-accent-error)' 
              : 'var(--color-text-secondary)'
          ),
          borderWidth: 1,
        },
      ],
    };
  }, [featureImportance]);

  const confirmingFactors = useMemo(() => {
    return reasoningDetails.filter(rd => rd.direction === 'confirming');
  }, [reasoningDetails]);

  const contradictingFactors = useMemo(() => {
    return reasoningDetails.filter(rd => rd.direction === 'contradicting');
  }, [reasoningDetails]);

  const getRecommendationColor = () => {
    switch (recommendation) {
      case 'BUY':
        return 'var(--color-accent-success)';
      case 'SELL':
        return 'var(--color-accent-error)';
      default:
        return 'var(--color-text-secondary)';
    }
  };

  const getRecommendationLabel = () => {
    switch (recommendation) {
      case 'BUY':
        return 'Покупка';
      case 'SELL':
        return 'Продажа';
      default:
        return 'Удержание';
    }
  };

  return (
    <Card variant="glass" className={`recommendation-explanation ${className}`}>
      <div className="explanation-header">
        <h3 className="explanation-title">Объяснение рекомендации</h3>
        <div className="explanation-badges">
          <Badge 
            variant={recommendation === 'BUY' ? 'success' : recommendation === 'SELL' ? 'error' : 'warning'}
            size="lg"
          >
            {getRecommendationLabel()}
          </Badge>
          <span className="confidence-badge" style={{ color: getRecommendationColor() }}>
            Уверенность: {(confidence * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Feature Importance Chart */}
      {chartData && (
        <div className="explanation-section">
          <h4 className="section-title">Важность факторов</h4>
          <div className="chart-container">
            <Chart
              type="bar"
              data={chartData}
              options={{
                indexAxis: 'y' as const,
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: false,
                  },
                  tooltip: {
                    callbacks: {
                      label: function(context: any) {
                        return `Важность: ${context.parsed.x.toFixed(1)}%`;
                      }
                    }
                  }
                },
                scales: {
                  x: {
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
              height={Math.min(400, featureImportance.length * 40)}
            />
          </div>
        </div>
      )}

      {/* Indicator Legend */}
      {indicatorInfo.length > 0 && (
        <div className="explanation-section">
          <IndicatorLegend indicators={indicatorInfo} />
        </div>
      )}

      {/* Confirming Factors */}
      {confirmingFactors.length > 0 && (
        <div className="explanation-section">
          <h4 className="section-title">Подтверждающие факторы</h4>
          <div className="factors-list">
            {confirmingFactors.map((factor, index) => (
              <div key={index} className="factor-item factor-confirming">
                <div className="factor-header">
                  <span className="factor-name">{factor.factor}</span>
                  <Badge variant="success" size="sm">Подтверждает</Badge>
                </div>
                <div className="factor-details">
                  <span className="factor-value">
                    Значение: {typeof factor.value === 'number' ? factor.value.toFixed(2) : factor.value}
                    {factor.threshold && ` (порог: ${factor.threshold.toFixed(2)})`}
                  </span>
                </div>
                <p className="factor-explanation">{factor.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contradicting Factors */}
      {contradictingFactors.length > 0 && (
        <div className="explanation-section">
          <h4 className="section-title">Противоречащие факторы</h4>
          <div className="factors-list">
            {contradictingFactors.map((factor, index) => (
              <div key={index} className="factor-item factor-contradicting">
                <div className="factor-header">
                  <span className="factor-name">{factor.factor}</span>
                  <Badge variant="error" size="sm">Противоречит</Badge>
                </div>
                <div className="factor-details">
                  <span className="factor-value">
                    Значение: {typeof factor.value === 'number' ? factor.value.toFixed(2) : factor.value}
                    {factor.threshold && ` (порог: ${factor.threshold.toFixed(2)})`}
                  </span>
                </div>
                <p className="factor-explanation">{factor.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Text Reasoning */}
      {reasoning && (
        <div className="explanation-section">
          <h4 className="section-title">Детальное объяснение</h4>
          <div className="reasoning-text">
            <p>{reasoning}</p>
          </div>
        </div>
      )}
    </Card>
  );
};

export default RecommendationExplanation;

