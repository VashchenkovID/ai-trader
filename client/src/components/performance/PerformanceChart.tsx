import React, { useMemo } from 'react';
import { Chart } from '../ui/Chart/Chart';
import './PerformanceChart.css';

export type ChartPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface PerformanceChartProps {
  type: 'returns' | 'pnl-distribution' | 'drawdown';
  data: any;
  period?: ChartPeriod;
  height?: number;
  className?: string;
}

export const PerformanceChart: React.FC<PerformanceChartProps> = ({
  type,
  data,
  period: _period = 'month', // Reserved for future use
  height = 300,
  className = ''
}) => {
  const chartData = useMemo(() => {
    if (!data) return null;

    switch (type) {
      case 'returns':
        return {
          labels: data.labels || [],
          datasets: [
            {
              label: 'Доходность',
              data: data.returns || [],
              borderColor: '#3B82F6', // Синий
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              borderWidth: 2,
              fill: true,
              tension: 0.4,
              pointRadius: 3,
              pointHoverRadius: 5,
              pointBackgroundColor: '#3B82F6',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 2,
            },
            {
              label: 'Накопленная доходность',
              data: data.cumulativeReturns || [],
              borderColor: '#10B981', // Зеленый
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              borderWidth: 2,
              fill: false,
              tension: 0.4,
              pointRadius: 3,
              pointHoverRadius: 5,
              pointBackgroundColor: '#10B981',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 2,
            },
          ],
        };

      case 'pnl-distribution':
        // Обрабатываем данные: бэкенд может вернуть либо массив объектов bins, либо уже обработанные данные
        const binsData = data.bins || [];
        const isBinsArray = Array.isArray(binsData) && binsData.length > 0 && typeof binsData[0] === 'object';
        
        // Извлекаем labels и frequencies в зависимости от формата данных
        let labels: string[] = [];
        let frequencies: number[] = [];
        let avgPnLs: number[] = [];
        
        if (isBinsArray) {
          // Формат от бэкенда: массив объектов {label, count, totalPnL, avgPnL}
          // Форматируем label - показываем только средний PnL
          labels = binsData.map((bin: any) => {
            const avgPnL = bin.avgPnL || 0;
            // Форматируем средний PnL с разделителями тысяч
            const formattedAvgPnL = avgPnL.toLocaleString('ru-RU', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            });
            return `${avgPnL >= 0 ? '+' : ''}${formattedAvgPnL} ₽`;
          });
          frequencies = binsData.map((bin: any) => bin.count || 0);
          avgPnLs = binsData.map((bin: any) => bin.avgPnL || 0);
        } else {
          // Формат уже обработанный: bins - массив чисел, frequencies - массив частот
          labels = (data.bins || []).map((bin: number) => `${bin.toFixed(0)} ₽`);
          frequencies = data.frequencies || [];
          avgPnLs = data.bins || [];
        }
        
        // Создаем градиент цветов: красный для убытков, зеленый для прибылей
        const generateColors = (avgPnLValues: number[]) => {
          if (!avgPnLValues || avgPnLValues.length === 0) return [];
          
          return avgPnLValues.map((avgPnL: number) => {
            if (avgPnL < 0) {
              // Убытки - оттенки красного
              const intensity = Math.min(Math.abs(avgPnL) / 1000, 1); // Нормализуем до 0-1
              return `rgba(239, 68, 68, ${0.6 + intensity * 0.4})`; // От 0.6 до 1.0 прозрачности
            } else if (avgPnL > 0) {
              // Прибыли - оттенки зеленого
              const intensity = Math.min(avgPnL / 1000, 1);
              return `rgba(16, 185, 129, ${0.6 + intensity * 0.4})`;
            } else {
              // Ноль - серый
              return 'rgba(156, 163, 175, 0.6)';
            }
          });
        };
        
        return {
          labels: labels,
          datasets: [
            {
              label: 'Количество сделок',
              data: frequencies,
              backgroundColor: generateColors(avgPnLs),
              borderColor: avgPnLs.map((avgPnL: number) => 
                avgPnL < 0 ? '#EF4444' : avgPnL > 0 ? '#10B981' : '#9CA3AF'
              ),
              borderWidth: 1.5,
              borderRadius: 4,
              // Сохраняем avgPnLs для использования в tooltip
              avgPnLs: avgPnLs,
            },
          ],
        };

      case 'drawdown':
        return {
          labels: data.labels || [],
          datasets: [
            {
              label: 'Просадка',
              data: data.drawdown || [],
              borderColor: '#EF4444', // Красный
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              borderWidth: 2,
              fill: true,
              tension: 0.4,
              pointRadius: 3,
              pointHoverRadius: 5,
              pointBackgroundColor: '#EF4444',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 2,
            },
          ],
        };

      default:
        return null;
    }
  }, [type, data]);

  const chartOptions = useMemo(() => {
    // Сохраняем chartData для использования в callbacks
    const currentChartData = chartData;
    const baseOptions: any = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: {
            color: '#FFFFFF', // Белый цвет для текста легенды
            padding: 15,
            usePointStyle: true,
            font: {
              size: 12,
              weight: '500',
            },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(26, 26, 36, 0.95)', // Темный фон для tooltip
          titleColor: '#FFFFFF', // Белый цвет для заголовка
          bodyColor: '#FFFFFF', // Белый цвет для текста
          borderColor: 'rgba(255, 255, 255, 0.2)', // Светлая граница
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          titleFont: {
            size: 13,
            weight: '600',
          },
          bodyFont: {
            size: 12,
          },
          displayColors: true, // Показывать цветные индикаторы
          callbacks: type === 'pnl-distribution' ? {
            title: (tooltipItems: any[]) => {
              if (tooltipItems.length > 0) {
                const item = tooltipItems[0];
                const label = item.label || '';
                return `Диапазон: ${label}`;
              }
              return '';
            },
            label: (context: any) => {
              const value = context.parsed.y || 0;
              const index = context.dataIndex;
              
              // Получаем avgPnL из dataset
              let avgPnL = 0;
              if (context.dataset && context.dataset.avgPnLs && context.dataset.avgPnLs[index] !== undefined) {
                avgPnL = context.dataset.avgPnLs[index];
              }
              
              const lines = [
                `Количество сделок: ${value}`,
              ];
              
              if (avgPnL !== 0 || index < (context.dataset?.avgPnLs?.length || 0)) {
                const formattedPnL = avgPnL.toLocaleString('ru-RU', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                });
                lines.push(`Средний P&L: ${avgPnL >= 0 ? '+' : ''}${formattedPnL} ₽`);
              }
              
              return lines;
            },
          } : undefined,
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#FFFFFF', // Белый цвет для текста оси X
            font: {
              size: 11,
            },
            maxRotation: type === 'returns' || type === 'drawdown' ? 45 : 45,
            minRotation: type === 'returns' || type === 'drawdown' ? 45 : 45,
            callback: type === 'returns' || type === 'drawdown'
              ? function(value: any) {
                  // Получаем label из currentChartData через замыкание
                  if (currentChartData && currentChartData.labels && currentChartData.labels[value] !== undefined) {
                    const label = currentChartData.labels[value];
                    // Форматируем дату в читаемый формат
                    if (label && typeof label === 'string') {
                      try {
                        const date = new Date(label);
                        if (!isNaN(date.getTime())) {
                          // Формат: "27.01" или "27 янв" в зависимости от периода
                          const day = date.getDate();
                          const month = date.getMonth() + 1;
                          return `${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}`;
                        }
                      } catch (e) {
                        // Если не удалось распарсить дату, возвращаем как есть
                      }
                    }
                    return label;
                  }
                  return '';
                }
              : type === 'pnl-distribution'
              ? function(value: any) {
                  // Получаем label из currentChartData через замыкание
                  if (currentChartData && currentChartData.labels && currentChartData.labels[value] !== undefined) {
                    const label = currentChartData.labels[value];
                    // Label уже содержит средний PnL, просто возвращаем его
                    return label;
                  }
                  return '';
                }
              : undefined,
          },
          grid: {
            color: 'var(--color-border-default)',
          },
          title: {
            display: type === 'returns' || type === 'drawdown' || type === 'pnl-distribution',
            text: type === 'returns' || type === 'drawdown' ? 'Дата' : 'Прибыль/убыток (₽)',
            color: '#FFFFFF',
            font: {
              size: 12,
            },
          },
        },
        y: {
          ticks: {
            color: '#FFFFFF', // Белый цвет для текста оси Y
            font: {
              size: 11,
            },
            callback: type === 'returns'
              ? function(value: any) {
                  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
                }
              : type === 'drawdown'
              ? function(value: any) {
                  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
                }
              : type === 'pnl-distribution'
              ? function(value: any) {
                  return `${value}`; // Для распределения PnL показываем просто число
                }
              : undefined,
          },
          grid: {
            color: 'var(--color-border-default)',
          },
          title: {
            display: type === 'pnl-distribution',
            text: 'Количество сделок',
            color: '#FFFFFF',
            font: {
              size: 12,
            },
          },
        },
      },
    };

    if (type === 'pnl-distribution') {
      baseOptions.scales.y.beginAtZero = true;
    }

    return baseOptions;
  }, [type]);

  if (!chartData) {
    return (
      <div className={`performance-chart-skeleton ${className}`}>
        <div className="skeleton-placeholder" style={{ height: `${height}px` }} />
      </div>
    );
  }

  const chartType = type === 'pnl-distribution' ? 'bar' : 'line';

  return (
    <div className={`performance-chart ${className}`}>
      <Chart
        type={chartType}
        data={chartData}
        options={chartOptions}
        height={height}
      />
    </div>
  );
};

export default PerformanceChart;

