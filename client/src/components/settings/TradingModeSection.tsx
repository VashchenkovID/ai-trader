import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../ui/Card/Card';
import { Button } from '../ui/Button/Button';
import { Badge } from '../ui/Badge/Badge';
import { Alert } from '../ui/Alert/Alert';
import { Toolbar } from '../ui/Toolbar/Toolbar';
import { ProgressBar } from '../ui/ProgressBar/ProgressBar';
import { apiService } from '../../services/apiService';
import { Toast } from 'primereact/toast';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import TradingModeValidationCard from './TradingModeValidationCard';
import './TradingModeSection.css';

interface TradingMode {
  mode: string;
  name: string;
  description: string;
  icon: string;
  riskLevel: string;
  status: 'active' | 'available' | 'locked';
  canSwitch: boolean;
  requiresActivation: boolean;
  warnings?: string[];
}

interface TradingModeSectionProps {
  className?: string;
}

const TradingModeSection: React.FC<TradingModeSectionProps> = ({ className = '' }) => {
  const [currentMode, setCurrentMode] = useState<any>(null);
  const [tradingEngineStatus, setTradingEngineStatus] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);
  const [modeHistory, setModeHistory] = useState<any[]>([]);
  // Валидация для каждого режима
  const [modeValidations, setModeValidations] = useState<Record<string, any>>({});
  const [validatingModes, setValidatingModes] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useRef<Toast>(null);

  // Определение режимов торговли
  const tradingModes: TradingMode[] = [
    {
      mode: 'paper',
      name: '📄 Бумажная торговля',
      description: 'Виртуальная торговля для тестирования стратегий. Автоматически активируется при переключении.',
      icon: 'pi pi-file',
      riskLevel: 'Низкий',
      status: 'available',
      canSwitch: true,
      requiresActivation: false
    },
    {
      mode: 'micro',
      name: '🔬 Микро-капитал',
      description: 'Реальная торговля с минимальными суммами. Требует явной активации после переключения.',
      icon: 'pi pi-flask',
      riskLevel: 'Средний',
      status: 'available',
      canSwitch: true,
      requiresActivation: true
    },
    {
      mode: 'real',
      name: '💰 Полная торговля',
      description: 'Полноценная реальная торговля. Требует явной активации и проверки готовности.',
      icon: 'pi pi-wallet',
      riskLevel: 'Высокий',
      status: 'available',
      canSwitch: true,
      requiresActivation: true
    }
  ];

  // Загрузка данных
  const loadData = async () => {
    try {
      setRefreshing(true);
      const [
        modeResponse,
        statusResponse,
        validationResponse,
        historyResponse
      ] = await Promise.allSettled([
        apiService.getCurrentTradingMode(),
        apiService.getTradingEngineStatus(),
        apiService.getTradingModeValidation(),
        apiService.getTradingModeHistory().catch(() => [])
      ]);

      if (modeResponse.status === 'fulfilled' && modeResponse.value) {
        const modeData = (modeResponse.value as any).data || modeResponse.value;
        if (modeData.mode) {
          setCurrentMode(modeData);
        } else if (typeof modeData === 'object') {
          setCurrentMode(modeData);
        }
      }

      if (statusResponse.status === 'fulfilled' && statusResponse.value) {
        const statusData = statusResponse.value.data || statusResponse.value;
        setTradingEngineStatus(statusData);
      }

      if (validationResponse.status === 'fulfilled' && validationResponse.value) {
        setValidation(validationResponse.value.data || validationResponse.value);
      }

      if (historyResponse.status === 'fulfilled' && historyResponse.value) {
        const historyValue = historyResponse.value as any;
        const historyData = Array.isArray(historyValue) 
          ? historyValue 
          : (historyValue?.data || []);
        setModeHistory(Array.isArray(historyData) ? historyData : []);
      }
    } catch (error) {
      console.error('Error loading trading mode data:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить данные'
      });
    } finally {
      setRefreshing(false);
    }
  };

  // Переключение режима торговли
  const switchMode = async (newMode: string) => {
    try {
      setLoading(true);
      
      let canSwitchResult;
      try {
        const validationResponse = await apiService.canSwitchToMode(newMode as 'paper' | 'micro' | 'real');
        canSwitchResult = validationResponse.data || validationResponse;
      } catch (validationError: any) {
        console.error('Ошибка валидации:', validationError);
        toast.current?.show({
          severity: 'error',
          summary: 'Ошибка валидации',
          detail: validationError.response?.data?.message || 'Не удалось проверить возможность переключения',
          life: 5000
        });
        setLoading(false);
        return;
      }

      if (!canSwitchResult.canSwitch) {
        toast.current?.show({
          severity: 'error',
          summary: 'Переключение невозможно',
          detail: canSwitchResult.reason || 'Система не готова к переходу на этот режим',
          life: 7000
        });
        setLoading(false);
        return;
      }

      // Показываем предупреждения, если есть
      if (canSwitchResult.warnings && canSwitchResult.warnings.length > 0) {
        const warningsText = canSwitchResult.warnings.join('; ');
        
        // @ts-ignore - PrimeReact confirmDialog supports ReactNode
        confirmDialog({
          message: (
            <div>
              <p>Вы уверены, что хотите переключиться на режим <strong>{newMode.toUpperCase()}</strong>?</p>
              {warningsText && (
                <div className="trading-mode-section-warnings">
                  <strong>Предупреждения:</strong>
                  <ul>
                    {canSwitchResult.warnings.map((warning: any, idx: number) => (
                      <li key={idx}>
                        {typeof warning === 'string' 
                          ? warning 
                          : (warning?.message || warning?.text || JSON.stringify(warning))}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {newMode === 'micro' || newMode === 'real' ? (
                <p className="trading-mode-section-warning-text">⚠️ Это активирует реальную торговлю с реальными деньгами!</p>
              ) : null}
            </div>
          ),
          header: 'Подтверждение переключения режима',
          icon: 'pi pi-exclamation-triangle',
          accept: async () => {
            await performSwitch(newMode);
          },
          reject: () => {
            setLoading(false);
          }
        });
      } else {
        if (newMode === 'micro' || newMode === 'real') {
          confirmDialog({
            message: `Вы уверены, что хотите переключиться на режим ${newMode.toUpperCase()}? Это активирует реальную торговлю.`,
            header: 'Подтверждение переключения режима',
            icon: 'pi pi-exclamation-triangle',
            accept: async () => {
              await performSwitch(newMode);
            },
            reject: () => {
              setLoading(false);
            }
          });
        } else {
          await performSwitch(newMode);
        }
      }
    } catch (error) {
      console.error('Error switching trading mode:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось переключить режим торговли'
      });
      setLoading(false);
    }
  };

  const performSwitch = async (newMode: string) => {
    try {
      const response = await apiService.switchTradingMode(newMode as 'paper' | 'micro' | 'real');
      
      if (response.success) {
        const modeData = response.data;
        toast.current?.show({
          severity: 'success',
          summary: 'Успех',
          detail: `Режим торговли изменен на ${newMode.toUpperCase()}`
        });

        if (modeData.requiresActivation) {
          toast.current?.show({
            severity: 'warn',
            summary: 'Требуется активация',
            detail: 'Для работы в этом режиме необходимо активировать торговый движок',
            life: 5000
          });
        }

        await loadData();
      }
    } catch (error: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: error.response?.data?.message || 'Не удалось переключить режим торговли'
      });
    } finally {
      setLoading(false);
    }
  };

  // Активация торгового движка
  const activateEngine = async () => {
    try {
      setActivating(true);
      const response = await apiService.activateTradingEngine();
      
      if (response.success || response.data?.success) {
        toast.current?.show({
          severity: 'success',
          summary: 'Успех',
          detail: 'Торговый движок активирован'
        });
        setTimeout(() => {
          loadData();
        }, 500);
      } else {
        throw new Error(response.message || 'Неизвестная ошибка активации');
      }
    } catch (error: any) {
      console.error('Error activating trading engine:', error);
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message || 
                          'Не удалось активировать торговый движок';
      
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка активации',
        detail: errorMessage,
        life: 5000
      });
    } finally {
      setActivating(false);
    }
  };

  // Деактивация торгового движка
  const deactivateEngine = async () => {
    confirmDialog({
      message: 'Вы уверены, что хотите деактивировать торговый движок? Торговля будет остановлена.',
      header: 'Подтверждение деактивации',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          setActivating(true);
          const response = await apiService.deactivateTradingEngine();
          
          if (response.success) {
            toast.current?.show({
              severity: 'success',
              summary: 'Успех',
              detail: 'Торговый движок деактивирован'
            });
            await loadData();
          }
        } catch (error: any) {
          toast.current?.show({
            severity: 'error',
            summary: 'Ошибка',
            detail: error.response?.data?.message || 'Не удалось деактивировать торговый движок'
          });
        } finally {
          setActivating(false);
        }
      }
    });
  };

  // Проверка готовности для конкретного режима
  const checkModeReadiness = async (mode: string) => {
    if (mode === 'paper') {
      // Paper режим всегда доступен
      setModeValidations(prev => ({
        ...prev,
        paper: {
          canSwitch: true,
          warnings: [],
          checks: null
        }
      }));
      return;
    }

    try {
      setValidatingModes(prev => ({ ...prev, [mode]: true }));
      const result = await apiService.canSwitchToMode(mode as 'paper' | 'micro' | 'real');
      const validationData = result.data || result;
      
      setModeValidations(prev => ({
        ...prev,
        [mode]: validationData
      }));

      if (!validationData.canSwitch) {
        toast.current?.show({
          severity: 'warn',
          summary: 'Режим недоступен',
          detail: validationData.reason || 'Система не готова к переходу на этот режим',
          life: 5000
        });
      }
    } catch (error: any) {
      console.error(`Error checking readiness for ${mode}:`, error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка проверки',
        detail: error.response?.data?.message || 'Не удалось проверить готовность',
        life: 5000
      });
      setModeValidations(prev => ({
        ...prev,
        [mode]: {
          canSwitch: false,
          reason: 'Ошибка проверки готовности',
          error: error.message
        }
      }));
    } finally {
      setValidatingModes(prev => ({ ...prev, [mode]: false }));
    }
  };

  // Проверка готовности для всех режимов
  const checkAllModesReadiness = async () => {
    for (const mode of ['paper', 'micro', 'real']) {
      await checkModeReadiness(mode);
      // Небольшая задержка между проверками
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  };

  useEffect(() => {
    loadData();
    // Проверяем готовность для всех режимов при загрузке
    checkAllModesReadiness();
  }, []);

  const getCurrentModeValue = () => {
    if (!currentMode) return 'unknown';
    if (typeof currentMode === 'string') return currentMode;
    if (currentMode.mode) return currentMode.mode;
    if (currentMode.data?.mode) return currentMode.data.mode;
    return 'unknown';
  };

  const currentModeValue = getCurrentModeValue();
  const currentModeData = tradingModes.find(m => m.mode === currentModeValue);
  const isEngineActive = tradingEngineStatus?.isActive || tradingEngineStatus?.data?.isActive || false;

  return (
    <div className={`trading-mode-section ${className}`}>
      <Toast ref={toast} />
      <ConfirmDialog />
      
      <Card header="Режим торговли">
        <Toolbar
          start={
            <div className="trading-mode-section-status">
              <span>Текущий режим:</span>
              <Badge 
                variant={currentModeData?.riskLevel === 'Низкий' ? 'success' : 
                         currentModeData?.riskLevel === 'Средний' ? 'warning' : 'error'}
              >
                {currentModeValue.toUpperCase()}
              </Badge>
              <span>Движок:</span>
              <Badge variant={isEngineActive ? 'success' : 'warning'}>
                {isEngineActive ? 'Активен' : 'Неактивен'}
              </Badge>
            </div>
          }
          end={
            <div className="trading-mode-section-actions">
              <Button
                icon={<i className="pi pi-play"></i>}
                disabled={isEngineActive}
                loading={activating}
                onClick={activateEngine}
                variant="success"
                size="sm"
              >
                Активировать
              </Button>
              <Button
                icon={<i className="pi pi-pause"></i>}
                disabled={!isEngineActive}
                loading={activating}
                onClick={deactivateEngine}
                variant="secondary"
                size="sm"
              >
                Деактивировать
              </Button>
              <Button
                icon={<i className="pi pi-check-circle"></i>}
                loading={Object.values(validatingModes).some(v => v)}
                onClick={checkAllModesReadiness}
                variant="ghost"
                size="sm"
                title="Проверить готовность всех режимов"
              >
                Проверить готовность
              </Button>
              <Button
                icon={<i className="pi pi-refresh"></i>}
                loading={refreshing}
                onClick={loadData}
                variant="ghost"
                size="sm"
              >
                Обновить
              </Button>
            </div>
          }
        />

        <div className="trading-mode-section-modes">
          {tradingModes.map((mode) => {
            const isCurrentMode = currentModeValue === mode.mode;
            const modeValidation = modeValidations[mode.mode];
            const isValidating = validatingModes[mode.mode] || false;
            const canSwitch = modeValidation?.canSwitch !== false;
            // Обрабатываем warnings - могут быть строками или объектами
            const warnings = Array.isArray(modeValidation?.warnings) 
              ? modeValidation.warnings.map((w: any) => typeof w === 'string' ? w : (w.message || w.text || JSON.stringify(w)))
              : [];
            const checks = modeValidation?.checks;
            
            // Извлекаем текущие значения из checks для сравнения
            const getCurrentValue = (criteriaKey: string): { current?: number; threshold: number; passed?: boolean } | null => {
              if (!checks) return null;
              
              // Маппинг ключей критериев к ключам в checks.details
              // В SwitchValidator используются ключи: profitableMonths, winRate, totalTrades, consecutiveLosses, confidence, consistency, maxDrawdown, sharpeRatio, profitFactor
              const keyMapping: Record<string, string> = {
                minProfitableMonths: 'profitableMonths',
                minWinRate: 'winRate',
                maxDrawdown: 'maxDrawdown',
                minTotalTrades: 'totalTrades',
                minProfitFactor: 'profitFactor',
                maxConsecutiveLosses: 'consecutiveLosses',
                minConfidence: 'confidence',
                minSharpeRatio: 'sharpeRatio',
                minConsistency: 'consistency'
              };
              
              const detailKey = keyMapping[criteriaKey];
              if (!detailKey) return null;
              
              // Ищем в details всех проверок
              const checkKeys = ['profitability', 'consistency', 'riskMetrics'];
              for (const checkKey of checkKeys) {
                const check = checks[checkKey];
                if (check?.details && check.details[detailKey]) {
                  const detail = check.details[detailKey];
                  if (detail && detail.value !== undefined) {
                    return {
                      current: detail.value,
                      threshold: detail.threshold,
                      passed: detail.passed
                    };
                  }
                }
              }
              return null;
            };
            
            return (
              <Card key={mode.mode} className={`trading-mode-section-mode-card ${isCurrentMode ? 'trading-mode-section-mode-card-active' : ''}`}>
                <div className="trading-mode-section-mode-header">
                  <div className="trading-mode-section-mode-info">
                    <h4>{mode.name}</h4>
                    <p>{mode.description}</p>
                  </div>
                  <Badge variant={mode.riskLevel === 'Низкий' ? 'success' : mode.riskLevel === 'Средний' ? 'warning' : 'error'}>
                    {mode.riskLevel}
                  </Badge>
                </div>

                {/* Статус готовности */}
                {modeValidation && mode.mode !== 'paper' && (
                  <div className="trading-mode-section-mode-readiness">
                    <div className="trading-mode-section-mode-readiness-header">
                      <span className="trading-mode-section-mode-readiness-label">Готовность:</span>
                      <Badge 
                        variant={canSwitch ? 'success' : 'error'} 
                        size="sm"
                      >
                        {canSwitch ? '✅ Готов' : '❌ Не готов'}
                      </Badge>
                    </div>
                    {!canSwitch && modeValidation.reason && (
                      <div className="trading-mode-section-mode-readiness-reason">
                        {typeof modeValidation.reason === 'string' 
                          ? modeValidation.reason 
                          : (modeValidation.reason?.message || modeValidation.reason?.text || JSON.stringify(modeValidation.reason))}
                      </div>
                    )}
                    {warnings.length > 0 && (
                      <div className="trading-mode-section-mode-readiness-warnings">
                        <strong>Предупреждения:</strong>
                        <ul>
                          {warnings.map((warning: any, idx: number) => (
                            <li key={idx}>
                              {typeof warning === 'string' 
                                ? warning 
                                : (warning?.message || warning?.text || JSON.stringify(warning))}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {/* Критерии для перехода */}
                    {modeValidation.criteria && (
                      <div className="trading-mode-section-mode-readiness-criteria">
                        <strong>Требования для перехода:</strong>
                        <div className="trading-mode-section-mode-readiness-criteria-list">
                          {Object.entries(modeValidation.criteria).map(([key, value]: [string, any]) => {
                            const criteriaLabels: Record<string, string> = {
                              minProfitableMonths: 'Минимум прибыльных месяцев',
                              minWinRate: 'Минимальный win rate',
                              maxDrawdown: 'Максимальная просадка',
                              minTotalTrades: 'Минимум сделок',
                              minProfitFactor: 'Минимальный profit factor',
                              maxConsecutiveLosses: 'Максимум убытков подряд',
                              minConfidence: 'Минимальная уверенность',
                              minSharpeRatio: 'Минимальный коэффициент Шарпа',
                              minMonths: 'Минимум месяцев работы',
                              minReturn: 'Минимальная доходность',
                              minConsistency: 'Минимальная консистентность'
                            };
                            const label = criteriaLabels[key] || key;
                            
                            // Получаем текущее значение из checks
                            const currentData = getCurrentValue(key);
                            const currentValue = currentData?.current;
                            const threshold = currentData?.threshold ?? value;
                            const passed = currentData?.passed;
                            
                            // Определяем формат отображения
                            const isPercentage = key.includes('Rate') || key.includes('Confidence') || key.includes('Consistency') || key.includes('Drawdown') || key.includes('Return');
                            const isDecimal = key.includes('Factor') || key.includes('Ratio');
                            
                            const formatValue = (val: number | undefined, isThreshold: boolean = false): string => {
                              if (val === undefined || val === null) return '—';
                              if (isPercentage) {
                                return (val * 100).toFixed(1) + '%';
                              } else if (isDecimal) {
                                return val.toFixed(2);
                              } else {
                                return val.toString();
                              }
                            };
                            
                            const displayThreshold = formatValue(threshold, true);
                            const displayCurrent = formatValue(currentValue);
                            
                            // Определяем, выполнено ли требование
                            let isPassed: boolean | null = null;
                            if (passed !== undefined) {
                              isPassed = passed;
                            } else if (currentValue !== undefined && threshold !== undefined) {
                              // Логика сравнения в зависимости от типа критерия
                              if (key.startsWith('min')) {
                                isPassed = currentValue >= threshold;
                              } else if (key.startsWith('max')) {
                                isPassed = currentValue <= threshold;
                              }
                            }
                            
                            return (
                              <div 
                                key={key} 
                                className={`trading-mode-section-mode-readiness-criteria-item ${
                                  isPassed === true ? 'trading-mode-section-mode-readiness-criteria-item-passed' : 
                                  isPassed === false ? 'trading-mode-section-mode-readiness-criteria-item-failed' : ''
                                }`}
                              >
                                <div className="trading-mode-section-mode-readiness-criteria-header">
                                  <span className="trading-mode-section-mode-readiness-criteria-key">{label}</span>
                                  {isPassed !== null && (
                                    <Badge 
                                      variant={isPassed ? 'success' : 'error'} 
                                      size="sm"
                                    >
                                      {isPassed ? '✅' : '❌'}
                                    </Badge>
                                  )}
                                </div>
                                <div className="trading-mode-section-mode-readiness-criteria-values">
                                  <div className="trading-mode-section-mode-readiness-criteria-current">
                                    <span className="trading-mode-section-mode-readiness-criteria-label">Текущее:</span>
                                    <span className={`trading-mode-section-mode-readiness-criteria-value ${
                                      isPassed === true ? 'trading-mode-section-mode-readiness-criteria-value-passed' : 
                                      isPassed === false ? 'trading-mode-section-mode-readiness-criteria-value-failed' : ''
                                    }`}>
                                      {displayCurrent}
                                    </span>
                                  </div>
                                  <div className="trading-mode-section-mode-readiness-criteria-threshold">
                                    <span className="trading-mode-section-mode-readiness-criteria-label">Требуется:</span>
                                    <span className="trading-mode-section-mode-readiness-criteria-value">
                                      {displayThreshold}
                                    </span>
                                  </div>
                                </div>
                                {currentValue !== undefined && threshold !== undefined && (
                                  <div className="trading-mode-section-mode-readiness-criteria-progress">
                                    <ProgressBar 
                                      value={
                                        key.startsWith('max') 
                                          ? Math.min(100, (threshold / Math.max(currentValue, threshold)) * 100)
                                          : Math.min(100, (currentValue / threshold) * 100)
                                      }
                                      variant={isPassed ? 'success' : 'error'}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {/* Рекомендации */}
                    {modeValidation.recommendations && Array.isArray(modeValidation.recommendations) && modeValidation.recommendations.length > 0 && (
                      <div className="trading-mode-section-mode-readiness-recommendations">
                        <strong>Рекомендации:</strong>
                        <div className="trading-mode-section-mode-readiness-recommendations-list">
                          {modeValidation.recommendations.map((recommendation: any, idx: number) => {
                            // Если рекомендация - строка, отображаем как есть
                            if (typeof recommendation === 'string') {
                              return (
                                <div key={idx} className="trading-mode-section-mode-readiness-recommendation-item">
                                  <span>{recommendation}</span>
                                </div>
                              );
                            }
                            
                            // Если рекомендация - объект с category, priority, actions
                            const category = recommendation.category || recommendation.categoryName || 'Общие';
                            const priority = recommendation.priority || 'medium';
                            const actions = Array.isArray(recommendation.actions) 
                              ? recommendation.actions 
                              : (recommendation.action ? [recommendation.action] : []);
                            
                            // Если нет структуры, пытаемся извлечь текст
                            if (!category && !actions.length) {
                              const text = recommendation.message || recommendation.text || recommendation.recommendation || JSON.stringify(recommendation);
                              return (
                                <div key={idx} className="trading-mode-section-mode-readiness-recommendation-item">
                                  <span>{text}</span>
                                </div>
                              );
                            }
                            
                            return (
                              <div key={idx} className="trading-mode-section-mode-readiness-recommendation-card">
                                <div className="trading-mode-section-mode-readiness-recommendation-header">
                                  <span className="trading-mode-section-mode-readiness-recommendation-category">{category}</span>
                                  <Badge 
                                    variant={priority === 'high' ? 'error' : priority === 'medium' ? 'warning' : 'info'}
                                    size="sm"
                                  >
                                    {priority === 'high' ? 'Высокий' : priority === 'medium' ? 'Средний' : 'Низкий'}
                                  </Badge>
                                </div>
                                {actions.length > 0 && (
                                  <ul className="trading-mode-section-mode-readiness-recommendation-actions">
                                    {actions.map((action: any, actionIdx: number) => (
                                      <li key={actionIdx}>
                                        {typeof action === 'string' ? action : (action?.text || action?.message || String(action))}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {checks && (
                      <div className="trading-mode-section-mode-readiness-checks">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            // Показываем детальную валидацию
                            setValidation({
                              ...modeValidation,
                              mode: mode.mode,
                              checks: checks
                            });
                          }}
                          icon={<i className="pi pi-info-circle"></i>}
                        >
                          Детали проверки
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <div className="trading-mode-section-mode-actions">
                  <div className="trading-mode-section-mode-actions-row">
                    <Button
                      disabled={isCurrentMode || loading}
                      loading={loading && !isCurrentMode}
                      onClick={() => switchMode(mode.mode)}
                      variant={isCurrentMode ? 'success' : canSwitch ? 'primary' : 'secondary'}
                      fullWidth
                    >
                      {isCurrentMode ? 'Текущий режим' : 'Переключить'}
                    </Button>
                    {!isCurrentMode && mode.mode !== 'paper' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={isValidating}
                        onClick={() => checkModeReadiness(mode.mode)}
                        icon={<i className="pi pi-refresh"></i>}
                        title="Проверить готовность"
                      />
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {currentModeValue !== 'paper' && !isEngineActive && (
          <Alert variant="warning" className="trading-mode-section-alert">
            Для работы в этом режиме необходимо активировать торговый движок
          </Alert>
        )}
      </Card>

      {/* Валидация режима */}
      {validation && (
        <div className="trading-mode-section-validation">
          <TradingModeValidationCard 
            validation={validation} 
            currentMode={currentModeValue}
          />
        </div>
      )}

      {/* История переключений */}
      {modeHistory.length > 0 && (
        <Card header="📜 История переключений" className="trading-mode-section-history">
          <div className="trading-mode-section-history-list">
            {modeHistory.slice(0, 10).map((entry: any, index: number) => {
              const mode = entry.mode || entry.targetMode || 'unknown';
              const timestamp = entry.timestamp || entry.createdAt || entry.date;
              const reason = entry.reason || entry.message || '';
              
              return (
                <div key={index} className="trading-mode-section-history-item">
                  <div className="trading-mode-section-history-item-header">
                    <Badge 
                      variant={mode === 'paper' ? 'success' : mode === 'micro' ? 'warning' : 'error'}
                      size="sm"
                    >
                      {mode.toUpperCase()}
                    </Badge>
                    <span className="trading-mode-section-history-item-time">
                      {timestamp ? new Date(timestamp).toLocaleString('ru-RU') : 'Неизвестно'}
                    </span>
                  </div>
                  {reason && (
                    <div className="trading-mode-section-history-item-reason">{reason}</div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
};

export default TradingModeSection;

