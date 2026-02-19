import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { apiService } from '../services/apiService';
import { api } from '../services/apiService';
import { weeklyForecastApi } from '../services/weeklyForecastApi';
import { useWebSocketData } from '../components/WebSocketDataProvider';
import { Skeleton } from '../components/ui';
import { calculateAllIndicators } from '../utils/technicalIndicators';

// Header
import StockDetailHeader from '../components/stock/StockDetailHeader';

// Карточки торговых параметров
import MainRecommendationCard from '../components/stock/MainRecommendationCard';
import WeeklyForecastRecommendationCard from '../components/stock/WeeklyForecastRecommendationCard';
import StrategyRecommendationsCard from '../components/stock/StrategyRecommendationsCard';

// Графики
import EnhancedPriceChart from '../components/stock/EnhancedPriceChart';
import VolumeChart from '../components/stock/VolumeChart';
import TechnicalIndicatorsPanel from '../components/stock/TechnicalIndicatorsPanel';

// Виджеты
import ActiveSignalsWidget from '../components/stock/ActiveSignalsWidget';
import RecentNewsWidget from '../components/stock/RecentNewsWidget';
import FundamentalMetricsWidget from '../components/stock/FundamentalMetricsWidget';

// Вкладки
import StockDetailTabs from '../components/stock/StockDetailTabs';

import './StockDetailNew.css';

interface StockDetail {
  figi: string;
  ticker: string;
  name: string;
  sector?: string;
  currentPrice: number;
  currency: string;
  lot: number;
  dividendYield?: number;
  lastPrice?: number;
  lastPriceTime?: string;
}

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type TimePeriod = 'day' | 'week' | 'month' | 'year' | 'all';

