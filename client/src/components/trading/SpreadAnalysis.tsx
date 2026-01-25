import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '../ui/Card/Card';
import { Chart } from '../ui/Chart/Chart';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { Badge } from '../ui/Badge/Badge';
import './SpreadAnalysis.css';

interface SpreadData {
  current: number;
  historical: Array<{
    date: string;
    spread: number;
  }>;
}

interface SpreadAnalysisProps {
  figi: string;
  days?: number;
  className?: string;
}

const formatPercent = (value: number, decimals: number = 3) => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
};

export const SpreadAnalysis: React.FC<SpreadAnalysisProps> = ({
  figi,
  days = 30,
  className = ''
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spreadData, setSpreadData] = useState<SpreadData | null>(null);

  useEffect(() => {
    if (figi) {
      loadSpreadData();
    }
  }, [figi, days]);

  const loadSpreadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${(window as any).env?.REACT_APP_API_URL || 'http://localhost:3001'}/api/trading/entry-optimization/${figi}/spread?days=${days}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch spread data');
      }
      
      const result = await response.json();
      setSpreadData(result.data || result);
    } catch (err: any) {
      console.error('Error loading spread data:', err);
      setError(err.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const chartData = useMemo(() => {
    if (!spreadData || !spreadData.historical || spreadData.historical.length === 0) {
      return null;
    }

    const sorted = [...spreadData.historical].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return {
      labels: sorted.map(item => 
        new Date(item.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
      ),
      datasets: [
        {
          label: 'Spread',
          data: sorted.map(item => item.spread * 100),
          borderColor: 'var(--color-accent-primary)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
        },
        {
          label: 'Текущий spread',
          data: new Array(sorted.length).fill(spreadData.current * 100),
          borderColor: 'var(--color-accent-success)',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
        },
      ],
    };
  }, [spreadData]);

  const chartOptions = useMemo(() => ({
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
        callbacks: {
          label: function(context: any) {
            return `${context.dataset.label}: ${formatPercent(context.parsed.y)}`;
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
            return formatPercent(value);
          },
        },
        grid: {
          color: 'var(--color-border-default)',
        },
      },
    },
  }), []);

  if (loading) {
    return (
      <Card variant="glass" className={`spread-analysis ${className}`}>
        <Skeleton width="100%" height={400} />
      </Card>
    );
  }

  if (error || !spreadData) {
    return (
      <Card variant="glass" className={`spread-analysis ${className}`}>
        <div className="error-message">
          <p>{error || 'Данные недоступны'}</p>
        </div>
      </Card>
    );
  }

  const spreadValues = spreadData.historical.map(s => s.spread);
  const mean = spreadValues.reduce((a, b) => a + b, 0) / spreadValues.length;
  const sorted = [...spreadValues].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = Math.min(...spreadValues);
  const max = Math.max(...spreadValues);

  const getSpreadStatus = () => {
    if (spreadData.current < median * 0.8) return { status: 'low', variant: 'success' as const };
    if (spreadData.current > median * 1.2) return { status: 'high', variant: 'error' as const };
    return { status: 'medium', variant: 'warning' as const };
  };

  const spreadStatus = getSpreadStatus();

  return (
    <Card variant="glass" className={`spread-analysis ${className}`}>
      <div className="spread-header">
        <h3 className="spread-title">Анализ spread'а</h3>
        <Badge variant={spreadStatus.variant} size="sm">
          {spreadStatus.status === 'low' ? 'Низкий' : 
           spreadStatus.status === 'medium' ? 'Средний' : 'Высокий'}
        </Badge>
      </div>

      <div className="spread-current-section">
        <div className="current-spread">
          <span className="current-label">Текущий spread</span>
          <span className="current-value">
            {formatPercent(spreadData.current * 100, 3)}
          </span>
        </div>
      </div>

      {chartData && (
        <div className="spread-chart">
          <Chart
            type="line"
            data={chartData}
            options={chartOptions}
            height={300}
          />
        </div>
      )}

      <div className="spread-stats">
        <div className="stat-item">
          <span className="stat-label">Средний</span>
          <span className="stat-value">{formatPercent(mean * 100, 3)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Медиана</span>
          <span className="stat-value">{formatPercent(median * 100, 3)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Минимум</span>
          <span className="stat-value">{formatPercent(min * 100, 3)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Максимум</span>
          <span className="stat-value">{formatPercent(max * 100, 3)}</span>
        </div>
      </div>
    </Card>
  );
};

export default SpreadAnalysis;

