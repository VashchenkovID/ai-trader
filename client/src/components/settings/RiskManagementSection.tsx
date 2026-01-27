import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../ui/Card/Card';
import { Button } from '../ui/Button/Button';
import { Alert } from '../ui/Alert/Alert';
// import { Input } from '../ui/Input/Input'; // Reserved for future use
import { InputNumber } from '../ui/InputNumber/InputNumber';
import { InputSwitch } from 'primereact/inputswitch';
import { Divider } from '../ui/Divider/Divider';
import { Badge } from '../ui/Badge/Badge';
import { ProgressBar } from '../ui/ProgressBar/ProgressBar';
import { apiService } from '../../services/apiService';
import { Toast } from 'primereact/toast';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import './RiskManagementSection.css';

interface RiskManagementSettings {
  // Основные лимиты
  maxPositionSize: number; // % от капитала
  maxTotalExposure: number; // % от капитала
  maxDrawdown: number; // % максимальная просадка
  maxConsecutiveLosses: number;
  maxDailyLoss: number; // % максимальный дневной убыток
  minConfidence: number; // минимальная уверенность для сделки
  maxVolatility: number; // максимальная волатильность инструмента
  
  // Стоп-лоссы
  globalStopLossPercent: number;
  globalTakeProfitPercent: number;
  trailingStopEnabled: boolean;
  trailingStopPercent: number;
  
  // Формула Келли
  kellyEnabled: boolean;
  kellyConservativeFactor: number;
  kellyMinTrades: number;
  kellyVolatilityPeriod: number;
  
  // Ребалансировка
  portfolioRebalancingEnabled: boolean;
  portfolioRebalancingThreshold: number;
  portfolioRebalancingMinAmount: number;
  portfolioRebalancingMinBenefit: number;
}

interface RiskManagementStatus {
  currentDrawdown: number;
  maxDrawdown: number;
  consecutiveLosses: number;
  dailyPnL: number;
  totalPnL: number;
  winRate: number;
  emergencyStop: boolean;
}

interface RiskManagementSectionProps {
  className?: string;
}

