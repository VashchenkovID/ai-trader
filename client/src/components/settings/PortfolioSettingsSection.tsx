import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../ui/Card/Card';
import { Button } from '../ui/Button/Button';
import { Alert } from '../ui/Alert/Alert';
import { InputNumber } from '../ui/InputNumber/InputNumber';
import { InputSwitch } from 'primereact/inputswitch';
import { Divider } from '../ui/Divider/Divider';
import { Badge } from '../ui/Badge/Badge';
import { Select } from '../ui/Select/Select';
import { apiService } from '../../services/apiService';
import { Toast } from 'primereact/toast';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import './PortfolioSettingsSection.css';

interface PortfolioSettings {
  // Бюджет и капитал
  userMaxPortfolioBudget: number; // Максимальный бюджет портфеля
  virtualPortfolioInitialCapital: number; // Начальный капитал виртуального портфеля
  
  // Лимиты на инструменты
  maxStockPrice: number; // Максимальная цена акции (0 = без ограничений)
  minStockPrice: number; // Минимальная цена акции
  
  // Ребалансировка
  portfolioRebalancingEnabled: boolean;
  portfolioRebalancingThreshold: number; // Порог отклонения (%)
  portfolioRebalancingCheckInterval: string; // Cron выражение
  portfolioRebalancingMinAmount: number; // Минимальная сумма операции
  portfolioRebalancingMinBenefit: number; // Минимальная выгода
  
  // Диверсификация
  maxPositions: number; // Максимальное количество позиций
  maxPositionSizePercent: number; // Максимальный размер одной позиции (%)
  maxSectorExposure: number; // Максимальная экспозиция по сектору (%)
  
  // Обновление цен
  portfolioPricesUpdateIntervalMinutes: number; // Интервал обновления цен
}

interface PortfolioInfo {
  cash: number;
  positionsValue: number;
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  initialCapital: number;
  mode: string;
}

interface PortfolioSettingsSectionProps {
  className?: string;
}