const StockDetailNew: React.FC = () => {
  const { figi } = useParams<{ figi: string }>();
  const [loading, setLoading] = useState(true);
  const [stockDetail, setStockDetail] = useState<StockDetail | null>(null);
  const [priceCandles, setPriceCandles] = useState<Candle[]>([]);
  const [recommendation, setRecommendation] = useState<any>(null);
  const [weeklyForecast, setWeeklyForecast] = useState<any>(null);
  const [signals, setSignals] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [fundamentalMetrics, setFundamentalMetrics] = useState<any>(null);
  const [technicalIndicators, setTechnicalIndicators] = useState<any>(null);
  const [pricePeriod, setPricePeriod] = useState<TimePeriod>('month');
  const [loadingNews, setLoadingNews] = useState(false);
  const [generatingForecast, setGeneratingForecast] = useState(false);
  
  const { socket, isConnected, subscribe, unsubscribe } = useWebSocketData();

  // Функция для расчета индикаторов из свечей
  const calculateIndicatorsFromCandles = useCallback((candles: Candle[]) => {
    if (candles && candles.length > 0) {
      try {
        const indicators = calculateAllIndicators(candles);
        setTechnicalIndicators(indicators);
      } catch (e) {
        console.warn('Failed to calculate technical indicators:', e);
      }
    }
  }, []);

  // Пересчитываем индикаторы при изменении периода или свечей
  useEffect(() => {
    if (priceCandles.length > 0) {
      calculateIndicatorsFromCandles(priceCandles);
    }
  }, [pricePeriod, priceCandles, calculateIndicatorsFromCandles]);

  // Загрузка данных
  useEffect(() => {
    if (!figi) return;

    const loadData = async () => {
      try {
        setLoading(true);

        // Загружаем основную информацию об акции
        const stockData = await apiService.getStockDetail(figi);
        setStockDetail(stockData);

        // Загружаем свечи (преобразуем TimePeriod в days)
        const periodToDays: Record<TimePeriod, number> = {
          day: 1,
          week: 7,
          month: 30,
          year: 365,
          all: 365
        };
        const days = periodToDays[pricePeriod];
        const candles = await apiService.getStockCandles(figi, days);
        setPriceCandles(candles);
        
        // Вычисляем технические индикаторы из свечей
        calculateIndicatorsFromCandles(candles);

        // Загружаем рекомендацию
        try {
          const recResponse = await apiService.getLatestStockRecommendation(figi);
          // API возвращает { success: true, data: {...} }
          if (recResponse?.success && recResponse?.data) {
            const recData = recResponse.data;
            setRecommendation(recData);
          } else if (recResponse?.data) {
            setRecommendation(recResponse.data);
          } else {
            setRecommendation(null);
          }
        } catch (e) {
          console.warn('Failed to load recommendation:', e);
          setRecommendation(null);
        }

        // Загружаем Weekly Forecast
        try {
          const forecast = await weeklyForecastApi.getForecast(figi);
          setWeeklyForecast(forecast);
        } catch (e) {
          console.warn('Failed to load weekly forecast:', e);
        }

        // Загружаем сигналы для конкретного инструмента
        try {
          const signalsResponse = await apiService.getStockSignals(figi, 100, false);
          // Обрабатываем разные форматы ответа
          const signalsData = signalsResponse?.data || signalsResponse || [];
          const signalsArray = Array.isArray(signalsData) ? signalsData : [];
          // Проверяем и устанавливаем isActive для каждого сигнала
          const processedSignals = signalsArray.map((s: any) => ({
            ...s,
            isActive: s.isActive !== undefined 
              ? s.isActive 
              : (s.endDt ? new Date(s.endDt) > new Date() : true)
          }));
          setSignals(processedSignals);
        } catch (e) {
          console.warn('Failed to load signals:', e);
          // Пробуем альтернативный метод
          try {
            const signalsData = await apiService.getAllSignals(100, false);
            const filteredSignals = (signalsData?.data || signalsData || [])
              .filter((s: any) => s.figi === figi)
              .map((s: any) => ({
                ...s,
                isActive: s.isActive !== undefined ? s.isActive : (s.endDt ? new Date(s.endDt) > new Date() : true)
              }));
            setSignals(filteredSignals);
          } catch (e2) {
            console.warn('Failed to load signals with fallback method:', e2);
          }
        }

        // Загружаем новости
        const loadNews = async () => {
          if (!figi) return;
          try {
            const newsData = await apiService.getNews(figi);
            setNews(newsData?.news || []);
          } catch (e) {
            console.warn('Failed to load news:', e);
          }
        };
        await loadNews();

        // Загружаем фундаментальные данные
        try {
          const fundamentalResponse = await api.get(`/api/fundamental-data/${figi}`);
          if (fundamentalResponse.data?.success && fundamentalResponse.data?.data) {
            // Извлекаем данные из Sequelize модели (может быть dataValues или напрямую)
            const rawData = fundamentalResponse.data.data;
            const fd = rawData.dataValues || rawData;
            const metadata = fd.metadata || {};
            
            // Преобразуем строковые значения в числа
            const parseNumber = (val: any) => {
              if (val === null || val === undefined) return undefined;
              const num = typeof val === 'string' ? parseFloat(val) : val;
              return isNaN(num) ? undefined : num;
            };
            
            setFundamentalMetrics({
              // Основные показатели из dataValues
              pe: parseNumber(fd.pe) || parseNumber(metadata.peRatioTtm),
              pb: parseNumber(fd.pb) || parseNumber(metadata.priceToBookTtm),
              ps: parseNumber(metadata.priceToSalesTtm),
              evEbitda: parseNumber(fd.evEbitda) || parseNumber(metadata.evToEbitdaMrq),
              
              // Дивиденды
              dividendYield: parseNumber(metadata.dividendYieldDailyTtm) || parseNumber(metadata.fiveYearsAverageDividendYield),
              dividendPerShare: parseNumber(metadata.dividendsPerShare) || parseNumber(metadata.dividendRateTtm),
              
              // Капитализация
              marketCap: parseNumber(metadata.marketCapitalization),
              
              // Прибыльность
              eps: parseNumber(metadata.epsTtm),
              roe: parseNumber(fd.roe) || parseNumber(metadata.roe),
              roa: parseNumber(metadata.roa),
              profitMargin: parseNumber(fd.netMargin) || parseNumber(metadata.netMarginMrq),
              
              // Финансовая устойчивость
              debtToEquity: parseNumber(metadata.totalDebtToEquityMrq),
              currentRatio: parseNumber(metadata.currentRatioMrq),
              quickRatio: undefined, // Не приходит в ответе
              
              // Сравнение с сектором (если есть)
              sectorPe: undefined,
              sectorPb: undefined,
              sectorDividendYield: undefined
            });
          }
        } catch (e) {
          console.warn('Failed to load fundamental data:', e);
        }

      } catch (error) {
        console.error('Error loading stock data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [figi, pricePeriod]);

  // WebSocket подписка
  useEffect(() => {
    if (!figi || !isConnected || !socket) return;

    subscribe(`stock_${figi}`, 'stock_updates');

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'stock_price_update' && message.data?.figi === figi) {
          const priceData = message.data;
          setStockDetail(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              currentPrice: priceData.price || prev.currentPrice,
              lastPrice: prev.currentPrice,
              lastPriceTime: priceData.timestamp || new Date().toISOString()
            };
          });
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    };

    socket.addEventListener('message', handleMessage);

    return () => {
      unsubscribe(`stock_${figi}`, 'stock_updates');
      socket.removeEventListener('message', handleMessage);
    };
  }, [figi, isConnected, socket, subscribe, unsubscribe]);

  if (loading || !stockDetail) {
    return (
      <div className="stock-detail-new">
        <Skeleton variant="rectangular" width="100%" height="80px" className="mb-4" />
        <Skeleton variant="rectangular" width="100%" height="400px" />
      </div>
    );
  }

  // Вычисляем изменение цены
  const priceChange = stockDetail.lastPrice 
    ? stockDetail.currentPrice - stockDetail.lastPrice 
    : 0;
  const priceChangePercent = stockDetail.lastPrice && stockDetail.lastPrice !== 0
    ? (priceChange / stockDetail.lastPrice) * 100 
    : 0;

  // Извлекаем данные из рекомендации (проверяем все возможные источники)
  let stopLoss = recommendation?.stopLoss 
    || recommendation?.analysis?.stopLoss 
    || recommendation?.explanation?.stopLoss
    || recommendation?.explanation?.details?.stopLoss
    || recommendation?.explanation?.details?.ensemble?.stopLoss
    || (recommendation?.analysis?.horizons?.shortTerm?.stopLoss)
    || (recommendation?.explanation?.details?.ensemble?.horizons?.shortTerm?.stopLoss);
  
  let takeProfit = recommendation?.takeProfit 
    || recommendation?.analysis?.takeProfit 
    || recommendation?.explanation?.takeProfit
    || recommendation?.explanation?.details?.takeProfit
    || recommendation?.explanation?.details?.ensemble?.takeProfit
    || (recommendation?.analysis?.horizons?.shortTerm?.takeProfit)
    || (recommendation?.explanation?.details?.ensemble?.horizons?.shortTerm?.takeProfit);
  
  // Проверяем и исправляем перепутанные значения
  // Стоп-лосс должен быть ниже текущей цены, тейк-профит - выше
  if (stopLoss && takeProfit && stockDetail.currentPrice) {
    const stopLossIsAbovePrice = stopLoss > stockDetail.currentPrice;
    const takeProfitIsBelowPrice = takeProfit < stockDetail.currentPrice;
    
    // Если оба значения перепутаны, меняем их местами
    if (stopLossIsAbovePrice && takeProfitIsBelowPrice) {
      [stopLoss, takeProfit] = [takeProfit, stopLoss];
    } else if (stopLossIsAbovePrice) {
      // Если только стоп-лосс выше цены, а тейк-профит правильный, меняем местами
      [stopLoss, takeProfit] = [takeProfit, stopLoss];
    } else if (takeProfitIsBelowPrice && stopLoss < stockDetail.currentPrice) {
      // Если только тейк-профит ниже цены, а стоп-лосс правильный, меняем местами
      [stopLoss, takeProfit] = [takeProfit, stopLoss];
    }
  }
  
  const targetPrice = recommendation?.targetPrice
    || recommendation?.analysis?.targetPrice
    || recommendation?.explanation?.targetPrice
    || recommendation?.explanation?.details?.targetPrice;
  
  const strategies = recommendation?.explanation?.details?.ensemble?.horizons?.shortTerm?.strategies;

  // Извлекаем данные из Weekly Forecast
  // Данные уже конвертированы на сервере в абсолютные цены
  const forecastData = weeklyForecast?.forecastData;
  
  // Используем predictedPriceChange из прогноза, если он есть, иначе считаем от текущей цены
  let forecastPrice: number | undefined;
  let forecastPriceChange: number | undefined;
  let forecastPriceChangePercent: number | undefined;
  
  if (forecastData && forecastData.length > 0) {
    // Берем последнюю цену закрытия из прогноза (уже конвертированную)
    forecastPrice = forecastData[forecastData.length - 1]?.close;
    
    // Если есть predictedPriceChange в прогнозе, используем его
    if (weeklyForecast?.predictedPriceChange !== undefined && weeklyForecast.predictedPriceChange !== null) {
      // predictedPriceChange может быть в процентах или абсолютном значении
      // Проверяем: если значение маленькое (< 1), то это процент, иначе абсолютное
      const predictedChange = weeklyForecast.predictedPriceChange;
      if (Math.abs(predictedChange) < 1 && stockDetail.currentPrice) {
        // Это процент (например, 0.9 = 0.9%)
        forecastPriceChangePercent = predictedChange;
        const calculatedChange = (stockDetail.currentPrice * predictedChange) / 100;
        forecastPriceChange = calculatedChange;
        forecastPrice = stockDetail.currentPrice + calculatedChange;
      } else {
        // Это абсолютное значение
        forecastPriceChange = predictedChange;
        if (stockDetail.currentPrice) {
          forecastPrice = stockDetail.currentPrice + predictedChange;
          forecastPriceChangePercent = stockDetail.currentPrice !== 0
            ? (predictedChange / stockDetail.currentPrice) * 100
            : undefined;
        }
      }
    } else if (forecastPrice && stockDetail.currentPrice) {
      // Считаем от текущей цены (данные уже конвертированы)
      const calculatedChange = forecastPrice - stockDetail.currentPrice;
      forecastPriceChange = calculatedChange;
      forecastPriceChangePercent = stockDetail.currentPrice !== 0
        ? (calculatedChange / stockDetail.currentPrice) * 100
        : undefined;
    }
  }

  return (
    <div className="stock-detail-new">
      {/* Header */}
      <StockDetailHeader
        ticker={stockDetail.ticker}
        name={stockDetail.name}
        sector={stockDetail.sector}
        currentPrice={stockDetail.currentPrice}
        priceChange={priceChange}
        priceChangePercent={priceChangePercent}
        currency={stockDetail.currency}
        figi={figi}
        stopLoss={stopLoss}
        takeProfit={takeProfit}
        lastUpdateTime={stockDetail.lastPriceTime}
        isLive={isConnected}
        onAnalyze={async () => {
          if (!figi) return;
          try {
            await apiService.analyzeSingleInstrument(figi);
            // Перезагружаем данные после анализа
            const recResponse = await apiService.getLatestStockRecommendation(figi);
            if (recResponse?.success && recResponse?.data) {
              setRecommendation(recResponse.data);
            }
          } catch (error) {
            console.error('Error analyzing:', error);
          }
        }}
        onTrain={async () => {
          if (!figi) return;
          try {
            await apiService.trainEnsemble(figi, { useNews: true });
          } catch (error) {
            console.error('Error training:', error);
          }
        }}
        onBuy={() => {
          // Callback после создания заявки на покупку
          console.log('Buy request created');
        }}
      />

      {/* Секция рекомендаций сразу после хедера */}
      <div className="stock-detail-new__recommendations-section">
        {recommendation && recommendation.recommendation && (
          <MainRecommendationCard
            recommendation={recommendation.recommendation}
            confidence={recommendation.confidence != null ? (recommendation.confidence > 1 ? recommendation.confidence : recommendation.confidence * 100) : 0}
            score={recommendation.score != null ? recommendation.score : 0}
            targetPrice={targetPrice}
            analysisDate={recommendation.analysisDate || recommendation.createdAt || new Date().toISOString()}
            currency={stockDetail.currency}
          />
        )}

        {strategies && (
          <StrategyRecommendationsCard
            aggressive={strategies.aggressive}
            moderate={strategies.moderate}
            conservative={strategies.conservative}
            currency={stockDetail.currency}
          />
        )}
      </div>

      {/* Основная сетка: 2 колонки (центральная - графики, правая - виджеты) */}
      <div className="stock-detail-new__grid">
        {/* Центральная колонка: Графики */}
        <div className="stock-detail-new__center-column">
          <EnhancedPriceChart
            candles={priceCandles}
            period={pricePeriod === 'all' ? 'year' : pricePeriod}
            onPeriodChange={setPricePeriod}
            currency={stockDetail.currency}
            currentPrice={stockDetail.currentPrice}
            stopLoss={stopLoss}
            takeProfit={takeProfit}
            targetPrice={targetPrice}
          />

          <VolumeChart
            candles={priceCandles}
            period={pricePeriod === 'all' ? 'year' : pricePeriod}
            onPeriodChange={(period) => setPricePeriod(period as TimePeriod)}
          />

          <TechnicalIndicatorsPanel
            rsi={technicalIndicators?.rsi}
            macd={technicalIndicators?.macd}
            sma20={technicalIndicators?.sma20}
            ema12={technicalIndicators?.ema12}
            atr={technicalIndicators?.atr}
            bollingerPosition={technicalIndicators?.bollingerPosition}
            currency={stockDetail.currency}
            labels={priceCandles.map(c => c.time)}
          />

          <WeeklyForecastRecommendationCard
            forecastPrice={forecastPrice}
            priceChange={forecastPriceChange}
            priceChangePercent={forecastPriceChangePercent}
            trend={weeklyForecast?.predictedTrend}
            confidenceScore={weeklyForecast?.confidenceScore != null ? (weeklyForecast.confidenceScore * 100) : undefined}
            volatility={weeklyForecast?.predictedVolatility}
            currency={stockDetail.currency}
            figi={figi!}
            ticker={stockDetail.ticker}
            forecastData={forecastData}
            onGenerate={async () => {
              if (!figi) return;
              setGeneratingForecast(true);
              try {
                const result = await weeklyForecastApi.generateForecast(figi, false);
                if (result.forecast) {
                  setWeeklyForecast(result.forecast);
                  // Показываем уведомление об успехе
                  console.log('Прогноз успешно сгенерирован');
                }
              } catch (error) {
                console.error('Ошибка генерации прогноза:', error);
                // Можно добавить toast-уведомление об ошибке
              } finally {
                setGeneratingForecast(false);
              }
            }}
            isGenerating={generatingForecast}
          />
        </div>

        {/* Правая колонка: Виджеты */}
        <div className="stock-detail-new__right-column">
          <ActiveSignalsWidget
            signals={signals}
            maxVisible={5}
          />

          <RecentNewsWidget
            news={news}
            maxVisible={5}
            onRefresh={async () => {
              if (!figi) return;
              setLoadingNews(true);
              try {
                // Используем метод для запроса свежих новостей
                const { newsService } = await import('../services/services/newsService');
                await newsService.fetchFreshNews(figi);
                // Затем загружаем обновленные новости
                const newsData = await apiService.getNews(figi);
                setNews(newsData?.news || []);
              } catch (e) {
                console.error('Failed to refresh news:', e);
                // Пробуем просто перезагрузить новости
                try {
                  const newsData = await apiService.getNews(figi);
                  setNews(newsData?.news || []);
                } catch (e2) {
                  console.error('Failed to reload news:', e2);
                }
              } finally {
                setLoadingNews(false);
              }
            }}
            isLoading={loadingNews}
          />

          <FundamentalMetricsWidget
            metrics={fundamentalMetrics || {}}
            currency={stockDetail.currency}
          />
        </div>
      </div>

      {/* Полная ширина: Вкладки детальной информации */}
      <div className="stock-detail-new__full-width">
        <StockDetailTabs
          figi={figi!}
          ticker={stockDetail.ticker}
          horizons={recommendation?.horizons || recommendation?.analysis?.horizons || recommendation?.explanation?.horizons || recommendation?.explanation?.details?.ensemble?.horizons || null}
          agreement={recommendation?.agreement != null ? recommendation.agreement : (recommendation?.analysis?.agreement != null ? recommendation.analysis.agreement : (recommendation?.explanation?.agreement != null ? recommendation.explanation.agreement : null))}
          weeklyForecasts={weeklyForecast ? [weeklyForecast] : []}
          signals={signals}
          news={news}
          technicalIndicators={technicalIndicators}
          fundamentalData={fundamentalMetrics ? { metrics: fundamentalMetrics } : undefined}
        />
      </div>
    </div>
  );
};

export default StockDetailNew;

