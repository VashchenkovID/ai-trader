import React, { useState, useEffect, useRef } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { MultiSelect } from 'primereact/multiselect';
import { ProgressBar } from 'primereact/progressbar';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Badge } from 'primereact/badge';
import { Divider } from 'primereact/divider';
import { apiService } from '../services/apiService';

interface Instrument {
  figi: string;
  ticker: string;
  name: string;
}

interface NewsTestResult {
  ticker: string;
  figi: string;
  success: boolean;
  newsCount: number;
  message?: string;
  error?: string;
}

interface TrainingResult {
  figi: string;
  ticker: string;
  success: boolean;
  message?: string;
  error?: string;
}

interface AllNetworksTrainingResult {
  figi: string;
  ticker: string;
  networks: {
    name: string;
    success: boolean;
    message?: string;
    error?: string;
  }[];
}

const TrainingDebug: React.FC = () => {
  const [availableInstruments, setAvailableInstruments] = useState<Instrument[]>([]);
  const [selectedInstruments, setSelectedInstruments] = useState<Instrument[]>([]);
  const [isLoadingInstruments, setIsLoadingInstruments] = useState(false);
  const [isLoadingNews, setIsLoadingNews] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [isTrainingAllNetworks, setIsTrainingAllNetworks] = useState(false);
  const [newsResults, setNewsResults] = useState<NewsTestResult[]>([]);
  const [trainingResults, setTrainingResults] = useState<TrainingResult[]>([]);
  const [allNetworksResults, setAllNetworksResults] = useState<AllNetworksTrainingResult[]>([]);
  const [newsProgress, setNewsProgress] = useState<{ current: number; total: number } | null>(null);
  const [trainingProgress, setTrainingProgress] = useState<{ current: number; total: number } | null>(null);
  const [allNetworksProgress, setAllNetworksProgress] = useState<{ current: number; total: number; network?: string } | null>(null);
  const toast = useRef<Toast>(null);

  // Загрузка доступных инструментов
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
      const filtered = instruments
        .map((inst: any) => ({
          figi: inst.figi,
          ticker: inst.ticker,
          name: inst.name
        }));

      setAvailableInstruments(filtered);
    } catch (error) {
      console.error('Error loading instruments:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить список инструментов'
      });
    } finally {
      setIsLoadingInstruments(false);
    }
  };

  useEffect(() => {
    loadInstruments();
  }, []);

  // Тестирование получения новостей для выбранных инструментов
  const handleTestNews = async () => {
    if (selectedInstruments.length === 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Предупреждение',
        detail: 'Выберите хотя бы один инструмент'
      });
      return;
    }

    setIsLoadingNews(true);
    setNewsResults([]);
    setNewsProgress({ current: 0, total: selectedInstruments.length });

    const results: NewsTestResult[] = [];

    for (let i = 0; i < selectedInstruments.length; i++) {
      const instrument = selectedInstruments[i];
      setNewsProgress({ current: i + 1, total: selectedInstruments.length });

      try {
        console.log(`📡 Загрузка новостей для ${instrument.ticker}...`);
        console.log(`📋 Отправляемые данные:`, {
          ticker: instrument.ticker,
          figi: instrument.figi,
          name: instrument.name
        });
        const result = await apiService.testNewsApiNews(instrument.ticker);

        results.push({
          ticker: instrument.ticker,
          figi: instrument.figi,
          success: result.success || false,
          newsCount: result.data?.newsCount || 0,
          message: result.message || 'Успешно'
        });

        toast.current?.show({
          severity: 'success',
          summary: 'Успешно',
          detail: `Новости для ${instrument.ticker}: ${result.data?.newsCount || 0} статей`,
          life: 2000
        });

        // Небольшая задержка между запросами
        if (i < selectedInstruments.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error: any) {
        console.error(`❌ Ошибка загрузки новостей для ${instrument.ticker}:`, error);
        results.push({
          ticker: instrument.ticker,
          figi: instrument.figi,
          success: false,
          newsCount: 0,
          error: error.message || 'Неизвестная ошибка'
        });

        toast.current?.show({
          severity: 'error',
          summary: 'Ошибка',
          detail: `${instrument.ticker}: ${error.message || 'Ошибка загрузки новостей'}`,
          life: 3000
        });
      }
    }

    setNewsResults(results);
    setIsLoadingNews(false);
    setNewsProgress(null);
  };

  // Запуск обучения для выбранных инструментов
  const handleTrainWithNews = async () => {
    if (selectedInstruments.length === 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Предупреждение',
        detail: 'Выберите хотя бы один инструмент'
      });
      return;
    }

    setIsTraining(true);
    setTrainingResults([]);
    setTrainingProgress({ current: 0, total: selectedInstruments.length });

    const results: TrainingResult[] = [];

    for (let i = 0; i < selectedInstruments.length; i++) {
      const instrument = selectedInstruments[i];
      setTrainingProgress({ current: i + 1, total: selectedInstruments.length });

      try {
        console.log(`🧠 Запуск обучения для ${instrument.ticker}...`);
        const result = await apiService.trainNeuralNetwork(instrument.figi, {
          useNews: true, // Использовать новости при обучении
          epochs: 10
        });

        results.push({
          figi: instrument.figi,
          ticker: instrument.ticker,
          success: result.success || false,
          message: result.message || 'Обучение запущено'
        });

        toast.current?.show({
          severity: 'success',
          summary: 'Успешно',
          detail: `Обучение для ${instrument.ticker} запущено`,
          life: 2000
        });

        // Небольшая задержка между запросами
        if (i < selectedInstruments.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error: any) {
        console.error(`❌ Ошибка обучения для ${instrument.ticker}:`, error);
        results.push({
          figi: instrument.figi,
          ticker: instrument.ticker,
          success: false,
          error: error.message || 'Неизвестная ошибка'
        });

        toast.current?.show({
          severity: 'error',
          summary: 'Ошибка',
          detail: `${instrument.ticker}: ${error.message || 'Ошибка обучения'}`,
          life: 3000
        });
      }
    }

    setTrainingResults(results);
    setIsTraining(false);
    setTrainingProgress(null);
  };

  // Запуск обучения всех нейросетей по одному инструменту
  const handleTrainAllNetworks = async () => {
    if (selectedInstruments.length === 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Предупреждение',
        detail: 'Выберите хотя бы один инструмент'
      });
      return;
    }

    setIsTrainingAllNetworks(true);
    setAllNetworksResults([]);
    setAllNetworksProgress({ current: 0, total: selectedInstruments.length });

    const results: AllNetworksTrainingResult[] = [];

    for (let i = 0; i < selectedInstruments.length; i++) {
      const instrument = selectedInstruments[i];
      setAllNetworksProgress({ current: i + 1, total: selectedInstruments.length });

      const networkResults: { name: string; success: boolean; message?: string; error?: string }[] = [];

      // Список нейросетей для обучения
      const networks = [
        { name: 'Основная нейросеть', method: () => apiService.trainNeuralNetwork(instrument.figi, { useNews: true, epochs: 10 }) },
        { name: 'Ансамбль', method: () => apiService.trainEnsemble(instrument.figi, { useNews: true }) },
        { name: 'Мета-обучение', method: () => apiService.trainMetaLearning(instrument.figi, { useNews: true }) },
        { name: 'Обучение с подкреплением', method: () => apiService.trainReinforcementLearning(instrument.figi, { useNews: true }) }
      ];

      for (const network of networks) {
        setAllNetworksProgress({ 
          current: i + 1, 
          total: selectedInstruments.length,
          network: `${instrument.ticker} - ${network.name}`
        });

        try {
          console.log(`🧠 Запуск обучения ${network.name} для ${instrument.ticker}...`);
          const result = await network.method();

          networkResults.push({
            name: network.name,
            success: result?.success !== false,
            message: result?.message || 'Обучение запущено'
          });

          toast.current?.show({
            severity: 'success',
            summary: 'Успешно',
            detail: `${instrument.ticker} - ${network.name}: запущено`,
            life: 2000
          });

          // Небольшая задержка между запусками нейросетей
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error: any) {
          console.error(`❌ Ошибка обучения ${network.name} для ${instrument.ticker}:`, error);
          networkResults.push({
            name: network.name,
            success: false,
            error: error.message || 'Неизвестная ошибка'
          });

          toast.current?.show({
            severity: 'error',
            summary: 'Ошибка',
            detail: `${instrument.ticker} - ${network.name}: ${error.message || 'Ошибка обучения'}`,
            life: 3000
          });
        }
      }

      results.push({
        figi: instrument.figi,
        ticker: instrument.ticker,
        networks: networkResults
      });

      // Небольшая задержка между инструментами
      if (i < selectedInstruments.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    setAllNetworksResults(results);
    setIsTrainingAllNetworks(false);
    setAllNetworksProgress(null);
  };

  // Форматирование опций для MultiSelect
  const instrumentOptions = availableInstruments.map(inst => ({
    label: `${inst.ticker} - ${inst.name}`,
    value: inst
  }));

  // Шаблон для отображения статуса в таблице новостей
  const newsStatusTemplate = (rowData: NewsTestResult) => {
    return (
      <Badge 
        value={rowData.success ? 'Успешно' : 'Ошибка'} 
        severity={rowData.success ? 'success' : 'danger'} 
      />
    );
  };

  // Шаблон для отображения статуса в таблице обучения
  const trainingStatusTemplate = (rowData: TrainingResult) => {
    return (
      <Badge 
        value={rowData.success ? 'Запущено' : 'Ошибка'} 
        severity={rowData.success ? 'success' : 'danger'} 
      />
    );
  };

  return (
    <div className="grid">
      <div className="col-12">
        <Toast ref={toast} />
        
        <Card title="🔧 Отладка обучения с новостями" className="mb-4">
          <div className="grid">
            {/* Выбор инструментов */}
            <div className="col-12">
              <div className="field">
                <label htmlFor="instruments" className="font-semibold mb-2 block">
                  Выберите инструменты для тестирования
                </label>
                <MultiSelect
                  id="instruments"
                  value={selectedInstruments}
                  onChange={(e) => setSelectedInstruments(e.value || [])}
                  options={instrumentOptions}
                  optionLabel="label"
                  optionValue="value"
                  placeholder={isLoadingInstruments ? "Загрузка..." : "Выберите инструменты"}
                  disabled={isLoadingInstruments}
                  className="w-full"
                  display="chip"
                  filter
                  maxSelectedLabels={5}
                  selectedItemsLabel="{0} инструментов выбрано"
                />
                <div className="text-xs text-500 mt-1">
                  Доступно инструментов: {availableInstruments.length}
                </div>
              </div>
            </div>

            <Divider />

            {/* Тестирование новостей */}
            <div className="col-12">
              <h3 className="text-xl font-semibold mb-3">📰 Тестирование получения новостей</h3>
              <p className="text-500 mb-3">
                Проверка получения новостей для выбранных инструментов через NewsAPI.org
              </p>
              
              <Button
                label="Запросить новости"
                icon="pi pi-search"
                onClick={handleTestNews}
                disabled={isLoadingNews || selectedInstruments.length === 0}
                loading={isLoadingNews}
                className="mb-3"
              />

              {newsProgress && (
                <div className="mb-3">
                  <ProgressBar 
                    value={(newsProgress.current / newsProgress.total) * 100} 
                    showValue={false}
                  />
                  <div className="text-sm text-500 mt-1">
                    Обработано: {newsProgress.current} / {newsProgress.total}
                  </div>
                </div>
              )}

              {newsResults.length > 0 && (
                <div className="mt-4">
                  <DataTable value={newsResults} responsiveLayout="scroll" className="text-sm">
                    <Column field="ticker" header="Тикер" style={{ minWidth: '100px' }} />
                    <Column field="newsCount" header="Количество новостей" style={{ minWidth: '150px' }} />
                    <Column 
                      body={newsStatusTemplate} 
                      header="Статус" 
                      style={{ minWidth: '120px' }} 
                    />
                    <Column field="message" header="Сообщение" style={{ minWidth: '200px' }} />
                    <Column field="error" header="Ошибка" style={{ minWidth: '200px' }} />
                  </DataTable>
                </div>
              )}
            </div>

            <Divider />

            {/* Запуск обучения */}
            <div className="col-12">
              <h3 className="text-xl font-semibold mb-3">🧠 Запуск обучения с новостями</h3>
              <p className="text-500 mb-3">
                Запуск обучения нейросети для выбранных инструментов с использованием данных новостей
              </p>
              
              <div className="flex gap-2 mb-3">
                <Button
                  label="Запустить обучение (одна нейросеть)"
                  icon="pi pi-play"
                  onClick={handleTrainWithNews}
                  disabled={isTraining || isTrainingAllNetworks || selectedInstruments.length === 0}
                  loading={isTraining}
                  className="flex-1"
                  severity="success"
                />
                <Button
                  label="Запустить все нейросети"
                  icon="pi pi-th-large"
                  onClick={handleTrainAllNetworks}
                  disabled={isTraining || isTrainingAllNetworks || selectedInstruments.length === 0}
                  loading={isTrainingAllNetworks}
                  className="flex-1"
                  severity="info"
                />
              </div>

              {(trainingProgress || allNetworksProgress) && (
                <div className="mb-3">
                  <ProgressBar 
                    value={((trainingProgress?.current || allNetworksProgress?.current || 0) / (trainingProgress?.total || allNetworksProgress?.total || 1)) * 100} 
                    showValue={false}
                  />
                  <div className="text-sm text-500 mt-1">
                    Обработано: {trainingProgress?.current || allNetworksProgress?.current || 0} / {trainingProgress?.total || allNetworksProgress?.total || 0}
                    {allNetworksProgress?.network && (
                      <span className="ml-2">({allNetworksProgress.network})</span>
                    )}
                  </div>
                </div>
              )}

              {trainingResults.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-lg font-semibold mb-2">Результаты обучения (одна нейросеть)</h4>
                  <DataTable value={trainingResults} responsiveLayout="scroll" className="text-sm">
                    <Column field="ticker" header="Тикер" style={{ minWidth: '100px' }} />
                    <Column 
                      body={trainingStatusTemplate} 
                      header="Статус" 
                      style={{ minWidth: '120px' }} 
                    />
                    <Column field="message" header="Сообщение" style={{ minWidth: '200px' }} />
                    <Column field="error" header="Ошибка" style={{ minWidth: '200px' }} />
                  </DataTable>
                </div>
              )}

              {allNetworksResults.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-lg font-semibold mb-2">Результаты обучения всех нейросетей</h4>
                  {allNetworksResults.map((result, idx) => (
                    <Card key={idx} title={`${result.ticker} (${result.figi})`} className="mb-3">
                      <DataTable value={result.networks} responsiveLayout="scroll" className="text-sm">
                        <Column field="name" header="Нейросеть" style={{ minWidth: '200px' }} />
                        <Column 
                          body={(rowData) => (
                            <Badge 
                              value={rowData.success ? 'Успешно' : 'Ошибка'} 
                              severity={rowData.success ? 'success' : 'danger'} 
                            />
                          )}
                          header="Статус" 
                          style={{ minWidth: '120px' }} 
                        />
                        <Column field="message" header="Сообщение" style={{ minWidth: '200px' }} />
                        <Column field="error" header="Ошибка" style={{ minWidth: '200px' }} />
                      </DataTable>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default TrainingDebug;
