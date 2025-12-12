import React, { useState, useRef } from 'react';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { apiService } from '../../services/apiService';

interface Recommendation {
  figi: string;
  ticker: string;
  name: string;
}

interface AnalyzeButtonProps {
  rowData: Recommendation;
  onAnalysisComplete?: () => void;
}

const AnalyzeButton: React.FC<AnalyzeButtonProps> = ({ rowData, onAnalysisComplete }) => {
  const [loading, setLoading] = useState(false);
  const toast = useRef<Toast>(null);

  const handleAnalyze = async () => {
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
      await apiService.analyzeSingleInstrument(rowData.figi);
      
      toast.current?.show({
        severity: 'success',
        summary: 'Анализ завершен',
        detail: `Анализ для ${rowData.ticker} (${rowData.name}) успешно выполнен и сохранен`,
        life: 5000
      });

      // Вызываем callback для обновления данных
      if (onAnalysisComplete) {
        setTimeout(() => {
          onAnalysisComplete();
        }, 1000);
      }
    } catch (error: any) {
      console.error('Error analyzing instrument:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка анализа',
        detail: error.response?.data?.error || error.message || 'Не удалось выполнить анализ',
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
        icon="pi pi-chart-line"
        label="Анализ"
        size="small"
        severity="info"
        loading={loading}
        onClick={handleAnalyze}
        tooltip="Провести анализ инструмента и обновить рекомендацию"
        tooltipOptions={{ position: 'top' }}
      />
    </>
  );
};

export default AnalyzeButton;

