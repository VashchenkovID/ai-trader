import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Skeleton } from 'primereact/skeleton';
import { Tooltip } from 'primereact/tooltip';
import { Toast } from 'primereact/toast';

interface MacroDataPreviewProps {
  className?: string;
}

interface MacroIndicator {
  indicatorType: string;
  value: string;
  period: string;
  change?: number;
}

interface MacroData {
  interestRate?: MacroIndicator;
  inflation?: MacroIndicator;
  gdp?: MacroIndicator;
  volatilityIndex?: MacroIndicator;
}

const formatPercent = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '—';
  return `${numValue.toFixed(2)}%`;
};

const formatChange = (change: number | undefined) => {
  if (change === undefined || change === null || isNaN(change)) return null;
  return change >= 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;
};

const getChangeColor = (change: number | undefined) => {
  if (change === undefined || change === null || isNaN(change)) return 'text-500';
  return change >= 0 ? 'text-green-500' : 'text-red-500';
};

const getTrendIcon = (change: number | undefined) => {
  if (change === undefined || change === null || isNaN(change)) return '—';
  return change >= 0 ? '↑' : '↓';
};

export const MacroDataPreview: React.FC<MacroDataPreviewProps> = ({ className = '' }) => {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [macroData, setMacroData] = useState<MacroData>({});
  const toast = React.useRef<Toast>(null);

  const loadMacroData = async () => {
    try {
      setLoading(true);
      // Загружаем последние макро-данные через apiService
      const { apiService } = await import('../../services/apiService');
      const result = await apiService.getMacroDataLatest('RUS');
      if (result.success && result.data?.indicators) {
        const indicators = result.data.indicators;
        setMacroData({
          interestRate: indicators.interest_rate,
          inflation: indicators.inflation,
          gdp: indicators.gdp,
          volatilityIndex: indicators.volatility_index
        });
      }
    } catch (error) {
      console.error('Error loading macro data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMacroData();
  }, []);

  const handleUpdate = async () => {
    try {
      setUpdating(true);
      const { apiService } = await import('../../services/apiService');
      const result = await apiService.updateMacroData();
      
      if (result.success) {
        toast.current?.show({
          severity: 'success',
          summary: 'Успешно',
          detail: result.message || 'Макро-данные обновлены',
          life: 3000
        });
        // Перезагружаем данные после обновления
        await loadMacroData();
      } else {
        toast.current?.show({
          severity: 'error',
          summary: 'Ошибка',
          detail: result.message || 'Не удалось обновить макро-данные',
          life: 5000
        });
      }
    } catch (error) {
      console.error('Error updating macro data:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Произошла ошибка при обновлении данных',
        life: 5000
      });
    } finally {
      setUpdating(false);
    }
  };

  const indicators = [
    {
      key: 'interestRate',
      label: 'Ставка ЦБ РФ',
      icon: 'pi pi-percentage',
      data: macroData.interestRate,
      tooltip: 'Ключевая ставка Центрального банка РФ'
    },
    {
      key: 'inflation',
      label: 'Инфляция',
      icon: 'pi pi-chart-line',
      data: macroData.inflation,
      tooltip: 'Годовая инфляция'
    },
    {
      key: 'gdp',
      label: 'ВВП',
      icon: 'pi pi-building',
      data: macroData.gdp,
      tooltip: 'Рост ВВП (квартальный)'
    },
    {
      key: 'volatilityIndex',
      label: 'RVI',
      icon: 'pi pi-chart-bar',
      data: macroData.volatilityIndex,
      tooltip: 'Индекс волатильности RVI'
    }
  ];

  return (
    <>
      <Toast ref={toast} />
      <Card 
        title={
          <div className="flex align-items-center justify-content-between w-full">
            <span><i className="pi pi-globe mr-2"></i>Макроэкономические данные</span>
            <Button
              icon="pi pi-refresh"
              className="p-button-text p-button-sm"
              onClick={handleUpdate}
              loading={updating}
              tooltip="Обновить макро-данные"
              tooltipOptions={{ position: 'left' }}
            />
          </div>
        }
        className={`h-full ${className}`}
      >
      {loading ? (
        <div className="grid">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="col-12 md:col-6">
              <div className="p-2">
                <Skeleton width="60%" height="1rem" className="mb-2" />
                <Skeleton width="40%" height="1.5rem" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid">
          {indicators.map((indicator) => {
            const value = indicator.data?.value;
            const change = indicator.data?.change;
            const hasData = indicator.data && value !== null && value !== undefined;
            
            return (
              <div key={indicator.key} className="col-12 md:col-6">
                <div className="p-2 border-round surface-100 h-full">
                  <div className="flex align-items-center justify-content-between">
                    <div className="flex align-items-center gap-2 flex-1">
                      <i className={`${indicator.icon} text-primary`} />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{indicator.label}</div>
                        <Tooltip target={`.macro-${indicator.key}-tooltip`} />
                        <small className={`text-xs text-500 macro-${indicator.key}-tooltip`} data-pr-tooltip={hasData ? indicator.tooltip : 'Данные отсутствуют. Возможно, требуется обновление макро-данных.'}>
                          {hasData && indicator.data?.period ? new Date(indicator.data.period).toLocaleDateString('ru-RU') : 'Нет данных'}
                        </small>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${hasData ? '' : 'text-500'}`}>
                        {hasData ? formatPercent(value) : '—'}
                      </div>
                      {hasData && change !== undefined && change !== null && (
                        <div className={`text-xs ${getChangeColor(change)}`}>
                          {getTrendIcon(change)} {formatChange(change)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </Card>
    </>
  );
};

export default MacroDataPreview;
