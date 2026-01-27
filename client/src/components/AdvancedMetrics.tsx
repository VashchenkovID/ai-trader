import React, { useState, useEffect, useRef } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { TabView, TabPanel } from 'primereact/tabview';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Chart } from 'primereact/chart';
import { Toast } from 'primereact/toast';
import { SelectButton } from 'primereact/selectbutton';
import { Calendar } from 'primereact/calendar';
import { Dropdown } from 'primereact/dropdown';
import { apiService } from '../services/apiService';
import {
  AdvancedMetricsSummaryResponse,
  PeriodType,
  // AdvancedMetrics, // Reserved for future use
  // BaseMetrics, // Reserved for future use
  PeriodAnalysis,
  DayOfWeekAnalysis,
  // MonthStats // Reserved for future use
} from '../types/advancedMetrics';

interface AdvancedMetricsProps {
  className?: string;
}

const AdvancedMetricsComponent: React.FC<AdvancedMetricsProps> = ({ className = '' }) => {
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<PeriodType>('daily');
  const [days, setDays] = useState(30);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [summaryData, setSummaryData] = useState<AdvancedMetricsSummaryResponse | null>(null);
  const [periodAnalysis, setPeriodAnalysis] = useState<PeriodAnalysis | null>(null);
  const toast = useRef<Toast>(null);

  const periodOptions = [
    { label: 'День', value: 'daily' },
    { label: 'Неделя', value: 'weekly' },
    { label: 'Месяц', value: 'monthly' }
  ];

  const daysOptions = [
    { label: '7 дней', value: 7 },
    { label: '30 дней', value: 30 },
    { label: '90 дней', value: 90 },
    { label: '180 дней', value: 180 },
    { label: '365 дней', value: 365 }
  ];

  // Загрузка данных
  const loadData = async () => {
    try {
      setLoading(true);
      
      const [summaryResponse, periodAnalysisResponse] = await Promise.all([
        apiService.getAdvancedMetricsSummary(period, days),
        apiService.getPeriodAnalysis(
          period,
          startDate?.toISOString(),
          endDate?.toISOString()
        )
      ]);

      if (summaryResponse.success) {
        setSummaryData(summaryResponse);
      } else {
        toast.current?.show({
          severity: 'warn',
          summary: 'Предупреждение',
          detail: 'Не удалось загрузить сводку метрик'
        });
      }

      if (periodAnalysisResponse.success) {
        setPeriodAnalysis(periodAnalysisResponse.data);
      } else if (periodAnalysisResponse.message) {
        // Это нормально, если нет данных
        setPeriodAnalysis(null);
      }
    } catch (error: any) {
      console.error('Error loading advanced metrics:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: error.message || 'Не удалось загрузить данные'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [period, days]);

  // Форматирование чисел
  const formatNumber = (value: number | null | undefined, decimals: number = 2): string => {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    return value.toFixed(decimals);
  };

  const formatPercent = (value: number | null | undefined): string => {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    return `${value.toFixed(2)}%`;
  };

  // Получение цвета для метрики
  const getMetricColor = (value: number | null | undefined, threshold: number = 0): string => {
    if (value === null || value === undefined || isNaN(value)) return 'gray';
    return value >= threshold ? 'green' : 'red';
  };

  // Данные для графика метрик
  const getMetricsChartData = () => {
    if (!summaryData?.data) return null;

    const { baseMetrics, advancedMetrics } = summaryData.data;

    return {
      labels: ['Sharpe', 'Sortino', 'Calmar', 'Information'],
      datasets: [
        {
          label: 'Коэффициенты',
          data: [
            baseMetrics.sharpeRatio || 0,
            advancedMetrics.sortinoRatio || 0,
            advancedMetrics.calmarRatio || 0,
            advancedMetrics.informationRatio || 0
          ],
          backgroundColor: [
            'rgba(54, 162, 235, 0.6)',
            'rgba(75, 192, 192, 0.6)',
            'rgba(255, 159, 64, 0.6)',
            'rgba(153, 102, 255, 0.6)'
          ],
          borderColor: [
            'rgba(54, 162, 235, 1)',
            'rgba(75, 192, 192, 1)',
            'rgba(255, 159, 64, 1)',
            'rgba(153, 102, 255, 1)'
          ],
          borderWidth: 2
        }
      ]
    };
  };

  // Данные для графика MAE/MFE
  const getMAEMFEChartData = () => {
    if (!summaryData?.data?.advancedMetrics) return null;

    const { mae, mfe } = summaryData.data.advancedMetrics;

    return {
      labels: ['MAE', 'MFE'],
      datasets: [
        {
          label: 'Процент',
          data: [mae || 0, mfe || 0],
          backgroundColor: [
            'rgba(239, 68, 68, 0.6)',
            'rgba(16, 185, 129, 0.6)'
          ],
          borderColor: [
            'rgba(239, 68, 68, 1)',
            'rgba(16, 185, 129, 1)'
          ],
          borderWidth: 2
        }
      ]
    };
  };

  // Данные для графика по дням недели
  const getDayOfWeekChartData = () => {
    if (!periodAnalysis?.byDayOfWeek) return null;

    const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const profits = dayKeys.map(key => periodAnalysis.byDayOfWeek?.[key as keyof DayOfWeekAnalysis]?.profit || 0);

    return {
      labels: dayNames,
      datasets: [
        {
          label: 'Прибыль (₽)',
          data: profits,
          backgroundColor: profits.map(p => p >= 0 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)'),
          borderColor: profits.map(p => p >= 0 ? 'rgba(16, 185, 129, 1)' : 'rgba(239, 68, 68, 1)'),
          borderWidth: 2
        }
      ]
    };
  };

  // Данные для графика по месяцам
  const getMonthChartData = () => {
    if (!periodAnalysis?.byMonth || periodAnalysis.byMonth.length === 0) return null;

    const sortedMonths = [...periodAnalysis.byMonth].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.monthIndex - b.monthIndex;
    });

    return {
      labels: sortedMonths.map(m => `${m.month} ${m.year}`),
      datasets: [
        {
          label: 'Прибыль (₽)',
          data: sortedMonths.map(m => m.totalProfit),
          backgroundColor: sortedMonths.map(m => m.totalProfit >= 0 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)'),
          borderColor: sortedMonths.map(m => m.totalProfit >= 0 ? 'rgba(16, 185, 129, 1)' : 'rgba(239, 68, 68, 1)'),
          borderWidth: 2
        }
      ]
    };
  };

  // Heatmap данные для дней недели
  const getDayOfWeekHeatmapData = () => {
    if (!periodAnalysis?.byDayOfWeek) return null;

    const dayNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    return dayKeys.map((key, index) => {
      const dayData = periodAnalysis.byDayOfWeek?.[key as keyof DayOfWeekAnalysis];
      return {
        day: dayNames[index],
        profit: dayData?.profit || 0,
        trades: dayData?.trades || 0,
        winRate: dayData?.winRate || 0,
        avgProfit: dayData?.avgProfit || 0
      };
    });
  };

  // Экспорт данных
  const exportData = () => {
    if (!summaryData?.data) return;

    const data = {
      period,
      days,
      timestamp: new Date().toISOString(),
      baseMetrics: summaryData.data.baseMetrics,
      advancedMetrics: summaryData.data.advancedMetrics,
      periodAnalysis: periodAnalysis
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `advanced-metrics-${period}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.current?.show({
      severity: 'success',
      summary: 'Успешно',
      detail: 'Данные экспортированы'
    });
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };

  const barChartOptions = {
    ...chartOptions,
    plugins: {
      legend: {
        display: false
      }
    }
  };

  return (
    <div className={`advanced-metrics ${className}`}>
      <Toast ref={toast} />
      
      {/* Заголовок и фильтры */}
      <Card className="mb-4">
        <div className="flex justify-content-between align-items-center mb-3 flex-wrap gap-3">
          <h2 className="m-0">📊 Продвинутые метрики производительности</h2>
          <div className="flex align-items-center gap-2">
            <Button
              icon="pi pi-refresh"
              label="Обновить"
              onClick={loadData}
              loading={loading}
              className="p-button-outlined"
            />
            <Button
              icon="pi pi-download"
              label="Экспорт"
              onClick={exportData}
              className="p-button-outlined"
              disabled={!summaryData}
            />
          </div>
        </div>

        <div className="grid">
          <div className="col-12 md:col-6 lg:col-3">
            <label className="block mb-2">Период</label>
            <SelectButton
              value={period}
              options={periodOptions}
              onChange={(e) => setPeriod(e.value)}
            />
          </div>
          <div className="col-12 md:col-6 lg:col-3">
            <label className="block mb-2">Количество дней</label>
            <Dropdown
              value={days}
              options={daysOptions}
              onChange={(e) => setDays(e.value)}
              placeholder="Выберите период"
            />
          </div>
          <div className="col-12 md:col-6 lg:col-3">
            <label className="block mb-2">Начальная дата</label>
            <Calendar
              value={startDate}
              onChange={(e) => setStartDate(e.value as Date)}
              dateFormat="dd.mm.yy"
              showIcon
              placeholder="Выберите дату"
            />
          </div>
          <div className="col-12 md:col-6 lg:col-3">
            <label className="block mb-2">Конечная дата</label>
            <Calendar
              value={endDate}
              onChange={(e) => setEndDate(e.value as Date)}
              dateFormat="dd.mm.yy"
              showIcon
              placeholder="Выберите дату"
            />
          </div>
        </div>
      </Card>

      {loading && !summaryData ? (
        <Card>
          <div className="text-center p-4">
            <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem' }}></i>
            <p className="mt-3">Загрузка данных...</p>
          </div>
        </Card>
      ) : !summaryData ? (
        <Card>
          <div className="text-center p-4 text-600">
            Нет данных для отображения
          </div>
        </Card>
      ) : (
        <TabView>
          {/* Вкладка: Обзор метрик */}
          <TabPanel header="📈 Обзор метрик">
            <div className="grid">
              {/* Базовые метрики */}
              <div className="col-12 lg:col-6">
                <Card title="Базовые метрики" className="h-full">
                  <div className="grid">
                    <div className="col-6">
                      <div className="text-center p-3 border-round surface-border">
                        <div className="text-2xl font-bold text-blue-500">
                          {formatPercent(summaryData.data.baseMetrics.totalReturn)}
                        </div>
                        <div className="text-sm text-600 mt-2">Общая доходность</div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="text-center p-3 border-round surface-border">
                        <div className="text-2xl font-bold text-green-500">
                          {formatPercent(summaryData.data.baseMetrics.winRate)}
                        </div>
                        <div className="text-sm text-600 mt-2">Win Rate</div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="text-center p-3 border-round surface-border">
                        <div className="text-2xl font-bold text-purple-500">
                          {formatNumber(summaryData.data.baseMetrics.sharpeRatio)}
                        </div>
                        <div className="text-sm text-600 mt-2">Sharpe Ratio</div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="text-center p-3 border-round surface-border">
                        <div className="text-2xl font-bold text-red-500">
                          {formatPercent(summaryData.data.baseMetrics.maxDrawdown)}
                        </div>
                        <div className="text-sm text-600 mt-2">Max Drawdown</div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Продвинутые метрики */}
              <div className="col-12 lg:col-6">
                <Card title="Продвинутые метрики" className="h-full">
                  <div className="grid">
                    <div className="col-6">
                      <div className="text-center p-3 border-round surface-border">
                        <div className={`text-2xl font-bold text-${getMetricColor(summaryData.data.advancedMetrics.sortinoRatio, 1)}-500`}>
                          {formatNumber(summaryData.data.advancedMetrics.sortinoRatio)}
                        </div>
                        <div className="text-sm text-600 mt-2">Sortino Ratio</div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="text-center p-3 border-round surface-border">
                        <div className={`text-2xl font-bold text-${getMetricColor(summaryData.data.advancedMetrics.calmarRatio, 1)}-500`}>
                          {formatNumber(summaryData.data.advancedMetrics.calmarRatio)}
                        </div>
                        <div className="text-sm text-600 mt-2">Calmar Ratio</div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="text-center p-3 border-round surface-border">
                        <div className="text-2xl font-bold text-orange-500">
                          {summaryData.data.advancedMetrics.informationRatio !== null 
                            ? formatNumber(summaryData.data.advancedMetrics.informationRatio)
                            : 'N/A'}
                        </div>
                        <div className="text-sm text-600 mt-2">Information Ratio</div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="text-center p-3 border-round surface-border">
                        <Badge
                          value={summaryData.data.advancedMetrics.maeMfeAvailable ? 'Доступно' : 'Недоступно'}
                          severity={summaryData.data.advancedMetrics.maeMfeAvailable ? 'success' : 'warning'}
                        />
                        <div className="text-sm text-600 mt-2">MAE/MFE</div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* График метрик */}
              <div className="col-12">
                <Card title="Сравнение коэффициентов">
                  <div style={{ height: '300px' }}>
                    {getMetricsChartData() ? (
                      <Chart type="bar" data={getMetricsChartData()!} options={chartOptions} />
                    ) : (
                      <div className="flex align-items-center justify-content-center h-full text-600">
                        Нет данных для отображения
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </TabPanel>

          {/* Вкладка: MAE/MFE */}
          <TabPanel header="📉 MAE/MFE">
            <div className="grid">
              <div className="col-12 lg:col-6">
                <Card title="Maximum Adverse Excursion (MAE)" className="h-full">
                  <div className="text-center p-4">
                    <div className="text-4xl font-bold text-red-500 mb-2">
                      {formatPercent(summaryData.data.advancedMetrics.mae)}
                    </div>
                    <p className="text-600">
                      Максимальное неблагоприятное отклонение цены от точки входа
                    </p>
                  </div>
                </Card>
              </div>
              <div className="col-12 lg:col-6">
                <Card title="Maximum Favorable Excursion (MFE)" className="h-full">
                  <div className="text-center p-4">
                    <div className="text-4xl font-bold text-green-500 mb-2">
                      {formatPercent(summaryData.data.advancedMetrics.mfe)}
                    </div>
                    <p className="text-600">
                      Максимальное благоприятное отклонение цены от точки входа
                    </p>
                  </div>
                </Card>
              </div>
              <div className="col-12">
                <Card title="Сравнение MAE и MFE">
                  <div style={{ height: '300px' }}>
                    {getMAEMFEChartData() ? (
                      <Chart type="bar" data={getMAEMFEChartData()!} options={barChartOptions} />
                    ) : (
                      <div className="flex align-items-center justify-content-center h-full text-600">
                        Нет данных для отображения
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </TabPanel>

          {/* Вкладка: Анализ по периодам */}
          <TabPanel header="📅 Анализ по периодам">
            {periodAnalysis ? (
              <div className="grid">
                {/* Лучшие/худшие периоды */}
                <div className="col-12 lg:col-6">
                  <Card title="Лучшие периоды" className="h-full">
                    {periodAnalysis.bestDay && (
                      <div className="mb-3 p-3 border-round surface-border">
                        <div className="flex justify-content-between align-items-center mb-2">
                          <span className="font-semibold">Лучший день недели:</span>
                          <Badge value={periodAnalysis.bestDay.period} severity="success" />
                        </div>
                        <div className="text-sm text-600">
                          Прибыль: {formatNumber(periodAnalysis.bestDay.profit)} ₽
                        </div>
                        <div className="text-sm text-600">
                          Сделок: {periodAnalysis.bestDay.trades}
                        </div>
                        <div className="text-sm text-600">
                          Win Rate: {formatPercent(periodAnalysis.bestDay.winRate)}
                        </div>
                      </div>
                    )}
                    {periodAnalysis.bestMonth && (
                      <div className="p-3 border-round surface-border">
                        <div className="flex justify-content-between align-items-center mb-2">
                          <span className="font-semibold">Лучший месяц:</span>
                          <Badge value={periodAnalysis.bestMonth.period} severity="success" />
                        </div>
                        <div className="text-sm text-600">
                          Прибыль: {formatNumber(periodAnalysis.bestMonth.profit)} ₽
                        </div>
                        <div className="text-sm text-600">
                          Сделок: {periodAnalysis.bestMonth.trades}
                        </div>
                      </div>
                    )}
                  </Card>
                </div>

                <div className="col-12 lg:col-6">
                  <Card title="Худшие периоды" className="h-full">
                    {periodAnalysis.worstDay && (
                      <div className="mb-3 p-3 border-round surface-border">
                        <div className="flex justify-content-between align-items-center mb-2">
                          <span className="font-semibold">Худший день недели:</span>
                          <Badge value={periodAnalysis.worstDay.period} severity="danger" />
                        </div>
                        <div className="text-sm text-600">
                          Прибыль: {formatNumber(periodAnalysis.worstDay.profit)} ₽
                        </div>
                        <div className="text-sm text-600">
                          Сделок: {periodAnalysis.worstDay.trades}
                        </div>
                        <div className="text-sm text-600">
                          Win Rate: {formatPercent(periodAnalysis.worstDay.winRate)}
                        </div>
                      </div>
                    )}
                    {periodAnalysis.worstMonth && (
                      <div className="p-3 border-round surface-border">
                        <div className="flex justify-content-between align-items-center mb-2">
                          <span className="font-semibold">Худший месяц:</span>
                          <Badge value={periodAnalysis.worstMonth.period} severity="danger" />
                        </div>
                        <div className="text-sm text-600">
                          Прибыль: {formatNumber(periodAnalysis.worstMonth.profit)} ₽
                        </div>
                        <div className="text-sm text-600">
                          Сделок: {periodAnalysis.worstMonth.trades}
                        </div>
                      </div>
                    )}
                  </Card>
                </div>

                {/* График по дням недели */}
                <div className="col-12 lg:col-6">
                  <Card title="Прибыльность по дням недели">
                    <div style={{ height: '300px' }}>
                      {getDayOfWeekChartData() ? (
                        <Chart type="bar" data={getDayOfWeekChartData()!} options={barChartOptions} />
                      ) : (
                        <div className="flex align-items-center justify-content-center h-full text-600">
                          Нет данных для отображения
                        </div>
                      )}
                    </div>
                  </Card>
                </div>

                {/* График по месяцам */}
                <div className="col-12 lg:col-6">
                  <Card title="Прибыльность по месяцам">
                    <div style={{ height: '300px' }}>
                      {getMonthChartData() ? (
                        <Chart type="bar" data={getMonthChartData()!} options={barChartOptions} />
                      ) : (
                        <div className="flex align-items-center justify-content-center h-full text-600">
                          Нет данных для отображения
                        </div>
                      )}
                    </div>
                  </Card>
                </div>

                {/* Таблица по дням недели */}
                <div className="col-12">
                  <Card title="Детальная статистика по дням недели">
                    <DataTable
                      value={getDayOfWeekHeatmapData() || []}
                      emptyMessage="Нет данных"
                      className="p-datatable-sm"
                    >
                      <Column field="day" header="День недели" />
                      <Column
                        field="profit"
                        header="Прибыль (₽)"
                        body={(rowData) => (
                          <span className={rowData.profit >= 0 ? 'text-green-500' : 'text-red-500'}>
                            {formatNumber(rowData.profit)}
                          </span>
                        )}
                      />
                      <Column field="trades" header="Сделок" />
                      <Column
                        field="winRate"
                        header="Win Rate"
                        body={(rowData) => formatPercent(rowData.winRate)}
                      />
                      <Column
                        field="avgProfit"
                        header="Средняя прибыль (₽)"
                        body={(rowData) => formatNumber(rowData.avgProfit)}
                      />
                    </DataTable>
                  </Card>
                </div>

                {/* Таблица по месяцам */}
                {periodAnalysis.byMonth && periodAnalysis.byMonth.length > 0 && (
                  <div className="col-12">
                    <Card title="Детальная статистика по месяцам">
                      <DataTable
                        value={periodAnalysis.byMonth}
                        emptyMessage="Нет данных"
                        className="p-datatable-sm"
                      >
                        <Column field="month" header="Месяц" />
                        <Column field="year" header="Год" />
                        <Column
                          field="totalProfit"
                          header="Прибыль (₽)"
                          body={(rowData) => (
                            <span className={rowData.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}>
                              {formatNumber(rowData.totalProfit)}
                            </span>
                          )}
                        />
                        <Column field="totalTrades" header="Сделок" />
                        <Column
                          field="winRate"
                          header="Win Rate"
                          body={(rowData) => formatPercent(rowData.winRate)}
                        />
                        <Column
                          field="avgProfit"
                          header="Средняя прибыль (₽)"
                          body={(rowData) => formatNumber(rowData.avgProfit)}
                        />
                      </DataTable>
                    </Card>
                  </div>
                )}
              </div>
            ) : (
              <Card>
                <div className="text-center p-4 text-600">
                  Нет данных для анализа по периодам. Убедитесь, что есть сделки в указанном периоде.
                </div>
              </Card>
            )}
          </TabPanel>
        </TabView>
      )}
    </div>
  );
};

export default AdvancedMetricsComponent;

