import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card/Card';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { Button } from '../ui/Button/Button';
import { Select } from '../ui/Select/Select';
import { PerformanceChart, ChartPeriod } from './PerformanceChart';
import { performanceApi, DashboardData } from '../../services/performanceApi';
import './PerformanceDashboard.css';

interface PerformanceDashboardProps {
  className?: string;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value || 0);

const formatPercent = (value: number, decimals: number = 2) => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
};

const formatNumber = (value: number | null | undefined, decimals: number = 2) => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return value.toFixed(decimals);
};
const periodOptions = [
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'quarter', label: 'Квартал' },
  { value: 'year', label: 'Год' },
];

export const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({ className = '' }) => {
  const [period, setPeriod] = useState<ChartPeriod>('month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, [period]);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await performanceApi.getDashboardData(period);
      setDashboardData(data);
    } catch (err: any) {
      console.error('Error loading dashboard data:', err);
      setError(err.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !dashboardData) {
    return (
      <div className={`performance-dashboard ${className}`}>
        <div className="dashboard-header">
          <h2 className="dashboard-title">Дашборд производительности</h2>
          <Skeleton width={200} height={40} />
        </div>
        <div className="dashboard-metrics">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} variant="glass">
              <Skeleton width="100%" height={80} />
            </Card>
          ))}
        </div>
        <div className="dashboard-charts">
          <Card variant="glass">
            <Skeleton width="100%" height={300} />
          </Card>
          <Card variant="glass">
            <Skeleton width="100%" height={300} />
          </Card>
        </div>
      </div>
    );
  }

  if (error && !dashboardData) {
    return (
      <div className={`performance-dashboard ${className}`}>
        <Card variant="glass">
          <div className="error-message">
            <p>Ошибка загрузки данных: {error}</p>
            <Button onClick={loadDashboardData} variant="primary">
              Повторить
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const summary = dashboardData?.summary;

  return (
    <div className={`performance-dashboard ${className}`}>
      {/* Заголовок с фильтром периода */}
      <div className="dashboard-header">
        <h2 className="dashboard-title">Дашборд производительности</h2>
        <div className="period-selector">
          <Select
            value={period}
            onChange={(e) => setPeriod(e.target.value as ChartPeriod)}
            options={periodOptions}
            placeholder="Выберите период"
            size="md"
          />
        </div>
      </div>

      {/* Ключевые метрики */}
      <div className="dashboard-metrics">
        <Card variant="glass" className="metric-card">
          <div className="metric-label">Общая прибыль</div>
          <div className={`metric-value ${summary?.totalProfit && summary.totalProfit >= 0 ? 'number-positive' : 'number-negative'}`}>
            {summary ? formatCurrency(summary.totalProfit) : '—'}
          </div>
        </Card>

        <Card variant="glass" className="metric-card">
          <div className="metric-label">Всего сделок</div>
          <div className="metric-value number-text-primary">
            {summary?.totalTrades ?? '—'}
          </div>
        </Card>

        <Card variant="glass" className="metric-card">
          <div className="metric-label">Win Rate</div>
          <div className="metric-value number-success">
            {summary ? formatPercent(summary.winRate * 100, 1) : '—'}
          </div>
        </Card>

        <Card variant="glass" className="metric-card">
          <div className="metric-label">Sharpe Ratio</div>
          <div className="metric-value number-primary">
            {summary ? formatNumber(summary.sharpeRatio, 2) : '—'}
          </div>
        </Card>

        <Card variant="glass" className="metric-card">
          <div className="metric-label">Макс. просадка</div>
          <div className="metric-value number-error">
            {summary ? formatPercent(summary.maxDrawdown * 100, 2) : '—'}
          </div>
        </Card>

        <Card variant="glass" className="metric-card">
          <div className="metric-label">Волатильность</div>
          <div className="metric-value number-warning">
            {summary ? formatPercent(summary.volatility * 100, 2) : '—'}
          </div>
        </Card>
      </div>

      {/* Графики */}
      <div className="dashboard-charts">
        <Card variant="glass" className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Доходность по времени</h3>
          </div>
          <div className="chart-content">
            <PerformanceChart
              type="returns"
              data={dashboardData?.returns}
              period={period}
              height={300}
            />
          </div>
        </Card>

        <Card variant="glass" className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Распределение прибылей/убытков</h3>
          </div>
          <div className="chart-content">
            <PerformanceChart
              type="pnl-distribution"
              data={dashboardData?.pnlDistribution}
              period={period}
              height={300}
            />
            {dashboardData?.pnlDistribution && (
              <div className="distribution-stats">
                <div className="stat-item">
                  <span className="stat-label">Среднее:</span>
                  <span className="stat-value">{formatCurrency(dashboardData.pnlDistribution.mean)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Медиана:</span>
                  <span className="stat-value">{formatCurrency(dashboardData.pnlDistribution.median)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Ст. отклонение:</span>
                  <span className="stat-value">{formatCurrency(dashboardData.pnlDistribution.stdDev)}</span>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card variant="glass" className="chart-card chart-card-full">
          <div className="chart-header">
            <h3 className="chart-title">Просадка (Drawdown)</h3>
            {dashboardData?.drawdown && (
              <div className="drawdown-info">
                <span className="drawdown-label">Максимальная просадка:</span>
                <span className="drawdown-value number-error">
                  {formatPercent(dashboardData.drawdown.maxDrawdown * 100, 2)}
                </span>
                {dashboardData.drawdown.maxDrawdownDate && (
                  <span className="drawdown-date">
                    ({new Date(dashboardData.drawdown.maxDrawdownDate).toLocaleDateString('ru-RU')})
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="chart-content">
            <PerformanceChart
              type="drawdown"
              data={dashboardData?.drawdown}
              period={period}
              height={300}
            />
          </div>
        </Card>
      </div>
    </div>
  );
};

export default PerformanceDashboard;