const RiskManagementSection: React.FC<RiskManagementSectionProps> = ({ className = '' }) => {
  const [settings, setSettings] = useState<RiskManagementSettings | null>(null);
  const [status, setStatus] = useState<RiskManagementStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useRef<Toast>(null);

  useEffect(() => {
    loadData();
    // Обновляем статус каждые 30 секунд
    const interval = setInterval(() => {
      loadStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadSettings(), loadStatus()]);
    } catch (error: any) {
      console.error('Error loading risk management data:', error);
      showToast('error', 'Не удалось загрузить данные риск-менеджмента');
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const allSettings = await apiService.getSettings();
      const riskSettings = Array.isArray(allSettings) 
        ? allSettings.filter(s => s.category === 'risk_management')
        : [];

      // Получаем лимиты из RiskManagementService
      // RiskManagementStatus не имеет поля limits, используем только settingsMap
      const limits: any = {};

      const settingsMap: Partial<RiskManagementSettings> = {};
      riskSettings.forEach(setting => {
        const key = setting.key.replace('risk_', '').replace('kelly_', '');
        settingsMap[key as keyof RiskManagementSettings] = setting.value;
      });

      const mergedSettings: RiskManagementSettings = {
        maxPositionSize: limits.maxPositionSize ?? settingsMap.maxPositionSize ?? 0.02,
        maxTotalExposure: limits.maxTotalExposure ?? settingsMap.maxTotalExposure ?? 0.20,
        maxDrawdown: limits.maxDrawdown ?? settingsMap.maxDrawdown ?? 0.15,
        maxConsecutiveLosses: limits.maxConsecutiveLosses ?? settingsMap.maxConsecutiveLosses ?? 5,
        maxDailyLoss: limits.maxDailyLoss ?? settingsMap.maxDailyLoss ?? 0.05,
        minConfidence: limits.minConfidence ?? settingsMap.minConfidence ?? 0.6,
        maxVolatility: limits.maxVolatility ?? settingsMap.maxVolatility ?? 0.30,
        globalStopLossPercent: settingsMap.globalStopLossPercent ?? 5.0,
        globalTakeProfitPercent: settingsMap.globalTakeProfitPercent ?? 10.0,
        trailingStopEnabled: settingsMap.trailingStopEnabled ?? false,
        trailingStopPercent: settingsMap.trailingStopPercent ?? 2.0,
        kellyEnabled: settingsMap.kellyEnabled ?? true,
        kellyConservativeFactor: settingsMap.kellyConservativeFactor ?? 0.25,
        kellyMinTrades: settingsMap.kellyMinTrades ?? 10,
        kellyVolatilityPeriod: settingsMap.kellyVolatilityPeriod ?? 30,
        portfolioRebalancingEnabled: settingsMap.portfolioRebalancingEnabled ?? true,
        portfolioRebalancingThreshold: settingsMap.portfolioRebalancingThreshold ?? 5,
        portfolioRebalancingMinAmount: settingsMap.portfolioRebalancingMinAmount ?? 1000,
        portfolioRebalancingMinBenefit: settingsMap.portfolioRebalancingMinBenefit ?? 50,
      };

      setSettings(mergedSettings);
    } catch (error: any) {
      console.error('Error loading risk management settings:', error);
      throw error;
    }
  };

  const loadStatus = async () => {
    try {
      const statusData = await apiService.getRiskManagementStatus();
      // getStatus() возвращает RiskManagementStatus (из apiService)
      // Локальный интерфейс RiskManagementStatus имеет дополнительные поля
      if (statusData) {
        setStatus({
          currentDrawdown: statusData.currentDrawdown || 0,
          maxDrawdown: statusData.maxDrawdown || 0,
          consecutiveLosses: statusData.consecutiveLosses || 0,
          // Эти поля могут отсутствовать в API ответе, используем значения по умолчанию
          dailyPnL: (statusData as any).dailyPnL || 0,
          totalPnL: (statusData as any).totalPnL || 0,
          winRate: (statusData as any).winRate || 0,
          emergencyStop: statusData.emergencyStop || false,
        });
      } else {
        // Fallback
        setStatus({
          currentDrawdown: 0,
          maxDrawdown: 0,
          consecutiveLosses: 0,
          dailyPnL: 0,
          totalPnL: 0,
          winRate: 0,
          emergencyStop: false,
        });
      }
    } catch (error: any) {
      console.error('Error loading risk management status:', error);
    }
  };

  const handleUpdate = useCallback(async (key: keyof RiskManagementSettings, value: any) => {
    if (!settings) return;

    const updatedSettings = { ...settings, [key]: value };
    setSettings(updatedSettings);

    try {
      setSaving(true);
      
      // Определяем, куда сохранять
      const isLimitSetting = [
        'maxPositionSize',
        'maxTotalExposure',
        'maxDrawdown',
        'maxConsecutiveLosses',
        'maxDailyLoss',
        'minConfidence',
        'maxVolatility'
      ].includes(key);

      if (isLimitSetting) {
        // Сохраняем через RiskManagementService
        await apiService.updateRiskManagementLimits({ [key]: value });
      } else {
        // Сохраняем через Settings
        await apiService.updateSettings({ [`risk_${key}`]: value });
      }
      
      showToast('success', 'Настройка обновлена');
    } catch (error: any) {
      console.error('Error updating risk management setting:', error);
      showToast('error', 'Не удалось обновить настройку');
      setSettings(settings);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const handleResetEmergency = async () => {
    try {
      setSaving(true);
      await apiService.resetEmergencyStop();
      showToast('success', 'Экстренный режим сброшен');
      await loadStatus();
    } catch (error: any) {
      console.error('Error resetting emergency mode:', error);
      showToast('error', 'Не удалось сбросить экстренный режим');
    } finally {
      setSaving(false);
    }
  };

  const showToast = useCallback((severity: 'success' | 'error' | 'info' | 'warn', message: string) => {
    if (toast.current) {
      toast.current.show({ severity, summary: message, life: 3000 });
    }
  }, []);

  const renderSwitch = useCallback((key: keyof RiskManagementSettings, label: string, description?: string) => {
    if (!settings) return null;

    return (
      <div className="risk-setting-item">
        <div className="risk-setting-label">
          <label className="risk-setting-label-text">{label}</label>
          {description && (
            <span className="risk-setting-description">{description}</span>
          )}
        </div>
        <div className="risk-setting-control">
          <InputSwitch
            checked={settings[key] as boolean}
            onChange={(e) => handleUpdate(key, e.value)}
          />
        </div>
      </div>
    );
  }, [settings, handleUpdate]);

  const renderNumberInput = useCallback((
    key: keyof RiskManagementSettings, 
    label: string, 
    description?: string,
    min?: number,
    max?: number,
    step?: number,
    suffix?: string
  ) => {
    if (!settings) return null;

    const value = settings[key] as number;
    const displayValue = suffix === '%' ? value * 100 : value;

    return (
      <div className="risk-setting-item">
        <div className="risk-setting-label">
          <label className="risk-setting-label-text">{label}</label>
          {description && (
            <span className="risk-setting-description">{description}</span>
          )}
        </div>
        <div className="risk-setting-control">
          <InputNumber
            value={displayValue}
            onValueChange={(e) => {
              const newValue = suffix === '%' ? (e.value || 0) / 100 : (e.value || 0);
              handleUpdate(key, newValue);
            }}
            min={min !== undefined ? (suffix === '%' ? min * 100 : min) : undefined}
            max={max !== undefined ? (suffix === '%' ? max * 100 : max) : undefined}
            step={step !== undefined ? (suffix === '%' ? step * 100 : step) : 1}
            showButtons
            buttonLayout="horizontal"
            size="sm"
          />
        </div>
      </div>
    );
  }, [settings, handleUpdate]);

  if (loading) {
    return (
      <div className={`risk-management-section ${className}`}>
        <Skeleton height={600} />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className={`risk-management-section ${className}`}>
        <Alert variant="error" title="Ошибка">
          Не удалось загрузить настройки риск-менеджмента
        </Alert>
      </div>
    );
  }

  const drawdownPercent = status ? (status.currentDrawdown / settings.maxDrawdown) * 100 : 0;
  const drawdownColor = drawdownPercent > 80 ? 'error' : drawdownPercent > 60 ? 'warning' : 'success';

  return (
    <div className={`risk-management-section ${className}`}>
      <Toast ref={toast} />

      {/* Статус и предупреждения */}
      {status && (
        <Card
          header={
            <div className="risk-card-header">
              <h3 className="risk-card-title">📊 Текущий статус</h3>
            </div>
          }
          className="risk-card"
        >
          {status.emergencyStop && (
            <Alert variant="error" title="Экстренный режим активен" className="risk-emergency-alert">
              Торговля приостановлена из-за превышения лимитов риска
              <Button
                variant="danger"
                size="sm"
                onClick={handleResetEmergency}
                loading={saving}
                className="risk-reset-emergency-btn"
              >
                Сбросить экстренный режим
              </Button>
            </Alert>
          )}
          
          <div className="risk-status-grid">
            <div className="risk-status-item">
              <div className="risk-status-label">Текущая просадка</div>
              <div className="risk-status-value">
                <Badge variant={drawdownColor}>
                  {(status.currentDrawdown * 100).toFixed(2)}%
                </Badge>
              </div>
              <ProgressBar
                value={drawdownPercent}
                variant={drawdownColor === 'error' ? 'error' : drawdownColor === 'warning' ? 'warning' : 'success'}
                showLabel
              />
              <div className="risk-status-hint">
                Лимит: {(settings.maxDrawdown * 100).toFixed(1)}%
              </div>
            </div>
            
            <div className="risk-status-item">
              <div className="risk-status-label">Максимальная просадка</div>
              <div className="risk-status-value">
                {(status.maxDrawdown * 100).toFixed(2)}%
              </div>
            </div>
            
            <div className="risk-status-item">
              <div className="risk-status-label">Подряд убытков</div>
              <div className="risk-status-value">
                <Badge variant={status.consecutiveLosses >= settings.maxConsecutiveLosses ? 'error' : 'warning'}>
                  {status.consecutiveLosses} / {settings.maxConsecutiveLosses}
                </Badge>
              </div>
            </div>
            
            <div className="risk-status-item">
              <div className="risk-status-label">Дневной P&L</div>
              <div className="risk-status-value">
                <Badge variant={status.dailyPnL < 0 ? 'error' : 'success'}>
                  {status.dailyPnL >= 0 ? '+' : ''}{status.dailyPnL.toFixed(2)}%
                </Badge>
              </div>
            </div>
            
            <div className="risk-status-item">
              <div className="risk-status-label">Общий P&L</div>
              <div className="risk-status-value">
                <Badge variant={status.totalPnL < 0 ? 'error' : 'success'}>
                  {status.totalPnL >= 0 ? '+' : ''}{status.totalPnL.toFixed(2)}%
                </Badge>
              </div>
            </div>
            
            <div className="risk-status-item">
              <div className="risk-status-label">Винрейт</div>
              <div className="risk-status-value">
                <Badge variant={status.winRate >= 0.6 ? 'success' : status.winRate >= 0.5 ? 'warning' : 'error'}>
                  {(status.winRate * 100).toFixed(1)}%
                </Badge>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Основные лимиты */}
      <Card
        header={
          <div className="risk-card-header">
            <h3 className="risk-card-title">🛡️ Основные лимиты риска</h3>
            <p className="risk-card-subtitle">Глобальные ограничения для управления рисками</p>
          </div>
        }
        className="risk-card"
      >
        {renderNumberInput(
          'maxPositionSize',
          'Максимальный размер позиции',
          'Максимальный процент капитала на одну позицию',
          0.01,
          0.1,
          0.01,
          '%'
        )}
        <Divider />
        {renderNumberInput(
          'maxTotalExposure',
          'Максимальная общая экспозиция',
          'Максимальный процент капитала в акциях одновременно',
          0.1,
          0.5,
          0.01,
          '%'
        )}
        <Divider />
        {renderNumberInput(
          'maxDrawdown',
          'Максимальная просадка',
          'Максимально допустимая просадка от пика капитала',
          0.05,
          0.3,
          0.01,
          '%'
        )}
        <Divider />
        {renderNumberInput(
          'maxConsecutiveLosses',
          'Максимум убытков подряд',
          'Количество убыточных сделок подряд до остановки торговли',
          3,
          10,
          1
        )}
        <Divider />
        {renderNumberInput(
          'maxDailyLoss',
          'Максимальный дневной убыток',
          'Максимально допустимый убыток за день',
          0.01,
          0.2,
          0.01,
          '%'
        )}
        <Divider />
        {renderNumberInput(
          'minConfidence',
          'Минимальная уверенность',
          'Минимальная уверенность модели для открытия сделки',
          0.5,
          0.95,
          0.05
        )}
        <Divider />
        {renderNumberInput(
          'maxVolatility',
          'Максимальная волатильность',
          'Максимально допустимая волатильность инструмента',
          0.1,
          0.5,
          0.01
        )}
      </Card>

      {/* Стоп-лоссы */}
      <Card
        header={
          <div className="risk-card-header">
            <h3 className="risk-card-title">🛑 Стоп-лоссы и тейк-профиты</h3>
            <p className="risk-card-subtitle">Настройки защиты позиций</p>
          </div>
        }
        className="risk-card"
      >
        {renderNumberInput(
          'globalStopLossPercent',
          'Глобальный стоп-лосс',
          'Процент от цены входа для стоп-лосса по умолчанию',
          1,
          20,
          0.5,
          '%'
        )}
        <Divider />
        {renderNumberInput(
          'globalTakeProfitPercent',
          'Глобальный тейк-профит',
          'Процент от цены входа для тейк-профита по умолчанию',
          5,
          50,
          1,
          '%'
        )}
        <Divider />
        {renderSwitch(
          'trailingStopEnabled',
          'Включить трейлинг стоп',
          'Автоматически перемещать стоп-лосс при движении цены в прибыль'
        )}
        {settings.trailingStopEnabled && (
          <>
            <Divider />
            {renderNumberInput(
              'trailingStopPercent',
              'Процент трейлинг стопа',
              'Процент от максимальной прибыли для трейлинг стопа',
              1,
              10,
              0.5,
              '%'
            )}
          </>
        )}
      </Card>

      {/* Формула Келли */}
      <Card
        header={
          <div className="risk-card-header">
            <h3 className="risk-card-title">📐 Формула Келли</h3>
            <p className="risk-card-subtitle">Оптимизация размера позиций на основе статистики</p>
          </div>
        }
        className="risk-card"
      >
        {renderSwitch(
          'kellyEnabled',
          'Включить формулу Келли',
          'Использовать формулу Келли для расчета оптимального размера позиций'
        )}
        {settings.kellyEnabled && (
          <>
            <Divider />
            {renderNumberInput(
              'kellyConservativeFactor',
              'Консервативный коэффициент',
              'Доля от полного Келли (0.25 = 25% от полного Келли)',
              0.1,
              1.0,
              0.05
            )}
            <Divider />
            {renderNumberInput(
              'kellyMinTrades',
              'Минимальное количество сделок',
              'Минимальное количество сделок для использования статистики',
              5,
              100,
              1
            )}
            <Divider />
            {renderNumberInput(
              'kellyVolatilityPeriod',
              'Период расчета волатильности',
              'Количество дней для расчета волатильности',
              7,
              365,
              1
            )}
          </>
        )}
      </Card>

      {/* Ребалансировка портфеля */}
      <Card
        header={
          <div className="risk-card-header">
            <h3 className="risk-card-title">⚖️ Ребалансировка портфеля</h3>
            <p className="risk-card-subtitle">Автоматическая корректировка распределения капитала</p>
          </div>
        }
        className="risk-card"
      >
        {renderSwitch(
          'portfolioRebalancingEnabled',
          'Включить ребалансировку',
          'Автоматически корректировать распределение капитала между стратегиями'
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
            {renderNumberInput(
              'portfolioRebalancingMinAmount',
              'Минимальная сумма операции',
              'Минимальная сумма операции ребалансировки (руб.)',
              100,
              100000,
              100
            )}
            <Divider />
            {renderNumberInput(
              'portfolioRebalancingMinBenefit',
              'Минимальная выгода',
              'Минимальная чистая выгода от ребалансировки (руб.)',
              0,
              10000,
              10
            )}
          </>
        )}
      </Card>
    </div>
  );
};

export default RiskManagementSection;

