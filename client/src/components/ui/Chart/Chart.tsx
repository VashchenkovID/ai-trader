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
  const { themeName } = useTheme();
  const isDark = themeName === 'dark';

  // Темная тема для графиков с использованием дизайн-системы
  const chartOptions = useMemo(() => {
    // Получаем цвета из CSS переменных
    const textPrimary = isDark ? '#F9FAFB' : '#1A1A24';
    const textSecondary = isDark ? '#9CA3AF' : '#6B7280';
    // const textTertiary = isDark ? '#6B7280' : '#9CA3AF'; // Reserved for future use
    const borderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    const tooltipBg = isDark ? 'rgba(26, 26, 36, 0.95)' : 'rgba(255, 255, 255, 0.95)';

    const defaultOptions = {
      responsive: true,
      maintainAspectRatio: false,
      // Прозрачный фон для области графика
      backgroundColor: 'transparent',
      // Layout для контроля отступов и фона
      layout: {
        padding: {
          top: 10,
          bottom: 10,
          left: 10,
          right: 10,
        },
      },
      // Отключаем анимацию по умолчанию для лучшей производительности
      animation: {
        duration: 750,
      },
      // Настройки для canvas
      elements: {
        arc: {
          borderWidth: 2,
          borderColor: borderColor,
        },
        bar: {
          borderWidth: 0,
        },
      },
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: {
            color: textPrimary,
            padding: 15,
            usePointStyle: true,
            font: {
              size: 12,
              family: 'Inter, sans-serif',
              weight: '500',
            },
            boxWidth: 12,
            boxHeight: 12,
            // Стили для точек в легенде
            pointStyle: 'circle',
          },
        },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: textPrimary,
          bodyColor: textPrimary,
          borderColor: borderColor,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          displayColors: true,
          titleFont: {
            family: 'Inter, sans-serif',
            size: 13,
            weight: '600',
          },
          bodyFont: {
            family: 'Inter, sans-serif',
            size: 12,
          },
          boxPadding: 6,
          // Стили для цветных квадратиков в tooltip
          callbacks: {
            labelColor: function(context: any) {
              return {
                borderColor: context.dataset.backgroundColor || context.dataset.borderColor,
                backgroundColor: context.dataset.backgroundColor || context.dataset.borderColor,
              };
            },
          },
        },
      },
      scales: type !== 'doughnut' && type !== 'pie' ? {
        x: {
          ticks: {
            color: textSecondary,
            font: {
              size: 11,
              family: 'Inter, sans-serif',
            },
          },
          grid: {
            color: borderColor,
            drawBorder: false,
            lineWidth: 1,
          },
          border: {
            color: borderColor,
            display: false,
          },
        },
        y: {
          ticks: {
            color: textSecondary,
            font: {
              size: 11,
              family: 'Inter, sans-serif',
            },
            callback: options?.scales?.y?.ticks?.callback,
          },
          grid: {
            color: borderColor,
            drawBorder: false,
            lineWidth: 1,
          },
          border: {
            color: borderColor,
            display: false,
          },
          beginAtZero: options?.scales?.y?.beginAtZero !== false,
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
    <div 
      className={`chart-wrapper ${className}`} 
      style={{ 
        height: `${height}px`,
        background: isDark ? 'transparent' : 'var(--color-surface-default)',
      }}
    >
      {renderChart()}
    </div>
  );
};

export default Chart;
