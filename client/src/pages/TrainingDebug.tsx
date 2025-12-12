import React, { useState, useEffect, useRef } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Dropdown } from 'primereact/dropdown';
import { ProgressBar } from 'primereact/progressbar';
import { Divider } from 'primereact/divider';
import { apiService } from '../services/apiService';

interface Instrument {
  figi: string;
  ticker: string;
  name: string;
}

interface TrainingStatus {
  type: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
  error?: string;
}

const TrainingDebug: React.FC = () => {
  const [availableInstruments, setAvailableInstruments] = useState<Instrument[]>([]);
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument | null>(null);
  const [isLoadingInstruments, setIsLoadingInstruments] = useState(false);
  const [trainingStatuses, setTrainingStatuses] = useState<Record<string, TrainingStatus>>({});
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

  // Обновление статуса обучения
  const updateTrainingStatus = (type: string, status: TrainingStatus['status'], message?: string, error?: string) => {
    setTrainingStatuses(prev => ({
      ...prev,
      [type]: { type, status, message, error }
    }));
  };

  // Обработчик обучения
  const handleTraining = async (type: string, trainingFunction: () => Promise<any>) => {
    if (!selectedInstrument) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Предупреждение',
        detail: 'Выберите инструмент для обучения'
      });
      return;
    }

    updateTrainingStatus(type, 'loading', 'Запуск обучения...');

    try {
      const result = await trainingFunction();
      updateTrainingStatus(type, 'success', result.message || 'Обучение успешно запущено');
      toast.current?.show({
        severity: 'success',
        summary: 'Успешно',
        detail: `${type} для ${selectedInstrument.ticker}: обучение запущено`,
        life: 3000
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Неизвестная ошибка';
      updateTrainingStatus(type, 'error', undefined, errorMessage);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: `${type} для ${selectedInstrument.ticker}: ${errorMessage}`,
        life: 5000
      });
    }
  };

  // Виды обучения
  const trainingTypes = [
    {
      key: 'analyze-single',
      label: 'Анализ и сохранение рекомендации',
      icon: 'pi pi-chart-line',
      description: 'Анализ одного инструмента с сохранением результата в рекомендации (для отладки)',
      handler: () => handleTraining('analyze-single', () => 
        apiService.analyzeSingleInstrument(selectedInstrument!.figi)
      ),
      severity: 'info' as const
    },
    {
      key: 'neural',
      label: 'Основная нейросеть',
      icon: 'pi pi-brain',
      description: 'Обучение традиционной нейросети для одного инструмента',
      handler: () => handleTraining('neural', () => 
        apiService.trainNeuralNetwork(selectedInstrument!.figi, { useNews: true, epochs: 10 })
      ),
      severity: 'success' as const
    },
    {
      key: 'ensemble',
      label: 'Ансамбль',
      icon: 'pi pi-sitemap',
      description: 'Обучение ансамбля моделей (LSTM, CNN, Transformer)',
      handler: () => handleTraining('ensemble', () => 
        apiService.trainEnsemble(selectedInstrument!.figi, { useNews: true })
      ),
      severity: 'info' as const
    },
    {
      key: 'meta',
      label: 'Мета-обучение',
      icon: 'pi pi-cog',
      description: 'Обучение модели мета-обучения для адаптации к новым задачам',
      handler: () => handleTraining('meta', () => 
        apiService.trainMetaLearning(selectedInstrument!.figi, { useNews: true })
      ),
      severity: 'warning' as const
    },
    {
      key: 'reinforcement',
      label: 'Обучение с подкреплением',
      icon: 'pi pi-android',
      description: 'Обучение RL агента для принятия торговых решений',
      handler: () => handleTraining('reinforcement', () => 
        apiService.trainReinforcementLearning(selectedInstrument!.figi, { useNews: true })
      ),
      severity: 'help' as const
    },
    {
      key: 'all',
      label: 'Все AI сети',
      icon: 'pi pi-th-large',
      description: 'Обучение всех AI сетей одновременно (Integrated AI)',
      handler: () => handleTraining('all', () => 
        apiService.trainAllAI(selectedInstrument!.figi, { useNews: true })
      ),
      severity: 'secondary' as const
    }
  ];

  // Пакетное обучение
  const batchTrainingTypes = [
    {
      key: 'batch-neural',
      label: 'Пакетное обучение нейросетей',
      icon: 'pi pi-list',
      description: 'Обучение нейросетей для нескольких инструментов',
      handler: () => handleTraining('batch-neural', () => 
        apiService.trainBatchNeuralNetwork([selectedInstrument!.figi], { useNews: true })
      ),
      severity: 'success' as const
    },
    {
      key: 'batch-ensemble',
      label: 'Пакетное обучение ансамбля',
      icon: 'pi pi-list',
      description: 'Пакетное обучение ансамбля для нескольких инструментов',
      handler: () => handleTraining('batch-ensemble', () => 
        apiService.trainBatchEnsemble([selectedInstrument!.figi], { useNews: true })
      ),
      severity: 'info' as const
    },
    {
      key: 'batch-meta',
      label: 'Пакетное обучение мета-обучения',
      icon: 'pi pi-list',
      description: 'Пакетное обучение мета-обучения для нескольких инструментов',
      handler: () => handleTraining('batch-meta', () => 
        apiService.trainBatchMetaLearning([selectedInstrument!.figi], { useNews: true })
      ),
      severity: 'warning' as const
    },
    {
      key: 'batch-reinforcement',
      label: 'Пакетное обучение RL',
      icon: 'pi pi-list',
      description: 'Пакетное обучение RL для нескольких инструментов',
      handler: () => handleTraining('batch-reinforcement', () => 
        apiService.trainBatchReinforcementLearning([selectedInstrument!.figi], { useNews: true })
      ),
      severity: 'help' as const
    }
  ];

  // Форматирование опций для Dropdown
  const instrumentOptions = availableInstruments.map(inst => ({
    label: `${inst.ticker} - ${inst.name}`,
    value: inst.figi,
    instrument: inst
  }));

  // Получение статуса для типа обучения
  const getStatusForType = (type: string): TrainingStatus => {
    return trainingStatuses[type] || { type, status: 'idle' };
  };

  // Рендер кнопки обучения
  const renderTrainingButton = (trainingType: typeof trainingTypes[0]) => {
    const status = getStatusForType(trainingType.key);
    const isLoading = status.status === 'loading';
    const isDisabled = !selectedInstrument || isLoading;

    return (
      <div key={trainingType.key} className="col-12 md:col-6 lg:col-4">
        <Card className="h-full">
          <div className="flex flex-column gap-3">
            <div className="flex align-items-center gap-2">
              <i className={`pi ${trainingType.icon} text-2xl`}></i>
              <h3 className="text-lg font-semibold m-0">{trainingType.label}</h3>
            </div>
            <p className="text-sm text-500 m-0">{trainingType.description}</p>
            
            <Button
              label={isLoading ? 'Обучение...' : 'Запустить обучение'}
              icon={isLoading ? 'pi pi-spin pi-spinner' : 'pi pi-play'}
              onClick={trainingType.handler}
              disabled={isDisabled}
              loading={isLoading}
              severity={trainingType.severity}
              className="w-full"
            />

            {status.status === 'loading' && (
              <ProgressBar mode="indeterminate" style={{ height: '4px' }} />
            )}

            {status.status === 'success' && status.message && (
              <div className="text-sm text-green-500">
                <i className="pi pi-check-circle mr-2"></i>
                {status.message}
              </div>
            )}

            {status.status === 'error' && status.error && (
              <div className="text-sm text-red-500">
                <i className="pi pi-times-circle mr-2"></i>
                {status.error}
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  };

  return (
    <div className="grid">
      <div className="col-12">
        <Toast ref={toast} />
        
        <Card title="🔧 Отладка обучения нейросетей" className="mb-4">
          <div className="grid">
            {/* Выбор инструмента */}
            <div className="col-12">
              <div className="field">
                <label htmlFor="instrument" className="font-semibold mb-2 block">
                  Выберите инструмент для обучения
                </label>
                <Dropdown
                  id="instrument"
                  value={selectedInstrument?.figi || null}
                  onChange={(e) => {
                    const figi = e.value;
                    if (figi) {
                      const instrument = availableInstruments.find(inst => inst.figi === figi);
                      setSelectedInstrument(instrument || null);
                    } else {
                      setSelectedInstrument(null);
                    }
                  }}
                  options={instrumentOptions}
                  optionLabel="label"
                  optionValue="value"
                  placeholder={isLoadingInstruments ? "Загрузка..." : "Выберите инструмент"}
                  disabled={isLoadingInstruments}
                  className="w-full"
                  filter
                  showClear
                />
                <div className="text-xs text-500 mt-1">
                  Доступно инструментов: {availableInstruments.length}
                  {selectedInstrument && (
                    <span className="ml-2">
                      | Выбрано: {selectedInstrument.ticker} ({selectedInstrument.figi})
                    </span>
                  )}
                </div>
              </div>
            </div>

            <Divider />

            {/* Обучение по одному инструменту */}
            <div className="col-12">
              <h2 className="text-2xl font-semibold mb-3">🎓 Обучение по одному инструменту</h2>
              <p className="text-500 mb-4">
                Выберите инструмент и запустите обучение выбранного типа нейросети
              </p>
              
              <div className="grid">
                {trainingTypes.map(renderTrainingButton)}
              </div>
            </div>

            <Divider />

            {/* Пакетное обучение */}
            <div className="col-12">
              <h2 className="text-2xl font-semibold mb-3">📦 Пакетное обучение</h2>
              <p className="text-500 mb-4">
                Пакетное обучение для нескольких инструментов (в текущей версии используется один выбранный инструмент)
              </p>
              
              <div className="grid">
                {batchTrainingTypes.map(renderTrainingButton)}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default TrainingDebug;
