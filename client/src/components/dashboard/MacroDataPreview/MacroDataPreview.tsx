import React, { useState, useEffect } from 'react';
import { Card } from '../../ui/Card/Card.tsx';
import { Button } from '../../ui/Button/Button.tsx';
import { Skeleton } from '../../ui/Skeleton/Skeleton.tsx';
import { Badge } from '../../ui/Badge/Badge.tsx';
import { Toast } from 'primereact/toast';
import './MacroDataPreview.css';

interface MacroDataPreviewProps {
  className?: string;
}

interface MacroIndicatorMetadata {
  change?: number | null;
  changePercent?: number | null;
  forecast?: number | null;
  previousValue?: number | null;
  currency?: string | null;
}

interface MacroIndicator {
  id: number;
  indicatorType: string;
  source: string;
  value: string;
  period: string | Date;
  periodType: 'daily' | 'monthly' | 'quarterly' | 'yearly';
  unit: 'percent' | 'index' | 'absolute';
  metadata?: MacroIndicatorMetadata;
  country: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  change?: number | null;
}

interface MacroDataResponse {
  country: string;
  indicators: {
    [key: string]: MacroIndicator;
  };
  count: number;
}

const formatValue = (value: string | number | null | undefined, unit: string = 'percent', currency?: string | null) => {
  if (value === null || value === undefined || value === '') return '—';
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '—';
  
  switch (unit) {
    case 'percent':
      return `${numValue.toFixed(2)}%`;
    case 'index':
      return numValue.toFixed(2);
    case 'absolute':
      const formatted = numValue.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
      // Добавляем валюту для absolute значений, если она указана
      return currency ? `${formatted} ${currency}` : formatted;
    default:
      return numValue.toFixed(2);
  }
};

// Функция для определения валюты по типу индикатора и источнику
const getCurrency = (indicatorType: string, source: string, metadata?: MacroIndicatorMetadata): string | null => {
  // Если валюта указана в metadata, используем её
  if (metadata?.currency) {
    return metadata.currency;
  }
  
  // Определяем валюту по типу индикатора и источнику
  if (indicatorType === 'oil_price') {
    // Нефть обычно в USD, кроме некоторых источников
    if (source.includes('moex') && source.includes('gas')) {
      return 'RUB'; // Газ на Мосбирже в рублях
    }
    return 'USD'; // По умолчанию нефть в USD
  }
  
  if (indicatorType === 'currency_rate') {
    // Для курса валюты валюта может быть в source (например, cbr_usd)
    if (source === 'cbr_usd') {
      return 'USD';
    }
    // Можно добавить другие валюты по необходимости
  }
  
  return null;
};

const formatChange = (change: number | null | undefined, unit: string = 'percent', currentValue?: string | number, previousValue?: number | null, currency?: string | null) => {
  if (change === undefined || change === null || isNaN(change)) return null;
  
  // Для абсолютных значений (цена нефти, курс валюты) показываем и абсолютное, и процентное изменение
  if (unit === 'absolute' && currentValue !== undefined && previousValue !== null && previousValue !== undefined && !isNaN(previousValue) && previousValue !== 0) {
    const current = typeof currentValue === 'string' ? parseFloat(currentValue) : currentValue;
    const previous = previousValue;
    
    if (!isNaN(current) && !isNaN(previous)) {
      const absoluteChange = current - previous;
      // Используем change с сервера для процентного изменения, но пересчитываем для точности
      const percentChange = ((current - previous) / previous) * 100;
      const currencyLabel = currency ? ` ${currency}` : '';
      
      // Показываем абсолютное изменение с валютой и процентное изменение
      return `${absoluteChange >= 0 ? '+' : ''}${absoluteChange.toFixed(2)}${currencyLabel} (${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%)`;
    }
  }
  
  // Для остальных случаев показываем только процентное изменение
  return change >= 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;
};

const getChangeColor = (change: number | null | undefined) => {
  if (change === undefined || change === null || isNaN(change)) return 'text-500';
  return change >= 0 ? 'text-green-500' : 'text-red-500';
};

const getTrendIcon = (change: number | null | undefined) => {
  if (change === undefined || change === null || isNaN(change)) return '—';
  return change >= 0 ? '↑' : '↓';
};

const getSourceLabel = (source: string, indicatorType?: string) => {
  // Для currency_rate с источником cbr_usd показываем как USD
  if (indicatorType === 'currency_rate' && source === 'cbr_usd') {
    return 'USD';
  }
  
  const sources: { [key: string]: string } = {
    'rosstat': 'Росстат',
    'cbr': 'ЦБ РФ',
    'cbr_usd': 'ЦБ РФ (USD)',
    'moex': 'Мосбиржа',
    'moex_iss_aluminum': 'Мосбиржа (Алюминий)',
    'investing': 'Investing.com',
    'trading_economics': 'Trading Economics'
  };
  return sources[source] || source;
};

const getPeriodTypeLabel = (periodType: string) => {
  const types: { [key: string]: string } = {
    'daily': 'День',
    'monthly': 'Месяц',
    'quarterly': 'Квартал',
    'yearly': 'Год'
  };
  return types[periodType] || periodType;
};

