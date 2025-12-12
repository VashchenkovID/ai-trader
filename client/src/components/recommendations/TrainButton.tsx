import React, { useState, useRef } from 'react';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { apiService } from '../../services/apiService';

interface Recommendation {
  figi: string;
  ticker: string;
  name: string;
}

interface TrainButtonProps {
  rowData: Recommendation;
  onTrainingComplete?: () => void;
}

const TrainButton: React.FC<TrainButtonProps> = ({ rowData, onTrainingComplete }) => {
  const [loading, setLoading] = useState(false);
  const toast = useRef<Toast>(null);

  const handleTrain = async () => {
    if (!rowData.figi) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Предупреждение',
        detail: 'FIGI не указан',
        life: 3000
      });
      return;
    }

    setLoading(true);
    try {
      await apiService.trainEnsemble(rowData.figi, { useNews: true });
      
      toast.current?.show({
        severity: 'success',
        summary: 'Обучение запущено',
        detail: `Обучение ансамбля нейросетей для ${rowData.ticker} (${rowData.name}) успешно запущено. Это может занять некоторое время.`,
        life: 5000
      });

      // Вызываем callback для обновления данных после завершения обучения
      if (onTrainingComplete) {
        // Не вызываем сразу, так как обучение может занять время
        // Можно добавить WebSocket подписку на события обучения
        setTimeout(() => {
          onTrainingComplete();
        }, 2000);
      }
    } catch (error: any) {
      console.error('Error training neural networks:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка обучения',
        detail: error.response?.data?.error || error.message || 'Не удалось запустить обучение',
        life: 5000
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Toast ref={toast} />
      <Button
        icon="pi pi-brain"
        label="Обучить"
        size="small"
        severity="help"
        loading={loading}
        onClick={handleTrain}
        tooltip="Запустить обучение ансамбля нейросетей (LSTM, CNN, Transformer) для этого инструмента"
        tooltipOptions={{ position: 'top' }}
      />
    </>
  );
};

export default TrainButton;

