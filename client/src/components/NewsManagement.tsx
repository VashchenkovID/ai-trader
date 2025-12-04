import React, { useState, useEffect, useRef } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { ProgressBar } from 'primereact/progressbar';
import { Badge } from 'primereact/badge';
import { Message } from 'primereact/message';
import { Divider } from 'primereact/divider';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Dropdown } from 'primereact/dropdown';
import { apiService } from '../services/apiService';
import { useWebSocketData } from './WebSocketDataProvider';

interface HistoricalNewsStatus {
  totalInstruments: number;
  instrumentsWithNews: number;
  instrumentsWithoutNews: number;
  lastNewsDate: string | null;
  hasHistory: boolean;
  coverage: string;
}

interface NewsLoadProgress {
  current: number;
  total: number;
  figi: string;
  success: boolean;
  count?: number;
  error?: string;
}

const NewsManagement: React.FC = () => {
  const [status, setStatus] = useState<HistoricalNewsStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<NewsLoadProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useRef<Toast>(null);
  const { isConnected } = useWebSocketData();

  // Загрузка статуса исторических новостей
  const loadStatus = async () => {
    try {
      setLoadingStatus(true);
      const data = await apiService.getHistoricalNewsStatus();
      setStatus(data);
    } catch (error: any) {
      console.error('Error loading historical news status:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: `Не удалось загрузить статус: ${error.message}`
      });
    } finally {
      setLoadingStatus(false);
    }
  };


  // Состояние для выбора инструмента (как в TrainingManager)
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [availableInstruments, setAvailableInstruments] = useState<any[]>([]);
  const [isLoadingInstruments, setIsLoadingInstruments] = useState(false);

  // Загрузка доступных инструментов (ТОЧНО как в TrainingManager)
  const loadInstruments = async () => {
    try {
      setIsLoadingInstruments(true);
      const response = await apiService.getInstruments();
      
      let instruments: any[] = [];
      if (Array.isArray(response)) {
        instruments = response;
      } else if (response && typeof response === 'object' && 'success' in response) {
        const successResponse = response as { success: boolean; data?: any[] };
        if (successResponse.success) {
          instruments = successResponse.data || [];
        }
      }
      
      // Фильтруем только акции в рублях
      const filtered = instruments.filter((inst: any) => {
        return inst.ticker && inst.name && inst.currency === 'RUB' && (inst.instrumentType === 'share' || !inst.instrumentType);
      });
      
      setAvailableInstruments(filtered);
      console.log('📊 Загружено инструментов:', filtered.length);
      console.log('📊 Первые 3:', filtered.slice(0, 3));
    } catch (error) {
      console.error('Error loading instruments:', error);
    } finally {
      setIsLoadingInstruments(false);
    }
  };

  // Получение опций для dropdown (ТОЧНО как в TrainingManager, строка 160-163)
  const instrumentOptions = availableInstruments.map(inst => ({
    label: `${inst.ticker} - ${inst.name}`,
    value: inst.ticker
  }));
  
  console.log('🔍 instrumentOptions:', instrumentOptions.length, instrumentOptions.slice(0, 3));

  useEffect(() => {
    loadInstruments();
  }, []);

  // Тестовый запрос новостей через NewsAPI.org
  const handleTestNewsApi = () => {
    if (!selectedTicker) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Внимание',
        detail: 'Пожалуйста, выберите инструмент из списка'
      });
      return;
    }

    confirmDialog({
      message: `Загрузить новости для ${selectedTicker} через NewsAPI.org? Это тестовый запрос.`,
      header: 'Тест NewsAPI.org',
      icon: 'pi pi-info-circle',
      accept: async () => {
        try {
          setIsLoading(true);
          setLoadingProgress(null);
          
          const result = await apiService.testNewsApiNews(selectedTicker);
          
          toast.current?.show({
            severity: 'success',
            summary: 'Успешно',
            detail: `Загружено ${result.data?.newsCount || 0} новостей для ${selectedTicker}. Новости сохранены в БД.`
          });

          setTimeout(() => {
            loadStatus();
          }, 2000);

        } catch (error: any) {
          console.error('Error testing NewsAPI news:', error);
          toast.current?.show({
            severity: 'error',
            summary: 'Ошибка',
            detail: `Не удалось загрузить новости: ${error.message || error.response?.data?.error || 'Неизвестная ошибка'}`
          });
        } finally {
          setIsLoading(false);
        }
      }
    });
  };

  // Загрузка исторических новостей
  const handleLoadHistorical = () => {
    confirmDialog({
      message: `Загрузить исторические новости за ${new Date().getFullYear()} год для всех акций? Это может занять продолжительное время.`,
      header: 'Подтверждение загрузки',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          setIsLoading(true);
          setLoadingProgress(null);
          
          await apiService.loadHistoricalNews(new Date().getFullYear());
          
          toast.current?.show({
            severity: 'success',
            summary: 'Загрузка запущена',
            detail: 'Загрузка исторических новостей запущена. Прогресс будет отображаться ниже.'
          });

          // Обновляем статус после небольшой задержки
          setTimeout(() => {
            loadStatus();
          }, 2000);

        } catch (error: any) {
          console.error('Error loading historical news:', error);
          toast.current?.show({
            severity: 'error',
            summary: 'Ошибка',
            detail: `Не удалось запустить загрузку: ${error.message}`
          });
        } finally {
          setIsLoading(false);
        }
      }
    });
  };

  // Обработка WebSocket событий для прогресса загрузки
  useEffect(() => {
    if (!isConnected) return;

    const handleProgress = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'news_historical_load_progress') {
          setLoadingProgress(data.data);
        } else if (data.type === 'news_historical_load_completed') {
          setIsLoading(false);
          setLoadingProgress(null);
          toast.current?.show({
            severity: 'success',
            summary: 'Загрузка завершена',
            detail: `Загружено новостей для ${data.data.successCount} инструментов`
          });
          loadStatus();
        } else if (data.type === 'news_historical_load_error') {
          setIsLoading(false);
          setLoadingProgress(null);
          toast.current?.show({
            severity: 'error',
            summary: 'Ошибка загрузки',
            detail: data.data.error || 'Произошла ошибка при загрузке'
          });
        }
      } catch (error) {
        // Игнорируем ошибки парсинга
      }
    };

    // Подписываемся на WebSocket события
    const ws = (window as any).ws;
    if (ws && ws.addEventListener) {
      ws.addEventListener('message', handleProgress);
      return () => {
        ws.removeEventListener('message', handleProgress);
      };
    }
  }, [isConnected]);

  // Загружаем статус при монтировании
  useEffect(() => {
    loadStatus();
  }, []);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Нет данных';
    return new Date(dateString).toLocaleString('ru-RU');
  };

  return (
    <div className="news-management">
      <Toast ref={toast} />
      <ConfirmDialog />

      <Card title="📰 Управление новостями" className="mb-4">
        <div className="grid">
          {/* Статус исторических новостей */}
          <div className="col-12">
            <div className="flex justify-content-between align-items-center mb-3">
              <h3 className="m-0">Статус исторических новостей</h3>
              <Button
                icon="pi pi-refresh"
                label="Обновить"
                onClick={loadStatus}
                loading={loadingStatus}
                size="small"
              />
            </div>

            {status ? (
              <div className="grid">
                <div className="col-12 md:col-4">
                  <div className="text-center p-3 border-round surface-100">
                    <div className="text-2xl font-bold text-primary mb-2">
                      {status.instrumentsWithNews} / {status.totalInstruments}
                    </div>
                    <div className="text-600">Инструментов с новостями</div>
                    <div className="text-sm text-600 mt-2">
                      Покрытие: {status.coverage}%
                    </div>
                  </div>
                </div>

                <div className="col-12 md:col-4">
                  <div className="text-center p-3 border-round surface-100">
                    <div className="text-2xl font-bold text-orange-500 mb-2">
                      {status.instrumentsWithoutNews}
                    </div>
                    <div className="text-600">Инструментов без новостей</div>
                  </div>
                </div>

                <div className="col-12 md:col-4">
                  <div className="text-center p-3 border-round surface-100">
                    <div className="text-lg font-bold text-blue-500 mb-2">
                      {formatDate(status.lastNewsDate)}
                    </div>
                    <div className="text-600">Последняя новость</div>
                    <Badge
                      value={status.hasHistory ? 'Есть история' : 'Нет истории'}
                      severity={status.hasHistory ? 'success' : 'warning'}
                      className="mt-2"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center p-4">
                <i className="pi pi-spin pi-spinner text-4xl"></i>
              </div>
            )}
          </div>

          {/* Тестовая кнопка NewsAPI.org */}
          <div className="col-12">
            <Card className="mt-3">
              <div className="flex flex-column gap-3">
                <div>
                  <h4 className="m-0 mb-2">🧪 Тест NewsAPI.org</h4>
                  <p className="text-600 text-sm m-0">
                    Выберите инструмент и загрузите новости через NewsAPI.org с поиском по ключевым словам
                  </p>
                </div>
                
                <div className="flex flex-column gap-3">
                  <div className="field">
                    <label htmlFor="instrument-select" className="block text-sm font-medium mb-2">
                      Выберите инструмент:
                    </label>
                    <Dropdown
                      id="instrument-select"
                      value={selectedTicker}
                      onChange={(e) => setSelectedTicker(e.value)}
                      options={instrumentOptions}
                      placeholder={isLoadingInstruments ? "Загрузка..." : "Выберите инструмент"}
                      disabled={isLoadingInstruments}
                      className="w-full"
                    />
                    {instrumentOptions.length > 0 && (
                      <div className="text-xs text-500 mt-1">
                        Доступно инструментов: {instrumentOptions.length}
                      </div>
                    )}
                    {instrumentOptions.length === 0 && !isLoadingInstruments && (
                      <div className="text-sm text-500 mt-2">
                        Инструменты не найдены. Нажмите "Обновить список" для повторной загрузки.
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      icon="pi pi-refresh"
                      label="Обновить список"
                      onClick={loadInstruments}
                      loading={isLoadingInstruments}
                      severity="secondary"
                      outlined
                      className="flex-1"
                    />
                    <Button
                      icon="pi pi-send"
                      label="Загрузить новости"
                      onClick={handleTestNewsApi}
                      loading={isLoading}
                      disabled={!selectedTicker}
                      severity="info"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Кнопка загрузки */}
          <div className="col-12">
            <Divider />
            <div className="flex flex-column gap-3">
              <div>
                <h4 className="m-0 mb-2">Загрузка исторических новостей</h4>
                <p className="text-600 text-sm mb-3">
                  Загрузите новости за текущий год для всех акций через Tinkoff Invest API. 
                  Это может занять продолжительное время.
                </p>
              </div>

              <Button
                label="Загрузить исторические новости"
                icon="pi pi-download"
                onClick={handleLoadHistorical}
                loading={isLoading}
                disabled={isLoading || !isConnected}
                severity="success"
                className="w-full"
              />

              {loadingProgress && (
                <div className="mt-3">
                  <div className="flex justify-content-between mb-2">
                    <span className="text-sm">
                      Загрузка: {loadingProgress.current} / {loadingProgress.total}
                    </span>
                    {loadingProgress.count !== undefined && (
                      <span className="text-sm">
                        Новостей загружено: {loadingProgress.count}
                      </span>
                    )}
                  </div>
                  <ProgressBar
                    value={(loadingProgress.current / loadingProgress.total) * 100}
                    className="mb-2"
                  />
                  <div className="text-sm text-600">
                    Текущий инструмент: {loadingProgress.figi}
                  </div>
                  {loadingProgress.error && (
                    <Message severity="error" text={loadingProgress.error} className="mt-2" />
                  )}
                </div>
              )}

              {!isConnected && (
                <Message
                  severity="warn"
                  text="WebSocket не подключен. Прогресс загрузки не будет отображаться."
                />
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default NewsManagement;

