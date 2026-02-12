import React from 'react';
import { Card } from '../ui';
import './FundamentalMetricsWidget.css';

interface FundamentalMetrics {
  // Оценка
  pe?: number; // P/E (Price/Earnings)
  pb?: number; // P/B (Price/Book)
  ps?: number; // P/S (Price/Sales)
  evEbitda?: number; // EV/EBITDA
  
  // Дивиденды
  dividendYield?: number; // Дивидендная доходность (%)
  dividendPerShare?: number; // Дивиденды на акцию
  
  // Капитализация
  marketCap?: number; // Рыночная капитализация
  
  // Прибыльность
  eps?: number; // EPS (Earnings Per Share)
  roe?: number; // ROE (Return on Equity) (%)
  roa?: number; // ROA (Return on Assets) (%)
  profitMargin?: number; // Маржа прибыли (%)
  
  // Финансовая устойчивость
  debtToEquity?: number; // Debt/Equity
  currentRatio?: number; // Текущий коэффициент
  quickRatio?: number; // Коэффициент быстрой ликвидности
  
  // Сравнение с сектором (опционально)
  sectorPe?: number;
  sectorPb?: number;
  sectorDividendYield?: number;
}

interface FundamentalMetricsWidgetProps {
  metrics: FundamentalMetrics;
  currency?: string;
}

const FundamentalMetricsWidget: React.FC<FundamentalMetricsWidgetProps> = ({
  metrics,
  currency = 'RUB'
}) => {
  const formatCurrency = (value: number) => {
    if (value >= 1e12) {
      return `${(value / 1e12).toFixed(2)} трлн`;
    } else if (value >= 1e9) {
      return `${(value / 1e9).toFixed(2)} млрд`;
    } else if (value >= 1e6) {
      return `${(value / 1e6).toFixed(2)} млн`;
    } else if (value >= 1e3) {
      return `${(value / 1e3).toFixed(2)} тыс`;
    }
    return value.toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const compareWithSector = (value?: number, sectorValue?: number): 'better' | 'worse' | 'neutral' | null => {
    if (value === undefined || sectorValue === undefined) return null;
    // Для P/E и P/B меньше лучше, для остальных больше лучше
    const threshold = 0.1; // 10% разница считается значимой
    const diff = (value - sectorValue) / sectorValue;
    
    if (Math.abs(diff) < threshold) return 'neutral';
    return diff < 0 ? 'better' : 'worse';
  };

  const renderMetric = (
    label: string,
    value: number | undefined,
    formatter: (val: number) => string = (v) => v.toFixed(2),
    sectorValue?: number,
    _isLowerBetter: boolean = false
  ) => {
    if (value === undefined) return null;

    const comparison = compareWithSector(value, sectorValue);
    const comparisonClass = comparison ? `fundamental-metrics-widget__metric-value--${comparison}` : '';

    return (
      <div className="fundamental-metrics-widget__metric">
        <div className="fundamental-metrics-widget__metric-label">{label}</div>
        <div className={`fundamental-metrics-widget__metric-value ${comparisonClass}`}>
          {formatter(value)}
          {sectorValue !== undefined && (
            <span className="fundamental-metrics-widget__metric-sector">
              (сектор: {formatter(sectorValue)})
            </span>
          )}
        </div>
      </div>
    );
  };

  const hasAnyMetrics = Object.values(metrics).some(v => v !== undefined && v !== null);

  if (!hasAnyMetrics) {
    return (
      <Card className="fundamental-metrics-widget">
        <div className="fundamental-metrics-widget__header">
          <h3 className="fundamental-metrics-widget__title">Фундаментальные показатели</h3>
        </div>
        <div className="fundamental-metrics-widget__empty">
          Данные недоступны
        </div>
      </Card>
    );
  }

  return (
    <Card className="fundamental-metrics-widget">
      <div className="fundamental-metrics-widget__header">
        <h3 className="fundamental-metrics-widget__title">Фундаментальные показатели</h3>
      </div>
      
      <div className="fundamental-metrics-widget__content">
        {/* Оценка */}
        {(metrics.pe !== undefined || metrics.pb !== undefined || metrics.ps !== undefined) && (
          <div className="fundamental-metrics-widget__section">
            <div className="fundamental-metrics-widget__section-title">Оценка</div>
            <div className="fundamental-metrics-widget__section-content">
              {renderMetric('P/E', metrics.pe, (v) => v.toFixed(2), metrics.sectorPe, true)}
              {renderMetric('P/B', metrics.pb, (v) => v.toFixed(2), metrics.sectorPb, true)}
              {renderMetric('P/S', metrics.ps, (v) => v.toFixed(2))}
              {renderMetric('EV/EBITDA', metrics.evEbitda, (v) => v.toFixed(2))}
            </div>
          </div>
        )}

        {/* Дивиденды */}
        {(metrics.dividendYield !== undefined || metrics.dividendPerShare !== undefined) && (
          <div className="fundamental-metrics-widget__section">
            <div className="fundamental-metrics-widget__section-title">Дивиденды</div>
            <div className="fundamental-metrics-widget__section-content">
              {renderMetric('Див. доходность', metrics.dividendYield, formatPercent, metrics.sectorDividendYield)}
              {renderMetric('Див. на акцию', metrics.dividendPerShare, (v) => `${formatCurrency(v)} ${currency}`)}
            </div>
          </div>
        )}

        {/* Капитализация */}
        {metrics.marketCap !== undefined && (
          <div className="fundamental-metrics-widget__section">
            <div className="fundamental-metrics-widget__section-title">Капитализация</div>
            <div className="fundamental-metrics-widget__section-content">
              {renderMetric('Рыночная капитализация', metrics.marketCap, (v) => `${formatCurrency(v)} ${currency}`)}
            </div>
          </div>
        )}

        {/* Прибыльность */}
        {(metrics.eps !== undefined || metrics.roe !== undefined || metrics.roa !== undefined || metrics.profitMargin !== undefined) && (
          <div className="fundamental-metrics-widget__section">
            <div className="fundamental-metrics-widget__section-title">Прибыльность</div>
            <div className="fundamental-metrics-widget__section-content">
              {renderMetric('EPS', metrics.eps, (v) => `${formatCurrency(v)} ${currency}`)}
              {renderMetric('ROE', metrics.roe, formatPercent)}
              {renderMetric('ROA', metrics.roa, formatPercent)}
              {renderMetric('Маржа прибыли', metrics.profitMargin, formatPercent)}
            </div>
          </div>
        )}

        {/* Финансовая устойчивость */}
        {(metrics.debtToEquity !== undefined || metrics.currentRatio !== undefined || metrics.quickRatio !== undefined) && (
          <div className="fundamental-metrics-widget__section">
            <div className="fundamental-metrics-widget__section-title">Финансовая устойчивость</div>
            <div className="fundamental-metrics-widget__section-content">
              {renderMetric('Debt/Equity', metrics.debtToEquity, (v) => v.toFixed(2), undefined, true)}
              {renderMetric('Текущий коэффициент', metrics.currentRatio, (v) => v.toFixed(2))}
              {renderMetric('Коэф. быстрой ликвидности', metrics.quickRatio, (v) => v.toFixed(2))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default FundamentalMetricsWidget;

