import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { Badge } from 'primereact/badge';
import { Chart } from 'primereact/chart';
import { Skeleton } from 'primereact/skeleton';
import { Message } from 'primereact/message';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import apiService from '../services/apiService';

interface ModeStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  executed: number;
  cancelled: number;
  expired: number;
}

interface StatsByMode {
  paper: ModeStats;
  micro: ModeStats;
  real: ModeStats;
}

const TradingModeStats: React.FC = () => {
  const [stats, setStats] = useState<StatsByMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any>(null);
  const [chartOptions, setChartOptions] = useState<any>(null);
  const toast = React.useRef<Toast>(null);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 60000); // Обновляем каждую минуту
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (stats) {
      prepareChartData();
    }
  }, [stats]);

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await apiService.getTradingRequestStatsByMode();
      setStats(data);
    } catch (error) {
      console.error('Error loading trading mode stats:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить статистику'
      });
    } finally {
      setLoading(false);
    }
  };

  const prepareChartData = () => {
    if (!stats) return;

    // Данные для круговой диаграммы по режимам
    const pieData = {
      labels: ['Paper Trading', 'Micro Trading', 'Real Trading'],
      datasets: [
        {
          data: [stats.paper.total, stats.micro.total, stats.real.total],
          backgroundColor: ['#3B82F6', '#F59E0B', '#EF4444'],
          hoverBackgroundColor: ['#2563EB', '#D97706', '#DC2626']
        }
      ]
    };

    // Данные для столбчатой диаграммы по статусам
    const barData = {
      labels: ['Ожидают', 'Одобрены', 'Исполнены', 'Отклонены'],
      datasets: [
        {
          label: 'Paper',
          data: [stats.paper.pending, stats.paper.approved, stats.paper.executed, stats.paper.rejected],
          backgroundColor: '#3B82F6'
        },
        {
          label: 'Micro',
          data: [stats.micro.pending, stats.micro.approved, stats.micro.executed, stats.micro.rejected],
          backgroundColor: '#F59E0B'
        },
        {
          label: 'Real',
          data: [stats.real.pending, stats.real.approved, stats.real.executed, stats.real.rejected],
          backgroundColor: '#EF4444'
        }
      ]
    };

    setChartData({ pie: pieData, bar: barData });

    const options = {
      plugins: {
        legend: {
          position: 'bottom'
        }
      },
      responsive: true,
      maintainAspectRatio: false
    };

    setChartOptions(options);
  };

  const getModeCard = (mode: keyof StatsByMode, title: string, icon: string, color: string) => {
    if (!stats) return null;

    const modeStats = stats[mode];
    const successRate = modeStats.total > 0 ? 
      ((modeStats.executed / modeStats.total) * 100).toFixed(1) : '0.0';

    return (
      <Card className="h-full">
        <div className="flex align-items-center justify-content-between mb-3">
          <div className="flex align-items-center gap-2">
            <span className="text-2xl">{icon}</span>
            <span className="font-bold text-lg">{title}</span>
          </div>
          <Badge 
            value={modeStats.total.toString()} 
            severity={color as any}
            size="large"
          />
        </div>

        <div className="grid">
          <div className="col-6">
            <div className="text-center p-2">
              <div className="text-xl font-bold text-orange-500">
                {modeStats.pending}
              </div>
              <div className="text-sm text-600">Ожидают</div>
            </div>
          </div>
          
          <div className="col-6">
            <div className="text-center p-2">
              <div className="text-xl font-bold text-blue-500">
                {modeStats.approved}
              </div>
              <div className="text-sm text-600">Одобрены</div>
            </div>
          </div>
          
          <div className="col-6">
            <div className="text-center p-2">
              <div className="text-xl font-bold text-green-500">
                {modeStats.executed}
              </div>
              <div className="text-sm text-600">Исполнены</div>
            </div>
          </div>
          
          <div className="col-6">
            <div className="text-center p-2">
              <div className="text-xl font-bold text-red-500">
                {modeStats.rejected}
              </div>
              <div className="text-sm text-600">Отклонены</div>
            </div>
          </div>
        </div>

        <div className="mt-3 p-2 bg-gray-50 border-round">
          <div className="flex justify-content-between align-items-center">
            <span className="text-sm text-600">Успешность:</span>
            <Badge 
              value={`${successRate}%`} 
              severity={parseFloat(successRate) >= 70 ? 'success' : parseFloat(successRate) >= 50 ? 'warning' : 'danger'}
            />
          </div>
        </div>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="trading-mode-stats">
        <div className="grid">
          {[1, 2, 3].map((item) => (
            <div key={item} className="col-12 md:col-4">
              <Card className="h-full">
                <div className="flex align-items-center gap-2 mb-3">
                  <Skeleton width="2rem" height="2rem" />
                  <Skeleton width="8rem" height="1.5rem" />
                </div>
                <div className="grid">
                  {[1, 2, 3, 4].map((stat) => (
                    <div key={stat} className="col-6">
                      <div className="text-center p-2">
                        <Skeleton width="3rem" height="2rem" className="mb-1" />
                        <Skeleton width="4rem" height="1rem" />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="trading-mode-stats">
        <Message severity="info" text="Нет данных для отображения статистики" />
      </div>
    );
  }

  return (
    <div className="trading-mode-stats">
      <Toast ref={toast} />
      
      <div className="flex justify-content-between align-items-center mb-4">
        <h3 className="m-0">📊 Статистика по режимам торговли</h3>
        <Button
          label="Обновить"
          icon="pi pi-refresh"
          onClick={loadStats}
          loading={loading}
          size="small"
        />
      </div>

      {/* Карточки по режимам */}
      <div className="grid mb-4">
        <div className="col-12 md:col-4">
          {getModeCard('paper', 'Paper Trading', '📝', 'info')}
        </div>
        <div className="col-12 md:col-4">
          {getModeCard('micro', 'Micro Trading', '🔬', 'warning')}
        </div>
        <div className="col-12 md:col-4">
          {getModeCard('real', 'Real Trading', '💰', 'danger')}
        </div>
      </div>

      {/* Графики */}
      {chartData && (
        <div className="grid">
          <div className="col-12 md:col-6">
            <Card title="Распределение заявок по режимам" className="h-full">
              <div style={{ height: '300px' }}>
                <Chart 
                  type="pie" 
                  data={chartData.pie} 
                  options={chartOptions}
                  style={{ height: '100%' }}
                />
              </div>
            </Card>
          </div>
          
          <div className="col-12 md:col-6">
            <Card title="Статусы заявок по режимам" className="h-full">
              <div style={{ height: '300px' }}>
                <Chart 
                  type="bar" 
                  data={chartData.bar} 
                  options={{
                    ...chartOptions,
                    scales: {
                      y: {
                        beginAtZero: true
                      }
                    }
                  }}
                  style={{ height: '100%' }}
                />
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Общая статистика */}
      <div className="mt-4">
        <Card title="Общая статистика">
          <div className="grid">
            <div className="col-12 md:col-3">
              <div className="text-center p-3">
                <div className="text-3xl font-bold text-primary mb-2">
                  {stats.paper.total + stats.micro.total + stats.real.total}
                </div>
                <div className="text-600">Всего заявок</div>
              </div>
            </div>
            
            <div className="col-12 md:col-3">
              <div className="text-center p-3">
                <div className="text-3xl font-bold text-orange-500 mb-2">
                  {stats.paper.pending + stats.micro.pending + stats.real.pending}
                </div>
                <div className="text-600">Ожидают решения</div>
              </div>
            </div>
            
            <div className="col-12 md:col-3">
              <div className="text-center p-3">
                <div className="text-3xl font-bold text-green-500 mb-2">
                  {stats.paper.executed + stats.micro.executed + stats.real.executed}
                </div>
                <div className="text-600">Исполнено</div>
              </div>
            </div>
            
            <div className="col-12 md:col-3">
              <div className="text-center p-3">
                <div className="text-3xl font-bold text-blue-500 mb-2">
                  {(() => {
                    const total = stats.paper.total + stats.micro.total + stats.real.total;
                    const executed = stats.paper.executed + stats.micro.executed + stats.real.executed;
                    return total > 0 ? ((executed / total) * 100).toFixed(1) : '0.0';
                  })()}%
                </div>
                <div className="text-600">Общая успешность</div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default TradingModeStats;
