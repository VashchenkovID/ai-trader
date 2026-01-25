import React, { useMemo } from 'react';
import { Card } from '../ui/Card/Card';
import { Chart } from '../ui/Chart/Chart';
import { Badge } from '../ui/Badge/Badge';
import { EnhancedNewsItem, NewsCategory, CATEGORY_LABELS } from './EnhancedNewsFeed';
import './NewsImpactChart.css';

interface NewsImpactChartProps {
  news: EnhancedNewsItem[];
  className?: string;
}

export const NewsImpactChart: React.FC<NewsImpactChartProps> = ({
  news,
  className = ''
}) => {
  const categoryImpact = useMemo(() => {
    const impactByCategory: Record<NewsCategory, { count: number; totalImpact: number; avgImpact: number }> = {
      earnings: { count: 0, totalImpact: 0, avgImpact: 0 },
      mergers: { count: 0, totalImpact: 0, avgImpact: 0 },
      macro: { count: 0, totalImpact: 0, avgImpact: 0 },
      dividends: { count: 0, totalImpact: 0, avgImpact: 0 },
      guidance: { count: 0, totalImpact: 0, avgImpact: 0 },
      regulatory: { count: 0, totalImpact: 0, avgImpact: 0 },
      other: { count: 0, totalImpact: 0, avgImpact: 0 },
    };

    news.forEach(item => {
      if (item.category && item.impactOnPrice !== undefined) {
        const category = item.category;
        impactByCategory[category].count++;
        impactByCategory[category].totalImpact += item.impactOnPrice;
      }
    });

    // Рассчитываем среднее влияние
    Object.keys(impactByCategory).forEach(category => {
      const data = impactByCategory[category as NewsCategory];
      data.avgImpact = data.count > 0 ? data.totalImpact / data.count : 0;
    });

    return impactByCategory;
  }, [news]);

  const chartData = useMemo(() => {
    const categories = Object.keys(categoryImpact) as NewsCategory[];
    const validCategories = categories.filter(cat => categoryImpact[cat].count > 0);

    return {
      labels: validCategories.map(cat => CATEGORY_LABELS[cat]),
      datasets: [
        {
          label: 'Среднее влияние на цену (%)',
          data: validCategories.map(cat => categoryImpact[cat].avgImpact * 100),
          backgroundColor: validCategories.map(cat => 
            cat === 'earnings' ? 'rgba(59, 130, 246, 0.8)' :
            cat === 'mergers' ? 'rgba(6, 182, 212, 0.8)' :
            cat === 'dividends' ? 'rgba(16, 185, 129, 0.8)' :
            cat === 'regulatory' ? 'rgba(239, 68, 68, 0.8)' :
            cat === 'guidance' ? 'rgba(245, 158, 11, 0.8)' :
            cat === 'macro' ? 'rgba(139, 92, 246, 0.8)' :
            'rgba(156, 163, 175, 0.8)'
          ),
          borderColor: validCategories.map(cat => 
            cat === 'earnings' ? 'var(--color-accent-primary)' :
            cat === 'mergers' ? 'var(--color-accent-info)' :
            cat === 'dividends' ? 'var(--color-accent-success)' :
            cat === 'regulatory' ? 'var(--color-accent-error)' :
            cat === 'guidance' ? 'var(--color-accent-warning)' :
            cat === 'macro' ? 'var(--color-accent-primary)' :
            'var(--color-text-secondary)'
          ),
          borderWidth: 1,
        },
      ],
    };
  }, [categoryImpact]);

  const chartOptions = useMemo(() => ({
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
            const category = Object.keys(CATEGORY_LABELS)[context.dataIndex] as NewsCategory;
            const data = categoryImpact[category];
            return [
              `Среднее влияние: ${(data.avgImpact * 100).toFixed(2)}%`,
              `Количество новостей: ${data.count}`,
            ];
          }
        }
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
          callback: function(value: any) {
            return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
          },
        },
        grid: {
          color: 'var(--color-border-default)',
        },
        zeroLine: true,
      },
    },
  }), [categoryImpact]);

  const hasData = Object.values(categoryImpact).some(data => data.count > 0);

  if (!hasData) {
    return null;
  }

  return (
    <Card variant="glass" className={`news-impact-chart ${className}`}>
      <div className="chart-header">
        <h3 className="chart-title">Влияние новостей по категориям</h3>
      </div>
      <div className="chart-content">
        <Chart
          type="bar"
          data={chartData}
          options={chartOptions}
          height={300}
        />
      </div>
      <div className="chart-legend">
        {Object.entries(categoryImpact)
          .filter(([_, data]) => data.count > 0)
          .map(([category, data]) => (
            <div key={category} className="legend-item">
              <span className="legend-label">{CATEGORY_LABELS[category as NewsCategory]}:</span>
              <span className={`legend-value ${data.avgImpact >= 0 ? 'value-positive' : 'value-negative'}`}>
                {data.avgImpact >= 0 ? '+' : ''}{(data.avgImpact * 100).toFixed(2)}%
              </span>
              <Badge variant="info" size="sm">
                {data.count} новостей
              </Badge>
            </div>
          ))}
      </div>
    </Card>
  );
};

export default NewsImpactChart;

