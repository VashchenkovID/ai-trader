import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../ui/Card/Card';
import { Button } from '../ui/Button/Button';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { Toast } from 'primereact/toast';
import './MacroDataPreview.css';

interface MacroDataPreviewProps {
  className?: string;
}

interface MacroIndicator {
  indicatorType: string;
  value: string | null;
  period: string | null;
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
        
        // Преобразуем Sequelize модели в простые объекты
        const transformIndicator = (indicator: any): MacroIndicator | undefined => {
          if (!indicator) return undefined;
          
          // Если это Sequelize модель, получаем plain object
          // getLatestIndicators уже возвращает plain objects с change
          const plain = indicator.dataValues || indicator.toJSON?.() || indicator.get?.({ plain: true }) || indicator;
          
          // change уже рассчитан на сервере, используем его
          const change = plain.change !== undefined && plain.change !== null && !isNaN(plain.change) 
            ? plain.change 
            : undefined;
          
          return {
            indicatorType: plain.indicatorType || '',
            value: plain.value !== null && plain.value !== undefined ? String(plain.value) : null,
            period: plain.period ? (typeof plain.period === 'string' ? plain.period : new Date(plain.period).toISOString()) : null,
            change: change
          };
        };
        
        setMacroData({
          interestRate: transformIndicator(indicators.interest_rate),
          inflation: transformIndicator(indicators.inflation),
          gdp: transformIndicator(indicators.gdp),
          volatilityIndex: transformIndicator(indicators.volatility_index)
        });
      } else {
        // Если данных нет, устанавливаем пустой объект
        console.warn('No macro data available. Try updating macro data.');
        setMacroData({});
        
        // Показываем информативное сообщение пользователю
        toast.current?.show({
          severity: 'info',
          summary: 'Нет данных',
          detail: 'Макроэкономические данные отсутствуют. Нажмите кнопку обновления для загрузки данных.',
          life: 5000
        });
      }
    } catch (error) {
      console.error('Error loading macro data:', error);
      // При ошибке устанавливаем пустой объект
      setMacroData({});
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
        variant="glass"
        className="macro-data-preview"
        header={
          <div className="flex align-items-center justify-content-between w-full">
            <span>Макроэкономические данные</span>
            <Button
              variant="ghost"
              size="sm"
              icon={updating ? <i className="pi pi-spin pi-spinner"></i> : <i className="pi pi-refresh"></i>}
              onClick={handleUpdate}
              loading={updating}
              title="Обновить макро-данные"
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
                <Skeleton variant="text" size="sm" style={{ width: '60%', marginBottom: '0.5rem' }} />
                <Skeleton variant="rectangular" size="md" style={{ width: '40%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="macro-indicator-grid">
          {indicators.map((indicator, index) => {
            const data = indicator.data;
            const value = data?.value;
            const change = data?.change;
            const hasData = data && value !== null && value !== undefined && value !== '';
            
            return (
              <div 
                key={indicator.key} 
                className="macro-indicator-item animate-fade-in"
                style={{ 
                  animationDelay: `${index * 0.1}s`, 
                  animationFillMode: 'both'
                }}
                title={hasData ? indicator.tooltip : 'Данные отсутствуют. Возможно, требуется обновление макро-данных.'}
              >
                <div className="flex align-items-center justify-content-between">
                  <div className="flex align-items-center gap-2 flex-1">
                    <i className={`${indicator.icon} number-primary`} />
                    <div className="flex-1">
                      <div className="text-sm font-medium number-text-primary">{indicator.label}</div>
                      <small className="text-xs number-text-tertiary">
                        {hasData && data?.period ? new Date(data.period).toLocaleDateString('ru-RU') : 'Нет данных'}
                      </small>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`number-sm font-bold ${hasData ? 'number-text-primary' : 'number-text-tertiary'}`}>
                      {hasData ? formatPercent(value) : '—'}
                    </div>
                    {hasData && change !== undefined && change !== null && !isNaN(change) && (
                      <div className={`text-xs ${change >= 0 ? 'number-success' : 'number-error'}`}>
                        {getTrendIcon(change)} {formatChange(change)}
                      </div>
                    )}
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
