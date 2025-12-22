import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar, Doughnut, Pie } from 'react-chartjs-2';
import { useTheme } from '../../../contexts/ThemeContext';
import './Chart.css';

// Регистрация компонентов Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export type ChartType = 'line' | 'bar' | 'doughnut' | 'pie';

export interface ChartProps {
  type: ChartType;
  data: any;
  options?: any;
  className?: string;
  height?: number;
}

export const Chart: React.FC<ChartProps> = ({
  type,
  data,
  options = {},
  className = '',
  height = 300,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Темная тема для графиков
  const chartOptions = useMemo(() => {
    const defaultOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: isDark ? '#F9FAFB' : '#1A1A24',
            padding: 15,
            usePointStyle: true,
            font: {
              size: 12,
              family: 'Inter, sans-serif',
            },
          },
        },
        tooltip: {
          backgroundColor: isDark ? 'rgba(26, 26, 36, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          titleColor: isDark ? '#F9FAFB' : '#1A1A24',
          bodyColor: isDark ? '#F9FAFB' : '#1A1A24',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          displayColors: true,
        },
      },
      scales: type !== 'doughnut' && type !== 'pie' ? {
        x: {
          ticks: {
            color: isDark ? '#9CA3AF' : '#6B7280',
            font: {
              size: 11,
              family: 'Inter, sans-serif',
            },
          },
          grid: {
            color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
            drawBorder: false,
          },
        },
        y: {
          ticks: {
            color: isDark ? '#9CA3AF' : '#6B7280',
            font: {
              size: 11,
              family: 'Inter, sans-serif',
            },
          },
          grid: {
            color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
            drawBorder: false,
          },
        },
      } : undefined,
      ...options,
    };

    return defaultOptions;
  }, [isDark, type, options]);

  // Обертка для рендера нужного типа графика
  const renderChart = () => {
    const chartProps = {
      data,
      options: chartOptions,
    };

    switch (type) {
      case 'line':
        return <Line {...chartProps} />;
      case 'bar':
        return <Bar {...chartProps} />;
      case 'doughnut':
        return <Doughnut {...chartProps} />;
      case 'pie':
        return <Pie {...chartProps} />;
      default:
        return <Line {...chartProps} />;
    }
  };

  return (
    <div className={`chart-wrapper ${className}`} style={{ height: `${height}px` }}>
      {renderChart()}
    </div>
  );
};

export default Chart;
