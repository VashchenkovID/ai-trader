import React, { useState, useEffect } from 'react';
import { Message } from 'primereact/message';
import { Toast } from 'primereact/toast';
import { apiService } from '../services/apiService';
import { useWebSocketData } from './WebSocketDataProvider';
import useWebSocket from '../hooks/useWebSocket';
import PortfolioSummaryCard, { PortfolioSummary } from './portfolio/PortfolioSummaryCard';
import PortfolioPositionsTable, { Position } from './portfolio/PortfolioPositionsTable';
import PortfolioCharts from './portfolio/PortfolioCharts';
import PortfolioAnalytics from './portfolio/PortfolioAnalytics';
import PortfolioAnalysisResults, { SellRecommendation } from './portfolio/PortfolioAnalysisResults';

interface PortfolioVisualizationProps {
  className?: string;
}

const PortfolioVisualization: React.FC<PortfolioVisualizationProps> = ({ className = '' }) => {
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<{
    sellRecommendations: SellRecommendation[];
    buyRecommendations?: any[];
  } | null>(null);
  const [showAnalysisResults, setShowAnalysisResults] = useState(false);
  const toast = React.useRef<Toast>(null);
  
  const { isConnected, tradingStats } = useWebSocketData();

  // WebSocket для получения результатов анализа
  useWebSocket({
    onMessage: (message) => {
      if (message.type === 'portfolio_analysis_completed') {
        console.log('📊 Portfolio analysis completed:', message.data);
        setAnalysisResults({
          sellRecommendations: message.data?.sellRecommendations || []
        });
        setAnalyzing(false);
        setShowAnalysisResults(true);
        
        toast.current?.show({
          severity: 'success',
          summary: 'Анализ завершен',
          detail: `Найдено ${message.data?.sellRecommendations?.length || 0} рекомендаций на продажу`,
          life: 5000
        });
      } else if (message.type === 'portfolio_analysis_error') {
        console.error('❌ Portfolio analysis error:', message.data);
        setAnalyzing(false);
        toast.current?.show({
          severity: 'error',
          summary: 'Ошибка анализа',
          detail: message.data?.error || 'Произошла ошибка при анализе портфеля',
          life: 5000
        });
      }
    }
  });

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

  // Обработка анализа портфеля
  const handleAnalyzePortfolio = async () => {
    try {
      setAnalyzing(true);
      setError(null);
      
      toast.current?.show({
        severity: 'info',
        summary: 'Проверка нейросети',
        detail: 'Проверяем статус нейросети...',
        life: 2000
      });

      // Проверяем статус нейросети
      try {
        const status = await apiService.getNeuralNetworkStatus();
        console.log('Neural network status:', status);
        
        // Если нейросеть неактивна, активируем её
        const isActive = status.data?.isActive || status.isActive || false;
        if (!isActive) {
          toast.current?.show({
            severity: 'info',
            summary: 'Активация нейросети',
            detail: 'Нейросеть отключена. Активируем...',
            life: 2000
          });
          
          await apiService.activateNeuralNetwork();
          
          // Ждем немного, чтобы нейросеть активировалась
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          toast.current?.show({
            severity: 'success',
            summary: 'Нейросеть активирована',
            detail: 'Нейросеть успешно активирована. Запускаем анализ...',
            life: 2000
          });
        }
      } catch (statusError: any) {
        console.warn('Could not check neural network status, trying to activate:', statusError);
        // Пробуем активировать напрямую
        try {
          await apiService.activateNeuralNetwork();
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (activateError) {
          console.error('Could not activate neural network:', activateError);
        }
      }

      toast.current?.show({
        severity: 'info',
        summary: 'Анализ запущен',
        detail: 'Анализ портфеля начат. Результаты будут доступны после завершения.',
        life: 3000
      });

      const response = await apiService.analyzePortfolio();
      
      // Если анализ уже есть в БД, сразу показываем результаты
      if (response.data && response.data.sellRecommendations) {
        setAnalysisResults({
          sellRecommendations: response.data.sellRecommendations || []
        });
        setShowAnalysisResults(true);
        setAnalyzing(false);
        
        toast.current?.show({
          severity: 'success',
          summary: 'Анализ получен',
          detail: `Найдено ${response.data.sellRecommendations?.length || 0} рекомендаций на продажу`,
          life: 3000
        });
        return;
      }
      
    } catch (error: any) {
      console.error('Error analyzing portfolio:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Ошибка анализа портфеля';
      setError(errorMessage);
      
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка анализа',
        detail: errorMessage,
        life: 5000
      });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className={`portfolio-visualization ${className}`}>
      <Toast ref={toast} />
      
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

      {/* Карточка Позиции */}
      <div className="mb-4">
        <PortfolioPositionsTable
          positions={positions}
          loading={loading}
          error={error}
          onRefresh={loadPortfolioData}
          onAnalyze={handleAnalyzePortfolio}
          analyzing={analyzing}
        />
      </div>

      {/* Карточка Аналитика */}
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

      {/* Модальное окно с результатами анализа */}
      {analysisResults && (
        <PortfolioAnalysisResults
          visible={showAnalysisResults}
          onHide={() => setShowAnalysisResults(false)}
          sellRecommendations={analysisResults.sellRecommendations}
        />
      )}
    </div>
  );
};

export default PortfolioVisualization;
