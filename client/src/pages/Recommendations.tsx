import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Toast } from 'primereact/toast';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services';
import { Card } from '../components/ui';
import { Skeleton } from '../components/ui';
import { useWebSocketData } from '../components/WebSocketDataProvider';
import RecommendationsLayout from '../components/recommendations/RecommendationsLayout';
import RecommendationsSummary from '../components/recommendations/RecommendationsSummary';
import RecommendationsFiltersExtended from '../components/recommendations/RecommendationsFiltersExtended';
import RecommendationInstrumentCard from '../components/recommendations/RecommendationInstrumentCard';
import RecommendationsSidebar from '../components/recommendations/RecommendationsSidebar';
import './Recommendations.css';

interface Recommendation {
  figi: string;
  ticker: string;
  name: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  score: number;
  priceAtAnalysis: number;
  currentPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  sector?: string;
  analysisDate: string;
  isActive: boolean;
  explanation?: any;
  analysis?: any;
  // Дополнительные поля для совместимости с API
  id?: string;
  price?: number;
  action?: 'BUY' | 'SELL' | 'HOLD';
  createdAt?: string;
  strategyId?: number;
  horizons?: {
    shortTerm?: {
      recommendation: 'BUY' | 'SELL' | 'HOLD';
      score: number;
      confidence: number;
      name: string;
      description: string;
    };
    mediumTerm?: {
      recommendation: 'BUY' | 'SELL' | 'HOLD';
      score: number;
      confidence: number;
      name: string;
      description: string;
    };
    longTerm?: {
      recommendation: 'BUY' | 'SELL' | 'HOLD';
      score: number;
      confidence: number;
      name: string;
      description: string;
    };
  };
  strategy?: {
    id: number;
    name: string;
    type: 'conservative' | 'moderate' | 'aggressive';
  };
  suggestedStrategy?: {
    id: number;
    name: string;
    type: 'conservative' | 'moderate' | 'aggressive';
  };
  // Дополнительные поля для расширенной карточки
  portfolioPosition?: {
    size: number;
    pnl: number;
    entryDate: string;
    entryPrice: number;
  };
  risk?: {
    level: 'low' | 'medium' | 'high';
    volatility: number;
    maxRisk: number;
    withinLimits: boolean;
  };
  news?: {
    count: number;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    latest?: string;
  };
  sentiment?: {
    telegram: 'bullish' | 'bearish' | 'neutral';
    analysts: 'bullish' | 'bearish' | 'neutral';
  };
  priority?: 'critical' | 'high' | 'medium' | 'low';
}

interface PortfolioPosition {
  figi: string;
  ticker: string;
  name: string;
  size: number;
  pnl: number;
  currentPrice: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  proximityToStopLoss?: number;
  proximityToTakeProfit?: number;
}

