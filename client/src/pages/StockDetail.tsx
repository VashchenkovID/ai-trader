import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from 'primereact/card';
import { Chart } from 'primereact/chart';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { Badge } from 'primereact/badge';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Message } from 'primereact/message';
import { SelectButton } from 'primereact/selectbutton';
import { Divider } from 'primereact/divider';
import { Dialog } from 'primereact/dialog';
import { apiService } from '../services/apiService';
import { translateSector } from '../utils/sectorTranslator';
import { translateRecommendation } from '../utils/recommendationTranslator';
import { getConfidenceDescription, getScoreDescription } from '../utils/confidenceTranslator';
import BuyButton from '../components/recommendations/BuyButton';
import AnalyzeButton from '../components/recommendations/AnalyzeButton';
import TrainButton from '../components/recommendations/TrainButton';

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

interface PredictionHistory {
  id: string;
  analysisDate: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  score: number;
  confidence: number;
  explanation?: any;
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
  
  const [loading, setLoading] = useState(true);
  const [stockDetail, setStockDetail] = useState<StockDetail | null>(null);
  const [priceCandles, setPriceCandles] = useState<Candle[]>([]);
  const [volumeCandles, setVolumeCandles] = useState<Candle[]>([]);
  const [predictionHistory, setPredictionHistory] = useState<PredictionHistory[]>([]);
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

  const periodOptions = [
    { label: 'День', value: 'day' },
    { label: 'Неделя', value: 'week' },
    { label: 'Месяц', value: 'month' },
    { label: 'Год', value: 'year' }
  ];

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
      
      // Загружаем данные из БД (как в таблице рекомендаций)
      console.log(`📊 Loading stock data for ${figi} from database...`);
      
      // Загружаем остальные данные параллельно
      const [detailData, priceCandlesData, volumeCandlesData, historyData, newsData, signalsData, recommendationData] = await Promise.all([
        apiService.getStockDetail(figi),
        apiService.getStockCandles(figi, 365, 'DAY'), // За год по умолчанию для цены
        apiService.getStockCandles(figi, 365, 'DAY'), // За год по умолчанию для объема
        apiService.getStockPredictionHistory(figi),
        apiService.getNews(figi, 20, 30).catch(() => []), // Новости за 30 дней из БД
        apiService.getStockSignals(figi, 20, false).catch(() => ({ success: true, data: [] })), // Сигналы из БД
        apiService.getLatestStockRecommendation(figi, 24).catch(() => ({ success: true, data: null })) // Рекомендация из БД (макс 24 часа)
      ]);
      
      setStockDetail(detailData);
      setPriceCandles(priceCandlesData || []);
      setVolumeCandles(volumeCandlesData || []);
      setPredictionHistory(historyData || []);
      
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
    
    try {
      const candlesData = await apiService.getStockCandles(figi, days, interval);
      setPriceCandles(candlesData || []);
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
    
    try {
      const candlesData = await apiService.getStockCandles(figi, days, interval);
      setVolumeCandles(candlesData || []);
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

  const formatDateShort = (date: string | Date) => {
    return new Date(date).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'short'
    });
  };

  // Используем загруженные свечи напрямую (они уже загружены для нужного периода)
  const filteredCandlesForPrice = priceCandles;
  const filteredCandlesForVolume = volumeCandles;

  // График цены
  const priceChartData = {
    labels: filteredCandlesForPrice.map(c => formatDateShort(c.time)),
    datasets: [
      {
        label: 'Цена закрытия',
        data: filteredCandlesForPrice.map(c => c.close),
        borderColor: '#42A5F5',
        backgroundColor: 'rgba(66, 165, 245, 0.1)',
        tension: 0.4,
        fill: true
      },
      {
        label: 'Максимум',
        data: filteredCandlesForPrice.map(c => c.high),
        borderColor: '#66BB6A',
        backgroundColor: 'transparent',
        tension: 0.4,
        borderDash: [5, 5],
        pointRadius: 0
      },
      {
        label: 'Минимум',
        data: filteredCandlesForPrice.map(c => c.low),
        borderColor: '#EF5350',
        backgroundColor: 'transparent',
        tension: 0.4,
        borderDash: [5, 5],
        pointRadius: 0
      }
    ]
  };

