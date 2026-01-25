import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '../ui/Card/Card';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { Button } from '../ui/Button/Button';
import { Select } from '../ui/Select/Select';
import { Chart } from '../ui/Chart/Chart';
import { Badge } from '../ui/Badge/Badge';
import { performanceApi, BenchmarkComparison as BenchmarkComparisonData, AvailableBenchmark, ChartPeriod } from '../../services/performanceApi';
import './BenchmarkComparison.css';

interface BenchmarkComparisonProps {
  className?: string;
}

const formatPercent = (value: number, decimals: number = 2) => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
};

const formatNumber = (value: number | null | undefined, decimals: number = 2) => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return value.toFixed(decimals);
};

export const BenchmarkComparison: React.FC<BenchmarkComparisonProps> = ({ className = '' }) => {
  const [benchmarks, setBenchmarks] = useState<AvailableBenchmark[]>([]);
  const [selectedBenchmark, setSelectedBenchmark] = useState<string>('');
  const [period, setPeriod] = useState<ChartPeriod>('month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comparisonData, setComparisonData] = useState<BenchmarkComparisonData | null>(null);

  const periodOptions = [
    { value: 'month', label: 'Месяц' },
    { value: 'quarter', label: 'Квартал' },
    { value: 'year', label: 'Год' },
  ];

  useEffect(() => {
    loadBenchmarks();
  }, []);

  useEffect(() => {
    if (selectedBenchmark) {
      loadComparison();
    }
  }, [selectedBenchmark, period]);

  const loadBenchmarks = async () => {
    try {
      const data = await performanceApi.getAvailableBenchmarks();
      setBenchmarks(data);
      if (data.length > 0) {
        setSelectedBenchmark(data[0].id);
      }
    } catch (err: any) {
      console.error('Error loading benchmarks:', err);
      setError(err.message || 'Ошибка загрузки бенчмарков');
    }
  };

  const loadComparison = async () => {
    if (!selectedBenchmark) return;

    setLoading(true);
    setError(null);
    try {
      const data = await performanceApi.compareWithBenchmark(selectedBenchmark, period);
      setComparisonData(data);
    } catch (err: any) {
      console.error('Error loading comparison:', err);
      setError(err.message || 'Ошибка загрузки сравнения');
    } finally {
      setLoading(false);
    }
  };

  const chartData = useMemo(() => {
    if (!comparisonData || !comparisonData.portfolio || !comparisonData.benchmark) return null;

    // Синхронизируем даты для обоих наборов данных
    const portfolioDates = comparisonData.portfolio.dates || [];
    const benchmarkDates = comparisonData.benchmark.dates || [];
    
    const allDates = new Set([
      ...portfolioDates,
      ...benchmarkDates
    ]);
    const sortedDates = Array.from(allDates).sort();

    const portfolioReturns: number[] = [];
    const benchmarkReturns: number[] = [];
    const portfolioReturnsArray = comparisonData.portfolio.returns || [];
    const benchmarkReturnsArray = comparisonData.benchmark.returns || [];

    sortedDates.forEach(date => {
      const portfolioIndex = portfolioDates.indexOf(date);
      const benchmarkIndex = benchmarkDates.indexOf(date);

      portfolioReturns.push(
        portfolioIndex >= 0 ? (portfolioReturnsArray[portfolioIndex] || 0) : 0
      );
      benchmarkReturns.push(
        benchmarkIndex >= 0 ? (benchmarkReturnsArray[benchmarkIndex] || 0) : 0
      );
    });

    return {
      labels: sortedDates.map(date => new Date(date).toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' })),
      datasets: [
        {
          label: 'Портфель',
          data: portfolioReturns,
          borderColor: '#3B82F6', // Яркий синий
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          borderWidth: 3,
          fill: false,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#3B82F6',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
        },
        {
          label: benchmarkDates.length > 0 ? benchmarks.find(b => b.id === selectedBenchmark)?.name || 'Бенчмарк' : 'Бенчмарк',
          data: benchmarkReturns,
          borderColor: '#10B981', // Яркий зеленый
          backgroundColor: 'rgba(16, 185, 129, 0.2)',
          borderWidth: 3,
          fill: false,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#10B981',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
        },
      ],
    };
  }, [comparisonData, selectedBenchmark, benchmarks]);

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
          font: {
            size: 13,
            weight: '600' as const,
          },
          boxWidth: 12,
          boxHeight: 12,
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
          color: 'var(--color-text-primary)',
          font: {
            size: 12,
            weight: '500' as const,
          },
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
          lineWidth: 1,
        },
        border: {
          color: 'rgba(255, 255, 255, 0.2)',
          width: 1,
        },
      },
      y: {
        ticks: {
          color: 'var(--color-text-primary)',
          font: {
            size: 12,
            weight: '500' as const,
          },
          callback: function(value: any) {
            return formatPercent(value);
          },
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
          lineWidth: 1,
        },
        border: {
          color: 'rgba(255, 255, 255, 0.2)',
          width: 1,
        },
      },
    },
  }), []);

  if (loading && !comparisonData) {
    return (
      <Card variant="glass" className={`benchmark-comparison ${className}`}>
        <Skeleton width="100%" height={400} />
      </Card>
    );
  }

  if (error && !comparisonData) {
    return (
      <Card variant="glass" className={`benchmark-comparison ${className}`}>
        <div className="error-message">
          <p>Ошибка загрузки данных: {error}</p>
          <Button onClick={loadComparison} variant="primary">
            Повторить
          </Button>
        </div>
      </Card>
    );
  }

  const metrics = comparisonData?.metrics;
  const selectedBenchmarkName = benchmarks.find(b => b.id === selectedBenchmark)?.name || 'Бенчмарк';

  return (
    <div className={`benchmark-comparison ${className}`}>
      <Card variant="glass" className="benchmark-comparison-card">
        <div className="benchmark-header">
          <h3 className="benchmark-title">Сравнение с бенчмарками</h3>
          <div className="benchmark-controls">
            <Select
              value={selectedBenchmark}
              onChange={(e) => setSelectedBenchmark(e.target.value)}
              options={benchmarks.map(b => ({ value: b.id, label: b.name }))}
              placeholder="Выберите бенчмарк"
              size="md"
            />
            <Select
              value={period}
              onChange={(e) => setPeriod(e.target.value as ChartPeriod)}
              options={periodOptions}
              placeholder="Период"
              size="md"
            />
          </div>
        </div>

        {comparisonData && (
          <>
            {/* График сравнения */}
            {chartData && (
              <div className="benchmark-chart">
                <Chart
                  type="line"
                  data={chartData}
                  options={chartOptions}
                  height={350}
                />
              </div>
            )}

            {/* Метрики сравнения */}
            <div className="benchmark-metrics">
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-label">Alpha</div>
                  <div className={`metric-value ${metrics && metrics.alpha >= 0 ? 'number-positive' : 'number-negative'}`}>
                    {metrics ? formatPercent(metrics.alpha, 2) : '—'}
                  </div>
                  <div className="metric-description">Превышение доходности</div>
                </div>

                <div className="metric-card">
                  <div className="metric-label">Beta</div>
                  <div className="metric-value number-text-primary">
                    {metrics ? formatNumber(metrics.beta, 2) : '—'}
                  </div>
                  <div className="metric-description">Корреляция с рынком</div>
                </div>

                <div className="metric-card">
                  <div className="metric-label">Tracking Error</div>
                  <div className="metric-value number-warning">
                    {metrics ? formatPercent(metrics.trackingError, 2) : '—'}
                  </div>
                  <div className="metric-description">Отклонение от бенчмарка</div>
                </div>

                <div className="metric-card">
                  <div className="metric-label">Доходность портфеля</div>
                  <div className={`metric-value ${metrics && metrics.portfolioReturn >= 0 ? 'number-positive' : 'number-negative'}`}>
                    {metrics ? formatPercent(metrics.portfolioReturn, 2) : '—'}
                  </div>
                  <div className="metric-description">За период</div>
                </div>

                <div className="metric-card">
                  <div className="metric-label">Доходность {selectedBenchmarkName}</div>
                  <div className={`metric-value ${metrics && metrics.benchmarkReturn >= 0 ? 'number-positive' : 'number-negative'}`}>
                    {metrics ? formatPercent(metrics.benchmarkReturn, 2) : '—'}
                  </div>
                  <div className="metric-description">За период</div>
                </div>

                <div className="metric-card">
                  <div className="metric-label">Sharpe Ratio (портфель)</div>
                  <div className="metric-value number-primary">
                    {metrics ? formatNumber(metrics.portfolioSharpe, 2) : '—'}
                  </div>
                  <div className="metric-description">vs {formatNumber(metrics?.benchmarkSharpe, 2)}</div>
                </div>
              </div>
            </div>

            {/* Таблица сравнения */}
            <div className="benchmark-table-container">
              <table className="benchmark-table">
                <thead>
                  <tr>
                    <th>Метрика</th>
                    <th>Портфель</th>
                    <th>{selectedBenchmarkName}</th>
                    <th>Разница</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Доходность</td>
                    <td className={metrics && metrics.portfolioReturn >= 0 ? 'number-positive' : 'number-negative'}>
                      {metrics ? formatPercent(metrics.portfolioReturn, 2) : '—'}
                    </td>
                    <td className={metrics && metrics.benchmarkReturn >= 0 ? 'number-positive' : 'number-negative'}>
                      {metrics ? formatPercent(metrics.benchmarkReturn, 2) : '—'}
                    </td>
                    <td className={metrics && (metrics.portfolioReturn - metrics.benchmarkReturn) >= 0 ? 'number-positive' : 'number-negative'}>
                      {metrics ? formatPercent(metrics.portfolioReturn - metrics.benchmarkReturn, 2) : '—'}
                    </td>
                  </tr>
                  <tr>
                    <td>Волатильность</td>
                    <td className="number-warning">{metrics ? formatPercent(metrics.portfolioVolatility, 2) : '—'}</td>
                    <td className="number-warning">{metrics ? formatPercent(metrics.benchmarkVolatility, 2) : '—'}</td>
                    <td className="number-text-secondary">
                      {metrics ? formatPercent(metrics.portfolioVolatility - metrics.benchmarkVolatility, 2) : '—'}
                    </td>
                  </tr>
                  <tr>
                    <td>Sharpe Ratio</td>
                    <td className="number-primary">{metrics ? formatNumber(metrics.portfolioSharpe, 2) : '—'}</td>
                    <td className="number-primary">{metrics ? formatNumber(metrics.benchmarkSharpe, 2) : '—'}</td>
                    <td className="number-text-secondary">
                      {metrics ? formatNumber(metrics.portfolioSharpe - metrics.benchmarkSharpe, 2) : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Алерты */}
            {comparisonData.alerts && comparisonData.alerts.length > 0 && (
              <div className="benchmark-alerts">
                <h4 className="alerts-title">Алерты</h4>
                <div className="alerts-list">
                  {comparisonData.alerts.map((alert, index) => (
                    <div key={index} className={`alert-item alert-${alert.severity}`}>
                      <Badge variant={alert.severity === 'high' ? 'error' : alert.severity === 'medium' ? 'warning' : 'info'}>
                        {alert.severity === 'high' ? 'Высокий' : alert.severity === 'medium' ? 'Средний' : 'Низкий'}
                      </Badge>
                      <span className="alert-message">{alert.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

export default BenchmarkComparison;

