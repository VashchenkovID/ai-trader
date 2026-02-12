import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiService } from '../services/apiService';
import { weeklyForecastApi } from '../services/weeklyForecastApi';
import { useWebSocketData } from '../components/WebSocketDataProvider';
import { Skeleton } from '../components/ui';

// Header
import StockDetailHeader from '../components/stock/StockDetailHeader';

// Карточки торговых параметров
import CurrentPriceCard from '../components/stock/CurrentPriceCard';
import StopLossCard from '../components/stock/StopLossCard';
import TakeProfitCard from '../components/stock/TakeProfitCard';
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
  const [pricePeriod, setPricePeriod] = useState<TimePeriod>('month');
  
  const { socket, isConnected, subscribe, unsubscribe } = useWebSocketData();

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

        // Загружаем рекомендацию
        try {
          const rec = await apiService.getLatestStockRecommendation(figi);
          setRecommendation(rec);
        } catch (e) {
          console.warn('Failed to load recommendation:', e);
        }

        // Загружаем Weekly Forecast
        try {
          const forecast = await weeklyForecastApi.getForecast(figi);
          setWeeklyForecast(forecast);
        } catch (e) {
          console.warn('Failed to load weekly forecast:', e);
        }

        // Загружаем сигналы
        try {
          const signalsData = await apiService.getAllSignals(100, false);
          // Фильтруем сигналы по FIGI
          const filteredSignals = signalsData?.filter((s: any) => s.figi === figi) || [];
          setSignals(filteredSignals);
        } catch (e) {
          console.warn('Failed to load signals:', e);
        }

        // Загружаем новости
        try {
          const newsData = await apiService.getNews(figi);
          setNews(newsData?.news || []);
        } catch (e) {
          console.warn('Failed to load news:', e);
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
  const priceChangePercent = stockDetail.lastPrice 
    ? (priceChange / stockDetail.lastPrice) * 100 
    : 0;

  // Извлекаем данные из рекомендации
  const stopLoss = recommendation?.stopLoss;
  const takeProfit = recommendation?.takeProfit;
  const targetPrice = recommendation?.targetPrice;
  const strategies = recommendation?.explanation?.details?.ensemble?.horizons?.shortTerm?.strategies;

  // Извлекаем данные из Weekly Forecast
  const forecastData = weeklyForecast?.forecastData;
  const forecastPrice = forecastData && forecastData.length > 0 
    ? forecastData[forecastData.length - 1]?.close 
    : undefined;
  const forecastPriceChange = forecastPrice && stockDetail.currentPrice
    ? forecastPrice - stockDetail.currentPrice
    : undefined;
  const forecastPriceChangePercent = forecastPriceChange && stockDetail.currentPrice
    ? (forecastPriceChange / stockDetail.currentPrice) * 100
    : undefined;

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
        onAnalyze={() => {
          // TODO: Реализовать анализ
          console.log('Analyze clicked');
        }}
        onTrain={() => {
          // TODO: Реализовать обучение
          console.log('Train clicked');
        }}
        onBuy={() => {
          // TODO: Реализовать покупку
          console.log('Buy clicked');
        }}
      />

      {/* Основная сетка: 3 колонки */}
      <div className="stock-detail-new__grid">
        {/* Левая колонка: Торговые параметры и рекомендации */}
        <div className="stock-detail-new__left-column">
          <CurrentPriceCard
            currentPrice={stockDetail.currentPrice}
            priceChange={priceChange}
            priceChangePercent={priceChangePercent}
            currency={stockDetail.currency}
            lastUpdateTime={stockDetail.lastPriceTime}
            isLive={isConnected}
          />

          {stopLoss && (
            <StopLossCard
              stopLossPrice={stopLoss}
              currentPrice={stockDetail.currentPrice}
              currency={stockDetail.currency}
            />
          )}

          {takeProfit && (
            <TakeProfitCard
              takeProfitPrice={takeProfit}
              currentPrice={stockDetail.currentPrice}
              currency={stockDetail.currency}
            />
          )}

          {recommendation && (
            <MainRecommendationCard
              recommendation={recommendation.recommendation}
              confidence={recommendation.confidence * 100}
              score={recommendation.score}
              targetPrice={targetPrice}
              analysisDate={recommendation.analysisDate}
              currency={stockDetail.currency}
            />
          )}

          {weeklyForecast && (
            <WeeklyForecastRecommendationCard
              forecastPrice={forecastPrice}
              priceChange={forecastPriceChange}
              priceChangePercent={forecastPriceChangePercent}
              trend={weeklyForecast.predictedTrend}
              confidenceScore={weeklyForecast.confidenceScore * 100}
              volatility={weeklyForecast.predictedVolatility}
              currency={stockDetail.currency}
              figi={figi!}
              ticker={stockDetail.ticker}
              forecastData={forecastData}
              currentPrice={stockDetail.currentPrice}
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
            weeklyForecast={forecastData}
          />

          <VolumeChart
            candles={priceCandles}
            period={pricePeriod === 'all' ? 'year' : pricePeriod}
            onPeriodChange={(period) => setPricePeriod(period as TimePeriod)}
          />

          <TechnicalIndicatorsPanel
            currency={stockDetail.currency}
            labels={priceCandles.map(c => c.time)}
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
          />

          <FundamentalMetricsWidget
            metrics={{}}
            currency={stockDetail.currency}
          />
        </div>
      </div>

      {/* Полная ширина: Вкладки детальной информации */}
      <div className="stock-detail-new__full-width">
        <StockDetailTabs
          figi={figi!}
          ticker={stockDetail.ticker}
          horizons={recommendation?.horizons || recommendation?.explanation?.horizons}
          weeklyForecasts={weeklyForecast ? [weeklyForecast] : []}
          signals={signals}
          news={news}
        />
      </div>
    </div>
  );
};

export default StockDetailNew;

