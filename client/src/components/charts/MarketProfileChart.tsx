import React, { useMemo } from 'react';
import { Card } from '../ui/Card/Card';
import { Chart } from '../ui/Chart/Chart';
import './MarketProfileChart.css';

export interface MarketProfileData {
  poc: number; // Point of Control
  valueAreaHigh: number;
  valueAreaLow: number;
  profileType: 'normal' | 'trend' | 'non_trend';
  balance: 'balanced' | 'imbalanced';
  tpoDistribution: Array<{
    price: number;
    tpo: number;
    volume?: number;
  }>;
}

interface MarketProfileChartProps {
  data: MarketProfileData | null;
  className?: string;
  height?: number;
}

export const MarketProfileChart: React.FC<MarketProfileChartProps> = ({
  data,
  className = '',
  height = 400
}) => {
  const chartData = useMemo(() => {
    if (!data || !data.tpoDistribution || data.tpoDistribution.length === 0) {
      return null;
    }

    // Сортируем по цене для правильного отображения
    const sorted = [...data.tpoDistribution].sort((a, b) => a.price - b.price);

    return {
      labels: sorted.map(item => item.price.toFixed(2)),
      datasets: [
        {
          label: 'TPO Distribution',
          data: sorted.map(item => item.tpo),
          backgroundColor: 'var(--color-accent-primary)',
          borderColor: 'var(--color-accent-primary-hover)',
          borderWidth: 1,
        },
      ],
    };
  }, [data]);

  const chartOptions = useMemo(() => ({
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'var(--color-surface-elevated)',
        titleColor: 'var(--color-text-primary)',
        bodyColor: 'var(--color-text-primary)',
        borderColor: 'var(--color-border-default)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context: any) {
            const price = parseFloat(context.label);
            const tpo = context.parsed.x;
            return `Цена: ${price.toFixed(2)}, TPO: ${tpo}`;
          }
        }
      },
      annotation: {
        annotations: {
          poc: {
            type: 'line' as const,
            yMin: data?.poc,
            yMax: data?.poc,
            borderColor: 'var(--color-accent-success)',
            borderWidth: 2,
            borderDash: [5, 5],
            label: {
              content: 'POC',
              enabled: true,
              position: 'end' as const,
            }
          },
          valueAreaHigh: {
            type: 'box' as const,
            yMin: data?.valueAreaLow,
            yMax: data?.valueAreaHigh,
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderColor: 'var(--color-accent-success)',
            borderWidth: 1,
          }
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: 'var(--color-text-secondary)',
        },
        grid: {
          color: 'var(--color-border-default)',
        },
        title: {
          display: true,
          text: 'TPO',
          color: 'var(--color-text-secondary)',
        }
      },
      y: {
        ticks: {
          color: 'var(--color-text-secondary)',
          callback: function(value: any) {
            return parseFloat(value).toFixed(2);
          }
        },
        grid: {
          color: 'var(--color-border-default)',
        },
        title: {
          display: true,
          text: 'Цена',
          color: 'var(--color-text-secondary)',
        }
      },
    },
  }), [data]);

  if (!data) {
    return (
      <Card variant="glass" className={`market-profile-chart ${className}`}>
        <div className="market-profile-empty">
          <p>Данные Market Profile недоступны</p>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="glass" className={`market-profile-chart ${className}`}>
      <div className="market-profile-header">
        <h3 className="market-profile-title">Market Profile</h3>
        <div className="market-profile-badges">
          <span className={`profile-badge profile-type-${data.profileType}`}>
            {data.profileType === 'normal' ? 'Нормальный' : 
             data.profileType === 'trend' ? 'Трендовый' : 'Нетрендовый'}
          </span>
          <span className={`profile-badge profile-balance-${data.balance}`}>
            {data.balance === 'balanced' ? 'Сбалансирован' : 'Дисбаланс'}
          </span>
        </div>
      </div>

      <div className="market-profile-content">
        <div className="market-profile-stats">
          <div className="stat-item">
            <span className="stat-label">POC (Point of Control)</span>
            <span className="stat-value">{data.poc.toFixed(2)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Value Area High</span>
            <span className="stat-value">{data.valueAreaHigh.toFixed(2)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Value Area Low</span>
            <span className="stat-value">{data.valueAreaLow.toFixed(2)}</span>
          </div>
        </div>

        <div className="market-profile-chart-container">
          <Chart
            type="bar"
            data={chartData}
            options={chartOptions}
            height={height}
          />
        </div>
      </div>
    </Card>
  );
};

export default MarketProfileChart;

