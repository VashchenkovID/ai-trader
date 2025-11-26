import React, { useState, useEffect } from 'react';
import { TabView, TabPanel } from 'primereact/tabview';
import { Message } from 'primereact/message';
import { apiService } from '../services/apiService';
import { useWebSocketData } from './WebSocketDataProvider';
import PortfolioSummaryCard, { PortfolioSummary } from './portfolio/PortfolioSummaryCard';
import PortfolioPositionsTable, { Position } from './portfolio/PortfolioPositionsTable';
import PortfolioCharts from './portfolio/PortfolioCharts';
import PortfolioAnalytics from './portfolio/PortfolioAnalytics';

interface PortfolioVisualizationProps {
  className?: string;
}

const PortfolioVisualization: React.FC<PortfolioVisualizationProps> = ({ className = '' }) => {
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { isConnected, tradingStats } = useWebSocketData();

  // Преобразование данных портфеля из API в формат PortfolioSummary
  const transformPortfolioData = async (portfolioData: any, positionsData: Position[]): Promise<PortfolioSummary | null> => {
    if (!portfolioData) {
      // Если нет данных портфеля, но есть данные из WebSocket, используем их
      if (tradingStats) {
        return {
          totalValue: tradingStats.portfolioValue || 0,
          cash: tradingStats.cash || 0,
          investedAmount: (tradingStats.portfolioValue || 0) - (tradingStats.cash || 0),
          totalPnL: tradingStats.totalPnL || 0,
          totalPnLPercent: 0,
          positionsCount: positionsData.length,
          dayChange: 0,
          dayChangePercent: 0
        };
      }
      return null;
    }

    const totalValue = portfolioData.totalValue || portfolioData.portfolioValue || tradingStats?.portfolioValue || 0;
    const cash = portfolioData.cash || tradingStats?.cash || 0;
    const positionsValue = portfolioData.positionsValue || (totalValue - cash);
    const investedAmount = positionsValue;

    // Рассчитываем PnL
    const totalPnL = portfolioData.totalPnL || tradingStats?.totalPnL || 0;
    const startingCapital = 1000000; // Начальный капитал для paper mode
    const totalPnLPercent = startingCapital > 0 ? (totalPnL / startingCapital) * 100 : 0;

    // Рассчитываем изменение за день (упрощенно, можно улучшить)
    const dayChange = totalPnL * 0.1; // Примерное изменение за день
    const dayChangePercent = totalValue > 0 ? (dayChange / totalValue) * 100 : 0;

    return {
      totalValue,
      cash,
      investedAmount,
      totalPnL,
      totalPnLPercent,
      positionsCount: positionsData.length || Object.keys(portfolioData.positions || {}).length,
      dayChange,
      dayChangePercent
    };
  };

  // Преобразование позиций из API в формат Position[]
  const transformPositionsData = async (positionsData: any): Promise<Position[]> => {
    // Если это уже массив позиций, преобразуем их
    if (Array.isArray(positionsData)) {
      return positionsData
        .filter((pos: any) => pos && pos.figi && pos.quantity > 0) // Фильтруем только некорректные данные, но не по цене
        .map((pos: any) => {
          // Валидация и нормализация цен (разрешаем 0)
          const currentPrice = typeof pos.currentPrice === 'number' && !isNaN(pos.currentPrice) && isFinite(pos.currentPrice)
            ? pos.currentPrice
            : 0;
          const averagePrice = typeof pos.averagePrice === 'number' && !isNaN(pos.averagePrice) && isFinite(pos.averagePrice)
            ? pos.averagePrice
            : (currentPrice > 0 ? currentPrice : 0); // Используем текущую цену как fallback, если она есть
          const quantity = typeof pos.quantity === 'number' && !isNaN(pos.quantity) && isFinite(pos.quantity) && pos.quantity > 0
            ? pos.quantity
            : 0;
          
          const marketValue = currentPrice > 0 && quantity > 0 ? currentPrice * quantity : 0;
          const unrealizedPnL = typeof pos.unrealizedPnL === 'number' && !isNaN(pos.unrealizedPnL) && isFinite(pos.unrealizedPnL)
            ? pos.unrealizedPnL
            : (currentPrice > 0 && averagePrice > 0 ? (currentPrice - averagePrice) * quantity : 0);
          const unrealizedPnLPercent = averagePrice > 0 && currentPrice > 0
            ? ((currentPrice - averagePrice) / averagePrice) * 100
            : (typeof pos.unrealizedPnLPercent === 'number' ? pos.unrealizedPnLPercent : 0);
          
          return {
            figi: pos.figi,
            ticker: (pos.ticker && pos.ticker !== 'Неизвестно' && pos.ticker !== 'Инструмент не найден') 
              ? pos.ticker 
              : (pos.figi?.substring(0, 10) || '—'),
            name: (pos.name && pos.name !== 'Неизвестно' && pos.name !== 'Инструмент не найден') 
              ? pos.name 
              : 'Название недоступно',
            quantity,
            averagePrice: Math.round(averagePrice * 100) / 100,
            currentPrice: Math.round(currentPrice * 100) / 100,
            marketValue: Math.round(marketValue * 100) / 100,
            unrealizedPnL: Math.round(unrealizedPnL * 100) / 100,
            unrealizedPnLPercent: Math.round(unrealizedPnLPercent * 100) / 100,
            weight: typeof pos.weight === 'number' && !isNaN(pos.weight) ? pos.weight : 0,
            sector: (pos.sector && pos.sector !== 'Неизвестно') ? pos.sector : 'Неизвестно',
            currency: pos.currency || 'RUB',
            lastUpdate: pos.lastUpdate || new Date().toISOString()
          };
        });
    }

    // Если positionsData - это объект { figi: quantity }, возвращаем пустой массив
    // (сервер должен обрабатывать это и возвращать массив)
    if (positionsData && typeof positionsData === 'object' && !Array.isArray(positionsData)) {
      console.warn('Получен объект позиций вместо массива. Сервер должен обрабатывать позиции.');
      return [];
    }

    return [];
  };

  // Загрузка данных портфеля
  const loadPortfolioData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Сначала показываем данные из WebSocket, если они есть (быстрое отображение)
      if (tradingStats && !portfolio) {
        const quickPortfolio: PortfolioSummary = {
          totalValue: tradingStats.portfolioValue || 0,
          cash: tradingStats.cash || 0,
          investedAmount: (tradingStats.portfolioValue || 0) - (tradingStats.cash || 0),
          totalPnL: tradingStats.totalPnL || 0,
          totalPnLPercent: 0,
          positionsCount: 0,
          dayChange: 0,
          dayChangePercent: 0
        };
        setPortfolio(quickPortfolio);
      }
      
      // Загружаем данные параллельно
      const [portfolioResponse, positionsResponse] = await Promise.allSettled([
        apiService.getPortfolio().catch(() => null),
        apiService.getPortfolioPositions().catch(() => ({ success: false, data: [] }))
      ]);

      // Обрабатываем позиции
      let positionsData: any = [];
      if (positionsResponse.status === 'fulfilled') {
        const response = positionsResponse.value;
        positionsData = response?.success ? response.data : (response?.data || []);
      }
      
      const transformedPositions = await transformPositionsData(positionsData);
      setPositions(transformedPositions);

      // Обрабатываем данные портфеля
      if (portfolioResponse.status === 'fulfilled' && portfolioResponse.value) {
        const transformedPortfolio = await transformPortfolioData(portfolioResponse.value, transformedPositions);
        if (transformedPortfolio) {
          setPortfolio(transformedPortfolio);
        }
      } else if (tradingStats) {
        // Если API не вернул данные, используем WebSocket
        const wsPortfolio: PortfolioSummary = {
          totalValue: tradingStats.portfolioValue || 0,
          cash: tradingStats.cash || 0,
          investedAmount: (tradingStats.portfolioValue || 0) - (tradingStats.cash || 0),
          totalPnL: tradingStats.totalPnL || 0,
          totalPnLPercent: 0,
          positionsCount: transformedPositions.length,
          dayChange: 0,
          dayChangePercent: 0
        };
        setPortfolio(wsPortfolio);
      }
    } catch (error: any) {
      console.error('Error loading portfolio data:', error);
      setError(error.message || 'Ошибка загрузки данных портфеля');
    } finally {
      setLoading(false);
    }
  };

  // Обновление данных из WebSocket (показываем данные сразу, если их нет)
  useEffect(() => {
    if (tradingStats) {
      setPortfolio(prev => {
        // Если данных еще нет, создаем их из WebSocket
        if (!prev) {
          return {
            totalValue: tradingStats.portfolioValue || 0,
            cash: tradingStats.cash || 0,
            investedAmount: (tradingStats.portfolioValue || 0) - (tradingStats.cash || 0),
            totalPnL: tradingStats.totalPnL || 0,
            totalPnLPercent: 0,
            positionsCount: positions.length,
            dayChange: 0,
            dayChangePercent: 0
          };
        }
        // Обновляем существующие данные
        return {
          ...prev,
          totalValue: tradingStats.portfolioValue || prev.totalValue,
          cash: tradingStats.cash || prev.cash,
          totalPnL: tradingStats.totalPnL || prev.totalPnL,
          positionsCount: positions.length || prev.positionsCount
        };
      });
    }
  }, [tradingStats, positions.length]);

  // Первоначальная загрузка и периодическое обновление
  useEffect(() => {
    loadPortfolioData();
    const interval = setInterval(loadPortfolioData, isConnected ? 60000 : 30000);
    return () => clearInterval(interval);
  }, [isConnected]);

  return (
    <div className={`portfolio-visualization ${className}`}>
      {/* Сводка портфеля */}
      <PortfolioSummaryCard
        portfolio={portfolio}
        loading={loading}
        isConnected={isConnected}
        className="mb-4"
      />

      {error && (
        <div className="mb-3">
          <Message severity="error" text={error} className="w-full" />
        </div>
      )}

      <TabView>
        {/* Позиции */}
        <TabPanel header="📋 Позиции" leftIcon="pi pi-list">
          <PortfolioPositionsTable
            positions={positions}
            loading={loading}
            error={error}
            onRefresh={loadPortfolioData}
          />
        </TabPanel>

        {/* Диаграммы */}
        <TabPanel header="📊 Аналитика" leftIcon="pi pi-chart-pie">
          <div className="grid">
            <div className="col-12 lg:col-8">
              <PortfolioCharts
                positions={positions}
                portfolio={portfolio}
              />
            </div>
            <div className="col-12 lg:col-4">
              <PortfolioAnalytics
                portfolio={portfolio}
                positions={positions}
              />
            </div>
          </div>
        </TabPanel>
      </TabView>
    </div>
  );
};

export default PortfolioVisualization;