const formatPeriod = (period: string | Date | null | undefined) => {
  if (!period) return '—';
  try {
    const date = typeof period === 'string' ? new Date(period) : period;
    return date.toLocaleDateString('ru-RU', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch {
    return '—';
  }
};

export const MacroDataPreview: React.FC<MacroDataPreviewProps> = ({ className = '' }) => {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [macroData, setMacroData] = useState<MacroDataResponse | null>(null);
  const toast = React.useRef<Toast>(null);

  const loadMacroData = async () => {
    try {
      setLoading(true);
      // Загружаем последние макро-данные через apiService
      const { apiService } = await import('../../../services/apiService.ts');
      const result = await apiService.getMacroDataLatest('RUS');
      
      if (result.success && result.data) {
        setMacroData(result.data);
      } else {
        // Если данных нет, устанавливаем null
        console.warn('No macro data available. Try updating macro data.');
        setMacroData(null);
        
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
      // При ошибке устанавливаем null
      setMacroData(null);
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
      const { apiService } = await import('../../../services/apiService.ts');
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

  // Определяем конфигурацию индикаторов
  const getIndicatorConfig = (indicatorType: string) => {
    const configs: { [key: string]: { label: string; icon: string; tooltip: string } } = {
      'interest_rate': {
        label: 'Ставка ЦБ РФ',
        icon: 'pi pi-percentage',
        tooltip: 'Ключевая ставка Центрального банка РФ'
      },
      'inflation': {
        label: 'Инфляция',
        icon: 'pi pi-chart-line',
        tooltip: 'Годовая инфляция'
      },
      'gdp': {
        label: 'ВВП',
        icon: 'pi pi-building',
        tooltip: 'Рост ВВП'
      },
      'volatility_index': {
        label: 'RVI',
        icon: 'pi pi-chart-bar',
        tooltip: 'Индекс волатильности RVI'
      },
      'unemployment': {
        label: 'Безработица',
        icon: 'pi pi-users',
        tooltip: 'Уровень безработицы'
      },
      'industrial_production': {
        label: 'Промпроизводство',
        icon: 'pi pi-cog',
        tooltip: 'Индекс промышленного производства'
      },
      'currency_rate': {
        label: 'Курс валюты',
        icon: 'pi pi-dollar',
        tooltip: 'Курс валюты'
      },
      'oil_price': {
        label: 'Цена нефти',
        icon: 'pi pi-chart-line',
        tooltip: 'Цена на нефть'
      }
    };
    return configs[indicatorType] || { label: indicatorType, icon: 'pi pi-info-circle', tooltip: '' };
  };

  // Преобразуем объект индикаторов в массив для отображения
  const indicators = macroData?.indicators 
    ? Object.entries(macroData.indicators).map(([key, indicator]) => {
        const config = getIndicatorConfig(indicator.indicatorType);
        return {
          key,
          ...config,
          data: indicator
        };
      })
    : [];

  return (
    <>
      <Toast ref={toast} />
      <Card 
        variant="glass"
        className={`macro-data-preview h-full ${className}`}
        header={
          <div className="card-header">
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
      >
      {loading ? (
        <div className="skeleton-grid">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="skeleton-col">
              <div className="skeleton-wrapper">
                <Skeleton variant="text" size="sm" className="skeleton-label" />
                <Skeleton variant="rectangular" size="md" className="skeleton-value" />
              </div>
            </div>
          ))}
        </div>
      ) : indicators.length > 0 ? (
        <div className="macro-indicator-grid">
          {indicators.map((indicator, index) => {
            const data = indicator.data;
            const value = data?.value;
            const change = data?.change ?? data?.metadata?.change;
            const hasData = data && value !== null && value !== undefined && value !== '';
            const metadata = data?.metadata;
            const forecast = metadata?.forecast;
            const previousValue = metadata?.previousValue;
            const currency = getCurrency(data?.indicatorType || '', data?.source || '', metadata);
            
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
                <div className="indicator-content">
                  {/* Заголовок с иконкой и метаданными */}
                  <div className="indicator-header">
                    <div className="indicator-left">
                      <i className={`${indicator.icon} indicator-icon`} />
                      <div className="indicator-info">
                        <div className="indicator-title-row">
                          <span className="indicator-title">{indicator.label}</span>
                        </div>
                        {data?.source && (
                          <Badge variant="info" size="sm">
                            {getSourceLabel(data.source, data.indicatorType)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="indicator-right">
                      <div className={`indicator-value ${hasData ? 'number-text-primary' : 'number-text-tertiary'}`}>
                        {hasData ? formatValue(value, data.unit, currency) : '—'}
                      </div>
                      {hasData && change !== undefined && change !== null && !isNaN(change) && (
                        <div className={`indicator-change ${getChangeColor(change)}`}>
                          {getTrendIcon(change)} {formatChange(change, data.unit, value, previousValue, currency)}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Дополнительная информация: прогноз и предыдущее значение */}
                  {(forecast !== undefined || previousValue !== undefined) && (
                    <div className="indicator-footer">
                      {previousValue !== undefined && previousValue !== null && (
                        <div className="indicator-footer-item">
                          <small className="indicator-footer-label">Предыдущее:</small>
                          <small className="indicator-footer-value">
                            {formatValue(previousValue, data.unit, currency)}
                          </small>
                        </div>
                      )}
                      {forecast !== undefined && forecast !== null && (
                        <div className="indicator-footer-item">
                          <small className="indicator-footer-label">Прогноз:</small>
                          <small className="indicator-footer-forecast">
                            {formatValue(forecast, data.unit, currency)}
                          </small>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-container">
          <p className="empty-message">Нет данных. Нажмите кнопку обновления для загрузки макро-данных.</p>
        </div>
      )}
      </Card>
    </>
  );
};

export default MacroDataPreview;
