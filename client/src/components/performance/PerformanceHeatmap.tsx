import React, { useMemo } from 'react';
import { Card } from '../ui/Card/Card';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { PerformanceHeatmapData } from '../../services/performanceApi';
// import { ChartPeriod } from '../../services/performanceApi'; // Reserved for future use
import './PerformanceHeatmap.css';

interface PerformanceHeatmapProps {
  data: PerformanceHeatmapData | null;
  loading?: boolean;
  className?: string;
  onCellClick?: (sector: string, strategy: string, data: any) => void;
}

export const PerformanceHeatmap: React.FC<PerformanceHeatmapProps> = ({
  data,
  loading = false,
  className = '',
  onCellClick
}) => {
  const heatmapData = useMemo(() => {
    if (!data) return null;

    // Создаем матрицу для heatmap
    const matrix: Record<string, Record<string, number>> = {};
    
    data.data.forEach(item => {
      if (!matrix[item.sector]) {
        matrix[item.sector] = {};
      }
      matrix[item.sector][item.strategy] = item.value;
    });

    return {
      sectors: data.sectors,
      strategies: data.strategies,
      matrix,
      rawData: data.data
    };
  }, [data]);

  const getCellColor = (value: number) => {
    // Нормализуем значение от -1 до 1 (или используем процентили)
    const normalized = Math.max(-1, Math.min(1, value));
    
    if (normalized >= 0) {
      // Зеленый для прибыли (от светлого к темному)
      const intensity = Math.min(1, normalized);
      const opacity = 0.3 + (intensity * 0.7);
      return `rgba(16, 185, 129, ${opacity})`;
    } else {
      // Красный для убытка (от светлого к темному)
      const intensity = Math.min(1, Math.abs(normalized));
      const opacity = 0.3 + (intensity * 0.7);
      return `rgba(239, 68, 68, ${opacity})`;
    }
  };

  const getCellTextColor = (value: number) => {
    return value >= 0 ? 'var(--color-accent-success)' : 'var(--color-accent-error)';
  };

  const formatValue = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  if (loading || !heatmapData) {
    return (
      <Card variant="glass" className={`performance-heatmap ${className}`}>
        <div className="heatmap-header">
          <h3 className="heatmap-title">Производительность по секторам и стратегиям</h3>
        </div>
        <div className="heatmap-skeleton">
          <Skeleton width="100%" height={400} />
        </div>
      </Card>
    );
  }

  return (
    <Card variant="glass" className={`performance-heatmap ${className}`}>
      <div className="heatmap-header">
        <h3 className="heatmap-title">Производительность по секторам и стратегиям</h3>
        <div className="heatmap-legend">
          <div className="legend-item">
            <div className="legend-color" style={{ background: 'rgba(239, 68, 68, 0.8)' }} />
            <span>Убыток</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: 'rgba(16, 185, 129, 0.8)' }} />
            <span>Прибыль</span>
          </div>
        </div>
      </div>

      <div className="heatmap-container">
        <div className="heatmap-table">
          {/* Заголовок стратегий */}
          <div className="heatmap-row heatmap-header-row">
            <div className="heatmap-cell heatmap-corner" />
            {heatmapData.strategies.map(strategy => (
              <div key={strategy} className="heatmap-cell heatmap-header-cell">
                {strategy}
              </div>
            ))}
          </div>

          {/* Строки с данными */}
          {heatmapData.sectors.map(sector => (
            <div key={sector} className="heatmap-row">
              <div className="heatmap-cell heatmap-label-cell">
                {sector}
              </div>
              {heatmapData.strategies.map(strategy => {
                const value = heatmapData.matrix[sector]?.[strategy] ?? 0;
                const cellData = heatmapData.rawData.find(
                  d => d.sector === sector && d.strategy === strategy
                );

                return (
                  <div
                    key={`${sector}-${strategy}`}
                    className="heatmap-cell heatmap-data-cell"
                    style={{
                      backgroundColor: getCellColor(value),
                      cursor: onCellClick ? 'pointer' : 'default'
                    }}
                    onClick={() => onCellClick && cellData && onCellClick(sector, strategy, cellData)}
                    title={cellData ? `${sector} / ${strategy}: ${formatValue(value)}\nПрибыль: ${cellData.profit.toFixed(2)} руб.\nСделок: ${cellData.trades}` : undefined}
                  >
                    <span 
                      className="heatmap-value"
                      style={{ color: getCellTextColor(value) }}
                    >
                      {formatValue(value)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

export default PerformanceHeatmap;

