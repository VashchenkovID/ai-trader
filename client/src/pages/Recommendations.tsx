import React, { useState, useEffect, useRef } from 'react';
import { Toast } from 'primereact/toast';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/apiService';
import { Card } from '../components/ui';
import { RecommendationCard } from '../components/recommendations/RecommendationCard';
import { RecommendationFilters } from '../components/recommendations/RecommendationFilters';
import { Skeleton } from '../components/ui';
import BuyButton from '../components/recommendations/BuyButton';
import { useWebSocketData } from '../components/WebSocketDataProvider';
import './Recommendations.css';

interface Recommendation {
  figi: string;
  ticker: string;
  name: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  score: number;
  priceAtAnalysis: number;
  targetPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  sector?: string;
  analysisDate: string;
  isActive: boolean;
  explanation?: any; // JSON с объяснением стратегии
  analysis?: any;
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
  }; // JSON с деталями анализа
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
}

const Recommendations: React.FC = () => {
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [filteredRecommendations, setFilteredRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterConfidence, setFilterConfidence] = useState<string>('all');
  const [filterStrategy, setFilterStrategy] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [strategies, setStrategies] = useState<any[]>([]);
  const [buyingFigi, setBuyingFigi] = useState<string | null>(null);
  const [newRecommendations, setNewRecommendations] = useState<Set<string>>(new Set());
  const toast = useRef<Toast>(null);
  
  // WebSocket для real-time обновлений
  const { tradingStats } = useWebSocketData();


  useEffect(() => {
    loadStrategies();
  }, []);

  // Обработка новых рекомендаций из WebSocket
  useEffect(() => {
    if (tradingStats?.recommendations && Array.isArray(tradingStats.recommendations)) {
      const wsRecommendations = tradingStats.recommendations;
      
      // Добавляем новые рекомендации в список
      wsRecommendations.forEach((wsRec: any) => {
        const existingIndex = recommendations.findIndex((r) => r.figi === wsRec.figi);
        
        if (existingIndex === -1) {
          // Новая рекомендация - добавляем в начало списка
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
          setNewRecommendations((prev) => new Set([...prev, wsRec.figi]));
          
          // Показываем уведомление для важных рекомендаций
          if (wsRec.confidence > 0.7) {
            toast.current?.show({
              severity: 'info',
              summary: 'Новая рекомендация',
              detail: `${wsRec.recommendation === 'BUY' ? 'Покупка' : wsRec.recommendation === 'SELL' ? 'Продажа' : 'Удержание'} ${wsRec.ticker} (уверенность: ${Math.round(wsRec.confidence * 100)}%)`,
              life: 5000,
            });
          }
          
          // Убираем badge "Новое" через 30 секунд
          setTimeout(() => {
            setNewRecommendations((prev) => {
              const newSet = new Set(prev);
              newSet.delete(wsRec.figi);
              return newSet;
            });
          }, 30000);
        } else {
          // Обновляем существующую рекомендацию
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

  useEffect(() => {
    if (strategies.length > 0) {
      loadRecommendations(); // Загружаем рекомендации только после загрузки стратегий
    }
  }, [strategies.length, filterType, filterStrategy]);

  // Фильтрация рекомендаций
  useEffect(() => {
    let filtered = [...recommendations];

    // Фильтр по поиску
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (rec) =>
          rec.name.toLowerCase().includes(searchLower) ||
          rec.ticker.toLowerCase().includes(searchLower) ||
          rec.sector?.toLowerCase().includes(searchLower)
      );
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

    setFilteredRecommendations(filtered);
  }, [recommendations, searchTerm, filterConfidence]);
  
  useEffect(() => {
    const interval = setInterval(() => {
      if (strategies.length > 0) {
        loadRecommendations();
      }
    }, 60000); // Обновляем каждую минуту
    return () => clearInterval(interval);
  }, [strategies.length]);

  const loadStrategies = async () => {
    try {
      const data = await apiService.getAllStrategies();
      setStrategies(data || []);
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
      
      // Обрабатываем ответ
      let recommendationsData = [];
      if (Array.isArray(data)) {
        recommendationsData = data;
      } else if (data?.data && Array.isArray(data.data)) {
        recommendationsData = data.data;
      }
      
      // Фильтруем только активные рекомендации и просто отображаем данные из БД
      // Предсказания обновляются автоматически на бэкенде каждые 20 минут через планировщик
      const filteredData = recommendationsData.filter((rec: any) => rec.isActive !== false);
      
      // Определяем стратегии для всех рекомендаций (синхронно, так как strategies уже загружены)
      const recommendationsWithStrategies = filteredData.map((rec: any) => {
          // Используем стратегию из БД, если она есть
          let strategy = null;
          
          // Проверяем, есть ли стратегия в объекте rec.strategy (из include)
          if (rec.strategy && typeof rec.strategy === 'object' && rec.strategy !== null) {
            // Если strategy - объект с данными стратегии (из include)
            if (rec.strategy.id || rec.strategy.name) {
              strategy = rec.strategy;
            }
          }
          
          // Если стратегия не найдена, проверяем strategyId
          if (!strategy && rec.strategyId) {
            strategy = strategies.find((s: any) => s.id === rec.strategyId);
          }
          
          // Если стратегия не найдена в БД, определяем на основе confidence и score
          let suggestedStrategy = strategy;
          if (!suggestedStrategy && strategies.length > 0) {
            try {
              const confidence = rec.confidence || 0;
              const score = rec.score || 0;
              
              if (confidence > 0.8 && score > 0.75) {
                suggestedStrategy = strategies.find((s: any) => s.type === 'aggressive');
              } else if (confidence >= 0.6 && score >= 0.6) {
                suggestedStrategy = strategies.find((s: any) => s.type === 'moderate');
              } else if (confidence >= 0.5 && score >= 0.5) {
                suggestedStrategy = strategies.find((s: any) => s.type === 'conservative');
              }
            } catch (error) {
              // Игнорируем ошибки определения стратегии
            }
          }
          
        // Парсим analysis и explanation, если они строки JSON
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
        
        // Извлекаем горизонты из разных мест (в порядке приоритета)
        let horizons = null;
        // Приоритет 1: прямое поле horizons
        if (rec.horizons) {
          horizons = rec.horizons;
        }
        // Приоритет 2: analysis.horizons (как в БД)
        else if (analysisObj && typeof analysisObj === 'object' && analysisObj.horizons) {
          horizons = analysisObj.horizons;
        }
        // Приоритет 3: explanation.details.ensemble.horizons
        else if (explanationObj && typeof explanationObj === 'object') {
          horizons = explanationObj.details?.ensemble?.horizons || 
                     explanationObj.details?.horizons || 
                     explanationObj.horizons || 
                     null;
        }
        
        return {
          figi: rec.figi || rec.id,
          ticker: rec.ticker || '',
          name: rec.name || 'Неизвестно',
          recommendation: rec.recommendation || rec.action || 'HOLD',
          confidence: rec.confidence || 0,
          score: rec.score || 0,
          priceAtAnalysis: rec.priceAtAnalysis || rec.price || 0,
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
          horizons: horizons
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
    } catch (error: any) {
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

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '—';
    }
  };

  const handleBuy = (figi: string) => {
    // Проверяем, доступна ли цена — иначе покупка недоступна
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

    // Ставим индикатор загрузки
    setBuyingFigi(figi);

    // Находим скрытый BuyButton и кликаем по нему
    setTimeout(() => {
      const buyButtonContainer = document.querySelector(`[data-buy-button-figi="${figi}"]`);
      if (buyButtonContainer) {
        const buyButton = buyButtonContainer.querySelector('button[data-buy-trigger]') || 
                          buyButtonContainer.querySelector('button.btn') ||
                          buyButtonContainer.querySelector('button');
        if (buyButton && !(buyButton as HTMLButtonElement).disabled) {
          (buyButton as HTMLButtonElement).click();
        } else {
          // Если кнопка не найдена или disabled, сбрасываем лоадер
          setBuyingFigi(null);
        }
      } else {
        // Если контейнер не найден, сбрасываем лоадер
        setBuyingFigi(null);
      }
    }, 100); // Небольшая задержка для гарантии, что DOM готов
  };

  const handleBuyComplete = () => {
    setBuyingFigi(null);
    loadRecommendations();
  };

  const handleDetails = (figi: string) => {
    navigate(`/stock/${figi}`);
  };

  return (
    <div className="recommendations-page">
      <Toast ref={toast} />
      
      <div className="recommendations-header">
        <h1 className="recommendations-title">📊 Рекомендации AI для торговли</h1>
        <div className="recommendations-count">
          Всего рекомендаций: <strong>{filteredRecommendations.length}</strong>
        </div>
      </div>

      <RecommendationFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        filterType={filterType}
        onFilterTypeChange={setFilterType}
        filterConfidence={filterConfidence}
        onFilterConfidenceChange={setFilterConfidence}
        filterStrategy={filterStrategy}
        onFilterStrategyChange={setFilterStrategy}
        strategies={strategies}
        onRefresh={loadRecommendations}
        loading={loading}
      />

      {loading ? (
        <div className="recommendations-grid">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} variant="card" height="300px" />
          ))}
        </div>
      ) : filteredRecommendations.length === 0 ? (
        <Card variant="default" className="recommendations-empty">
          <div className="recommendations-empty-content">
            <span className="recommendations-empty-icon">📊</span>
            <h3>Нет активных рекомендаций</h3>
            <p>Запустите анализ портфеля для получения рекомендаций.</p>
          </div>
        </Card>
      ) : (
        <div className="recommendations-grid">
          {filteredRecommendations.map((recommendation) => (
            <RecommendationCard
              key={recommendation.figi}
              recommendation={recommendation}
              onBuy={handleBuy}
              onDetails={handleDetails}
              loading={buyingFigi === recommendation.figi}
              isNew={newRecommendations.has(recommendation.figi)}
            />
          ))}
        </div>
      )}

      {/* BuyButton компоненты для модальных окон - скрыты, но доступны для клика */}
      {filteredRecommendations.map((recommendation) => (
        <div 
          key={`buy-button-${recommendation.figi}`} 
          data-buy-button-figi={recommendation.figi}
          style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'auto' }}
        >
          <BuyButton
            rowData={recommendation}
            onRequestCreated={handleBuyComplete}
            onModalOpen={() => setBuyingFigi(null)}
          />
        </div>
      ))}
    </div>
  );
};

export default Recommendations;

