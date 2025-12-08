import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from 'primereact/card';
import { Chart } from 'primereact/chart';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Message } from 'primereact/message';
import { SelectButton } from 'primereact/selectbutton';
import { Divider } from 'primereact/divider';
import { apiService } from '../services/apiService';
import { translateSector } from '../utils/sectorTranslator';
import { translateRecommendation } from '../utils/recommendationTranslator';
import { getConfidenceDescription, getScoreDescription } from '../utils/confidenceTranslator';
import { formatFullPrediction } from '../utils/predictionFormatter';

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
  const [error, setError] = useState<string | null>(null);
  const [pricePeriod, setPricePeriod] = useState<TimePeriod>('week');
  const [volumePeriod, setVolumePeriod] = useState<TimePeriod>('week');
  const [loadingNews, setLoadingNews] = useState(false);
  const [signals, setSignals] = useState<any>(null);
  const [loadingSignals, setLoadingSignals] = useState(false);

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
      
      // Загружаем данные параллельно
      const [detailData, priceCandlesData, volumeCandlesData, historyData, predictionData, newsData] = await Promise.all([
        apiService.getStockDetail(figi),
        apiService.getStockCandles(figi, 365, 'DAY'), // За год по умолчанию для цены
        apiService.getStockCandles(figi, 365, 'DAY'), // За год по умолчанию для объема
        apiService.getStockPredictionHistory(figi),
        apiService.getEnsemblePrediction(figi),
        apiService.getNews(figi, 20, 30).catch(() => []) // Новости за 30 дней
      ]);
      
      setStockDetail(detailData);
      setPriceCandles(priceCandlesData || []);
      setVolumeCandles(volumeCandlesData || []);
      setPredictionHistory(historyData || []);
      setCurrentPrediction(predictionData);
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

  const handleFetchFreshNews = async () => {
    if (!stockDetail || !stockDetail.ticker) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Предупреждение',
        detail: 'Не удалось определить тикер инструмента',
        life: 3000
      });
      return;
    }

    try {
      setLoadingNews(true);
      const result = await apiService.testNewsApiNews(stockDetail.ticker);
      
      toast.current?.show({
        severity: 'success',
        summary: 'Успешно',
        detail: `Загружено ${result.data?.newsCount || 0} новостей`,
        life: 3000
      });

      // Перезагружаем новости из БД после успешного запроса
      setTimeout(async () => {
        try {
          const newsData = await apiService.getNews(figi || '', 20, 30).catch(() => []);
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
        } catch (err) {
          console.error('Error reloading news:', err);
        }
      }, 2000); // Небольшая задержка для сохранения в БД
      
    } catch (err: any) {
      console.error('Error fetching fresh news:', err);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: err.response?.data?.message || err.message || 'Не удалось загрузить свежие новости',
        life: 5000
      });
    } finally {
      setLoadingNews(false);
    }
  };

  const handleGetSignals = async () => {
    if (!figi) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Предупреждение',
        detail: 'FIGI инструмента не указан',
        life: 3000
      });
      return;
    }

    try {
      setLoadingSignals(true);
      const result = await apiService.getStockSignals(figi);
      
      if (result.success) {
        setSignals(result.data);
        toast.current?.show({
          severity: 'success',
          summary: 'Успешно',
          detail: 'Сигналы успешно получены',
          life: 3000
        });
      } else {
        toast.current?.show({
          severity: 'warn',
          summary: 'Предупреждение',
          detail: result.message || 'Метод GetSignals недоступен',
          life: 5000
        });
        setSignals(null);
      }
    } catch (err: any) {
      console.error('Error getting signals:', err);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: err.response?.data?.message || err.message || 'Не удалось получить сигналы',
        life: 5000
      });
      setSignals(null);
    } finally {
      setLoadingSignals(false);
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
          <div className="col-12 md:col-3">
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
          
          <div className="col-12 md:col-3">
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
          
          <div className="col-12 md:col-3">
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
              <div className="flex align-items-center justify-content-between mb-2">
                <div className="text-600 text-sm">Текущее предсказание</div>
                <Button
                  icon="pi pi-bolt"
                  label="Получить сигналы"
                  size="small"
                  onClick={handleGetSignals}
                  loading={loadingSignals}
                  disabled={!figi || loadingSignals}
                  className="p-button-text p-button-sm"
                />
              </div>
              {currentPrediction ? (
                <div>
                  <Tag 
                    value={translateRecommendation(currentPrediction.recommendation || 'HOLD')} 
                    severity={currentPrediction.recommendation === 'BUY' ? 'success' : currentPrediction.recommendation === 'SELL' ? 'danger' : 'info'} 
                    className="mb-2"
                  />
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
                  {formatFullPrediction(currentPrediction)}
                </div>
              ) : (
                <div className="text-500">Нет данных</div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Блок с сигналами */}
      {signals && (
        <Card className="mb-4">
          <h3 className="mb-3">⚡ Торговые сигналы от Tinkoff API</h3>
          <div className="p-3 surface-100 border-round">
            <pre className="text-sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(signals, null, 2)}
            </pre>
          </div>
        </Card>
      )}

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

        {/* Правая колонка - Новости */}
        <div className="col-12 lg:col-4">
          <Card className="mb-4">
            <div className="flex align-items-center justify-content-between mb-3">
              <h3 className="m-0">📰 Новости</h3>
              <Button
                icon="pi pi-refresh"
                label="Запросить свежие"
                size="small"
                onClick={handleFetchFreshNews}
                loading={loadingNews}
                disabled={!stockDetail || loadingNews}
                className="p-button-text p-button-sm"
              />
            </div>
            {news.length > 0 ? (
              <div className="flex flex-column gap-3" style={{ maxHeight: '800px', overflowY: 'auto' }}>
                {news.map((item, index) => (
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
            ) : (
              <div className="text-center text-500 py-4">
                Нет новостей
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default StockDetail;