const PortfolioSettingsSection: React.FC<PortfolioSettingsSectionProps> = ({ className = '' }) => {
  const [settings, setSettings] = useState<PortfolioSettings | null>(null);
  const [portfolioInfo, setPortfolioInfo] = useState<PortfolioInfo | null>(null);
  const [realPortfolioInfo, setRealPortfolioInfo] = useState<PortfolioInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingRealPortfolio, setSyncingRealPortfolio] = useState(false);
  const toast = useRef<Toast>(null);

  useEffect(() => {
    loadData();
    // Обновляем информацию о портфеле каждые 30 секунд
    const interval = setInterval(() => {
      loadPortfolioInfo();
      loadRealPortfolioInfo();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadSettings(), loadPortfolioInfo(), loadRealPortfolioInfo()]);
    } catch (error: any) {
      console.error('Error loading portfolio data:', error);
      showToast('error', 'Не удалось загрузить данные портфеля');
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const allSettings = await apiService.getSettings();
      const portfolioSettings = Array.isArray(allSettings) 
        ? allSettings.filter(s => s.category === 'portfolio' || s.category === 'scheduler')
        : [];

      const settingsMap: Partial<PortfolioSettings> = {};
      portfolioSettings.forEach(setting => {
        let key = setting.key;
        
        // Преобразуем ключи из snake_case в camelCase
        if (key.includes('_')) {
          const parts = key.split('_');
          key = parts[0] + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
        }
        
        // Маппинг ключей из Settings в PortfolioSettings
        const keyMapping: Record<string, keyof PortfolioSettings> = {
          'userMaxPortfolioBudget': 'userMaxPortfolioBudget',
          'maxStockPrice': 'maxStockPrice',
          'minStockPrice': 'minStockPrice',
          'portfolioRebalancingEnabled': 'portfolioRebalancingEnabled',
          'portfolioRebalancingThreshold': 'portfolioRebalancingThreshold',
          'portfolioRebalancingCheckInterval': 'portfolioRebalancingCheckInterval',
          'portfolioRebalancingMinAmount': 'portfolioRebalancingMinAmount',
          'portfolioRebalancingMinBenefit': 'portfolioRebalancingMinBenefit',
          'portfolioPricesUpdateIntervalMinutes': 'portfolioPricesUpdateIntervalMinutes',
        };
        
        const mappedKey = keyMapping[key];
        if (mappedKey) {
          settingsMap[mappedKey] = setting.value;
        }
      });

      const mergedSettings: PortfolioSettings = {
        userMaxPortfolioBudget: settingsMap.userMaxPortfolioBudget ?? 1000000,
        virtualPortfolioInitialCapital: settingsMap.virtualPortfolioInitialCapital ?? 1000000,
        maxStockPrice: settingsMap.maxStockPrice ?? 0,
        minStockPrice: settingsMap.minStockPrice ?? 0,
        portfolioRebalancingEnabled: settingsMap.portfolioRebalancingEnabled ?? true,
        portfolioRebalancingThreshold: settingsMap.portfolioRebalancingThreshold ?? 5,
        portfolioRebalancingCheckInterval: settingsMap.portfolioRebalancingCheckInterval ?? '0 2 * * *',
        portfolioRebalancingMinAmount: settingsMap.portfolioRebalancingMinAmount ?? 1000,
        portfolioRebalancingMinBenefit: settingsMap.portfolioRebalancingMinBenefit ?? 50,
        maxPositions: settingsMap.maxPositions ?? 20,
        maxPositionSizePercent: settingsMap.maxPositionSizePercent ?? 10,
        maxSectorExposure: settingsMap.maxSectorExposure ?? 30,
        portfolioPricesUpdateIntervalMinutes: settingsMap.portfolioPricesUpdateIntervalMinutes ?? 15,
      };

      setSettings(mergedSettings);
    } catch (error: any) {
      console.error('Error loading portfolio settings:', error);
      throw error;
    }
  };

  const loadPortfolioInfo = async () => {
    try {
      const portfolio: any = await apiService.getPortfolio();
      // Показываем только виртуальный портфель
      if (portfolio.mode === 'paper' || portfolio.mode === 'virtual') {
        setPortfolioInfo({
          cash: portfolio.cash || 0,
          positionsValue: portfolio.positionsValue || 0,
          totalValue: portfolio.totalValue || 0,
          totalPnL: portfolio.totalPnL || 0,
          totalPnLPercent: portfolio.totalPnLPercent || 0,
          initialCapital: portfolio.initialCapital || 1000000,
          mode: portfolio.mode || 'paper',
        });
      }
    } catch (error: any) {
      console.error('Error loading portfolio info:', error);
    }
  };

  const loadRealPortfolioInfo = async () => {
    try {
      const realPortfolio: any = await apiService.getRealPortfolio();
      if (realPortfolio) {
        setRealPortfolioInfo({
          cash: realPortfolio.cash || 0,
          positionsValue: realPortfolio.positionsValue || 0,
          totalValue: realPortfolio.totalValue || 0,
          totalPnL: realPortfolio.totalPnL || 0,
          totalPnLPercent: realPortfolio.totalPnLPercent || 0,
          initialCapital: realPortfolio.initialCapital || 0,
          mode: 'real',
        });
      }
    } catch (error: any) {
      console.error('Error loading real portfolio info:', error);
      // Не показываем ошибку, если реальный портфель просто недоступен
    }
  };

  const handleSyncRealPortfolio = async () => {
    try {
      setSyncingRealPortfolio(true);
      await apiService.syncRealPortfolio();
      showToast('success', 'Реальный портфель успешно обновлен из Tinkoff API');
      // Перезагружаем данные портфеля после синхронизации
      await loadRealPortfolioInfo();
    } catch (error: any) {
      console.error('Error syncing real portfolio:', error);
      showToast('error', error.response?.data?.message || 'Не удалось обновить реальный портфель');
    } finally {
      setSyncingRealPortfolio(false);
    }
  };

  const handleUpdate = useCallback(async (key: keyof PortfolioSettings, value: any) => {
    if (!settings) return;

    const updatedSettings = { ...settings, [key]: value };
    setSettings(updatedSettings);

    try {
      // Маппинг ключей обратно в формат Settings
      const keyMapping: Record<keyof PortfolioSettings, string> = {
        'userMaxPortfolioBudget': 'user_max_portfolio_budget',
        'virtualPortfolioInitialCapital': 'virtual_portfolio_initial_capital',
        'maxStockPrice': 'max_stock_price',
        'minStockPrice': 'min_stock_price',
        'portfolioRebalancingEnabled': 'portfolio_rebalancing_enabled',
        'portfolioRebalancingThreshold': 'portfolio_rebalancing_threshold',
        'portfolioRebalancingCheckInterval': 'portfolio_rebalancing_check_interval',
        'portfolioRebalancingMinAmount': 'portfolio_rebalancing_min_amount',
        'portfolioRebalancingMinBenefit': 'portfolio_rebalancing_min_benefit',
        'maxPositions': 'max_positions',
        'maxPositionSizePercent': 'max_position_size_percent',
        'maxSectorExposure': 'max_sector_exposure',
        'portfolioPricesUpdateIntervalMinutes': 'portfolio_prices_update_interval_minutes',
      };
      
      const apiKey = keyMapping[key] || key;
      await apiService.updateSettings({ [apiKey]: value });
      
      showToast('success', 'Настройка обновлена');
    } catch (error: any) {
      console.error('Error updating portfolio setting:', error);
      showToast('error', 'Не удалось обновить настройку');
      setSettings(settings);
    }
  }, [settings]);

  const showToast = useCallback((severity: 'success' | 'error' | 'info' | 'warn', message: string) => {
    if (toast.current) {
      toast.current.show({ severity, summary: message, life: 3000 });
    }
  }, []);

  const renderSwitch = useCallback((key: keyof PortfolioSettings, label: string, description?: string) => {
    if (!settings) return null;

    return (
      <div className="portfolio-setting-item">
        <div className="portfolio-setting-label">
          <label className="portfolio-setting-label-text">{label}</label>
          {description && (
            <span className="portfolio-setting-description">{description}</span>
          )}
        </div>
        <div className="portfolio-setting-control">
          <InputSwitch
            checked={settings[key] as boolean}
            onChange={(e) => handleUpdate(key, e.value)}
          />
        </div>
      </div>
    );
  }, [settings, handleUpdate]);

  const renderNumberInput = useCallback((
    key: keyof PortfolioSettings, 
    label: string, 
    description?: string,
    min?: number,
    max?: number,
    step?: number,
    suffix?: string
  ) => {
    if (!settings) return null;

    const value = settings[key] as number;

    return (
      <div className="portfolio-setting-item">
        <div className="portfolio-setting-label">
          <label className="portfolio-setting-label-text">{label}{suffix ? ` (${suffix})` : ''}</label>
          {description && (
            <span className="portfolio-setting-description">{description}</span>
          )}
        </div>
        <div className="portfolio-setting-control">
          <InputNumber
            value={value}
            onValueChange={(e) => {
              const newValue = e.value || 0;
              handleUpdate(key, newValue);
            }}
            min={min}
            max={max}
            step={step || 1}
            showButtons
            buttonLayout="horizontal"
            size="sm"
          />
        </div>
      </div>
    );
  }, [settings, handleUpdate]);

  const renderSelect = useCallback((
    key: keyof PortfolioSettings,
    label: string,
    description: string,
    options: Array<{ value: string; label: string }>
  ) => {
    if (!settings) return null;

    return (
      <div className="portfolio-setting-item">
        <div className="portfolio-setting-label">
          <label className="portfolio-setting-label-text">{label}</label>
          {description && (
            <span className="portfolio-setting-description">{description}</span>
          )}
        </div>
        <div className="portfolio-setting-control">
          <Select
            value={settings[key] as string}
            onChange={(e) => handleUpdate(key, e.target.value)}
            options={options}
            fullWidth
          />
        </div>
      </div>
    );
  }, [settings, handleUpdate]);

  if (loading) {
    return (
      <div className={`portfolio-settings-section ${className}`}>
        <Skeleton height={600} />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className={`portfolio-settings-section ${className}`}>
        <Alert variant="error" title="Ошибка">
          Не удалось загрузить настройки портфеля
        </Alert>
      </div>
    );
  }

  const cronOptions = [
    { value: '0 */1 * * *', label: 'Каждый час' },
    { value: '0 */2 * * *', label: 'Каждые 2 часа' },
    { value: '0 */4 * * *', label: 'Каждые 4 часа' },
    { value: '0 2 * * *', label: 'Раз в день (2:00)' },
    { value: '0 2 * * 1', label: 'Раз в неделю (понедельник 2:00)' },
  ];

  return (
    <div className={`portfolio-settings-section ${className}`}>
      <Toast ref={toast} />

      {/* Виртуальный портфель */}
      {portfolioInfo && (
        <Card
          header={
            <div className="portfolio-card-header">
              <h3 className="portfolio-card-title">💼 Виртуальный портфель</h3>
              <Badge variant="info">Виртуальный</Badge>
            </div>
          }
          className="portfolio-card"
        >
          <div className="portfolio-info-grid">
            <div className="portfolio-info-item">
              <div className="portfolio-info-label">Денежные средства</div>
              <div className="portfolio-info-value">
                {portfolioInfo.cash.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
              </div>
            </div>
            
            <div className="portfolio-info-item">
              <div className="portfolio-info-label">Стоимость позиций</div>
              <div className="portfolio-info-value">
                {portfolioInfo.positionsValue.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
              </div>
            </div>
            
            <div className="portfolio-info-item">
              <div className="portfolio-info-label">Общая стоимость</div>
              <div className="portfolio-info-value">
                {portfolioInfo.totalValue.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
              </div>
            </div>
            
            <div className="portfolio-info-item">
              <div className="portfolio-info-label">Общий P&L</div>
              <div className="portfolio-info-value">
                <Badge variant={portfolioInfo.totalPnL >= 0 ? 'success' : 'error'}>
                  {portfolioInfo.totalPnL >= 0 ? '+' : ''}{portfolioInfo.totalPnL.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                </Badge>
              </div>
            </div>
            
            <div className="portfolio-info-item">
              <div className="portfolio-info-label">P&L %</div>
              <div className="portfolio-info-value">
                <Badge variant={portfolioInfo.totalPnLPercent >= 0 ? 'success' : 'error'}>
                  {portfolioInfo.totalPnLPercent >= 0 ? '+' : ''}{portfolioInfo.totalPnLPercent.toFixed(2)}%
                </Badge>
              </div>
            </div>
            
            <div className="portfolio-info-item">
              <div className="portfolio-info-label">Начальный капитал</div>
              <div className="portfolio-info-value">
                {portfolioInfo.initialCapital.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Реальный портфель */}
      {realPortfolioInfo && (
        <Card
          header={
            <div className="portfolio-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', width: '100%', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                  <h3 className="portfolio-card-title">💼 Реальный портфель</h3>
                  <Badge variant="success">Реальный</Badge>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSyncRealPortfolio}
                  loading={syncingRealPortfolio}
                  icon={<i className="pi pi-refresh"></i>}
                >
                  Актуализировать
                </Button>
              </div>
            </div>
          }
          className="portfolio-card"
        >
          <div className="portfolio-info-grid">
            <div className="portfolio-info-item">
              <div className="portfolio-info-label">Денежные средства</div>
              <div className="portfolio-info-value">
                {realPortfolioInfo.cash.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
              </div>
            </div>
            
            <div className="portfolio-info-item">
              <div className="portfolio-info-label">Стоимость позиций</div>
              <div className="portfolio-info-value">
                {realPortfolioInfo.positionsValue.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
              </div>
            </div>
            
            <div className="portfolio-info-item">
              <div className="portfolio-info-label">Общая стоимость</div>
              <div className="portfolio-info-value">
                {realPortfolioInfo.totalValue.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
              </div>
            </div>
            
            {realPortfolioInfo.initialCapital > 0 && (
              <>
                <div className="portfolio-info-item">
                  <div className="portfolio-info-label">Общий P&L</div>
                  <div className="portfolio-info-value">
                    <Badge variant={realPortfolioInfo.totalPnL >= 0 ? 'success' : 'error'}>
                      {realPortfolioInfo.totalPnL >= 0 ? '+' : ''}{realPortfolioInfo.totalPnL.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                    </Badge>
                  </div>
                </div>
                
                <div className="portfolio-info-item">
                  <div className="portfolio-info-label">P&L %</div>
                  <div className="portfolio-info-value">
                    <Badge variant={realPortfolioInfo.totalPnLPercent >= 0 ? 'success' : 'error'}>
                      {realPortfolioInfo.totalPnLPercent >= 0 ? '+' : ''}{realPortfolioInfo.totalPnLPercent.toFixed(2)}%
                    </Badge>
                  </div>
                </div>
                
                <div className="portfolio-info-item">
                  <div className="portfolio-info-label">Начальный капитал</div>
                  <div className="portfolio-info-value">
                    {realPortfolioInfo.initialCapital.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      {/* Бюджет и капитал */}
      <Card
        header={
          <div className="portfolio-card-header">
            <h3 className="portfolio-card-title">💰 Бюджет и капитал</h3>
            <p className="portfolio-card-subtitle">Настройки бюджета портфеля</p>
          </div>
        }
        className="portfolio-card"
      >
        {renderNumberInput(
          'userMaxPortfolioBudget',
          'Максимальный бюджет портфеля',
          'Максимальный бюджет для всех операций (руб.)',
          10000,
          10000000,
          10000,
          ' руб.'
        )}
        <Divider />
        {renderNumberInput(
          'virtualPortfolioInitialCapital',
          'Начальный капитал виртуального портфеля',
          'Начальный капитал для виртуального портфеля (руб.)',
          10000,
          10000000,
          10000,
          ' руб.'
        )}
        <Divider />
        {renderNumberInput(
          'portfolioPricesUpdateIntervalMinutes',
          'Интервал обновления цен',
          'Как часто обновлять цены инструментов (минуты)',
          1,
          60,
          1,
          ' мин'
        )}
      </Card>

      {/* Лимиты на инструменты */}
      <Card
        header={
          <div className="portfolio-card-header">
            <h3 className="portfolio-card-title">📊 Лимиты на инструменты</h3>
            <p className="portfolio-card-subtitle">Ограничения на покупку инструментов</p>
          </div>
        }
        className="portfolio-card"
      >
        {renderNumberInput(
          'maxStockPrice',
          'Максимальная цена акции',
          'Максимальная цена акции для покупки (0 = без ограничений)',
          0,
          100000,
          100,
          ' руб.'
        )}
        <Divider />
        {renderNumberInput(
          'minStockPrice',
          'Минимальная цена акции',
          'Минимальная цена акции для покупки',
          0,
          10000,
          10,
          ' руб.'
        )}
      </Card>

      {/* Диверсификация */}
      <Card
        header={
          <div className="portfolio-card-header">
            <h3 className="portfolio-card-title">🌐 Диверсификация</h3>
            <p className="portfolio-card-subtitle">Настройки распределения капитала</p>
          </div>
        }
        className="portfolio-card"
      >
        {renderNumberInput(
          'maxPositions',
          'Максимальное количество позиций',
          'Максимальное количество открытых позиций одновременно',
          5,
          100,
          1
        )}
        <Divider />
        {renderNumberInput(
          'maxPositionSizePercent',
          'Максимальный размер позиции',
          'Максимальный процент капитала на одну позицию',
          1,
          50,
          1,
          '%'
        )}
        <Divider />
        {renderNumberInput(
          'maxSectorExposure',
          'Максимальная экспозиция по сектору',
          'Максимальный процент капитала в одном секторе',
          10,
          50,
          1,
          '%'
        )}
      </Card>

      {/* Ребалансировка */}
      <Card
        header={
          <div className="portfolio-card-header">
            <h3 className="portfolio-card-title">⚖️ Ребалансировка портфеля</h3>
            <p className="portfolio-card-subtitle">Автоматическая корректировка распределения</p>
          </div>
        }
        className="portfolio-card"
      >
        {renderSwitch(
          'portfolioRebalancingEnabled',
          'Включить ребалансировку',
          'Автоматически корректировать распределение капитала'
        )}
        {settings.portfolioRebalancingEnabled && (
          <>
            <Divider />
            {renderNumberInput(
              'portfolioRebalancingThreshold',
              'Порог отклонения',
              'Процент отклонения от целевого веса для запуска ребалансировки',
              1,
              50,
              1,
              '%'
            )}
            <Divider />
            {renderSelect(
              'portfolioRebalancingCheckInterval',
              'Интервал проверки',
              'Как часто проверять необходимость ребалансировки',
              cronOptions.map(opt => ({ value: opt.value, label: opt.label }))
            )}
            <Divider />
            {renderNumberInput(
              'portfolioRebalancingMinAmount',
              'Минимальная сумма операции',
              'Минимальная сумма операции ребалансировки (руб.)',
              100,
              100000,
              100,
              ' руб.'
            )}
            <Divider />
            {renderNumberInput(
              'portfolioRebalancingMinBenefit',
              'Минимальная выгода',
              'Минимальная чистая выгода от ребалансировки (руб.)',
              0,
              10000,
              10,
              ' руб.'
            )}
          </>
        )}
      </Card>
    </div>
  );
};

export default PortfolioSettingsSection;