  const priceChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true
        }
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        ticks: {
          callback: function(value: any) {
            return formatCurrency(value);
          }
        }
      }
    }
  };

  // График объема
  const volumeChartData = {
    labels: filteredCandlesForVolume.map(c => formatDateShort(c.time)),
    datasets: [
      {
        label: 'Объем торгов',
        data: filteredCandlesForVolume.map(c => c.volume),
        backgroundColor: 'rgba(102, 187, 106, 0.5)',
        borderColor: '#66BB6A',
        borderWidth: 1
      }
    ]
  };

  const volumeChartOptions = {
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
            if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
            if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
            return value;
          }
        }
      }
    }
  };

  // График истории предсказаний
  const predictionChartData = {
    labels: predictionHistory.map(p => formatDate(p.analysisDate)),
    datasets: [
      {
        label: 'Score',
        data: predictionHistory.map(p => p.score * 100),
        borderColor: '#42A5F5',
        backgroundColor: 'rgba(66, 165, 245, 0.1)',
        tension: 0.4,
        yAxisID: 'y'
      },
      {
        label: 'Confidence',
        data: predictionHistory.map(p => p.confidence * 100),
        borderColor: '#66BB6A',
        backgroundColor: 'rgba(102, 187, 106, 0.1)',
        tension: 0.4,
        yAxisID: 'y'
      }
    ]
  };

  const predictionChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          callback: function(value: any) {
            return value + '%';
          }
        }
      }
    }
  };

  const recommendationTemplate = (rowData: PredictionHistory) => {
    const severity =
      rowData.recommendation === 'BUY' ? 'success' :
      rowData.recommendation === 'SELL' ? 'danger' : 'info';
    
    return (
      <Tag value={translateRecommendation(rowData.recommendation)} severity={severity as any} />
    );
  };

  const confidenceTemplate = (rowData: PredictionHistory) => {
    const confidenceDesc = getConfidenceDescription(rowData.confidence);
    const scoreDesc = getScoreDescription(rowData.score);
    
    return (
      <div className="flex flex-column">
        <div className={`text-sm ${confidenceDesc.colorClass}`}>
          Уверенность: {confidenceDesc.text} ({confidenceDesc.percentage})
        </div>
        <div className={`text-xs ${scoreDesc.colorClass}`}>
          Оценка: {scoreDesc.text} ({scoreDesc.percentage})
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex align-items-center justify-content-center" style={{ height: '100vh' }}>
        <ProgressSpinner />
      </div>
    );
  }

  if (error || !stockDetail) {
    return (
      <div className="p-4">
        <Card>
          <Message severity="error" text={error || 'Акция не найдена'} />
          <Button 
            label="Назад" 
            icon="pi pi-arrow-left" 
            onClick={() => navigate(-1)}
            className="mt-3"
          />
        </Card>
      </div>
    );
  }

  const confidenceDesc = currentPrediction ? getConfidenceDescription(currentPrediction.confidence || 0) : null;
  const scoreDesc = currentPrediction ? getScoreDescription(currentPrediction.score || 0) : null;

  return (
    <div className="stock-detail-page p-4">
      <Toast ref={toast} />
      
      {/* Заголовок с кнопкой назад */}
      <div className="flex align-items-center mb-4">
        <Button 
          icon="pi pi-arrow-left" 
          label="Назад" 
          onClick={() => navigate(-1)}
          className="mr-3"
          text
        />
        <h1 className="m-0">{stockDetail.name} ({stockDetail.ticker})</h1>
      </div>

      {/* Детальная информация наверху */}
      <Card className="mb-4">
        <div className="grid">
          <div className="col-12 md:col-2">
            <div className="mb-3">
              <div className="text-600 mb-1 text-sm">FIGI</div>
              <div className="font-medium">{stockDetail.figi}</div>
            </div>
            <div className="mb-3">
              <div className="text-600 mb-1 text-sm">Тикер</div>
              <div className="font-medium">{stockDetail.ticker}</div>
            </div>
            <div className="mb-3">
              <div className="text-600 mb-1 text-sm">Название</div>
              <div className="font-medium">{stockDetail.name}</div>
            </div>
          </div>
          
          <div className="col-12 md:col-2">
            <div className="mb-3">
              <div className="text-600 mb-1 text-sm">Сектор</div>
              <div className="font-medium">
                {stockDetail.sector ? translateSector(stockDetail.sector) : 'Не указан'}
              </div>
            </div>
            <div className="mb-3">
              <div className="text-600 mb-1 text-sm">Лот</div>
              <div className="font-medium">{stockDetail.lot}</div>
            </div>
            {stockDetail.dividendYield && (
              <div className="mb-3">
                <div className="text-600 mb-1 text-sm">Дивидендная доходность</div>
                <div className="font-medium">{(stockDetail.dividendYield * 100).toFixed(2)}%</div>
              </div>
            )}
          </div>
          
          <div className="col-12 md:col-2">
            <div className="mb-3">
              <div className="text-600 mb-1 text-sm">Текущая цена</div>
              <div className="text-2xl font-bold text-primary">
                {formatCurrency(stockDetail.currentPrice)}
              </div>
              {stockDetail.lastPriceTime && (
                <div className="text-xs text-500 mt-1">
                  Обновлено: {formatDate(stockDetail.lastPriceTime)}
                </div>
              )}
            </div>
          </div>
          
          <div className="col-12 md:col-3">
            <div className="mb-3">
              <div className="text-600 text-sm mb-2">Текущее предсказание (из БД)</div>
              {currentPrediction ? (
                <div>
                  <div className="mb-2">
                    <Tag 
                      value={translateRecommendation(currentPrediction.recommendation || 'HOLD')} 
                      severity={currentPrediction.recommendation === 'BUY' ? 'success' : currentPrediction.recommendation === 'SELL' ? 'danger' : 'info'} 
                    />
                  </div>
                  {confidenceDesc && (
                    <div className={`text-sm ${confidenceDesc.colorClass} mb-1`}>
                      Уверенность: {confidenceDesc.text} ({confidenceDesc.percentage})
                    </div>
                  )}
                  {scoreDesc && (
                    <div className={`text-sm ${scoreDesc.colorClass} mb-1`}>
                      Оценка: {scoreDesc.text} ({scoreDesc.percentage})
                    </div>
                  )}
                  {currentPrediction.analysisDate && (
                    <div className="text-xs text-500 mt-1">
                      Дата анализа: {formatDate(currentPrediction.analysisDate)}
                    </div>
                  )}
                  {currentPrediction.isFromDatabase && (
                    <div className="text-xs text-green-500 mt-1">
                      ✓ Данные из БД
                    </div>
                  )}
                  {/* Убираем formatFullPrediction отсюда - горизонты будут показаны ниже крупнее */}
                </div>
              ) : (
                <div className="text-500">
                  <div className="mb-2">Нет данных в БД</div>
                  <div className="text-xs mt-2">(Рекомендация будет создана при следующем обновлении или нажмите "Анализ" для немедленного анализа)</div>
                </div>
              )}
            </div>
          </div>
          
          <div className="col-12 md:col-3">
            <div className="mb-3">
              <div className="text-600 text-sm mb-2">Действия</div>
              <div className="flex flex-column gap-2">
                {currentPrediction ? (
                  <>
                    <BuyButton 
                      rowData={{
                        figi: currentPrediction.figi || figi || '',
                        ticker: currentPrediction.ticker || stockDetail?.ticker || '',
                        name: currentPrediction.name || stockDetail?.name || '',
                        recommendation: currentPrediction.recommendation || 'HOLD',
                        confidence: currentPrediction.confidence || 0,
                        score: currentPrediction.score || 0,
                        priceAtAnalysis: currentPrediction.priceAtAnalysis || currentPrediction.price || stockDetail?.currentPrice || 0,
                        targetPrice: currentPrediction.targetPrice,
                        stopLoss: currentPrediction.stopLoss,
                        takeProfit: currentPrediction.takeProfit,
                        explanation: currentPrediction.explanation,
                        horizons: currentPrediction.horizons
                      }}
                    />
                    <AnalyzeButton 
                      rowData={{
                        figi: currentPrediction.figi || figi || '',
                        ticker: currentPrediction.ticker || stockDetail?.ticker || '',
                        name: currentPrediction.name || stockDetail?.name || ''
                      }}
                      onAnalysisComplete={loadStockData}
                    />
                    <TrainButton 
                      rowData={{
                        figi: currentPrediction.figi || figi || '',
                        ticker: currentPrediction.ticker || stockDetail?.ticker || '',
                        name: currentPrediction.name || stockDetail?.name || ''
                      }}
                      onTrainingComplete={loadStockData}
                    />
                  </>
                ) : (
                  <>
                    <AnalyzeButton 
                      rowData={{
                        figi: figi || '',
                        ticker: stockDetail?.ticker || '',
                        name: stockDetail?.name || ''
                      }}
                      onAnalysisComplete={loadStockData}
                    />
                    <TrainButton 
                      rowData={{
                        figi: figi || '',
                        ticker: stockDetail?.ticker || '',
                        name: stockDetail?.name || ''
                      }}
                      onTrainingComplete={loadStockData}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Прогнозы по горизонтам - крупнее, под основными данными */}
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
          
          const { shortTerm, mediumTerm, longTerm } = horizons;
          const agreement = currentPrediction.agreement || currentPrediction.analysis?.agreement;
          
          const getRecColor = (rec: string) => {
            if (rec === 'BUY') return 'text-green-600';
            if (rec === 'SELL') return 'text-red-600';
            return 'text-blue-600';
          };
          
          const getRecSeverity = (rec: string) => {
            if (rec === 'BUY') return 'success';
            if (rec === 'SELL') return 'danger';
            return 'info';
          };
          
          return (
            <div className="col-12 mt-3 pt-3 border-top-1 surface-border">
              <div className="text-lg font-semibold mb-3">📊 Прогнозы по горизонтам</div>
              <div className="grid">
                {shortTerm && (
                  <div className="col-12 md:col-4">
                    <Card className="h-full">
                      <div className="text-600 text-sm mb-2">{shortTerm.name || 'Краткосрочный прогноз'}</div>
                      <div className="text-xs text-500 mb-2">{shortTerm.description || 'Прогноз на 1-3 дня'}</div>
                      <Tag 
                        value={translateRecommendation(shortTerm.recommendation || 'HOLD')} 
                        severity={getRecSeverity(shortTerm.recommendation || 'HOLD')}
                        className="mb-2"
                      />
                      <div className="text-sm mb-1">
                        <span className="text-600">Сигнал: </span>
                        <span className={getRecColor(shortTerm.recommendation || 'HOLD')}>
                          {((shortTerm.score || 0) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-sm mb-3">
                        <span className="text-600">Уверенность: </span>
                        <span className="font-semibold">
                          {((shortTerm.confidence || 0) * 100).toFixed(0)}%
                        </span>
                      </div>
                      
                      {/* Стратегии для горизонта */}
                      {shortTerm.strategies && (
                        <div className="mt-3 pt-3 border-top-1 surface-border">
                          <div className="text-xs text-600 font-semibold mb-2">Рекомендации по стратегиям:</div>
                          <div className="flex flex-column gap-2">
                            {shortTerm.strategies.aggressive && (
                              <div className="p-2 bg-red-50 border-round">
                                <div className="flex align-items-center gap-2 mb-1">
                                  <Tag 
                                    value="Агрессивная" 
                                    severity="danger"
                                    className="text-xs"
                                  />
                          
                                </div>
                                <div className="text-xs text-600">
                                  {shortTerm.strategies.aggressive.explanation || 'Нет описания'}
                                </div>
                              </div>
                            )}
                            {shortTerm.strategies.moderate && (
                              <div className="p-2 bg-yellow-50 border-round">
                                <div className="flex align-items-center gap-2 mb-1">
                                  <Tag 
                                    value="Умеренная" 
                                    severity="warning"
                                    className="text-xs"
                                  />
                            
                                </div>
                                <div className="text-xs text-600">
                                  {shortTerm.strategies.moderate.explanation || 'Нет описания'}
                                </div>
                              </div>
                            )}
                            {shortTerm.strategies.conservative && (
                              <div className="p-2 bg-green-50 border-round">
                                <div className="flex align-items-center gap-2 mb-1">
                                  <Tag 
                                    value="Консервативная" 
                                    severity="success"
                                    className="text-xs"
                                  />
                                </div>
                                <div className="text-xs text-600">
                                  {shortTerm.strategies.conservative.explanation || 'Нет описания'}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </Card>
                  </div>
                )}
                {mediumTerm && (
                  <div className="col-12 md:col-4">
                    <Card className="h-full">
                      <div className="text-600 text-sm mb-2">{mediumTerm.name || 'Среднесрочный прогноз'}</div>
                      <div className="text-xs text-500 mb-2">{mediumTerm.description || 'Прогноз на 1-4 недели'}</div>
                      <Tag 
                        value={translateRecommendation(mediumTerm.recommendation || 'HOLD')} 
                        severity={getRecSeverity(mediumTerm.recommendation || 'HOLD')}
                        className="mb-2"
                      />
                      <div className="text-sm mb-1">
                        <span className="text-600">Сигнал: </span>
                        <span className={getRecColor(mediumTerm.recommendation || 'HOLD')}>
                          {((mediumTerm.score || 0) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-sm mb-3">
                        <span className="text-600">Уверенность: </span>
                        <span className="font-semibold">
                          {((mediumTerm.confidence || 0) * 100).toFixed(0)}%
                        </span>
                      </div>
                      
                      {/* Стратегии для горизонта */}
                      {mediumTerm.strategies && (
                        <div className="mt-3 pt-3 border-top-1 surface-border">
                          <div className="text-xs text-600 font-semibold mb-2">Рекомендации по стратегиям:</div>
                          <div className="flex flex-column gap-2">
                            {mediumTerm.strategies.aggressive && (
                              <div className="p-2 bg-red-50 border-round">
                                <div className="flex align-items-center gap-2 mb-1">
                                  <Tag 
                                    value="Агрессивная" 
                                    severity="danger"
                                    className="text-xs"
                                  />
                                </div>
                                <div className="text-xs text-600">
                                  {mediumTerm.strategies.aggressive.explanation || 'Нет описания'}
                                </div>
                              </div>
                            )}
                            {mediumTerm.strategies.moderate && (
                              <div className="p-2 bg-yellow-50 border-round">
                                <div className="flex align-items-center gap-2 mb-1">
                                  <Tag 
                                    value="Умеренная" 
                                    severity="warning"
                                    className="text-xs"
                                  />
                                </div>
                                <div className="text-xs text-600">
                                  {mediumTerm.strategies.moderate.explanation || 'Нет описания'}
                                </div>
                              </div>
                            )}
                            {mediumTerm.strategies.conservative && (
                              <div className="p-2 bg-green-50 border-round">
                                <div className="flex align-items-center gap-2 mb-1">
                                  <Tag 
                                    value="Консервативная" 
                                    severity="success"
                                    className="text-xs"
                                  />
                                </div>
                                <div className="text-xs text-600">
                                  {mediumTerm.strategies.conservative.explanation || 'Нет описания'}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </Card>
                  </div>
                )}
                {longTerm && (
                  <div className="col-12 md:col-4">
                    <Card className="h-full">
                      <div className="text-600 text-sm mb-2">{longTerm.name || 'Долгосрочный прогноз'}</div>
                      <div className="text-xs text-500 mb-2">{longTerm.description || 'Прогноз на 2-3 месяца'}</div>
                      <Tag 
                        value={translateRecommendation(longTerm.recommendation || 'HOLD')} 
                        severity={getRecSeverity(longTerm.recommendation || 'HOLD')}
                        className="mb-2"
                      />
                      <div className="text-sm mb-1">
                        <span className="text-600">Сигнал: </span>
                        <span className={getRecColor(longTerm.recommendation || 'HOLD')}>
                          {((longTerm.score || 0) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-sm mb-3">
                        <span className="text-600">Уверенность: </span>
                        <span className="font-semibold">
                          {((longTerm.confidence || 0) * 100).toFixed(0)}%
                        </span>
                      </div>
                      
                      {/* Стратегии для горизонта */}
                      {longTerm.strategies && (
                        <div className="mt-3 pt-3 border-top-1 surface-border">
                          <div className="text-xs text-600 font-semibold mb-2">Рекомендации по стратегиям:</div>
                          <div className="flex flex-column gap-2">
                            {longTerm.strategies.aggressive && (
                              <div className="p-2 bg-red-50 border-round">
                                <div className="flex align-items-center gap-2 mb-1">
                                  <Tag 
                                    value="Агрессивная" 
                                    severity="danger"
                                    className="text-xs"
                                  />
                                </div>
                                <div className="text-xs text-600">
                                  {longTerm.strategies.aggressive.explanation || 'Нет описания'}
                                </div>
                              </div>
                            )}
                            {longTerm.strategies.moderate && (
                              <div className="p-2 bg-yellow-50 border-round">
                                <div className="flex align-items-center gap-2 mb-1">
                                  <Tag 
                                    value="Умеренная" 
                                    severity="warning"
                                    className="text-xs"
                                  />
                                </div>
                                <div className="text-xs text-600">
                                  {longTerm.strategies.moderate.explanation || 'Нет описания'}
                                </div>
                              </div>
                            )}
                            {longTerm.strategies.conservative && (
                              <div className="p-2 bg-green-50 border-round">
                                <div className="flex align-items-center gap-2 mb-1">
                                  <Tag 
                                    value="Консервативная" 
                                    severity="success"
                                    className="text-xs"
                                  />
                                </div>
                                <div className="text-xs text-600">
                                  {longTerm.strategies.conservative.explanation || 'Нет описания'}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </Card>
                  </div>
                )}
              </div>
              {agreement !== undefined && agreement !== null && (
                <div className="mt-3 text-center">
                  <div className="text-600 text-sm mb-1">Согласованность горизонтов</div>
                  <div className="text-xl font-bold text-primary">
                    {(agreement * 100).toFixed(0)}%
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </Card>

      {/* Основной контент */}
      <div className="grid">
        {/* Левая колонка - Графики и предсказания */}
        <div className="col-12 lg:col-8">
          {/* График динамики цены */}
          <Card className="mb-4">
            <div className="flex align-items-center justify-content-between mb-3">
              <h3 className="m-0">Динамика цены</h3>
              <SelectButton
                value={pricePeriod}
                options={periodOptions}
                onChange={(e) => setPricePeriod(e.value)}
              />
            </div>
            <div style={{ height: '400px' }}>
              {filteredCandlesForPrice.length > 0 ? (
                <Chart type="line" data={priceChartData} options={priceChartOptions} />
              ) : (
                <div className="flex align-items-center justify-content-center h-full text-600">
                  Нет данных для отображения
                </div>
              )}
            </div>
          </Card>

          {/* График объема торгов */}
          <Card className="mb-4">
            <div className="flex align-items-center justify-content-between mb-3">
              <h3 className="m-0">Объем торгов</h3>
              <SelectButton
                value={volumePeriod}
                options={periodOptions}
                onChange={(e) => setVolumePeriod(e.value)}
              />
            </div>
            <div style={{ height: '300px' }}>
              {filteredCandlesForVolume.length > 0 ? (
                <Chart type="bar" data={volumeChartData} options={volumeChartOptions} />
              ) : (
                <div className="flex align-items-center justify-content-center h-full text-600">
                  Нет данных для отображения
                </div>
              )}
            </div>
          </Card>

          {/* История предсказаний */}
          <Card className="mb-4">
            <h3 className="mb-3">История предсказаний</h3>
            <div style={{ height: '300px' }} className="mb-4">
              {predictionHistory.length > 0 ? (
                <Chart type="line" data={predictionChartData} options={predictionChartOptions} />
              ) : (
                <div className="flex align-items-center justify-content-center h-full text-600">
                  Нет истории предсказаний
                </div>
              )}
            </div>
            
            <Divider />
            
            <DataTable 
              value={predictionHistory}
              paginator
              rows={10}
              emptyMessage="Нет истории предсказаний"
            >
              <Column
                field="analysisDate"
                header="Дата"
                body={(rowData) => formatDate(rowData.analysisDate)}
                sortable
              />
              <Column
                field="recommendation"
                header="Рекомендация"
                body={recommendationTemplate}
                sortable
              />
              <Column
                field="confidence"
                header="Уверенность / Оценка"
                body={confidenceTemplate}
                sortable
              />
            </DataTable>
          </Card>
        </div>

        {/* Правая колонка - Сигналы и Новости */}
        <div className="col-12 lg:col-4">
          {/* Сигналы */}
          <Card className="mb-4">
            <div className="flex align-items-center justify-content-between mb-3">
              <h3 className="m-0">⚡ Торговые сигналы</h3>
              <Button
                icon="pi pi-refresh"
                label="Запросить сигналы"
                size="small"
                onClick={handleFetchFreshSignals}
                loading={loadingSignals}
                disabled={!figi || loadingSignals}
                className="p-button-text p-button-sm"
              />
            </div>
            {signals.length > 0 ? (
              <>
                <div className="flex flex-column gap-3">
                  {signals.slice(0, 5).map((signal) => {
                  const directionText = signal.direction === 'SIGNAL_DIRECTION_BUY' 
                    ? 'ПОКУПКА' 
                    : signal.direction === 'SIGNAL_DIRECTION_SELL' 
                    ? 'ПРОДАЖА' 
                    : 'НЕОПРЕДЕЛЕНО';
                  const directionSeverity = signal.direction === 'SIGNAL_DIRECTION_BUY' 
                    ? 'success' 
                    : signal.direction === 'SIGNAL_DIRECTION_SELL' 
                    ? 'danger' 
                    : 'info';
                  
                  return (
                    <div key={signal.signalId} className="border-bottom-1 surface-border pb-3">
                      <div className="flex align-items-center justify-content-between mb-2">
                        <Tag value={directionText} severity={directionSeverity} />
                        {signal.isActive && (
                          <Badge value="Активен" severity="success" />
                        )}
                      </div>
                      <div className="text-sm text-500 mb-2">
                        {signal.strategyName}
                        {signal.probability && ` • Вероятность: ${signal.probability}%`}
                      </div>
                      {signal.name && (
                        <div className="font-medium mb-2">{signal.name}</div>
                      )}
                      <div className="text-sm text-600 mb-2">
                        <div>Создан: {formatDate(signal.createDt)}</div>
                        <div>Действует до: {formatDate(signal.endDt)}</div>
                        {signal.initialPrice && (
                          <div>Начальная цена: {formatCurrency(signal.initialPrice)}</div>
                        )}
                        {signal.targetPrice && (
                          <div>Целевая цена: {formatCurrency(signal.targetPrice)}</div>
                        )}
                        {signal.stoploss && (
                          <div>Стоп-лосс: {formatCurrency(signal.stoploss)}</div>
                        )}
                      </div>
                      {signal.info && (
                        <div className="text-sm text-500">{signal.info}</div>
                      )}
                    </div>
                  );
                  })}
                </div>
                {signals.length > 5 && (
                  <div className="mt-3 text-center">
                    <Button
                      label="Еще"
                      icon="pi pi-arrow-down"
                      onClick={() => handleOpenSignalsModal()}
                      className="p-button-text"
                      size="small"
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-500 py-4">
                Нет сигналов
              </div>
            )}
          </Card>

          {/* Новости */}
          <Card className="mb-4">
            <div className="flex align-items-center justify-content-between mb-3">
              <h3 className="m-0">📰 Новости</h3>
              <Button
                icon="pi pi-refresh"
                label="Загрузить свежие"
                size="small"
                onClick={handleFetchFreshNews}
                loading={loadingNews}
                disabled={!figi || !stockDetail?.ticker || loadingNews}
                className="p-button-text p-button-sm"
                tooltip="Загрузить свежие новости из NewsAPI и сохранить в БД"
                tooltipOptions={{ position: 'top' }}
              />
            </div>
            {news.length > 0 ? (
              <>
                <div className="flex flex-column gap-3" style={{ maxHeight: '800px', overflowY: 'auto' }}>
                  {news.slice(0, 5).map((item, index) => (
                  <div key={index} className="border-bottom-1 surface-border pb-3">
                    <div className="text-sm text-500 mb-2">
                      {formatDate(item.publishedAt)}
                      {item.source?.name && ` • ${item.source.name}`}
                    </div>
                    <div className="font-medium mb-2">{item.title}</div>
                    {item.description && (
                      <div className="text-sm text-600 mb-2">{item.description}</div>
                    )}
                    {item.url && (
                      <a 
                        href={item.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-primary"
                      >
                        Читать далее →
                      </a>
                    )}
                  </div>
                  ))}
                </div>
                {news.length > 5 && (
                  <div className="mt-3 text-center">
                    <Button
                      label="Еще"
                      icon="pi pi-arrow-down"
                      onClick={() => handleOpenNewsModal()}
                      className="p-button-text"
                      size="small"
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-500 py-4">
                Нет новостей
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Модальное окно для сигналов */}
      <Dialog
        header="⚡ Торговые сигналы"
        visible={showSignalsModal}
        onHide={() => setShowSignalsModal(false)}
        style={{ width: '90vw', maxWidth: '800px' }}
        modal
        maximizable
      >
        <div
          ref={signalsModalRef}
          className="flex flex-column gap-3"
          style={{ maxHeight: '70vh', overflowY: 'auto' }}
          onScroll={handleSignalsScroll}
        >
          {modalSignals.map((signal) => {
            const directionText = signal.direction === 'SIGNAL_DIRECTION_BUY' 
              ? 'ПОКУПКА' 
              : signal.direction === 'SIGNAL_DIRECTION_SELL' 
              ? 'ПРОДАЖА' 
              : 'НЕОПРЕДЕЛЕНО';
            const directionSeverity = signal.direction === 'SIGNAL_DIRECTION_BUY' 
              ? 'success' 
              : signal.direction === 'SIGNAL_DIRECTION_SELL' 
              ? 'danger' 
              : 'info';
            
            return (
              <div key={signal.signalId} className="border-bottom-1 surface-border pb-3">
                <div className="flex align-items-center justify-content-between mb-2">
                  <Tag value={directionText} severity={directionSeverity} />
                  {signal.isActive && (
                    <Badge value="Активен" severity="success" />
                  )}
                </div>
                <div className="text-sm text-500 mb-2">
                  {signal.strategyName}
                  {signal.probability && ` • Вероятность: ${signal.probability}%`}
                </div>
                {signal.name && (
                  <div className="font-medium mb-2">{signal.name}</div>
                )}
                <div className="text-sm text-600 mb-2">
                  <div>Создан: {formatDate(signal.createDt)}</div>
                  <div>Действует до: {formatDate(signal.endDt)}</div>
                  {signal.initialPrice && (
                    <div>Начальная цена: {formatCurrency(signal.initialPrice)}</div>
                  )}
                  {signal.targetPrice && (
                    <div>Целевая цена: {formatCurrency(signal.targetPrice)}</div>
                  )}
                  {signal.stoploss && (
                    <div>Стоп-лосс: {formatCurrency(signal.stoploss)}</div>
                  )}
                </div>
                {signal.info && (
                  <div className="text-sm text-500">{signal.info}</div>
                )}
              </div>
            );
          })}
          {loadingMoreSignals && (
            <div className="text-center py-3">
              <ProgressSpinner />
            </div>
          )}
          {!hasMoreSignals && modalSignals.length > 0 && (
            <div className="text-center text-500 py-3">
              Все сигналы загружены
            </div>
          )}
        </div>
      </Dialog>

      {/* Модальное окно для новостей */}
      <Dialog
        header="📰 Новости"
        visible={showNewsModal}
        onHide={() => setShowNewsModal(false)}
        style={{ width: '90vw', maxWidth: '800px' }}
        modal
        maximizable
      >
        <div
          ref={newsModalRef}
          className="flex flex-column gap-3"
          style={{ maxHeight: '70vh', overflowY: 'auto' }}
          onScroll={handleNewsScroll}
        >
          {modalNews.map((item, index) => (
            <div key={index} className="border-bottom-1 surface-border pb-3">
              <div className="text-sm text-500 mb-2">
                {formatDate(item.publishedAt)}
                {item.source?.name && ` • ${item.source.name}`}
              </div>
              <div className="font-medium mb-2">{item.title}</div>
              {item.description && (
                <div className="text-sm text-600 mb-2">{item.description}</div>
              )}
              {item.url && (
                <a 
                  href={item.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-primary"
                >
                  Читать далее →
                </a>
              )}
            </div>
          ))}
          {loadingMoreNews && (
            <div className="text-center py-3">
              <ProgressSpinner />
            </div>
          )}
          {!hasMoreNews && modalNews.length > 0 && (
            <div className="text-center text-500 py-3">
              Все новости загружены
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
};

export default StockDetail;