const Recommendations: React.FC = () => {
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [portfolioPositions, setPortfolioPositions] = useState<PortfolioPosition[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Фильтры
  const [filterType, setFilterType] = useState<string>('all');
  const [filterConfidence, setFilterConfidence] = useState<string>('all');
  const [filterStrategy, setFilterStrategy] = useState<number | null>(null);
  const [filterSector, setFilterSector] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterHorizon, setFilterHorizon] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('confidence');
  
  const [strategies, setStrategies] = useState<Array<{ id: number; name: string; type: string }>>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [buyingFigi, setBuyingFigi] = useState<string | null>(null);
  const [newRecommendations, setNewRecommendations] = useState<Set<string>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const toast = useRef<Toast>(null);
  
  // WebSocket для real-time обновлений
  const { tradingStats } = useWebSocketData();

  // Загрузка стратегий
  useEffect(() => {
    loadStrategies();
  }, []);

  // Загрузка рекомендаций и портфеля
  useEffect(() => {
    if (strategies.length > 0) {
      loadRecommendations();
      loadPortfolioPositions();
    }
  }, [strategies.length, filterType, filterStrategy]);

  // Обновление данных каждую минуту
  useEffect(() => {
    const interval = setInterval(() => {
      if (strategies.length > 0) {
        loadRecommendations();
        loadPortfolioPositions();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [strategies.length]);

  // Обработка новых рекомендаций из WebSocket
  useEffect(() => {
    if (tradingStats?.recommendations && Array.isArray(tradingStats.recommendations)) {
      const wsRecommendations = tradingStats.recommendations;
      
      wsRecommendations.forEach((wsRec: Partial<Recommendation> & { figi?: string; price?: number }) => {
        const existingIndex = recommendations.findIndex((r) => r.figi === wsRec.figi);
        
        if (existingIndex === -1) {
          const newRec: Recommendation = {
            figi: wsRec.figi || '',
            ticker: wsRec.ticker || '',
            name: wsRec.name || 'Неизвестно',
            recommendation: wsRec.recommendation || 'HOLD',
            confidence: wsRec.confidence || 0,
            score: wsRec.score || 0,
            priceAtAnalysis: wsRec.priceAtAnalysis || wsRec.price || 0,
            targetPrice: wsRec.targetPrice,
            stopLoss: wsRec.stopLoss,
            takeProfit: wsRec.takeProfit,
            sector: wsRec.sector,
            analysisDate: wsRec.analysisDate || new Date().toISOString(),
            isActive: true,
            explanation: wsRec.explanation,
            analysis: wsRec.analysis,
            horizons: wsRec.horizons,
            strategy: wsRec.strategy,
            suggestedStrategy: wsRec.suggestedStrategy,
          };
          
          setRecommendations((prev) => [newRec, ...prev]);
          if (wsRec.figi) {
            setNewRecommendations((prev) => new Set([...prev, wsRec.figi!]));
          }
          
          if (wsRec.confidence && wsRec.confidence > 0.7) {
            toast.current?.show({
              severity: 'info',
              summary: 'Новая рекомендация',
              detail: `${wsRec.recommendation === 'BUY' ? 'Покупка' : wsRec.recommendation === 'SELL' ? 'Продажа' : 'Удержание'} ${wsRec.ticker} (уверенность: ${Math.round((wsRec.confidence || 0) * 100)}%)`,
              life: 5000,
            });
          }
          
          if (wsRec.figi) {
            setTimeout(() => {
              setNewRecommendations((prev) => {
                const newSet = new Set(prev);
                newSet.delete(wsRec.figi!);
                return newSet;
              });
            }, 30000);
          }
        } else {
          setRecommendations((prev) => {
            const updated = [...prev];
            updated[existingIndex] = {
              ...updated[existingIndex],
              ...wsRec,
              analysisDate: wsRec.analysisDate || updated[existingIndex].analysisDate,
            };
            return updated;
          });
        }
      });
    }
  }, [tradingStats?.recommendations]);

  const loadStrategies = async () => {
    try {
      const data = await apiService.getAllStrategies();
      setStrategies((data || []).map((s: { id: number; name?: string; type?: string }) => ({
        id: s.id,
        name: s.name || '',
        type: s.type || 'moderate'
      })));
    } catch (error) {
      console.error('Error loading strategies:', error);
    }
  };

  const loadRecommendations = async () => {
    try {
      setLoading(true);
      
      let data;
      if (filterType === 'all') {
        data = await apiService.getAllRecommendations();
      } else {
        data = await apiService.getRecommendationsByType(filterType);
      }
      
      let recommendationsData = [];
      if (Array.isArray(data)) {
        recommendationsData = data;
      } else if (data?.data && Array.isArray(data.data)) {
        recommendationsData = data.data;
      }
      
      const filteredData = recommendationsData.filter((rec: Recommendation) => rec.isActive !== false);
      
      const recommendationsWithStrategies = filteredData.map((rec: Recommendation) => {
        let strategy = null;
        
        if (rec.strategy && typeof rec.strategy === 'object' && rec.strategy !== null) {
          if (rec.strategy.id || rec.strategy.name) {
            strategy = rec.strategy;
          }
        }
        
        if (!strategy && rec.strategyId) {
          strategy = strategies.find((s: { id: number; type?: string }) => s.id === rec.strategyId);
        }
        
        let suggestedStrategy = strategy;
        if (!suggestedStrategy && strategies.length > 0) {
          try {
            const confidence = rec.confidence || 0;
            const score = rec.score || 0;
            
            if (confidence > 0.8 && score > 0.75) {
              suggestedStrategy = strategies.find((s: { type?: string }) => s.type === 'aggressive');
            } else if (confidence >= 0.6 && score >= 0.6) {
              suggestedStrategy = strategies.find((s: { type?: string }) => s.type === 'moderate');
            } else if (confidence >= 0.5 && score >= 0.5) {
              suggestedStrategy = strategies.find((s: { type?: string }) => s.type === 'conservative');
            }
          } catch (error) {
            // Игнорируем ошибки
          }
        }
        
        let analysisObj = rec.analysis;
        if (typeof analysisObj === 'string') {
          try {
            analysisObj = JSON.parse(analysisObj);
          } catch (e) {
            analysisObj = null;
          }
        }
        
        let explanationObj = rec.explanation;
        if (typeof explanationObj === 'string') {
          try {
            explanationObj = JSON.parse(explanationObj);
          } catch (e) {
            explanationObj = null;
          }
        }
        
        let horizons = null;
        if (rec.horizons) {
          horizons = rec.horizons;
        } else if (analysisObj && typeof analysisObj === 'object' && analysisObj.horizons) {
          horizons = analysisObj.horizons;
        } else if (explanationObj && typeof explanationObj === 'object') {
          horizons = explanationObj.details?.ensemble?.horizons || 
                     explanationObj.details?.horizons || 
                     explanationObj.horizons || 
                     null;
        }
        
        // Получаем текущую цену (если есть в портфеле)
        const portfolioPosition = portfolioPositions.find((p) => p.figi === rec.figi);
        const currentPrice = portfolioPosition?.currentPrice;
        
        // Определяем приоритет
        let priority: 'critical' | 'high' | 'medium' | 'low' = 'medium';
        if (rec.confidence >= 0.9 && rec.score >= 0.85) {
          priority = 'critical';
        } else if (rec.confidence >= 0.8 && rec.score >= 0.75) {
          priority = 'high';
        } else if (rec.confidence >= 0.6) {
          priority = 'medium';
        } else {
          priority = 'low';
        }
        
        // Если есть позиция в портфеле и близко к стоп-лоссу - критический приоритет
        if (portfolioPosition && portfolioPosition.proximityToStopLoss !== undefined && portfolioPosition.proximityToStopLoss < 5) {
          priority = 'critical';
        }
        
        return {
          figi: rec.figi || rec.id,
          ticker: rec.ticker || '',
          name: rec.name || 'Неизвестно',
          recommendation: rec.recommendation || rec.action || 'HOLD',
          confidence: rec.confidence || 0,
          score: rec.score || 0,
          priceAtAnalysis: rec.priceAtAnalysis || rec.price || 0,
          currentPrice: currentPrice,
          targetPrice: rec.targetPrice,
          stopLoss: rec.stopLoss,
          takeProfit: rec.takeProfit,
          sector: rec.sector,
          analysisDate: rec.analysisDate || rec.createdAt || new Date().toISOString(),
          isActive: rec.isActive !== undefined ? rec.isActive : true,
          explanation: explanationObj || rec.explanation || null,
          analysis: analysisObj || rec.analysis || null,
          strategy: strategy,
          suggestedStrategy: suggestedStrategy,
          strategyId: rec.strategyId || strategy?.id || suggestedStrategy?.id || null,
          horizons: horizons,
          portfolioPosition: portfolioPosition ? {
            size: portfolioPosition.size,
            pnl: portfolioPosition.pnl,
            entryDate: portfolioPosition.entryPrice.toString(), // Временно
            entryPrice: portfolioPosition.entryPrice,
          } : undefined,
          risk: {
            level: rec.confidence >= 0.8 ? 'high' : rec.confidence >= 0.6 ? 'medium' : 'low',
            volatility: 0.15, // TODO: получать из API
            maxRisk: 2, // TODO: получать из настроек
            withinLimits: true,
          },
          priority: priority,
        };
      });
      
      // Фильтруем по стратегии, если выбран фильтр
      let filteredRecommendations = recommendationsWithStrategies;
      if (filterStrategy !== null) {
        filteredRecommendations = recommendationsWithStrategies.filter((rec: Recommendation) => 
          rec.strategy?.id === filterStrategy || rec.suggestedStrategy?.id === filterStrategy
        );
      }
      
      setRecommendations(filteredRecommendations);
      
      // Извлекаем уникальные секторы
      const uniqueSectors = Array.from(
        new Set(filteredRecommendations.map((r: Recommendation) => r.sector).filter(Boolean))
      ) as string[];
      setSectors(uniqueSectors);
    } catch (error: unknown) {
      console.error('Error loading recommendations:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить рекомендации',
        life: 5000
      });
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  };

  const loadPortfolioPositions = async () => {
    try {
      const data = await apiService.getPortfolioPositions();
      
      let positionsData = [];
      if (Array.isArray(data?.data)) {
        positionsData = data.data;
      } else if (Array.isArray(data)) {
        positionsData = data;
      }
      
      const positions: PortfolioPosition[] = positionsData.map((pos: {
        figi?: string;
        instrumentId?: string;
        ticker?: string;
        name?: string;
        size?: number;
        quantity?: number;
        currentPrice?: number;
        price?: number;
        entryPrice?: number;
        averagePrice?: number;
        stopLoss?: number;
        takeProfit?: number;
      }) => {
        const currentPrice = pos.currentPrice || pos.price || 0;
        const entryPrice = pos.entryPrice || pos.averagePrice || 0;
        const pnl = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
        
        // Вычисляем близость к стоп-лоссу и тейк-профиту
        let proximityToStopLoss: number | undefined;
        let proximityToTakeProfit: number | undefined;
        
        if (pos.stopLoss && currentPrice > 0) {
          proximityToStopLoss = ((currentPrice - pos.stopLoss) / currentPrice) * 100;
        }
        
        if (pos.takeProfit && currentPrice > 0) {
          proximityToTakeProfit = ((pos.takeProfit - currentPrice) / currentPrice) * 100;
        }
        
        return {
          figi: pos.figi || pos.instrumentId || '',
          ticker: pos.ticker || '',
          name: pos.name || 'Неизвестно',
          size: pos.size || pos.quantity || 0,
          pnl: pnl,
          currentPrice: currentPrice,
          entryPrice: entryPrice,
          stopLoss: pos.stopLoss,
          takeProfit: pos.takeProfit,
          proximityToStopLoss: proximityToStopLoss,
          proximityToTakeProfit: proximityToTakeProfit,
        };
      });
      
      setPortfolioPositions(positions);
    } catch (error) {
      console.error('Error loading portfolio positions:', error);
      // Не показываем ошибку пользователю, просто оставляем пустой массив
      setPortfolioPositions([]);
    }
  };

  // Фильтрация и сортировка рекомендаций
  const filteredAndSortedRecommendations = useMemo(() => {
    let filtered = [...recommendations];

    // Поиск
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (rec) =>
          rec.name.toLowerCase().includes(searchLower) ||
          rec.ticker.toLowerCase().includes(searchLower) ||
          rec.sector?.toLowerCase().includes(searchLower)
      );
    }

    // Фильтр по типу
    if (filterType !== 'all') {
      filtered = filtered.filter((rec) => rec.recommendation === filterType);
    }

    // Фильтр по уверенности
    if (filterConfidence !== 'all') {
      filtered = filtered.filter((rec) => {
        const confidence = rec.confidence;
        if (filterConfidence === 'high') return confidence >= 0.8;
        if (filterConfidence === 'medium') return confidence >= 0.5 && confidence < 0.8;
        if (filterConfidence === 'low') return confidence < 0.5;
        return true;
      });
    }

    // Фильтр по сектору
    if (filterSector !== 'all') {
      filtered = filtered.filter((rec) => rec.sector === filterSector);
    }

    // Фильтр по приоритету
    if (filterPriority !== 'all') {
      filtered = filtered.filter((rec) => rec.priority === filterPriority);
    }

    // Фильтр по горизонту
    if (filterHorizon !== 'all') {
      filtered = filtered.filter((rec) => {
        // Проверяем горизонты в разных местах (в порядке приоритета)
        let horizons = null;
        
        // 1. Прямое поле horizons
        if (rec.horizons && typeof rec.horizons === 'object') {
          horizons = rec.horizons;
        }
        // 2. explanation.details.ensemble.horizons
        else if (rec.explanation?.details?.ensemble?.horizons && typeof rec.explanation.details.ensemble.horizons === 'object') {
          horizons = rec.explanation.details.ensemble.horizons;
        }
        // 3. explanation.horizons
        else if (rec.explanation?.horizons && typeof rec.explanation.horizons === 'object') {
          horizons = rec.explanation.horizons;
        }
        // 4. analysis.horizons
        else if ((rec as any).analysis?.horizons && typeof (rec as any).analysis.horizons === 'object') {
          horizons = (rec as any).analysis.horizons;
        }
        
        if (!horizons) return false;
        
        // Проверяем наличие конкретного горизонта с данными
        if (filterHorizon === 'shortTerm') {
          const shortTerm = horizons.shortTerm;
          return shortTerm !== null && shortTerm !== undefined && (
            shortTerm.recommendation !== undefined ||
            shortTerm.score !== undefined ||
            shortTerm.confidence !== undefined ||
            (shortTerm.strategies && Object.keys(shortTerm.strategies).length > 0)
          );
        } else if (filterHorizon === 'mediumTerm') {
          const mediumTerm = horizons.mediumTerm;
          return mediumTerm !== null && mediumTerm !== undefined && (
            mediumTerm.recommendation !== undefined ||
            mediumTerm.score !== undefined ||
            mediumTerm.confidence !== undefined ||
            (mediumTerm.strategies && Object.keys(mediumTerm.strategies).length > 0)
          );
        } else if (filterHorizon === 'longTerm') {
          const longTerm = horizons.longTerm;
          return longTerm !== null && longTerm !== undefined && (
            longTerm.recommendation !== undefined ||
            longTerm.score !== undefined ||
            longTerm.confidence !== undefined ||
            (longTerm.strategies && Object.keys(longTerm.strategies).length > 0)
          );
        }
        return true;
      });
    }

    // Сортировка
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'confidence':
          return b.confidence - a.confidence;
        case 'profit':
          const profitA = a.targetPrice && a.recommendation === 'BUY'
            ? ((a.targetPrice - a.priceAtAnalysis) / a.priceAtAnalysis) * 100
            : 0;
          const profitB = b.targetPrice && b.recommendation === 'BUY'
            ? ((b.targetPrice - b.priceAtAnalysis) / b.priceAtAnalysis) * 100
            : 0;
          return profitB - profitA;
        case 'risk':
          const riskA = a.stopLoss && a.recommendation === 'BUY'
            ? ((a.priceAtAnalysis - a.stopLoss) / a.priceAtAnalysis) * 100
            : 100;
          const riskB = b.stopLoss && b.recommendation === 'BUY'
            ? ((b.priceAtAnalysis - b.stopLoss) / b.priceAtAnalysis) * 100
            : 100;
          return riskA - riskB;
        case 'time':
          return new Date(b.analysisDate).getTime() - new Date(a.analysisDate).getTime();
        default:
          return 0;
      }
    });

    // Приоритизация: критические в начало
    filtered.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return (priorityOrder[a.priority || 'medium'] || 2) - (priorityOrder[b.priority || 'medium'] || 2);
    });

    return filtered;
  }, [recommendations, searchTerm, filterType, filterConfidence, filterSector, filterPriority, filterHorizon, sortBy]);

  // Вычисление сводки
  const summaryData = useMemo(() => {
    const buyCount = filteredAndSortedRecommendations.filter((r) => r.recommendation === 'BUY').length;
    const sellCount = filteredAndSortedRecommendations.filter((r) => r.recommendation === 'SELL').length;
    const holdCount = filteredAndSortedRecommendations.filter((r) => r.recommendation === 'HOLD').length;
    const highConfidenceCount = filteredAndSortedRecommendations.filter((r) => r.confidence >= 0.8).length;
    
    // Вычисляем согласованность (на основе горизонтов)
    const recommendationsWithHorizons = filteredAndSortedRecommendations.filter((r) => r.horizons);
    let agreementScore = 0;
    if (recommendationsWithHorizons.length > 0) {
      const agreements = recommendationsWithHorizons.map((r) => {
        const horizons = [
          r.horizons?.shortTerm,
          r.horizons?.mediumTerm,
          r.horizons?.longTerm,
        ].filter(Boolean);
        
        if (horizons.length === 0) return 0;
        
        const sameRecommendation = horizons.filter(
          (h) => h?.recommendation === r.recommendation
        ).length;
        
        return sameRecommendation / horizons.length;
      });
      
      agreementScore = agreements.reduce((sum, a) => sum + a, 0) / agreements.length;
    }
    
    // Топ покупок
    const topBuy = filteredAndSortedRecommendations
      .filter((r) => r.recommendation === 'BUY')
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map((r) => ({
        figi: r.figi,
        ticker: r.ticker,
        name: r.name,
        confidence: r.confidence,
        potentialProfit: r.targetPrice && r.recommendation === 'BUY'
          ? ((r.targetPrice - r.priceAtAnalysis) / r.priceAtAnalysis) * 100
          : undefined,
      }));
    
    // Топ продаж
    const topSell = filteredAndSortedRecommendations
      .filter((r) => r.recommendation === 'SELL')
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map((r) => ({
        figi: r.figi,
        ticker: r.ticker,
        name: r.name,
        confidence: r.confidence,
        currentLoss: r.portfolioPosition?.pnl || undefined,
      }));
    
    return {
      totalRecommendations: filteredAndSortedRecommendations.length,
      buyCount,
      sellCount,
      holdCount,
      highConfidenceCount,
      agreementScore,
      topBuyRecommendations: topBuy,
      topSellRecommendations: topSell,
    };
  }, [filteredAndSortedRecommendations]);

  const handleBuy = (figi: string) => {
    const rec = recommendations.find((r) => r.figi === figi);
    if (!rec || !rec.priceAtAnalysis || rec.priceAtAnalysis <= 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Покупка недоступна',
        detail: 'Нет цены для инструмента, заявка не может быть создана',
        life: 4000,
      });
      setBuyingFigi(null);
      return;
    }

    setBuyingFigi(figi);
    setTimeout(() => {
      const buyButtonContainer = document.querySelector(`[data-buy-button-figi="${figi}"]`);
      if (buyButtonContainer) {
        const buyButton = buyButtonContainer.querySelector('button[data-buy-trigger]') || 
                          buyButtonContainer.querySelector('button.btn') ||
                          buyButtonContainer.querySelector('button');
        if (buyButton && !(buyButton as HTMLButtonElement).disabled) {
          (buyButton as HTMLButtonElement).click();
        } else {
          setBuyingFigi(null);
        }
      } else {
        setBuyingFigi(null);
      }
    }, 100);
  };

  const handleDetails = (figi: string) => {
    navigate(`/stock/${figi}`);
  };

  const handleWatchlist = (figi: string) => {
    // TODO: реализовать добавление в наблюдение
    toast.current?.show({
      severity: 'info',
      summary: 'Добавлено в наблюдение',
      detail: `Инструмент ${figi} добавлен в список наблюдения`,
      life: 3000,
    });
  };

  const handleToggleExpand = (figi: string) => {
    setExpandedCards((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(figi)) {
        newSet.delete(figi);
      } else {
        newSet.add(figi);
      }
      return newSet;
    });
  };

  const handleClearFilters = () => {
    setFilterType('all');
    setFilterConfidence('all');
    setFilterStrategy(null);
    setFilterSector('all');
    setFilterPriority('all');
    setFilterHorizon('all');
    setSearchTerm('');
    setSortBy('confidence');
  };

  return (
    <div className="recommendations-page">
      <Toast ref={toast} />
      
      <RecommendationsLayout
        summary={
          <RecommendationsSummary
            totalRecommendations={summaryData.totalRecommendations}
            buyCount={summaryData.buyCount}
            sellCount={summaryData.sellCount}
            holdCount={summaryData.holdCount}
            highConfidenceCount={summaryData.highConfidenceCount}
            agreementScore={summaryData.agreementScore}
            topBuyRecommendations={summaryData.topBuyRecommendations}
            topSellRecommendations={summaryData.topSellRecommendations}
          />
        }
        filters={
          <RecommendationsFiltersExtended
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            filterType={filterType}
            onFilterTypeChange={setFilterType}
            filterConfidence={filterConfidence}
            onFilterConfidenceChange={setFilterConfidence}
            filterStrategy={filterStrategy}
            onFilterStrategyChange={setFilterStrategy}
            filterSector={filterSector}
            onFilterSectorChange={setFilterSector}
            filterPriority={filterPriority}
            onFilterPriorityChange={setFilterPriority}
            filterHorizon={filterHorizon}
            onFilterHorizonChange={setFilterHorizon}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            strategies={strategies}
            sectors={sectors}
            onRefresh={loadRecommendations}
            loading={loading}
            onClearFilters={handleClearFilters}
          />
        }
        content={
          loading ? (
            <div className="recommendations-grid">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} variant="rectangular" height="400px" />
              ))}
            </div>
          ) : filteredAndSortedRecommendations.length === 0 ? (
            <Card variant="default" className="recommendations-empty">
              <div className="recommendations-empty-content">
                <span className="recommendations-empty-icon">📊</span>
                <h3>Нет активных рекомендаций</h3>
                <p>Запустите анализ портфеля для получения рекомендаций.</p>
              </div>
            </Card>
          ) : (
            <div className="recommendations-grid">
              {filteredAndSortedRecommendations.map((recommendation) => (
                <RecommendationInstrumentCard
                  key={recommendation.figi}
                  recommendation={recommendation}
                  onBuy={handleBuy}
                  onDetails={handleDetails}
                  onWatchlist={handleWatchlist}
                  loading={buyingFigi === recommendation.figi}
                  isNew={newRecommendations.has(recommendation.figi)}
                  expanded={expandedCards.has(recommendation.figi)}
                  onToggleExpand={() => handleToggleExpand(recommendation.figi)}
                />
              ))}
            </div>
          )
        }
        sidebar={
          <RecommendationsSidebar
            portfolioPositions={portfolioPositions}
            topBuyRecommendations={summaryData.topBuyRecommendations}
            topSellRecommendations={summaryData.topSellRecommendations}
            recentChanges={[]} // TODO: получать из истории
            alerts={[]} // TODO: получать из системы алертов
            statistics={undefined} // TODO: получать из статистики
            onPositionClick={handleDetails}
            onRecommendationClick={handleDetails}
          />
        }
      />

    </div>
  );
};

export default Recommendations;
