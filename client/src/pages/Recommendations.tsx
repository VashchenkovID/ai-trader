import React, { useState, useEffect, useRef } from 'react';
import { Card } from 'primereact/card';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Dropdown } from 'primereact/dropdown';
import { Message } from 'primereact/message';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/apiService';
import { translateRecommendation } from '../utils/recommendationTranslator';
import HorizonsTemplate from '../components/recommendations/HorizonsTemplate';
import BuyButton from '../components/recommendations/BuyButton';
import RecommendationTemplate from '../components/recommendations/RecommendationTemplate';
import ConfidenceTemplate from '../components/recommendations/ConfidenceTemplate';
import StrategyTemplate from '../components/recommendations/StrategyTemplate';
import PriceTemplate from '../components/recommendations/PriceTemplate';
import SectorTemplate from '../components/recommendations/SectorTemplate';

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
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStrategy, setFilterStrategy] = useState<number | null>(null);
  const [strategies, setStrategies] = useState<any[]>([]);
  const toast = useRef<Toast>(null);

  const filterOptions = [
    { label: 'Все рекомендации', value: 'all' },
    { label: `Только ${translateRecommendation('BUY')}`, value: 'BUY' },
    { label: `Только ${translateRecommendation('SELL')}`, value: 'SELL' },
    { label: `Только ${translateRecommendation('HOLD')}`, value: 'HOLD' }
  ];

  useEffect(() => {
    loadStrategies();
  }, []);

  useEffect(() => {
    if (strategies.length > 0) {
      loadRecommendations(); // Загружаем рекомендации только после загрузки стратегий
    }
  }, [strategies.length, filterType, filterStrategy]);
  
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

  return (
    <div className="recommendations-page p-4">
      <Toast ref={toast} />
      
      <Card title="📊 Рекомендации AI для торговли" className="mb-4">
        <div className="flex justify-content-between align-items-center mb-3">
          <div className="flex align-items-center gap-3">
            <span className="text-600">Фильтр:</span>
            <Dropdown
              value={filterType}
              options={filterOptions}
              onChange={(e) => setFilterType(e.value)}
              placeholder="Тип рекомендации"
              style={{ minWidth: '200px' }}
            />
            <Dropdown
              value={filterStrategy}
              options={[
                { label: 'Все стратегии', value: null },
                ...strategies.map((s: any) => ({ label: s.name, value: s.id }))
              ]}
              onChange={(e) => setFilterStrategy(e.value)}
              placeholder="Стратегия"
              style={{ minWidth: '200px' }}
            />
            <Button
              icon="pi pi-refresh"
              label="Обновить"
              size="small"
              onClick={() => loadRecommendations()}
              loading={loading}
            />
          </div>
          <div className="text-sm text-600">
            Всего рекомендаций: <strong>{recommendations.length}</strong>
          </div>
        </div>

        {recommendations.length === 0 && !loading && (
          <Message 
            severity="info" 
            text="Нет активных рекомендаций. Запустите анализ портфеля для получения рекомендаций." 
            className="mb-3"
          />
        )}

        <DataTable
          value={recommendations}
          loading={loading}
          emptyMessage="Нет рекомендаций"
          paginator={recommendations.length > 10}
          rows={10}
          sortMode="multiple"
          className="p-datatable-sm"
          globalFilterFields={['ticker', 'name', 'recommendation', 'sector']}
        >
          <Column
            field="name"
            header="Инструмент"
            sortable
            style={{ minWidth: '250px' }}
            body={(rowData: Recommendation) => (
              <div 
                className="cursor-pointer hover:text-primary transition-colors"
                onClick={() => navigate(`/stock/${rowData.figi}`)}
                title="Нажмите для просмотра детальной информации"
              >
                <div className="font-medium">{rowData.name}</div>
                <div className="text-sm text-600">{rowData.ticker}</div>
              </div>
            )}
          />
          <Column
            field="recommendation"
            header="Общая рекомендация"
            body={(rowData: Recommendation) => <RecommendationTemplate rowData={rowData} />}
            sortable
            style={{ minWidth: '150px' }}
          />
          <Column
            field="horizons"
            header="Рекомендации по горизонтам"
            body={(rowData: Recommendation) => <HorizonsTemplate rowData={rowData} />}
            style={{ minWidth: '250px' }}
          />
          <Column
            field="confidence"
            header="Уверенность / Score"
            body={(rowData: Recommendation) => <ConfidenceTemplate rowData={rowData} />}
            sortable
            style={{ minWidth: '180px' }}
          />
          <Column
            field="priceAtAnalysis"
            header="Цена"
            body={(rowData: Recommendation) => <PriceTemplate rowData={rowData} />}
            sortable
            style={{ minWidth: '150px' }}
          />
          <Column
            field="sector"
            header="Сектор"
            body={(rowData: Recommendation) => <SectorTemplate rowData={rowData} />}
            sortable
            style={{ minWidth: '150px' }}
          />
          <Column
            field="analysisDate"
            header="Дата анализа"
            body={(rowData: Recommendation) => formatDate(rowData.analysisDate)}
            sortable
            style={{ minWidth: '150px' }}
          />
          <Column
            field="buy"
            header="Купить"
            body={(rowData: Recommendation) => <BuyButton rowData={rowData} onRequestCreated={loadRecommendations} />}
            style={{ minWidth: '120px' }}
            frozen
            alignFrozen="right"
          />
        </DataTable>
      </Card>
    </div>
  );
};

export default Recommendations;

