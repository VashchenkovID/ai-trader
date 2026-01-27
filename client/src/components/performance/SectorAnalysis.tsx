import React, { useState, useMemo } from 'react';
import { Card } from '../ui/Card/Card';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { SectorAnalysis as SectorAnalysisData } from '../../services/performanceApi';
import { translateSector } from '../../utils/sectorTranslator';
import './SectorAnalysis.css';

interface SectorAnalysisProps {
  data: SectorAnalysisData | null;
  loading?: boolean;
  className?: string;
}

type SortField = 'sector' | 'profit' | 'winRate' | 'sharpeRatio' | 'portfolioWeight';
type SortDirection = 'asc' | 'desc';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value || 0);

const formatPercent = (value: number, decimals: number = 2) => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
};

export const SectorAnalysis: React.FC<SectorAnalysisProps> = ({
  data,
  loading = false,
  className = ''
}) => {
  const [sortField, setSortField] = useState<SortField>('profit');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const sortedSectors = useMemo(() => {
    if (!data?.sectors) return [];

    const sectorsArray = Object.entries(data.sectors).map(([sector, performance]) => ({
      ...performance,
      sector // sector должен быть последним, чтобы не перезаписать из performance
    }));

    return sectorsArray.sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      if (sortField === 'sector') {
        aValue = translateSector(aValue);
        bValue = translateSector(bValue);
      }

      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      const comparison = aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  if (loading || !data) {
    return (
      <Card variant="glass" className={`sector-analysis ${className}`}>
        <div className="sector-analysis-header">
          <h3 className="sector-analysis-title">Анализ по секторам</h3>
        </div>
        <div className="sector-analysis-skeleton">
          <Skeleton width="100%" height={400} />
        </div>
      </Card>
    );
  }

  return (
    <div className={`sector-analysis ${className}`}>
      <Card variant="glass" className="sector-analysis-card">
        <div className="sector-analysis-header">
          <h3 className="sector-analysis-title">Анализ по секторам</h3>
        </div>

        <div className="sector-analysis-table-container">
          <table className="sector-analysis-table">
            <thead>
              <tr>
                <th 
                  className="sortable"
                  onClick={() => handleSort('sector')}
                >
                  Сектор {getSortIcon('sector')}
                </th>
                <th>Инструментов</th>
                <th>Сделок</th>
                <th 
                  className="sortable"
                  onClick={() => handleSort('profit')}
                >
                  Прибыль {getSortIcon('profit')}
                </th>
                <th 
                  className="sortable"
                  onClick={() => handleSort('winRate')}
                >
                  Win Rate {getSortIcon('winRate')}
                </th>
                <th 
                  className="sortable"
                  onClick={() => handleSort('sharpeRatio')}
                >
                  Sharpe Ratio {getSortIcon('sharpeRatio')}
                </th>
                <th 
                  className="sortable"
                  onClick={() => handleSort('portfolioWeight')}
                >
                  Доля в портфеле {getSortIcon('portfolioWeight')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedSectors.map((sector) => (
                <tr key={sector.sector}>
                  <td className="sector-name">
                    <span className="sector-badge">{translateSector(sector.sector)}</span>
                  </td>
                  <td className="number-text-primary">{sector.instruments || 0}</td>
                  <td className="number-text-primary">{sector.trades || 0}</td>
                  <td className={(sector.profit || 0) >= 0 ? 'number-positive' : 'number-negative'}>
                    {formatCurrency(sector.profit || 0)}
                  </td>
                  <td className="number-success">
                    {formatPercent((sector.winRate || 0) * 100, 1)}
                  </td>
                  <td className="number-primary">
                    {(sector.sharpeRatio || 0).toFixed(2)}
                  </td>
                  <td className="number-text-secondary">
                    {formatPercent((sector.portfolioWeight || 0) * 100, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Рекомендации */}
      {(data.recommendations && data.recommendations.length > 0) && (
        <Card variant="glass" className="sector-recommendations-card">
          <h4 className="recommendations-title">Рекомендации</h4>
          <div className="recommendations-list">
            {data.recommendations.map((rec, index) => (
              <div key={index} className={`recommendation-item recommendation-${rec.type}`}>
                <div className="recommendation-icon">
                  {rec.type === 'overexposure' && '⚠️'}
                  {rec.type === 'underexposure' && '📊'}
                  {rec.type === 'poor_performance' && '📉'}
                </div>
                <div className="recommendation-content">
                  <p className="recommendation-message">{rec.message}</p>
                  {rec.recommendedWeight !== undefined && rec.recommendedWeight !== null && (
                    <p className="recommendation-details">
                      Текущая доля: {formatPercent((rec.currentWeight || 0) * 100, 1)} → 
                      Рекомендуемая: {formatPercent((rec.recommendedWeight || 0) * 100, 1)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Рекомендации по диверсификации */}
      {data.diversification && data.diversification.recommendations && data.diversification.recommendations.length > 0 && (
        <Card variant="glass" className="diversification-card">
          <h4 className="diversification-title">Диверсификация</h4>
          <div className="diversification-info">
            <div className="diversification-metric">
              <span className="metric-label">Концентрация портфеля:</span>
              <span className={`metric-value ${(data.diversification.concentration || 0) > 0.5 ? 'number-warning' : 'number-success'}`}>
                {formatPercent((data.diversification.concentration || 0) * 100, 1)}
              </span>
            </div>
          </div>
          <div className="diversification-recommendations">
            {data.diversification.recommendations.map((rec, index) => (
              <div key={index} className="diversification-item">
                <p className="diversification-message">{rec.message}</p>
                {rec.sectors && rec.sectors.length > 0 && (
                  <div className="diversification-sectors">
                    {rec.sectors.map(sector => (
                      <span key={sector} className="sector-tag">
                        {translateSector(sector)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default SectorAnalysis;

