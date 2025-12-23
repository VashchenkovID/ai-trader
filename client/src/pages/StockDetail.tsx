import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Toast } from 'primereact/toast';
import { apiService } from '../services/apiService';
import { useStockDataCache } from '../hooks/useStockDataCache';
import { useWebSocketData } from '../components/WebSocketDataProvider';
import { Button as UIButton, Card as UICard, Modal, Alert, Skeleton } from '../components/ui';
import StockHero from '../components/stock/StockHero';
import HorizonCards from '../components/stock/HorizonCards';
import StockDetailSkeleton from '../components/stock/StockDetailSkeleton';
import PriceChart from '../components/stock/PriceChart';
import VolumeChart from '../components/stock/VolumeChart';
import SignalsList from '../components/stock/SignalsList';
import NewsList from '../components/stock/NewsList';
import SignalCard from '../components/stock/SignalCard';
import NewsCard from '../components/stock/NewsCard';
import './StockDetail.css';

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


interface NewsItem {
  title: string;
  description?: string;
  url?: string;
  publishedAt: string;
  source?: {
    name: string;
  };
}

interface SignalItem {
  signalId: string;
  strategyId: string;
  strategyName: string;
  createDt: string;
  endDt: string;
  direction: 'SIGNAL_DIRECTION_BUY' | 'SIGNAL_DIRECTION_SELL' | 'SIGNAL_DIRECTION_UNSPECIFIED';
  initialPrice: number | null;
  targetPrice: number | null;
  stoploss: number | null;
  probability: number;
  name: string;
  info?: string;
  isActive: boolean;
}

type TimePeriod = 'day' | 'week' | 'month' | 'year';

