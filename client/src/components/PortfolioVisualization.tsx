import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { Chart } from 'primereact/chart';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Badge } from 'primereact/badge';
import { ProgressBar } from 'primereact/progressbar';
import { Button } from 'primereact/button';
import { Skeleton } from 'primereact/skeleton';
import { TabView, TabPanel } from 'primereact/tabview';
import { Divider } from 'primereact/divider';
import { Tag } from 'primereact/tag';
import { apiService } from '../services/apiService';
import { useWebSocketData } from './WebSocketDataProvider';

interface Position {
  figi: string;
  ticker: string;
  name: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  weight: number;
  sector: string;
  currency: string;
  lastUpdate: string;
}

interface PortfolioSummary {
  totalValue: number;
  cash: number;
  investedAmount: number;
  totalPnL: number;
  totalPnLPercent: number;
  positionsCount: number;
  dayChange: number;
  dayChangePercent: number;
}

interface PortfolioVisualizationProps {
  className?: string;
}

const PortfolioVisualization: React.FC<PortfolioVisualizationProps> = ({ className = '' }) => {
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { isConnected } = useWebSocketData();

  // Загрузка данных портфеля
  const loadPortfolioData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [portfolioResponse, positionsResponse] = await Promise.all([
        apiService.getPortfolio(),
        apiService.getPortfolioPositions()
      ]);

      if (portfolioResponse) {
        setPortfolio(portfolioResponse);
      }
      
      if (positionsResponse.success) {
        setPositions(positionsResponse.data || []);
      }
    } catch (error: any) {
      console.error('Error loading portfolio data:', error);
      setError(error.message || 'Ошибка загрузки данных портфеля');
    } finally {
      setLoading(false);
    }
  };

  // Обновление данных из WebSocket
  useEffect(() => {
    // Временно отключено - требует рефакторинга для нового WebSocketDataProvider
    // TODO: Реализовать обновление портфеля из нового провайдера
  }, []);

  useEffect(() => {
    loadPortfolioData();
    const interval = setInterval(loadPortfolioData, isConnected ? 60000 : 30000);
    return () => clearInterval(interval);
  }, [isConnected]);

  // Генерация данных для круговой диаграммы распределения портфеля
  const generateAllocationChart = () => {
    if (!positions.length) return null;

    const topPositions = positions
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8);
    
    const othersWeight = positions
      .slice(8)
      .reduce((sum, pos) => sum + pos.weight, 0);

    const labels = topPositions.map(pos => pos.ticker);
    const data = topPositions.map(pos => pos.weight);
    
    if (othersWeight > 0) {
      labels.push('Другие');
      data.push(othersWeight);
    }

    // Добавляем наличные
    if (portfolio?.cash && portfolio.cash > 0) {
      const cashWeight = (portfolio.cash / portfolio.totalValue) * 100;
      labels.push('Наличные');
      data.push(cashWeight);
    }

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: [
          '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
          '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF',
          '#4BC0C0', '#36A2EB'
        ],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    };
  };

  // Генерация данных для столбчатой диаграммы P&L
  const generatePnLChart = () => {
    if (!positions.length) return null;

    const sortedPositions = positions
      .sort((a, b) => Math.abs(b.unrealizedPnL) - Math.abs(a.unrealizedPnL))
      .slice(0, 10);

    return {
      labels: sortedPositions.map(pos => pos.ticker),
      datasets: [{
        label: 'Нереализованная прибыль/убыток (₽)',
        data: sortedPositions.map(pos => pos.unrealizedPnL),
        backgroundColor: sortedPositions.map(pos => 
          pos.unrealizedPnL >= 0 ? '#10B981' : '#EF4444'
        ),
        borderColor: sortedPositions.map(pos => 
          pos.unrealizedPnL >= 0 ? '#059669' : '#DC2626'
        ),
        borderWidth: 1
      }]
    };
  };

  // Генерация данных для диаграммы по секторам
  const generateSectorChart = () => {
    if (!positions.length) return null;

    const sectorData = positions.reduce((acc, pos) => {
      const sector = pos.sector || 'Неизвестно';
      acc[sector] = (acc[sector] || 0) + pos.marketValue;
      return acc;
    }, {} as Record<string, number>);

    const labels = Object.keys(sectorData);
    const data = Object.values(sectorData);

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: [
          '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
          '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'
        ]
      }]
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          padding: 20,
          usePointStyle: true
        }
      }
    }
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            return new Intl.NumberFormat('ru-RU', {
              style: 'currency',
              currency: 'RUB',
              minimumFractionDigits: 0
            }).format(value);
          }
        }
      }
    }
  };

  // Форматирование валюты
  const formatCurrency = (amount: number, currency: string = 'RUB') => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0
    }).format(amount);
  };

  // Форматирование процентов
  const formatPercent = (value: number) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  // Шаблоны для колонок таблицы
  const tickerTemplate = (rowData: Position) => (
    <div className="flex align-items-center gap-2">
      <div>
        <div className="font-medium">{rowData.ticker}</div>
        <div className="text-sm text-600">{rowData.name}</div>
      </div>
    </div>
  );

  const quantityTemplate = (rowData: Position) => (
    <div className="text-right">
      <div className="font-medium">{rowData.quantity.toLocaleString('ru-RU')}</div>
      <div className="text-sm text-600">{rowData.currency}</div>
    </div>
  );

  const priceTemplate = (rowData: Position) => (
    <div className="text-right">
      <div className="font-medium">{formatCurrency(rowData.currentPrice, rowData.currency)}</div>
      <div className="text-sm text-600">Ср: {formatCurrency(rowData.averagePrice, rowData.currency)}</div>
    </div>
  );

  const marketValueTemplate = (rowData: Position) => (
    <div className="text-right">
      <div className="font-medium">{formatCurrency(rowData.marketValue)}</div>
      <div className="text-sm text-600">{rowData.weight.toFixed(1)}%</div>
    </div>
  );

  const pnlTemplate = (rowData: Position) => (
    <div className="text-right">
      <div className={`font-medium ${rowData.unrealizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
        {formatCurrency(rowData.unrealizedPnL)}
      </div>
      <div className={`text-sm ${rowData.unrealizedPnLPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
        {formatPercent(rowData.unrealizedPnLPercent)}
      </div>
    </div>
  );

  const sectorTemplate = (rowData: Position) => (
    <Tag value={rowData.sector || 'Неизвестно'} severity="info" />
  );

  return (
    <div className={`portfolio-visualization ${className}`}>
      {/* Сводка портфеля */}
      <Card title="💼 Сводка портфеля" className="mb-4">
        {loading && !portfolio ? (
          <div className="grid">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="col-12 md:col-3">
                <Skeleton width="100%" height="4rem" />
              </div>
            ))}
          </div>
        ) : portfolio ? (
          <div className="grid">
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-2xl font-bold text-primary mb-2">
                  {formatCurrency(portfolio.totalValue)}
                </div>
                <div className="text-600">Общая стоимость</div>
                {isConnected && (
                  <Badge value="LIVE" severity="success" className="mt-2" />
                )}
              </div>
            </div>
            
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className={`text-2xl font-bold mb-2 ${
                  portfolio.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'
                }`}>
                  {formatCurrency(portfolio.totalPnL)}
                </div>
                <div className="text-600">Общая прибыль/убыток</div>
                <div className={`text-sm ${
                  portfolio.totalPnLPercent >= 0 ? 'text-green-500' : 'text-red-500'
                }`}>
                  {formatPercent(portfolio.totalPnLPercent)}
                </div>
              </div>
            </div>
            
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className={`text-2xl font-bold mb-2 ${
                  portfolio.dayChange >= 0 ? 'text-green-500' : 'text-red-500'
                }`}>
                  {formatCurrency(portfolio.dayChange)}
                </div>
                <div className="text-600">Изменение за день</div>
                <div className={`text-sm ${
                  portfolio.dayChangePercent >= 0 ? 'text-green-500' : 'text-red-500'
                }`}>
                  {formatPercent(portfolio.dayChangePercent)}
                </div>
              </div>
            </div>
            
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-2xl font-bold text-blue-500 mb-2">
                  {portfolio.positionsCount}
                </div>
                <div className="text-600">Позиций в портфеле</div>
                <div className="text-sm text-600">
                  Наличные: {formatCurrency(portfolio.cash)}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center p-4 text-600">
            Нет данных о портфеле
          </div>
        )}
      </Card>

      <TabView>
        {/* Позиции */}
        <TabPanel header="📋 Позиции" leftIcon="pi pi-list">
          <Card>
            <div className="flex justify-content-between align-items-center mb-3">
              <h3 className="m-0">Текущие позиции</h3>
              <Button
                icon="pi pi-refresh"
                label="Обновить"
                size="small"
                loading={loading}
                onClick={loadPortfolioData}
              />
            </div>
            
            {error && (
              <div className="mb-3">
                <div className="p-3 border-round bg-red-50 text-red-800">
                  <i className="pi pi-exclamation-triangle mr-2"></i>
                  {error}
                </div>
              </div>
            )}

            <DataTable 
              value={positions} 
              loading={loading}
              emptyMessage="Нет позиций в портфеле"
              paginator={positions.length > 10}
              rows={10}
              sortMode="multiple"
              className="p-datatable-sm"
            >
              <Column 
                field="ticker" 
                header="Инструмент" 
                body={tickerTemplate}
                sortable
                style={{ minWidth: '200px' }}
              />
              <Column 
                field="quantity" 
                header="Количество" 
                body={quantityTemplate}
                sortable
                style={{ minWidth: '120px' }}
              />
              <Column 
                field="currentPrice" 
                header="Цена" 
                body={priceTemplate}
                sortable
                style={{ minWidth: '140px' }}
              />
              <Column 
                field="marketValue" 
                header="Рыночная стоимость" 
                body={marketValueTemplate}
                sortable
                style={{ minWidth: '160px' }}
              />
              <Column 
                field="unrealizedPnL" 
                header="P&L" 
                body={pnlTemplate}
                sortable
                style={{ minWidth: '140px' }}
              />
              <Column 
                field="sector" 
                header="Сектор" 
                body={sectorTemplate}
                sortable
                style={{ minWidth: '120px' }}
              />
            </DataTable>
          </Card>
        </TabPanel>

        {/* Диаграммы */}
        <TabPanel header="📊 Аналитика" leftIcon="pi pi-chart-pie">
          <div className="grid">
            {/* Распределение портфеля */}
            <div className="col-12 lg:col-6">
              <Card title="🥧 Распределение портфеля" className="h-full">
                <div style={{ height: '300px' }}>
                  {positions.length > 0 ? (
                    <Chart 
                      type="doughnut" 
                      data={generateAllocationChart()} 
                      options={chartOptions} 
                    />
                  ) : (
                    <div className="flex align-items-center justify-content-center h-full text-600">
                      Нет данных для отображения
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* P&L по позициям */}
            <div className="col-12 lg:col-6">
              <Card title="📈 Прибыль/убыток по позициям" className="h-full">
                <div style={{ height: '300px' }}>
                  {positions.length > 0 ? (
                    <Chart 
                      type="bar" 
                      data={generatePnLChart()} 
                      options={barChartOptions} 
                    />
                  ) : (
                    <div className="flex align-items-center justify-content-center h-full text-600">
                      Нет данных для отображения
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Распределение по секторам */}
            <div className="col-12 lg:col-6">
              <Card title="🏭 Распределение по секторам" className="h-full">
                <div style={{ height: '300px' }}>
                  {positions.length > 0 ? (
                    <Chart 
                      type="pie" 
                      data={generateSectorChart()} 
                      options={chartOptions} 
                    />
                  ) : (
                    <div className="flex align-items-center justify-content-center h-full text-600">
                      Нет данных для отображения
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Статистика */}
            <div className="col-12 lg:col-6">
              <Card title="📊 Статистика портфеля" className="h-full">
                {portfolio && positions.length > 0 ? (
                  <div className="flex flex-column gap-3">
                    <div>
                      <div className="text-600 mb-2">Диверсификация</div>
                      <ProgressBar 
                        value={Math.min((positions.length / 20) * 100, 100)} 
                        className="mb-2"
                      />
                      <small className="text-500">
                        {positions.length} позиций (рекомендуется 15-25)
                      </small>
                    </div>
                    
                    <Divider />
                    
                    <div className="grid text-center">
                      <div className="col-6">
                        <div className="text-xl font-bold text-blue-500">
                          {((portfolio.investedAmount / portfolio.totalValue) * 100).toFixed(1)}%
                        </div>
                        <div className="text-sm text-600">Инвестировано</div>
                      </div>
                      <div className="col-6">
                        <div className="text-xl font-bold text-green-500">
                          {((portfolio.cash / portfolio.totalValue) * 100).toFixed(1)}%
                        </div>
                        <div className="text-sm text-600">Наличные</div>
                      </div>
                    </div>
                    
                    <Divider />
                    
                    <div>
                      <div className="text-600 mb-2">Топ позиции по весу</div>
                      {positions
                        .sort((a, b) => b.weight - a.weight)
                        .slice(0, 3)
                        .map((pos, index) => (
                          <div key={pos.figi} className="flex justify-content-between align-items-center mb-2">
                            <span className="text-sm">{pos.ticker}</span>
                            <Badge value={`${pos.weight.toFixed(1)}%`} severity="info" />
                          </div>
                        ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-600">
                    Нет данных для анализа
                  </div>
                )}
              </Card>
            </div>
          </div>
        </TabPanel>
      </TabView>
    </div>
  );
};

export default PortfolioVisualization;
