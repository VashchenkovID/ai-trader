import React, { useMemo } from 'react';
import { Card } from '../ui/Card/Card';
import './IchimokuOverlay.css';

export interface IchimokuData {
  tenkan: number;
  kijun: number;
  senkouA: number;
  senkouB: number;
  chikou: number;
  cloudTop: number;
  cloudBottom: number;
  cloudColor: 'bullish' | 'bearish';
  signal: 'buy' | 'sell' | 'hold';
}

interface IchimokuOverlayProps {
  data: IchimokuData | null;
  labels: string[];
  prices: number[];
  className?: string;
}

export const IchimokuOverlay: React.FC<IchimokuOverlayProps> = ({
  data,
  labels,
  prices,
  className = ''
}) => {
  const chartData = useMemo(() => {
    if (!data || !labels || labels.length === 0) return null;

    // Для визуализации нужно сдвинуть Senkou Span A/B на 26 периодов вперед
    // и Chikou Span на 26 периодов назад
    const senkouA = new Array(26).fill(null).concat([data.senkouA]);
    const senkouB = new Array(26).fill(null).concat([data.senkouB]);
    const chikou = [data.chikou].concat(new Array(26).fill(null));

    return {
      labels,
      datasets: [
        {
          label: 'Tenkan-sen',
          data: [data.tenkan],
          borderColor: '#FF6B6B',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          borderDash: [],
        },
        {
          label: 'Kijun-sen',
          data: [data.kijun],
          borderColor: '#4ECDC4',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          borderDash: [],
        },
        {
          label: 'Senkou Span A',
          data: senkouA,
          borderColor: data.cloudColor === 'bullish' ? '#10B981' : '#EF4444',
          backgroundColor: data.cloudColor === 'bullish' 
            ? 'rgba(16, 185, 129, 0.2)' 
            : 'rgba(239, 68, 68, 0.2)',
          borderWidth: 1,
          pointRadius: 0,
          fill: '+1',
        },
        {
          label: 'Senkou Span B',
          data: senkouB,
          borderColor: data.cloudColor === 'bullish' ? '#10B981' : '#EF4444',
          backgroundColor: data.cloudColor === 'bullish' 
            ? 'rgba(16, 185, 129, 0.2)' 
            : 'rgba(239, 68, 68, 0.2)',
          borderWidth: 1,
          pointRadius: 0,
          fill: '-1',
        },
        {
          label: 'Chikou Span',
          data: chikou,
          borderColor: '#8B5CF6',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          borderDash: [5, 5],
        },
      ],
    };
  }, [data, labels]);

  if (!data) {
    return null;
  }

  return (
    <div className={`ichimoku-overlay ${className}`}>
      <div className="ichimoku-legend">
        <div className="legend-item">
          <div className="legend-line" style={{ borderColor: '#FF6B6B' }} />
          <span>Tenkan-sen: {data.tenkan.toFixed(2)}</span>
        </div>
        <div className="legend-item">
          <div className="legend-line" style={{ borderColor: '#4ECDC4' }} />
          <span>Kijun-sen: {data.kijun.toFixed(2)}</span>
        </div>
        <div className="legend-item">
          <div className="legend-cloud" style={{ 
            backgroundColor: data.cloudColor === 'bullish' 
              ? 'rgba(16, 185, 129, 0.3)' 
              : 'rgba(239, 68, 68, 0.3)' 
          }} />
          <span>Облако: {data.cloudColor === 'bullish' ? 'Бычье' : 'Медвежье'}</span>
        </div>
        <div className="legend-item">
          <div className="legend-line" style={{ borderColor: '#8B5CF6', borderStyle: 'dashed' }} />
          <span>Chikou Span: {data.chikou.toFixed(2)}</span>
        </div>
        <div className={`legend-signal signal-${data.signal}`}>
          <span>Сигнал: {data.signal === 'buy' ? 'Покупка' : data.signal === 'sell' ? 'Продажа' : 'Удержание'}</span>
        </div>
      </div>
    </div>
  );
};

export default IchimokuOverlay;