const StockDetail: React.FC = () => {
  const { figi } = useParams<{ figi: string }>();
  const navigate = useNavigate();
  const toast = useRef<Toast>(null);
  const { getCached, setCached } = useStockDataCache();
  
  const [loading, setLoading] = useState(true);
  const [stockDetail, setStockDetail] = useState<StockDetail | null>(null);
  const [priceCandles, setPriceCandles] = useState<Candle[]>([]);
  const [volumeCandles, setVolumeCandles] = useState<Candle[]>([]);
  const [currentPrediction, setCurrentPrediction] = useState<any>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pricePeriod, setPricePeriod] = useState<TimePeriod>('week');
  const [volumePeriod, setVolumePeriod] = useState<TimePeriod>('week');
  const [loadingNews, setLoadingNews] = useState(false);
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [showSignalsModal, setShowSignalsModal] = useState(false);
  const [showNewsModal, setShowNewsModal] = useState(false);
  const [modalSignals, setModalSignals] = useState<SignalItem[]>([]);
  const [modalNews, setModalNews] = useState<NewsItem[]>([]);
  const [loadingMoreSignals, setLoadingMoreSignals] = useState(false);
  const [loadingMoreNews, setLoadingMoreNews] = useState(false);
  const [hasMoreSignals, setHasMoreSignals] = useState(true);
  const [hasMoreNews, setHasMoreNews] = useState(true);
  const signalsModalRef = useRef<HTMLDivElement>(null);
  const newsModalRef = useRef<HTMLDivElement>(null);

  // WebSocket для реал-тайм обновлений
  const { socket, isConnected, subscribe, unsubscribe } = useWebSocketData();

  // Подписка на WebSocket обновления для конкретной акции
  useEffect(() => {
    if (!figi || !isConnected || !socket) return;

    // Подписываемся на обновления для конкретной акции
    subscribe(`stock_${figi}`, 'stock_updates');

    // Обработчик сообщений WebSocket
    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        
        // Обновление цены акции
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
          
          // Обновляем кэш
          setStockDetail(prev => {
            if (!prev) return prev;
            const updated = {
              ...prev,
              currentPrice: priceData.price || prev.currentPrice,
              lastPrice: prev.currentPrice,
              lastPriceTime: priceData.timestamp || new Date().toISOString()
            };
            setCached('stockDetail', figi, updated);
            return updated;
          });
          
          // Добавляем новую свечу в график, если есть
          if (priceData.price) {
            setPriceCandles(prev => {
              if (prev.length === 0) return prev;
              const lastCandle = prev[prev.length - 1];
              const newCandle: Candle = {
                time: priceData.timestamp || new Date().toISOString(),
                open: lastCandle.close,
                high: Math.max(lastCandle.high, priceData.price),
                low: Math.min(lastCandle.low, priceData.price),
                close: priceData.price,
                volume: priceData.volume || lastCandle.volume
              };
              
              const updated = [...prev];
              updated[updated.length - 1] = newCandle;
              return updated;
            });
          }
        }
        
        // Новый сигнал для этой акции
        if (message.type === 'trading_signal' && message.data?.figi === figi) {
          const signalData = message.data;
          const newSignal: SignalItem = {
            signalId: signalData.signalId || `signal_${Date.now()}`,
            strategyId: signalData.strategyId || '',
            strategyName: signalData.strategyName || signalData.strategy || 'Неизвестная стратегия',
            direction: signalData.direction || signalData.signalType || 'SIGNAL_DIRECTION_UNSPECIFIED',
            probability: signalData.probability || (signalData.confidence ? Math.round(signalData.confidence * 100) : undefined),
            name: signalData.name || '',
            createDt: signalData.timestamp || signalData.createDt || new Date().toISOString(),
            endDt: signalData.endDt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            initialPrice: signalData.entryPrice || signalData.initialPrice || null,
            targetPrice: signalData.takeProfit || signalData.targetPrice || null,
            stoploss: signalData.stopLoss || signalData.stoploss || null,
            info: signalData.info || signalData.description || '',
            isActive: true
          };
          
          setSignals(prev => {
            const exists = prev.some(s => s.signalId === newSignal.signalId);
            if (exists) return prev;
            return [newSignal, ...prev];
          });
          
          // Показываем уведомление для важных сигналов
          if (signalData.confidence && signalData.confidence > 0.7) {
            toast.current?.show({
              severity: 'info',
              summary: 'Новый торговый сигнал',
              detail: `${signalData.signalType || 'Сигнал'} для ${stockDetail?.ticker || figi}`,
              life: 5000
            });
          }
        }
        
        // Новая новость для этой акции
        if (message.type === 'news_update' && message.data?.figi === figi) {
          const newsData = message.data;
          const newNews: NewsItem = {
            title: newsData.title || '',
            description: newsData.description || '',
            url: newsData.url || '',
            publishedAt: newsData.publishedAt || newsData.timestamp || new Date().toISOString(),
            source: newsData.source ? (typeof newsData.source === 'string' ? { name: newsData.source } : newsData.source) : { name: 'Неизвестный источник' }
          };
          
          setNews(prev => {
            const exists = prev.some(n => n.title === newNews.title && n.publishedAt === newNews.publishedAt);
            if (exists) return prev;
            const updated = [newNews, ...prev];
            setCached('news', figi, updated);
            return updated;
          });
          
          // Показываем уведомление
          toast.current?.show({
            severity: 'info',
            summary: 'Новая новость',
            detail: newNews.title,
            life: 5000
          });
        }
        
        // Обновление рекомендации
        if (message.type === 'recommendation' && message.data?.figi === figi) {
          const recommendationData = message.data;
          
          // Обрабатываем рекомендацию так же, как при загрузке
          let analysisObj = recommendationData.analysis;
          if (typeof analysisObj === 'string') {
            try {
              analysisObj = JSON.parse(analysisObj);
            } catch (e) {
              analysisObj = null;
            }
          }
          
          let explanationObj = recommendationData.explanation;
          if (typeof explanationObj === 'string') {
            try {
              explanationObj = JSON.parse(explanationObj);
            } catch (e) {
              explanationObj = null;
            }
          }
          
          let horizons = recommendationData.horizons || 
            (analysisObj?.horizons) || 
            (explanationObj?.details?.ensemble?.horizons) || 
            null;
          
          let confidence = recommendationData.confidence;
          let score = recommendationData.score;
          if (typeof confidence === 'number' && confidence > 1) confidence /= 100;
          if (typeof score === 'number' && score > 1) score /= 100;
          
          setCurrentPrediction({
            ...recommendationData,
            analysis: analysisObj || recommendationData.analysis || null,
            explanation: explanationObj || recommendationData.explanation || null,
            horizons: horizons,
            confidence,
            score,
            priceAtAnalysis: recommendationData.priceAtAnalysis || recommendationData.price || stockDetail?.currentPrice || 0
          });
          
          // Обновляем кэш
          setCached('recommendation', figi, { success: true, data: recommendationData });
          
          // Показываем уведомление
          toast.current?.show({
            severity: 'success',
            summary: 'Обновлена рекомендация',
            detail: `Новая рекомендация для ${stockDetail?.ticker || figi}`,
            life: 5000
          });
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };

    socket.addEventListener('message', handleMessage);

    return () => {
      socket.removeEventListener('message', handleMessage);
      unsubscribe(`stock_${figi}`, 'stock_updates');
    };
  }, [figi, socket, isConnected, subscribe, unsubscribe, setCached]);

  useEffect(() => {
    if (figi) {
      loadStockData();
    }
  }, [figi]);

  useEffect(() => {
    if (figi && stockDetail) {
      loadPriceCandles(pricePeriod);
    }
  }, [figi, pricePeriod]);

  useEffect(() => {
    if (figi && stockDetail) {
      loadVolumeCandles(volumePeriod);
    }
  }, [figi, volumePeriod]);

  const loadStockData = async () => {
    if (!figi) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Проверяем кэш для основных данных
      const cachedDetail = getCached<StockDetail>('stockDetail', figi);
      const cachedNews = getCached<NewsItem[]>('news', figi);
      const cachedSignals = getCached<{ success: boolean; data: SignalItem[] }>('signals', figi);
      const cachedRecommendation = getCached<{ success: boolean; data: any }>('recommendation', figi);
      
      // Если есть кэшированные данные, используем их для быстрого отображения
      if (cachedDetail) {
        setStockDetail(cachedDetail);
      }
      if (cachedNews) {
        setNews(cachedNews);
      }
      if (cachedSignals?.success) {
        setSignals(cachedSignals.data);
      }
      // Обрабатываем кэшированную рекомендацию, если она есть
      if (cachedRecommendation?.success && cachedRecommendation.data) {
        const dbPrediction = cachedRecommendation.data;
        // Парсим analysis и explanation, если они строки JSON
        let analysisObj = dbPrediction.analysis;
        if (typeof analysisObj === 'string') {
          try {
            analysisObj = JSON.parse(analysisObj);
          } catch (e) {
            analysisObj = null;
          }
        }
        
        let explanationObj = dbPrediction.explanation;
        if (typeof explanationObj === 'string') {
          try {
            explanationObj = JSON.parse(explanationObj);
          } catch (e) {
            explanationObj = null;
          }
        }
        
        // Извлекаем горизонты
        let horizons = dbPrediction.horizons || 
          (analysisObj?.horizons) || 
          (explanationObj?.details?.ensemble?.horizons) || 
          null;
        
        // Нормализуем confidence и score
        let confidence = dbPrediction.confidence;
        let score = dbPrediction.score;
        if (typeof confidence === 'number' && confidence > 1) confidence /= 100;
        if (typeof score === 'number' && score > 1) score /= 100;
        
        setCurrentPrediction({
          ...dbPrediction,
          analysis: analysisObj || dbPrediction.analysis || null,
          explanation: explanationObj || dbPrediction.explanation || null,
          horizons: horizons,
          confidence,
          score,
          priceAtAnalysis: dbPrediction.priceAtAnalysis || dbPrediction.price || cachedDetail?.currentPrice || 0
        });
      }
      
      // Загружаем данные из БД (как в таблице рекомендаций)
      console.log(`📊 Loading stock data for ${figi} from database...`);
      
      // Загружаем данные параллельно, но только если их нет в кэше или они устарели
      const [detailData, newsData, signalsData, recommendationData] = await Promise.all([
        cachedDetail ? Promise.resolve(cachedDetail) : apiService.getStockDetail(figi),
        cachedNews ? Promise.resolve(cachedNews) : apiService.getNews(figi, 20, 30).catch(() => []),
        cachedSignals?.success ? Promise.resolve(cachedSignals) : apiService.getStockSignals(figi, 20, false).catch(() => ({ success: true, data: [] })),
        cachedRecommendation?.success ? Promise.resolve(cachedRecommendation) : apiService.getLatestStockRecommendation(figi, 240).catch(() => ({ success: true, data: null }))
      ]);
      
      // Кэшируем загруженные данные
      if (detailData && !cachedDetail) {
        setCached('stockDetail', figi, detailData);
      }
      if (newsData && !cachedNews) {
        setCached('news', figi, newsData);
      }
      if (signalsData?.success && !cachedSignals?.success) {
        setCached('signals', figi, signalsData);
      }
      if (recommendationData?.success && !cachedRecommendation?.success) {
        setCached('recommendation', figi, recommendationData);
      }
      
      // Графики загружаем лениво (только при необходимости)
      // Не загружаем их здесь, чтобы ускорить первоначальную загрузку
      
      setStockDetail(detailData);
      
      // Используем данные из БД (как в таблице)
      if (recommendationData?.success && recommendationData?.data) {
        const dbPrediction = recommendationData.data;
        console.log(`✅ Loaded recommendation from DB for ${figi}:`, {
          recommendation: dbPrediction.recommendation,
          confidence: dbPrediction.confidence,
          score: dbPrediction.score,
          analysisDate: dbPrediction.analysisDate,
          isFromDatabase: dbPrediction.isFromDatabase
        });
        
        // Парсим analysis и explanation, если они строки JSON
        let analysisObj = dbPrediction.analysis;
        if (typeof analysisObj === 'string') {
          try {
            analysisObj = JSON.parse(analysisObj);
          } catch (e) {
            console.warn('Failed to parse analysis JSON:', e);
            analysisObj = null;
          }
        }
        
        let explanationObj = dbPrediction.explanation;
        if (typeof explanationObj === 'string') {
          try {
            explanationObj = JSON.parse(explanationObj);
          } catch (e) {
            console.warn('Failed to parse explanation JSON:', e);
            explanationObj = null;
          }
        }
        
        // Извлекаем горизонты из разных мест (в порядке приоритета, как в таблице)
        let horizons = null;
        // Приоритет 1: прямое поле horizons
        if (dbPrediction.horizons) {
          horizons = dbPrediction.horizons;
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
        
        // Нормализуем confidence и score: если больше 1, значит это процент (0-100), делим на 100
        if (typeof dbPrediction.confidence === 'number' && !isNaN(dbPrediction.confidence) && dbPrediction.confidence > 1) {
          dbPrediction.confidence = dbPrediction.confidence / 100;
        }
        if (typeof dbPrediction.score === 'number' && !isNaN(dbPrediction.score) && dbPrediction.score > 1) {
          dbPrediction.score = dbPrediction.score / 100;
        }
        
        // Формируем объект предсказания с унифицированной структурой (как в таблице)
        setCurrentPrediction({
          ...dbPrediction,
          analysis: analysisObj || dbPrediction.analysis || null,
          explanation: explanationObj || dbPrediction.explanation || null,
          horizons: horizons,
          priceAtAnalysis: dbPrediction.priceAtAnalysis || dbPrediction.price || stockDetail?.currentPrice || 0
        });
      } else {
        console.log(`⚠️ No recommendation found in DB for ${figi} (or too old)`);
        setCurrentPrediction(null);
      }
      
      // Преобразуем новости в нужный формат
      const formattedNews = Array.isArray(newsData) 
        ? newsData.map((item: any) => ({
            title: item.title || '',
            description: item.description || '',
            url: item.url || '',
            publishedAt: item.publishedAt || new Date().toISOString(),
            source: item.source ? (typeof item.source === 'string' ? { name: item.source } : item.source) : { name: 'Неизвестный источник' }
          }))
        : [];
      setNews(formattedNews);
      
      // Загружаем сигналы из БД
      if (signalsData.success && Array.isArray(signalsData.data)) {
        setSignals(signalsData.data);
      } else {
        setSignals([]);
      }
      
    } catch (err: any) {
      console.error('Error loading stock data:', err);
      setError(err.response?.data?.message || err.message || 'Ошибка загрузки данных');
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить данные об акции',
        life: 5000
      });
    } finally {
      setLoading(false);
    }
  };

  const loadPriceCandles = async (period: TimePeriod) => {
    if (!figi) return;
    
    let days = 365;
    let interval = 'DAY';
    
    switch (period) {
      case 'day':
        days = 1;
        interval = 'HOUR'; // Для дня используем часовые свечи
        break;
      case 'week':
        days = 7;
        interval = 'DAY';
        break;
      case 'month':
        days = 30;
        interval = 'DAY';
        break;
      case 'year':
        days = 365;
        interval = 'DAY';
        break;
    }
    
    // Проверяем кэш
    const cacheKey = `candles_price_${period}`;
    const cached = getCached<Candle[]>('candles', figi, cacheKey);
    
    if (cached) {
      setPriceCandles(cached);
      return;
    }
    
    try {
      const candlesData = await apiService.getStockCandles(figi, days, interval);
      const candles = candlesData || [];
      setPriceCandles(candles);
      
      // Кэшируем данные
      if (candles.length > 0) {
        setCached('candles', figi, candles, undefined, cacheKey);
      }
    } catch (err: any) {
      console.error('Error loading price candles:', err);
    }
  };

  const loadVolumeCandles = async (period: TimePeriod) => {
    if (!figi) return;
    
    let days = 365;
    let interval = 'DAY';
    
    switch (period) {
      case 'day':
        days = 1;
        interval = 'HOUR'; // Для дня используем часовые свечи
        break;
      case 'week':
        days = 7;
        interval = 'DAY';
        break;
      case 'month':
        days = 30;
        interval = 'DAY';
        break;
      case 'year':
        days = 365;
        interval = 'DAY';
        break;
    }
    
    // Проверяем кэш
    const cacheKey = `candles_volume_${period}`;
    const cached = getCached<Candle[]>('candles', figi, cacheKey);
    
    if (cached) {
      setVolumeCandles(cached);
      return;
    }
    
    try {
      const candlesData = await apiService.getStockCandles(figi, days, interval);
      const candles = candlesData || [];
      setVolumeCandles(candles);
      
      // Кэшируем данные
      if (candles.length > 0) {
        setCached('candles', figi, candles, undefined, cacheKey);
      }
    } catch (err: any) {
      console.error('Error loading volume candles:', err);
    }
  };

  const handleFetchFreshSignals = async () => {
    if (!figi) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Предупреждение',
        detail: 'FIGI не указан',
        life: 3000
      });
      return;
    }

    try {
      setLoadingSignals(true);
      const result = await apiService.fetchAndCacheSignals(figi);
      
      toast.current?.show({
        severity: 'success',
        summary: 'Успешно',
        detail: result.message || `Загружено ${result.data?.savedCount || 0} сигналов`,
        life: 3000
      });

      // Обновляем список сигналов после загрузки
      const signalsData = await apiService.getStockSignals(figi, 20, false);
      if (signalsData.success && Array.isArray(signalsData.data)) {
        setSignals(signalsData.data);
      }
    } catch (error: any) {
      console.error('Error fetching signals:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: error.response?.data?.message || error.message || 'Не удалось загрузить сигналы',
        life: 5000
      });
    } finally {
      setLoadingSignals(false);
    }
  };

  const handleFetchFreshNews = async () => {
    if (!figi) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Предупреждение',
        detail: 'FIGI не указан',
        life: 3000
      });
      return;
    }

    // Используем ticker из stockDetail, если он есть, иначе пытаемся получить из detailData
    const ticker = stockDetail?.ticker;
    if (!ticker) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Предупреждение',
        detail: 'Не удалось определить тикер инструмента. Попробуйте обновить страницу.',
        life: 3000
      });
      return;
    }

    try {
      setLoadingNews(true);
      console.log(`📰 Запрос свежих новостей для тикера: ${ticker}`);
      
      const result = await apiService.testNewsApiNews(ticker);
      
      console.log(`✅ Результат загрузки новостей:`, result);
      
      const newsCount = result?.data?.newsCount || result?.newsCount || 0;
      
      toast.current?.show({
        severity: 'success',
        summary: 'Успешно',
        detail: `Загружено ${newsCount} новостей`,
        life: 3000
      });

      // Перезагружаем новости из БД после успешного запроса
      // Увеличиваем задержку до 3 секунд для надежного сохранения в БД
      setTimeout(async () => {
        try {
          console.log(`🔄 Перезагрузка новостей из БД для FIGI: ${figi}`);
          const newsData = await apiService.getNews(figi || '', 20, 30).catch((err) => {
            console.error('Ошибка при перезагрузке новостей:', err);
            return [];
          });
          
          const formattedNews = Array.isArray(newsData) 
            ? newsData.map((item: any) => ({
                title: item.title || '',
                description: item.description || '',
                url: item.url || '',
                publishedAt: item.publishedAt || new Date().toISOString(),
                source: item.source ? (typeof item.source === 'string' ? { name: item.source } : item.source) : { name: 'Неизвестный источник' }
              }))
            : [];
          
          console.log(`📰 Загружено ${formattedNews.length} новостей из БД`);
          setNews(formattedNews);
        } catch (err) {
          console.error('Error reloading news:', err);
        }
      }, 3000); // Увеличена задержка для сохранения в БД
      
    } catch (err: any) {
      console.error('❌ Error fetching fresh news:', err);
      const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message || 'Не удалось загрузить свежие новости';
      
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: errorMessage,
        life: 5000
      });
    } finally {
      setLoadingNews(false);
    }
  };

  // Открытие модального окна для сигналов
  const handleOpenSignalsModal = async () => {
    if (!figi) return;
    
    setShowSignalsModal(true);
    setModalSignals([]);
    setHasMoreSignals(true);
    
    try {
      const signalsData = await apiService.getStockSignals(figi, 20, false);
      if (signalsData.success && Array.isArray(signalsData.data)) {
        setModalSignals(signalsData.data);
        setHasMoreSignals(signalsData.data.length >= 20);
      }
    } catch (err) {
      console.error('Error loading signals:', err);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить сигналы',
        life: 3000
      });
    }
  };

  // Открытие модального окна для новостей
  const handleOpenNewsModal = async () => {
    if (!figi) return;
    
    setShowNewsModal(true);
    setModalNews([]);
    setHasMoreNews(true);
    
    try {
      const newsData = await apiService.getNews(figi, 20, 30);
      const formattedNews = Array.isArray(newsData) 
        ? newsData.map((item: any) => ({
            title: item.title || '',
            description: item.description || '',
            url: item.url || '',
            publishedAt: item.publishedAt || new Date().toISOString(),
            source: item.source ? (typeof item.source === 'string' ? { name: item.source } : item.source) : { name: 'Неизвестный источник' }
          }))
        : [];
      setModalNews(formattedNews);
      setHasMoreNews(formattedNews.length >= 20);
    } catch (err) {
      console.error('Error loading news:', err);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить новости',
        life: 3000
      });
    }
  };

  // Загрузка дополнительных сигналов
  const loadMoreSignals = async () => {
    if (!figi || loadingMoreSignals || !hasMoreSignals) return;
    
    setLoadingMoreSignals(true);
    try {
      const currentCount = modalSignals.length;
      const signalsData = await apiService.getStockSignals(figi, currentCount + 20, false);
      if (signalsData.success && Array.isArray(signalsData.data)) {
        // Добавляем только новые сигналы (которые еще не загружены)
        const existingIds = new Set(modalSignals.map(s => s.signalId));
        const newSignals = signalsData.data.filter((s: SignalItem) => !existingIds.has(s.signalId));
        
        if (newSignals.length > 0) {
          setModalSignals([...modalSignals, ...newSignals]);
        }
        
        // Если получили меньше чем запросили, значит больше нет данных
        setHasMoreSignals(signalsData.data.length >= currentCount + 20);
      } else {
        setHasMoreSignals(false);
      }
    } catch (err) {
      console.error('Error loading more signals:', err);
      setHasMoreSignals(false);
    } finally {
      setLoadingMoreSignals(false);
    }
  };

  // Загрузка дополнительных новостей
  const loadMoreNews = async () => {
    if (!figi || loadingMoreNews || !hasMoreNews) return;
    
    setLoadingMoreNews(true);
    try {
      const currentCount = modalNews.length;
      const newsData = await apiService.getNews(figi, currentCount + 20, 30);
      const formattedNews = Array.isArray(newsData) 
        ? newsData.map((item: any) => ({
            title: item.title || '',
            description: item.description || '',
            url: item.url || '',
            publishedAt: item.publishedAt || new Date().toISOString(),
            source: item.source ? (typeof item.source === 'string' ? { name: item.source } : item.source) : { name: 'Неизвестный источник' }
          }))
        : [];
      
      // Добавляем только новые новости (проверяем по title и publishedAt)
      const existingKeys = new Set(modalNews.map(n => `${n.title}_${n.publishedAt}`));
      const newNews = formattedNews.filter((n: NewsItem) => !existingKeys.has(`${n.title}_${n.publishedAt}`));
      
      if (newNews.length > 0) {
        setModalNews([...modalNews, ...newNews]);
      }
      
      // Если получили меньше чем запросили, значит больше нет данных
      setHasMoreNews(formattedNews.length >= currentCount + 20);
    } catch (err) {
      console.error('Error loading more news:', err);
      setHasMoreNews(false);
    } finally {
      setLoadingMoreNews(false);
    }
  };

  // Обработка прокрутки для сигналов
  const handleSignalsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    
    if (scrollBottom < 100 && hasMoreSignals && !loadingMoreSignals) {
      loadMoreSignals();
    }
  };

  // Обработка прокрутки для новостей
  const handleNewsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    
    if (scrollBottom < 100 && hasMoreNews && !loadingMoreNews) {
      loadMoreNews();
    }
  };


  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };




  if (loading) {
    return <StockDetailSkeleton />;
  }

  if (error || !stockDetail) {
    return (
      <div className="stock-detail-page p-4">
        <UICard variant="default">
          <Alert variant="error" size="md">
            {error || 'Акция не найдена'}
          </Alert>
          <div style={{ marginTop: '16px' }}>
            <UIButton 
              variant="ghost"
              size="md"
              onClick={() => navigate(-1)}
            >
              ← Назад
            </UIButton>
          </div>
        </UICard>
      </div>
    );
  }

  return (
    <div className="stock-detail-page p-4">
      <Toast ref={toast} />
      
      {/* Заголовок с кнопкой назад */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px', gap: '12px' }}>
        <UIButton 
          variant="ghost"
          size="md"
          onClick={() => navigate(-1)}
          icon={<span>←</span>}
        >
          Назад
        </UIButton>
      </div>

      {/* Hero секция с основной информацией */}
      {stockDetail && (
        <StockHero
          stockDetail={stockDetail}
          currentPrediction={currentPrediction}
          onAnalysisComplete={loadStockData}
          onTrainingComplete={loadStockData}
        />
      )}

      {/* Прогнозы по горизонтам */}
      {currentPrediction && (() => {
        // Извлекаем горизонты из разных возможных мест
        let horizons = null;
        if (currentPrediction.horizons) {
          horizons = currentPrediction.horizons;
        } else if (currentPrediction.analysis?.horizons) {
          horizons = currentPrediction.analysis.horizons;
        } else if (currentPrediction.explanation?.details?.ensemble?.horizons) {
          horizons = currentPrediction.explanation.details.ensemble.horizons;
        } else if (currentPrediction.explanation?.details?.horizons) {
          horizons = currentPrediction.explanation.details.horizons;
        }
        
        if (!horizons) return null;
        
        const agreement = currentPrediction.agreement || currentPrediction.analysis?.agreement;
        
        return (
          <HorizonCards 
            horizons={horizons} 
            agreement={agreement}
          />
        );
      })()}

      {/* Основной контент */}
      <div className="grid">
        {/* Левая колонка - Графики и предсказания */}
        <div className="col-12 lg:col-8">
          {/* График динамики цены */}
          <PriceChart
            candles={priceCandles}
            period={pricePeriod}
            onPeriodChange={setPricePeriod}
            currency={stockDetail.currency}
          />

          {/* График объема торгов */}
          <VolumeChart
            candles={volumeCandles}
            period={volumePeriod}
            onPeriodChange={setVolumePeriod}
          />
        </div>

        {/* Правая колонка - Сигналы и Новости */}
        <div className="col-12 lg:col-4">
          {/* Сигналы */}
          <SignalsList
            signals={signals}
            loading={loadingSignals}
            onRefresh={handleFetchFreshSignals}
            onShowMore={handleOpenSignalsModal}
            formatDate={formatDate}
            formatCurrency={formatCurrency}
            figi={figi}
          />

          {/* Новости */}
          <NewsList
            news={news}
            loading={loadingNews}
            onRefresh={handleFetchFreshNews}
            onShowMore={handleOpenNewsModal}
            formatDate={formatDate}
            figi={figi}
            ticker={stockDetail?.ticker}
          />
        </div>
      </div>

      {/* Модальное окно для сигналов */}
      <Modal
        isOpen={showSignalsModal}
        onClose={() => setShowSignalsModal(false)}
        title="⚡ Торговые сигналы"
        size="lg"
      >
        <div
          ref={signalsModalRef}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto' }}
          onScroll={handleSignalsScroll}
        >
          {modalSignals.map((signal) => (
            <SignalCard
              key={signal.signalId}
              signal={signal}
              formatDate={formatDate}
              formatCurrency={formatCurrency}
            />
          ))}
          {loadingMoreSignals && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 0' }}>
              <Skeleton variant="rectangular" width="100%" height={120} />
              <Skeleton variant="rectangular" width="100%" height={120} />
            </div>
          )}
          {!hasMoreSignals && modalSignals.length > 0 && (
            <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: '16px 0' }}>
              Все сигналы загружены
            </div>
          )}
        </div>
      </Modal>

      {/* Модальное окно для новостей */}
      <Modal
        isOpen={showNewsModal}
        onClose={() => setShowNewsModal(false)}
        title="📰 Новости"
        size="lg"
      >
        <div
          ref={newsModalRef}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto' }}
          onScroll={handleNewsScroll}
        >
          {modalNews.map((item, index) => (
            <NewsCard
              key={index}
              news={item}
              formatDate={formatDate}
            />
          ))}
          {loadingMoreNews && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 0' }}>
              <Skeleton variant="rectangular" width="100%" height={100} />
              <Skeleton variant="rectangular" width="100%" height={100} />
            </div>
          )}
          {!hasMoreNews && modalNews.length > 0 && (
            <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: '16px 0' }}>
              Все новости загружены
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default StockDetail;
