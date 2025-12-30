import React, { useState, useEffect, useRef } from 'react';
import { Toast } from 'primereact/toast';
import { Card } from '../components/ui/Card/Card';
import { Button } from '../components/ui/Button/Button';
import { Select } from '../components/ui/Select/Select';
import { ProgressBar } from '../components/ui/ProgressBar/ProgressBar';
import { Divider } from '../components/ui/Divider/Divider';
import { Badge } from '../components/ui/Badge/Badge';
import { apiService } from '../services/apiService';
import './TrainingDebug.css';

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
      } else if (response && typeof response === 'object' && 'data' in response) {
        // Если данные в поле data
        instruments = Array.isArray((response as any).data) ? (response as any).data : [];
      }
      
      // Фильтруем только акции в рублях и обрабатываем данные
      // Данные приходят как объекты Sequelize, нужно извлечь из dataValues или использовать toJSON()
      const filtered = instruments
        .map((inst: any) => {
          // Извлекаем данные из Sequelize модели
          const data = inst.dataValues || inst.toJSON?.() || inst;
          return {
            figi: data.figi || '',
            ticker: data.ticker || '',
            name: data.name || ''
          };
        })
        .filter(inst => inst.figi && (inst.ticker || inst.name)); // Фильтруем записи без figi и названия

      console.log('📊 Загружено инструментов:', filtered.length);
      if (filtered.length > 0) {
        console.log('📊 Пример инструмента:', filtered[0]);
      }

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
      variant: 'secondary' as const
    },
    {
      key: 'neural',
      label: 'Основная нейросеть',
      icon: 'pi pi-brain',
      description: 'Обучение традиционной нейросети для одного инструмента',
      handler: () => handleTraining('neural', () => 
        apiService.trainNeuralNetwork(selectedInstrument!.figi, { useNews: true, epochs: 10 })
      ),
      variant: 'success' as const
    },
    {
      key: 'ensemble',
      label: 'Ансамбль',
      icon: 'pi pi-sitemap',
      description: 'Обучение ансамбля моделей (LSTM, CNN, Transformer)',
      handler: () => handleTraining('ensemble', () => 
        apiService.trainEnsemble(selectedInstrument!.figi, { useNews: true })
      ),
      variant: 'secondary' as const
    },
    {
      key: 'meta',
      label: 'Мета-обучение',
      icon: 'pi pi-cog',
      description: 'Обучение модели мета-обучения для адаптации к новым задачам',
      handler: () => handleTraining('meta', () => 
        apiService.trainMetaLearning(selectedInstrument!.figi, { useNews: true })
      ),
      variant: 'secondary' as const
    },
    {
      key: 'reinforcement',
      label: 'Обучение с подкреплением',
      icon: 'pi pi-android',
      description: 'Обучение RL агента для принятия торговых решений',
      handler: () => handleTraining('reinforcement', () => 
        apiService.trainReinforcementLearning(selectedInstrument!.figi, { useNews: true })
      ),
      variant: 'secondary' as const
    },
    {
      key: 'all',
      label: 'Все AI сети',
      icon: 'pi pi-th-large',
      description: 'Обучение всех AI сетей одновременно (Integrated AI)',
      handler: () => handleTraining('all', () => 
        apiService.trainAllAI(selectedInstrument!.figi, { useNews: true })
      ),
      variant: 'primary' as const
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
      variant: 'success' as const
    },
    {
      key: 'batch-ensemble',
      label: 'Пакетное обучение ансамбля',
      icon: 'pi pi-list',
      description: 'Пакетное обучение ансамбля для нескольких инструментов',
      handler: () => handleTraining('batch-ensemble', () => 
        apiService.trainBatchEnsemble([selectedInstrument!.figi], { useNews: true })
      ),
      variant: 'secondary' as const
    },
    {
      key: 'batch-meta',
      label: 'Пакетное обучение мета-обучения',
      icon: 'pi pi-list',
      description: 'Пакетное обучение мета-обучения для нескольких инструментов',
      handler: () => handleTraining('batch-meta', () => 
        apiService.trainBatchMetaLearning([selectedInstrument!.figi], { useNews: true })
      ),
      variant: 'secondary' as const
    },
    {
      key: 'batch-reinforcement',
      label: 'Пакетное обучение RL',
      icon: 'pi pi-list',
      description: 'Пакетное обучение RL для нескольких инструментов',
      handler: () => handleTraining('batch-reinforcement', () => 
        apiService.trainBatchReinforcementLearning([selectedInstrument!.figi], { useNews: true })
      ),
      variant: 'secondary' as const
    }
  ];

  // Форматирование опций для Select
  const instrumentOptions = availableInstruments.map(inst => {
    const ticker = inst.ticker || '';
    const name = inst.name || '';
    const label = ticker && name 
      ? `${ticker} - ${name}` 
      : ticker 
        ? ticker 
        : name 
          ? name 
          : inst.figi;
    
    return {
      label,
      value: inst.figi
    };
  });

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
      <div key={trainingType.key} className="training-debug-card-wrapper">
        <Card variant="glass" className="training-debug-card h-full">
          <div className="training-debug-card-content">
            <div className="training-debug-card-header">
              <i className={`pi ${trainingType.icon} training-debug-icon`}></i>
              <h3 className="training-debug-title">{trainingType.label}</h3>
            </div>
            <p className="training-debug-description">{trainingType.description}</p>
            
            <Button
              variant={trainingType.variant}
              onClick={trainingType.handler}
              disabled={isDisabled}
              loading={isLoading}
              icon={<i className={isLoading ? 'pi pi-spin pi-spinner' : 'pi pi-play'}></i>}
              fullWidth
            >
              {isLoading ? 'Обучение...' : 'Запустить обучение'}
            </Button>

            {status.status === 'loading' && (
              <ProgressBar value={0} animated size="sm" />
            )}

            {status.status === 'success' && status.message && (
              <div className="training-debug-status training-debug-status-success">
                <i className="pi pi-check-circle"></i>
                <span>{status.message}</span>
              </div>
            )}

            {status.status === 'error' && status.error && (
              <div className="training-debug-status training-debug-status-error">
                <i className="pi pi-times-circle"></i>
                <span>{status.error}</span>
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  };

  return (
    <div className="training-debug-page">
      <Toast ref={toast} />
      
      <Card variant="glass" header="🔧 Отладка обучения нейросетей" className="training-debug-main-card">
        <div className="training-debug-content">
          {/* Выбор инструмента */}
          <div className="training-debug-instrument-section">
            <label htmlFor="instrument" className="training-debug-label">
              Выберите инструмент для обучения
            </label>
            <Select
              id="instrument"
              value={selectedInstrument?.figi || ''}
              onChange={(e) => {
                const figi = e.target.value;
                if (figi && figi !== '') {
                  const instrument = availableInstruments.find(inst => inst.figi === figi);
                  setSelectedInstrument(instrument || null);
                } else {
                  setSelectedInstrument(null);
                }
              }}
              options={instrumentOptions}
              placeholder={isLoadingInstruments ? "Загрузка..." : "Выберите инструмент"}
              disabled={isLoadingInstruments}
              fullWidth
              searchable
            />
            <div className="training-debug-helper-text">
              Доступно инструментов: <Badge variant="info" size="sm">{availableInstruments.length}</Badge>
              {selectedInstrument && (
                <span className="training-debug-selected">
                  | Выбрано: <strong>{selectedInstrument.ticker}</strong> ({selectedInstrument.figi})
                </span>
              )}
            </div>
          </div>

          <Divider />

          {/* Обучение по одному инструменту */}
          <div className="training-debug-section">
            <h2 className="training-debug-section-title">🎓 Обучение по одному инструменту</h2>
            <p className="training-debug-section-description">
              Выберите инструмент и запустите обучение выбранного типа нейросети
            </p>
            
            <div className="training-debug-grid">
              {trainingTypes.map(renderTrainingButton)}
            </div>
          </div>

          <Divider />

          {/* Пакетное обучение */}
          <div className="training-debug-section">
            <h2 className="training-debug-section-title">📦 Пакетное обучение</h2>
            <p className="training-debug-section-description">
              Пакетное обучение для нескольких инструментов (в текущей версии используется один выбранный инструмент)
            </p>
            
            <div className="training-debug-grid">
              {batchTrainingTypes.map(renderTrainingButton)}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default TrainingDebug;
