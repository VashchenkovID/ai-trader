import React, { useState, useEffect } from 'react';
import { Alert } from './ui/Alert/Alert';
import { Toast } from 'primereact/toast';
import './PortfolioVisualization.css';
import { apiService, TradingStats } from '../services/apiService';
import { useWebSocketData } from './WebSocketDataProvider';
import useWebSocket from '../hooks/useWebSocket';
import PortfolioSummaryCard, { PortfolioSummary } from './portfolio/PortfolioSummaryCard';
import PortfolioPositionsTable, { Position } from './portfolio/PortfolioPositionsTable';
import PortfolioCharts from './portfolio/PortfolioCharts';
import PortfolioAnalytics from './portfolio/PortfolioAnalytics';
import PortfolioAnalysisResults, { SellRecommendation } from './portfolio/PortfolioAnalysisResults';
import StrategyPositionsTable from './portfolio/StrategyPositionsTable';
import PortfolioSync from './portfolio/PortfolioSync';

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
  const [strategies, setStrategies] = useState<any[]>([]);
  const [strategyPositions, setStrategyPositions] = useState<Record<number, Position[]>>({});
  const toast = React.useRef<Toast>(null);
  
  const { isConnected, tradingStats } = useWebSocketData();

  // Присваиваем предсказания и стратегии позициям по FIGI
  const attachPredictionsToPositions = (
    basePositions: Position[],
    recommendations: any[] = []
  ): Position[] => {
    if (!Array.isArray(basePositions) || basePositions.length === 0) return basePositions;
    const map = new Map<string, { 
      recommendation: any; 
      score?: number; 
      confidence?: number;
      strategy?: {
        id: number;
        name: string;
        type: 'conservative' | 'moderate' | 'aggressive';
      };
    }>();
    for (const rec of recommendations) {
      const figi = rec?.item?.figi || rec?.figi;
      if (!figi) continue;
      const score = rec?.prediction?.score ?? rec?.score;
      const confidence = rec?.prediction?.confidence ?? rec?.confidence;
      // Отбрасываем бессодержательные записи с нулями, чтобы не затирать актуальные данные
      if (score === 0 && confidence === 0) continue;
      
      // Извлекаем стратегию из рекомендации
      let strategy = null;
      if (rec?.strategy) {
        // Если стратегия уже объект
        strategy = {
          id: rec.strategy.id,
          name: rec.strategy.name,
          type: rec.strategy.type
        };
        // eslint-disable-next-line no-dupe-else-if
      } else if (rec?.strategyId && rec?.strategy) {
        // Если есть и strategyId и объект strategy
        strategy = {
          id: rec.strategy.id || rec.strategyId,
          name: rec.strategy.name,
          type: rec.strategy.type
        };
      }
      
      map.set(figi, {
        recommendation: rec?.prediction?.recommendation || rec?.recommendation || rec?.action || 'HOLD',
        score,
        confidence,
        strategy: strategy || undefined
      });
    }
    return basePositions.map((p) => {
      const data = map.get(p.figi);
      if (data) {
        const { strategy: recStrategy, ...prediction } = data;
        return {
          ...p,
          prediction,
          // Приоритет: стратегия из позиции (от бэкенда) важнее стратегии из рекомендации
          strategy: p.strategy || recStrategy || undefined
        };
      }
      return p;
    });
  };

  // WebSocket для получения результатов анализа
  useWebSocket({
    onMessage: (message) => {
      if (message.type === 'portfolio_analysis_completed') {
        const sellRecs = message.data?.sellRecommendations || [];
        setAnalysisResults({
          sellRecommendations: sellRecs
        });
        // Обновляем предсказания в строках позиций
        setPositions((prev) => attachPredictionsToPositions(prev, sellRecs));
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
        const typedTradingStats = tradingStats as TradingStats;
        const wsTotalValue = typedTradingStats.portfolioValue || 0;
        const wsCash = typedTradingStats.cash || 0;
        const wsInvestedAmount = wsTotalValue - wsCash;
        const wsInitialCapital = 1000000; // Значение по умолчанию для paper mode
        const wsTotalPnL = typedTradingStats.totalPnL !== undefined 
          ? typedTradingStats.totalPnL 
          : (wsTotalValue - wsInitialCapital);
        const wsTotalPnLPercent = wsInitialCapital > 0 ? (wsTotalPnL / wsInitialCapital) * 100 : 0;
        
        return {
          totalValue: wsTotalValue,
          cash: wsCash,
          investedAmount: wsInvestedAmount,
          totalPnL: wsTotalPnL,
          totalPnLPercent: wsTotalPnLPercent,
          positionsCount: positionsData.length,
          dayChange: 0, // Убрано: изменение за день не рассчитывается
          dayChangePercent: 0 // Убрано: изменение за день не рассчитывается
        };
      }
      return null;
    }

    // Получаем данные из API, приоритет: API > WebSocket
    const totalValue = portfolioData.totalValue || portfolioData.portfolioValue || tradingStats?.portfolioValue || 0;
    const cash = portfolioData.cash !== undefined && portfolioData.cash !== null 
      ? portfolioData.cash 
      : (tradingStats?.cash !== undefined && tradingStats?.cash !== null ? tradingStats.cash : 0);
    
    // positionsValue должен быть передан из API, если нет - рассчитываем из позиций
    let positionsValue = portfolioData.positionsValue;
    if (positionsValue === undefined || positionsValue === null) {
      // Если positionsValue не передан, пытаемся рассчитать из totalValue и cash
      // Но только если оба значения валидны
      if (totalValue > 0 && cash >= 0) {
        positionsValue = Math.max(0, totalValue - cash);
      } else {
        // Если не можем рассчитать, используем 0
        positionsValue = 0;
      }
    }
    
    // Убеждаемся, что totalValue = cash + positionsValue для согласованности
    const calculatedTotalValue = cash + positionsValue;
    // Используем totalValue из API, если он есть и больше 0, иначе используем расчетное значение
    const finalTotalValue = totalValue > 0 ? totalValue : calculatedTotalValue;
    
    const investedAmount = positionsValue;

    // Рассчитываем PnL
    // Используем initialCapital из данных портфеля, если он есть, иначе используем значение по умолчанию
    const initialCapital = portfolioData.initialCapital || 1000000;
    
    // Приоритет: pnl.total из API > totalPnL из API > tradingStats.totalPnL > расчет как разница
    const totalPnL = portfolioData.pnl?.total !== undefined
      ? portfolioData.pnl.total
      : (portfolioData.totalPnL !== undefined 
          ? portfolioData.totalPnL 
          : (tradingStats?.totalPnL !== undefined 
              ? tradingStats.totalPnL 
              : (finalTotalValue - initialCapital))); // Если PnL не передан, рассчитываем как разницу
    
    // Процент прибыли: pnl.totalPercent из API > расчет относительно initialCapital
    const totalPnLPercent = portfolioData.pnl?.totalPercent !== undefined
      ? portfolioData.pnl.totalPercent
      : (initialCapital > 0 ? (totalPnL / initialCapital) * 100 : 0);

    return {
      totalValue: finalTotalValue,
      cash,
      investedAmount,
      totalPnL,
      totalPnLPercent,
      positionsCount: positionsData.length || Object.keys(portfolioData.positions || {}).length,
      dayChange: 0, // Убрано: изменение за день не рассчитывается
      dayChangePercent: 0 // Убрано: изменение за день не рассчитывается
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
            lastUpdate: pos.lastUpdate || new Date().toISOString(),
            strategy: pos.strategy || null // Сохраняем стратегию из исходных данных
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

      // Подтягиваем сохраненные рекомендации из БД и прикрепляем к позициям
      // Предсказания обновляются автоматически на бэкенде каждые 20 минут через планировщик
      let recommendationsForPositions: any[] = [];
      try {
        const recResp = await apiService.getAllRecommendations();
        const recData = Array.isArray(recResp) ? recResp : (recResp?.data || []);
        recommendationsForPositions = recData;
      } catch (recErr) {
        console.warn('Could not load recommendations for positions:', recErr);
      }

      const positionsWithPredictions = attachPredictionsToPositions(transformedPositions, recommendationsForPositions);
      setPositions(positionsWithPredictions);
      
      // Отладочный вывод для проверки стратегий в позициях
      const positionsWithStrategy = positionsWithPredictions.filter(p => p.strategy?.id);
      console.log('📊 Positions with strategy:', positionsWithStrategy.length, 'out of', positionsWithPredictions.length);
      if (positionsWithStrategy.length > 0) {
        console.log('📊 Sample position with strategy:', positionsWithStrategy[0]);
      }

      // Загружаем стратегии и группируем позиции по стратегиям
      try {
        // Определяем тип портфеля из ответа API
        const portfolioData = portfolioResponse.status === 'fulfilled' ? portfolioResponse.value : null;
        const portfolioMode = portfolioData?.mode || 'virtual';
        const portfolioType = (portfolioMode === 'real' || portfolioMode === 'micro') ? 'real' : 'virtual';
        
        // Загружаем стратегии с информацией о распределении бюджета для правильного типа портфеля
        const strategiesResp = await apiService.getStrategyAllocations(portfolioType);
        
        // API возвращает: { success: true, data: { strategies: [...], totalAllocated, ... } }
        let strategiesData = [];
        if (strategiesResp) {
          if (Array.isArray(strategiesResp)) {
            strategiesData = strategiesResp;
          } else if (strategiesResp.strategies && Array.isArray(strategiesResp.strategies)) {
            strategiesData = strategiesResp.strategies;
          } else if (strategiesResp.data) {
            if (Array.isArray(strategiesResp.data)) {
              strategiesData = strategiesResp.data;
            } else if (strategiesResp.data.strategies && Array.isArray(strategiesResp.data.strategies)) {
              strategiesData = strategiesResp.data.strategies;
            }
          }
        }
        
        // Преобразуем формат данных: API возвращает стратегии с прямыми полями,
        // но компоненты ожидают объект allocation
        const transformedStrategies = strategiesData.map((strategy: any) => {
          // Если уже есть allocation, оставляем как есть
          if (strategy.allocation) {
            return strategy;
          }
          
          // Иначе создаем объект allocation из прямых полей
          return {
            ...strategy,
            allocation: {
              allocatedAmount: strategy.allocatedAmount || 0,
              usedAmount: strategy.usedAmount || 0,
              availableAmount: strategy.availableAmount || 0,
              realUsedAmount: strategy.realUsedAmount || strategy.usedAmount || 0,
              positionsCount: strategy.positionsCount || 0
            }
          };
        });
        
        console.log('📊 Loaded strategies:', transformedStrategies.length, transformedStrategies);
        setStrategies(transformedStrategies);

        // Группируем позиции по стратегиям и фильтруем рекомендации по стратегиям
        // Бэкенд уже правильно группирует позиции по FIGI + strategyId, поэтому просто используем стратегию из данных
        const positionsByStrategy: Record<number, Position[]> = {};

        // Группируем позиции по стратегиям (используем positionsWithPredictions, чтобы сохранить стратегию)
        positionsWithPredictions.forEach(pos => {
          // Проверяем наличие стратегии в позиции
          const strategyId = pos.strategy?.id;
          if (strategyId) {
            if (!positionsByStrategy[strategyId]) {
              positionsByStrategy[strategyId] = [];
            }
            // Бэкенд уже правильно сгруппировал позиции по FIGI + strategyId,
            // поэтому просто добавляем позицию в соответствующую стратегию
            positionsByStrategy[strategyId].push(pos);
          }
        });

        // Фильтруем рекомендации по стратегиям из уже загруженных рекомендаций
        const finalStrategyPositions: Record<number, Position[]> = {};
        Object.keys(positionsByStrategy).forEach(strategyIdStr => {
          const strategyId = parseInt(strategyIdStr);
          const strategyPositionsList = positionsByStrategy[strategyId];
          const figis = new Set(strategyPositionsList.map(p => p.figi));
          
          // Фильтруем рекомендации для этой стратегии и позиций
          const strategyRecs = recommendationsForPositions.filter(rec => {
            const recFigi = rec?.item?.figi || rec?.figi;
            const recStrategyId = rec?.strategyId || rec?.strategy?.id;
            return figis.has(recFigi) && recStrategyId === strategyId;
          });
          
          // Группируем по FIGI, беря самую свежую рекомендацию
          const recsMap = new Map<string, any>();
          strategyRecs.forEach(rec => {
            const recFigi = rec?.item?.figi || rec?.figi;
            if (!recFigi) return;
            
            const existingRec = recsMap.get(recFigi);
            const recDate = new Date(rec?.analysisDate || rec?.createdAt || 0);
            const existingDate = existingRec ? new Date(existingRec?.analysisDate || existingRec?.createdAt || 0) : new Date(0);
            
            if (!existingRec || recDate > existingDate) {
              recsMap.set(recFigi, rec);
            }
          });
          
          finalStrategyPositions[strategyId] = attachPredictionsToPositions(
            strategyPositionsList, 
            Array.from(recsMap.values())
          );
        });

        setStrategyPositions(finalStrategyPositions);
        
        // Отладочный вывод
        console.log('📊 Strategies loaded:', strategiesData.length);
        console.log('📊 Positions by strategy:', Object.keys(finalStrategyPositions).length);
        Object.keys(finalStrategyPositions).forEach(strategyId => {
          console.log(`  Strategy ${strategyId}: ${finalStrategyPositions[parseInt(strategyId)].length} positions`);
        });
      } catch (strategiesErr) {
        console.warn('Could not load strategies:', strategiesErr);
      }

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

      const response = await apiService.analyzePortfolioPositionsOnly();
      
      // Если анализ уже есть в БД, сразу показываем результаты
      if (response.data && response.data.sellRecommendations) {
        const sellRecs = response.data.sellRecommendations || [];
        setAnalysisResults({
          sellRecommendations: sellRecs
        });
        // Обновляем предсказания в таблице
        setPositions((prev) => attachPredictionsToPositions(prev, sellRecs));
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
      <div className="portfolio-visualization-section">
        <PortfolioSummaryCard
          portfolio={portfolio}
          loading={loading}
          isConnected={isConnected}
          strategies={strategies}
          strategyPositions={strategyPositions}
        />
      </div>

      {error && (
        <div className="portfolio-visualization-error">
          <Alert variant="error" size="md">
            {error}
          </Alert>
        </div>
      )}

      {/* Карточка Позиции */}
      <div className="portfolio-visualization-section">
        <PortfolioPositionsTable
          positions={positions}
          loading={loading}
          error={error}
          onRefresh={loadPortfolioData}
          onAnalyze={handleAnalyzePortfolio}
          analyzing={analyzing}
          onSellSuccess={loadPortfolioData}
        />
      </div>

      {/* Синхронизация портфеля со стратегиями */}
      <div className="portfolio-visualization-section">
        <PortfolioSync />
      </div>

      {/* Таблицы по стратегиям */}
      {strategies.length > 0 && (
        <div className="portfolio-visualization-section">
          <h2 className="portfolio-visualization-strategies-title">Позиции по стратегиям</h2>
          <div className="portfolio-visualization-strategies">
            {strategies.map((strategy) => {
              const strategyPositionsList = strategyPositions[strategy.id] || [];
              return (
                <div key={strategy.id} className="portfolio-visualization-strategy-item">
                  <StrategyPositionsTable
                    strategyId={strategy.id}
                    strategyName={strategy.name}
                    strategyType={strategy.type}
                    positions={strategyPositionsList}
                    loading={loading}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Карточка Аналитика */}
      <div className="portfolio-visualization-analytics">
        <div className="portfolio-visualization-charts">
          <PortfolioCharts
            positions={positions}
            portfolio={portfolio}
          />
        </div>
        <div className="portfolio-visualization-stats">
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
