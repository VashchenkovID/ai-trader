import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { TabView, TabPanel } from 'primereact/tabview';
import { Toast } from 'primereact/toast';
import { useRef } from 'react';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Message } from 'primereact/message';
import { Divider } from 'primereact/divider';
import { apiService } from '../services/apiService';

interface TradingModeManagerProps {
  className?: string;
}

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

const TradingModeManager: React.FC<TradingModeManagerProps> = ({ className = '' }) => {
  const [currentMode, setCurrentMode] = useState<any>(null);
  const [tradingEngineStatus, setTradingEngineStatus] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);
  const [modeSettings, setModeSettings] = useState<any>(null);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [tradingStats, setTradingStats] = useState<any>(null);
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
        settingsResponse,
        portfolioResponse,
        statsResponse
      ] = await Promise.allSettled([
        apiService.getCurrentTradingMode(),
        apiService.getTradingEngineStatus(),
        apiService.getTradingModeValidation(),
        apiService.getTradingModeSettings(),
        apiService.getPortfolio().catch(() => null),
        apiService.getTradingStats()
      ]);

      if (modeResponse.status === 'fulfilled' && modeResponse.value) {
        const modeData = (modeResponse.value as any).data || modeResponse.value;
        // Обрабатываем разные форматы ответа
        if (modeData.mode) {
          setCurrentMode(modeData);
        } else if (typeof modeData === 'object') {
          setCurrentMode(modeData);
        } else {
          console.warn('Unexpected mode response format:', modeData);
        }
      } else if (modeResponse.status === 'rejected') {
        console.error('Failed to load trading mode:', modeResponse.reason);
      }

      if (statusResponse.status === 'fulfilled' && statusResponse.value) {
        const statusData = statusResponse.value.data || statusResponse.value;
        setTradingEngineStatus(statusData);
      } else if (statusResponse.status === 'rejected') {
        console.error('Failed to load trading engine status:', statusResponse.reason);
      }

      if (validationResponse.status === 'fulfilled' && validationResponse.value) {
        setValidation(validationResponse.value.data || validationResponse.value);
      }

      if (settingsResponse.status === 'fulfilled' && settingsResponse.value) {
        setModeSettings(settingsResponse.value.data || settingsResponse.value);
      }

      if (portfolioResponse.status === 'fulfilled' && portfolioResponse.value) {
        const portfolioData = (portfolioResponse.value as any).data || portfolioResponse.value;
        setPortfolio(portfolioData);
      }

      if (statsResponse.status === 'fulfilled' && statsResponse.value) {
        const statsData = (statsResponse.value as any).data || statsResponse.value;
        setTradingStats(statsData);
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
      
      // Проверяем возможность переключения через валидацию
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

      // Если переключение невозможно, показываем причину
      if (!canSwitchResult.canSwitch) {
        toast.current?.show({
          severity: 'error',
          summary: 'Переключение невозможно',
          detail: canSwitchResult.reason || 'Система не готова к переходу на этот режим',
          life: 7000
        });
        
        // Показываем рекомендации, если есть
        if (canSwitchResult.recommendations && canSwitchResult.recommendations.length > 0) {
          setTimeout(() => {
            // Обрабатываем рекомендации - могут быть строками или объектами
            const recommendationsText = canSwitchResult.recommendations
              .map((rec: any) => {
                if (typeof rec === 'string') {
                  return rec;
                } else if (rec && typeof rec === 'object') {
                  // Если это объект с category и actions
                  if (rec.category && rec.actions && Array.isArray(rec.actions)) {
                    return `${rec.category}: ${rec.actions.join(', ')}`;
                  } else if (rec.message) {
                    return rec.message;
                  } else {
                    return JSON.stringify(rec);
                  }
                }
                return String(rec);
              })
              .join('; ');
            
            toast.current?.show({
              severity: 'warn',
              summary: 'Рекомендации',
              detail: recommendationsText,
              life: 10000
            });
          }, 1000);
        }
        
        setLoading(false);
        return;
      }

      // Показываем предупреждения, если есть
      if (canSwitchResult.warnings && canSwitchResult.warnings.length > 0) {
        const warningsText = canSwitchResult.warnings.join('; ');
        
        confirmDialog({
          message: (
            <div>
              <p>Вы уверены, что хотите переключиться на режим <strong>{newMode.toUpperCase()}</strong>?</p>
              {warningsText && (
                <div className="mt-3">
                  <strong>Предупреждения:</strong>
                  <ul className="mt-2 pl-4">
                    {canSwitchResult.warnings.map((warning: string, idx: number) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              {newMode === 'micro' || newMode === 'real' ? (
                <p className="mt-3 text-orange-500">⚠️ Это активирует реальную торговлю с реальными деньгами!</p>
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
        // Если нет предупреждений, но это micro или real - все равно спрашиваем
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
          // Paper режим - переключаем сразу
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

        // Если режим требует активации, показываем предупреждение
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
      console.log('Attempting to activate trading engine...');
      
      const response = await apiService.activateTradingEngine();
      console.log('Activation response:', response);
      
      if (response.success || response.data?.success) {
        toast.current?.show({
          severity: 'success',
          summary: 'Успех',
          detail: 'Торговый движок активирован'
        });
        // Небольшая задержка перед обновлением данных
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

  // Состояние валидации для каждого режима
  const [modeValidations, setModeValidations] = useState<Record<string, any>>({});

  // Загрузка валидации для всех режимов
  const loadModeValidations = async () => {
    const modes = ['paper', 'micro', 'real'];
    const validations: Record<string, any> = {};
    
    for (const mode of modes) {
      try {
        const response = await apiService.canSwitchToMode(mode as 'paper' | 'micro' | 'real');
        validations[mode] = response.data || response;
      } catch (error) {
        console.error(`Error loading validation for ${mode}:`, error);
        // По умолчанию считаем доступным
        validations[mode] = { canSwitch: mode === 'paper', warnings: [] };
      }
    }
    
    setModeValidations(validations);
  };

  // Получение статуса режима
  const getModeStatus = (mode: string): TradingMode['status'] => {
    const currentModeValue = getCurrentModeValue();
    if (currentModeValue === mode) return 'active';
    
    // Проверяем валидацию для режима
    const modeValidation = modeValidations[mode];
    if (modeValidation) {
      return modeValidation.canSwitch ? 'available' : 'locked';
    }
    
    // Если валидация еще не загружена, считаем доступным для paper, иначе проверяем общую валидацию
    if (mode === 'paper') return 'available';
    if (validation && validation.canSwitch !== false) return 'available';
    
    return 'available'; // По умолчанию доступен, но при переключении будет проверка
  };

  // Получение цвета для статуса
  const getStatusColor = (status: string): 'success' | 'info' | 'danger' | 'warning' => {
    switch (status) {
      case 'active': return 'success';
      case 'available': return 'info';
      case 'locked': return 'danger';
      default: return 'info';
    }
  };

  // Форматирование валюты
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0
    }).format(amount);
  };

  // Форматирование процентов
  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  useEffect(() => {
    loadData();
    loadModeValidations();
    const interval = setInterval(() => {
      loadData();
      loadModeValidations();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Определяем текущий режим с учетом разных форматов ответа
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
  const currentModeName = currentModeValue;

  return (
    <div className={`trading-mode-manager ${className}`}>
      <Toast ref={toast} />
      <ConfirmDialog />
      
      {/* Заголовок и статус */}
      <Card className="mb-4">
        <div className="flex justify-content-between align-items-center mb-3">
          <h2 className="m-0">🎯 Управление режимами торговли</h2>
          <Button
            icon="pi pi-refresh"
            label="Обновить"
            loading={refreshing}
            onClick={loadData}
            size="small"
          />
        </div>
        
        {/* Текущий режим и статус движка */}
        <div className="grid">
          <div className="col-12 md:col-6">
            <div className="text-center p-4 border-round surface-100">
              <div className="text-2xl font-bold text-primary mb-2">
                Текущий режим: {currentModeName.toUpperCase()}
              </div>
              <div className="text-600 mb-3">
                {currentModeData?.description}
              </div>
              <Badge 
                value={currentModeData?.riskLevel || 'Неизвестно'}
                severity={currentModeData?.riskLevel === 'Низкий' ? 'success' : 
                         currentModeData?.riskLevel === 'Средний' ? 'warning' : 'danger'}
              />
            </div>
          </div>
          <div className="col-12 md:col-6">
            <div className="text-center p-4 border-round surface-100">
              <div className="text-2xl font-bold mb-2">
                Статус движка
              </div>
              <div className="mb-3">
                <Badge 
                  value={isEngineActive ? 'Активен' : 'Неактивен'}
                  severity={isEngineActive ? 'success' : 'warning'}
                />
              </div>
              <div className="flex gap-2 justify-content-center">
                <Button
                  icon="pi pi-play"
                  label="Активировать"
                  disabled={isEngineActive}
                  loading={activating}
                  onClick={activateEngine}
                  severity="success"
                  size="small"
                />
                <Button
                  icon="pi pi-pause"
                  label="Деактивировать"
                  disabled={!isEngineActive}
                  loading={activating}
                  onClick={deactivateEngine}
                  severity="warning"
                  size="small"
                />
              </div>
              {currentModeName !== 'paper' && !isEngineActive && (
                <Message
                  severity="warn"
                  text="Для работы в этом режиме необходимо активировать торговый движок"
                  className="mt-3"
                />
              )}
            </div>
          </div>
        </div>
      </Card>

      <TabView>
        {/* Режимы торговли */}
        <TabPanel header="🔄 Режимы торговли" leftIcon="pi pi-cog">
          <div className="grid">
            {tradingModes.map((mode) => {
              const status = getModeStatus(mode.mode);
              const isCurrentMode = currentMode?.mode === mode.mode;
              const canSwitch = status !== 'locked';
              
              return (
                <div key={mode.mode} className="col-12 md:col-4">
                  <Card 
                    className={`h-full ${isCurrentMode ? 'border-primary' : ''}`}
                    title={
                      <div className="flex align-items-center gap-2">
                        <span>{mode.icon}</span>
                        <span>{mode.name}</span>
                      </div>
                    }
                  >
                    <div className="text-center">
                      <div className="text-600 mb-3">{mode.description}</div>
                      
                      <div className="mb-3">
                        <Badge 
                          value={status === 'active' ? 'Активен' : 
                                status === 'available' ? 'Доступен' : 'Заблокирован'}
                          severity={getStatusColor(status)}
                        />
                      </div>
                      
                      <div className="text-sm text-600 mb-3">
                        <div>Риск: {mode.riskLevel}</div>
                        {modeSettings && modeSettings.settings && (
                          <div className="mt-2">
                            <div>Макс. позиция: {formatPercent(modeSettings.settings.maxPositionSize || 0)}</div>
                            <div>Макс. просадка: {formatPercent(modeSettings.settings.maxDrawdown || 0)}</div>
                            <div>Мин. уверенность: {formatPercent(modeSettings.settings.minConfidence || 0)}</div>
                          </div>
                        )}
                      </div>

                      {/* Показываем результаты валидации для режима */}
                      {modeValidations[mode.mode] && (
                        <div className="mb-3">
                          {!modeValidations[mode.mode].canSwitch ? (
                            <Message
                              severity="error"
                              text={modeValidations[mode.mode].reason || 'Переключение невозможно'}
                              className="mb-2"
                            />
                          ) : modeValidations[mode.mode].warnings && modeValidations[mode.mode].warnings.length > 0 ? (
                            <Message
                              severity="warn"
                              className="mb-2"
                            >
                              <div className="text-sm">
                                <strong>Предупреждения:</strong>
                                <ul className="mt-2 pl-4 mb-0">
                                  {modeValidations[mode.mode].warnings.map((warning: string, idx: number) => (
                                    <li key={idx}>{warning}</li>
                                  ))}
                                </ul>
                              </div>
                            </Message>
                          ) : null}
                          
                          {/* Показываем рекомендации, если есть */}
                          {modeValidations[mode.mode].recommendations && 
                           modeValidations[mode.mode].recommendations.length > 0 && (
                            <div className="text-sm text-600 mt-2">
                              <strong>Рекомендации:</strong>
                              <ul className="mt-1 pl-4">
                                {modeValidations[mode.mode].recommendations.slice(0, 3).map((rec: any, idx: number) => {
                                  // Обрабатываем рекомендации - могут быть строками или объектами
                                  let recText: string;
                                  if (typeof rec === 'string') {
                                    recText = rec;
                                  } else if (rec && typeof rec === 'object') {
                                    // Если это объект с category и actions
                                    if (rec.category && rec.actions && Array.isArray(rec.actions)) {
                                      recText = `${rec.category}: ${rec.actions.join(', ')}`;
                                    } else if (rec.message) {
                                      recText = rec.message;
                                    } else {
                                      recText = JSON.stringify(rec);
                                    }
                                  } else {
                                    recText = String(rec);
                                  }
                                  return <li key={idx}>{recText}</li>;
                                })}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <Button
                        label={isCurrentMode ? 'Текущий режим' : 'Переключить'}
                        icon={isCurrentMode ? 'pi pi-check' : 'pi pi-arrow-right'}
                        disabled={!canSwitch || isCurrentMode || loading}
                        loading={loading && !isCurrentMode}
                        onClick={() => switchMode(mode.mode)}
                        className="w-full"
                        severity={isCurrentMode ? 'success' : 'info'}
                      />
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        </TabPanel>

        {/* Валидация */}
        <TabPanel header="✅ Валидация" leftIcon="pi pi-check-circle">
          <div className="grid">
            <div className="col-12">
              <Card title="Проверка готовности к торговле">
                {validation ? (
                  <div>
                    <div className="flex justify-content-between align-items-center mb-3">
                      <span className="text-lg font-medium">Статус валидации</span>
                      <Badge 
                        value={validation.isValid ? 'Готов' : 'Не готов'}
                        severity={validation.isValid ? 'success' : 'warning'}
                      />
                    </div>

                    {validation.warnings && validation.warnings.length > 0 && (
                      <div className="mb-3">
                        <Message severity="warn" className="w-full">
                          <div className="font-medium mb-2">Предупреждения:</div>
                          <ul className="m-0 pl-4">
                            {validation.warnings.map((warning: string, idx: number) => (
                              <li key={idx}>{warning}</li>
                            ))}
                          </ul>
                        </Message>
                      </div>
                    )}

                    {validation.error && (
                      <Message severity="error" text={validation.error} className="w-full mb-3" />
                    )}

                    <Divider />

                    <div className="text-sm text-600">
                      <div className="mb-2">
                        <strong>Режим:</strong> {validation.mode || currentModeName}
                      </div>
                      <div>
                        <strong>Время проверки:</strong> {validation.timestamp ? new Date(validation.timestamp).toLocaleString('ru-RU') : 'Неизвестно'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-600">Загрузка валидации...</div>
                )}
              </Card>
            </div>
          </div>
        </TabPanel>

        {/* Портфель и статистика */}
        <TabPanel header="📊 Портфель и статистика" leftIcon="pi pi-chart-line">
          <div className="grid">
            {/* Портфель */}
            <div className="col-12 md:col-6">
              <Card title="💼 Портфель">
                {portfolio ? (
                  <div>
                    <div className="text-center mb-4">
                      <div className="text-3xl font-bold text-primary">
                        {formatCurrency(portfolio.totalValue || 0)}
                      </div>
                      <div className="text-600">Общая стоимость</div>
                    </div>
                    
                    <div className="grid">
                      <div className="col-6">
                        <div className="text-center p-3 border-round surface-100">
                          <div className="text-xl font-bold text-green-500">
                            {formatCurrency(portfolio.cash || 0)}
                          </div>
                          <div className="text-sm text-600">Наличные</div>
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="text-center p-3 border-round surface-100">
                          <div className="text-xl font-bold text-blue-500">
                            {Object.keys(portfolio.positions || {}).length}
                          </div>
                          <div className="text-sm text-600">Позиции</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-600">Загрузка...</div>
                )}
              </Card>
            </div>

            {/* Статистика торговли */}
            <div className="col-12 md:col-6">
              <Card title="📈 Статистика торговли">
                {tradingStats ? (
                  <div>
                    <div className="grid">
                      <div className="col-6">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-500">
                            {tradingStats.winRate ? formatPercent(tradingStats.winRate) : '0%'}
                          </div>
                          <div className="text-sm text-600">Win Rate</div>
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-500">
                            {tradingStats.totalTrades || 0}
                          </div>
                          <div className="text-sm text-600">Сделок</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-3">
                      <div className="flex justify-content-between mb-2">
                        <span>Прибыль</span>
                        <span className={tradingStats.totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}>
                          {formatCurrency(tradingStats.totalReturn || 0)}
                        </span>
                      </div>
                      <div className="flex justify-content-between mb-2">
                        <span>Максимальная просадка</span>
                        <span className="text-red-500">
                          {formatPercent(tradingStats.maxDrawdown || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-600">Загрузка...</div>
                )}
              </Card>
            </div>
          </div>
        </TabPanel>

        {/* Настройки режима */}
        <TabPanel header="⚙️ Настройки" leftIcon="pi pi-cog">
          <div className="grid">
            <div className="col-12">
              <Card title="Настройки текущего режима">
                {modeSettings ? (
                  <div>
                    <div className="text-lg font-medium mb-3">
                      Режим: {modeSettings.mode?.toUpperCase() || 'Неизвестно'}
                    </div>
                    
                    {modeSettings.settings && (
                      <div className="grid">
                        <div className="col-12 md:col-6">
                          <div className="p-3 border-round surface-100">
                            <div className="text-sm text-600 mb-1">Макс. размер позиции</div>
                            <div className="text-xl font-bold">{formatPercent(modeSettings.settings.maxPositionSize || 0)}</div>
                          </div>
                        </div>
                        <div className="col-12 md:col-6">
                          <div className="p-3 border-round surface-100">
                            <div className="text-sm text-600 mb-1">Макс. просадка</div>
                            <div className="text-xl font-bold">{formatPercent(modeSettings.settings.maxDrawdown || 0)}</div>
                          </div>
                        </div>
                        <div className="col-12 md:col-6">
                          <div className="p-3 border-round surface-100">
                            <div className="text-sm text-600 mb-1">Мин. уверенность</div>
                            <div className="text-xl font-bold">{formatPercent(modeSettings.settings.minConfidence || 0)}</div>
                          </div>
                        </div>
                        <div className="col-12 md:col-6">
                          <div className="p-3 border-round surface-100">
                            <div className="text-sm text-600 mb-1">Комиссия</div>
                            <div className="text-xl font-bold">{formatPercent(modeSettings.settings.commission || 0)}</div>
                          </div>
                        </div>
                        <div className="col-12 md:col-6">
                          <div className="p-3 border-round surface-100">
                            <div className="text-sm text-600 mb-1">Проскальзывание</div>
                            <div className="text-xl font-bold">{formatPercent(modeSettings.settings.slippage || 0)}</div>
                          </div>
                        </div>
                        <div className="col-12 md:col-6">
                          <div className="p-3 border-round surface-100">
                            <div className="text-sm text-600 mb-1">Задержка исполнения</div>
                            <div className="text-xl font-bold">{modeSettings.settings.executionDelay || 0} мс</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-600">Загрузка настроек...</div>
                )}
              </Card>
            </div>
          </div>
        </TabPanel>
      </TabView>
    </div>
  );
};

export default TradingModeManager;

