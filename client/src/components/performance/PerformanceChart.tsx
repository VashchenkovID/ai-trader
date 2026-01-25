import React, { useMemo } from 'react';
import { Chart } from '../ui/Chart/Chart';
import './PerformanceChart.css';

export type ChartPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface PerformanceChartProps {
  type: 'returns' | 'pnl-distribution' | 'drawdown';
  data: any;
  period?: ChartPeriod;
  height?: number;
  className?: string;
}

export const PerformanceChart: React.FC<PerformanceChartProps> = ({
  type,
  data,
  period = 'month',
  height = 300,
  className = ''
}) => {
  const chartData = useMemo(() => {
    if (!data) return null;

    switch (type) {
      case 'returns':
        return {
          labels: data.labels || [],
          datasets: [
            {
              label: 'Доходность',
              data: data.returns || [],
              borderColor: 'var(--color-accent-primary)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              borderWidth: 2,
              fill: true,
              tension: 0.4,
            },
            {
              label: 'Накопленная доходность',
              data: data.cumulativeReturns || [],
              borderColor: 'var(--color-accent-success)',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              borderWidth: 2,
              fill: false,
              tension: 0.4,
            },
          ],
        };

      case 'pnl-distribution':
        return {
          labels: data.bins || [],
          datasets: [
            {
              label: 'Частота',
              data: data.frequencies || [],
              backgroundColor: 'var(--color-accent-primary)',
              borderColor: 'var(--color-accent-primary-hover)',
              borderWidth: 1,
            },
          ],
        };

      case 'drawdown':
        return {
          labels: data.labels || [],
          datasets: [
            {
              label: 'Просадка',
              data: data.drawdown || [],
              borderColor: 'var(--color-accent-error)',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              borderWidth: 2,
              fill: true,
              tension: 0.4,
            },
          ],
        };

      default:
        return null;
    }
  }, [type, data]);

  const chartOptions = useMemo(() => {
    const baseOptions: any = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: {
            color: 'var(--color-text-primary)',
            padding: 15,
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: 'var(--color-surface-elevated)',
          titleColor: 'var(--color-text-primary)',
          bodyColor: 'var(--color-text-primary)',
          borderColor: 'var(--color-border-default)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          ticks: {
            color: 'var(--color-text-secondary)',
          },
          grid: {
            color: 'var(--color-border-default)',
          },
        },
        y: {
          ticks: {
            color: 'var(--color-text-secondary)',
            callback: type === 'returns' || type === 'drawdown' 
              ? function(value: any) {
                  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
                }
              : undefined,
          },
          grid: {
            color: 'var(--color-border-default)',
          },
        },
      },
    };

    if (type === 'pnl-distribution') {
      baseOptions.scales.y.beginAtZero = true;
    }

    return baseOptions;
  }, [type]);

  if (!chartData) {
    return (
      <div className={`performance-chart-skeleton ${className}`}>
        <div className="skeleton-placeholder" style={{ height: `${height}px` }} />
      </div>
    );
  }

  const chartType = type === 'pnl-distribution' ? 'bar' : 'line';

  return (
    <div className={`performance-chart ${className}`}>
      <Chart
        type={chartType}
        data={chartData}
        options={chartOptions}
        height={height}
      />
    </div>
  );
};

export default PerformanceChart;

