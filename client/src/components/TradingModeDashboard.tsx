import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { ProgressBar } from 'primereact/progressbar';
import { Chart } from 'primereact/chart';
import { Skeleton } from 'primereact/skeleton';
import { Message } from 'primereact/message';
import { Timeline } from 'primereact/timeline';
import { Divider } from 'primereact/divider';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Dropdown } from 'primereact/dropdown';
import { Checkbox } from 'primereact/checkbox';
import { apiService } from '../services/apiService';

interface TradingModeDashboardProps {
  className?: string;
}

interface ModeTransition {
  id: string;
  fromMode: string;
  toMode: string;
  timestamp: string;
  status: 'completed' | 'in_progress' | 'failed';
  reason: string;
  metrics: {
    profitability: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
  };
}

interface ModeSettings {
  maxPositionSize: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxDailyLoss: number;
  maxConcurrentPositions: number;
  emergencyStopEnabled: boolean;
}

const TradingModeDashboard: React.FC<TradingModeDashboardProps> = ({ className = '' }) => {
  const [currentMode, setCurrentMode] = useState<any>(null);
  const [modeHistory, setModeHistory] = useState<ModeTransition[]>([]);
  const [modeSettings, setModeSettings] = useState<ModeSettings | null>(null);
  const [validationResults, setValidationResults] = useState<any>(null);
  const [performanceData, setPerformanceData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [settingsDialogVisible, setSettingsDialogVisible] = useState(false);
  const [migrationDialogVisible, setMigrationDialogVisible] = useState(false);
  const [selectedTargetMode, setSelectedTargetMode] = useState<string>('');

  // Определение режимов торговли с расширенной информацией
  const tradingModes = [
    {
      mode: 'paper',
      name: '📄 Бумажная торговля',
      description: 'Безрисковое обучение и тестирование стратегий',
      icon: '📝',
      color: '#10B981',
      capital: 1000000,
      riskLevel: 'Минимальный',
      features: [
        'Неограниченный капитал',
        'Отсутствие реальных рисков',
        'Полное логирование операций',
        'Тестирование всех стратегий'
      ]
    },
    {
      mode: 'micro',
      name: '🔬 Микро-капитал',
      description: 'Реальная торговля с ограниченным капиталом',
      icon: '🧪',
      color: '#F59E0B',
      capital: 10000,
      riskLevel: 'Низкий',
      features: [
        'Реальные деньги',
        'Ограниченный риск',
        'Проверка стратегий',
        'Постепенное масштабирование'
      ]
    },
    {
      mode: 'real',
      name: '💰 Полная торговля',
      description: 'Торговля с полным капиталом',
      icon: '🚀',
      color: '#EF4444',
      capital: 100000,
      riskLevel: 'Высокий',
      features: [
        'Полный капитал',
        'Максимальная прибыль',
        'Профессиональные стратегии',
        'Расширенный риск-менеджмент'
      ]
    }
  ];

  // Загрузка данных
  const loadData = async () => {
    try {
      setLoading(true);
      
      const [
        modeResponse,
        historyResponse,
        settingsResponse,
        validationResponse,
        performanceResponse
      ] = await Promise.all([
        apiService.getCurrentTradingMode().catch(() => ({ mode: 'paper' })),
        apiService.getTradingModeHistory().catch(() => []),
        apiService.getTradingModeSettings().catch(() => null),
        apiService.getTradingModeValidation().catch(() => null),
        apiService.getTradingModePerformance().catch(() => null)
      ]);

      setCurrentMode(modeResponse);
      setModeHistory(historyResponse);
      setModeSettings(settingsResponse);
      setValidationResults(validationResponse);
      setPerformanceData(performanceResponse);
    } catch (error) {
      console.error('Error loading trading mode dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // Обновляем каждую минуту
    return () => clearInterval(interval);
  }, []);

  // Переключение режима с подтверждением
  const handleModeSwitch = (targetMode: string) => {
    const targetModeInfo = tradingModes.find(m => m.mode === targetMode);
    
    confirmDialog({
      message: `Вы уверены, что хотите переключиться на "${targetModeInfo?.name}"? Это действие может повлиять на ваши текущие позиции.`,
      header: 'Подтверждение смены режима',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          setLoading(true);
          await apiService.switchTradingMode(targetMode);
          await loadData();
        } catch (error) {
          console.error('Error switching mode:', error);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  // Запуск миграции портфеля
  const handlePortfolioMigration = () => {
    setMigrationDialogVisible(true);
  };

  // Сохранение настроек режима
  const handleSaveSettings = async () => {
    try {
      await apiService.updateTradingModeSettings(modeSettings);
      setSettingsDialogVisible(false);
      await loadData();
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  // Получение статуса режима
  const getModeStatus = (mode: string) => {
    if (currentMode?.mode === mode) return 'active';
    
    // Проверяем валидацию для перехода
    if (validationResults) {
      if (mode === 'micro' && validationResults.canSwitchToMicro) return 'available';
      if (mode === 'real' && validationResults.canSwitchToReal) return 'available';
    }
    
    return 'locked';
  };

  // Генерация данных для графика производительности
  const generatePerformanceChart = () => {
    if (!performanceData) return null;

    return {
      labels: performanceData.labels || ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн'],
      datasets: [
        {
          label: 'Прибыль (%)',
          data: performanceData.profitData || [0, 2.5, 5.1, 3.8, 7.2, 9.1],
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          tension: 0.4
        },
        {
          label: 'Просадка (%)',
          data: performanceData.drawdownData || [0, -1.2, -0.8, -2.1, -1.5, -0.9],
          borderColor: '#EF4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.4
        }
      ]
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Производительность по режимам'
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            return value + '%';
          }
        }
      }
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

  return (
    <div className={`trading-mode-dashboard ${className}`}>
      <ConfirmDialog />
      
      {/* Заголовок и текущий режим */}
      <div className="grid mb-4">
        <div className="col-12 xl:col-8">
          <Card>
            <div className="flex align-items-center justify-content-between mb-3">
              <h2 className="m-0 text-2xl font-bold">🎯 Дашборд режимов торговли</h2>
              <Button
                icon="pi pi-refresh"
                label="Обновить"
                loading={loading}
                onClick={loadData}
                size="small"
                className="p-button-outlined"
              />
            </div>
            
            {currentMode && (
              <div className="text-center p-4 border-round surface-100">
                <div className="text-3xl mb-2">
                  {tradingModes.find(m => m.mode === currentMode.mode)?.icon}
                </div>
                <div className="text-xl font-bold text-primary mb-2">
                  {tradingModes.find(m => m.mode === currentMode.mode)?.name}
                </div>
                <div className="text-600">
                  Активен с {new Date(currentMode.activatedAt || Date.now()).toLocaleDateString('ru-RU')}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="col-12 xl:col-4">
          <Card title="⚙️ Быстрые действия" className="h-full">
            <div className="flex flex-column gap-2">
              <Button
                icon="pi pi-cog"
                label="Настройки режима"
                className="p-button-outlined w-full"
                onClick={() => setSettingsDialogVisible(true)}
              />
              <Button
                icon="pi pi-arrow-right-arrow-left"
                label="Миграция портфеля"
                className="p-button-outlined w-full"
                onClick={handlePortfolioMigration}
              />
              <Button
                icon="pi pi-chart-line"
                label="Анализ производительности"
                className="p-button-outlined w-full"
                onClick={() => window.location.href = '/metrics'}
              />
            </div>
          </Card>
        </div>
      </div>

      {/* Режимы торговли */}
      <Card title="🔄 Доступные режимы торговли" className="mb-4">
        <div className="grid">
          {tradingModes.map((mode) => {
            const status = getModeStatus(mode.mode);
            const isCurrentMode = currentMode?.mode === mode.mode;
            
            return (
              <div key={mode.mode} className="col-12 md:col-4">
                <Card 
                  className={`h-full transition-all transition-duration-300 ${
                    isCurrentMode ? 'border-2 border-primary shadow-4' : 'hover:shadow-2'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-4xl mb-3">{mode.icon}</div>
                    <h3 className="text-lg font-bold mb-2" style={{ color: mode.color }}>
                      {mode.name}
                    </h3>
                    <p className="text-600 text-sm mb-3">{mode.description}</p>
                    
                    <div className="mb-3">
                      <Badge 
                        value={status === 'active' ? 'Активен' : 
                              status === 'available' ? 'Доступен' : 'Заблокирован'}
                        severity={status === 'active' ? 'success' : 
                                status === 'available' ? 'info' : 'danger'}
                      />
                    </div>
                    
                    <div className="surface-100 border-round p-3 mb-3">
                      <div className="grid text-sm">
                        <div className="col-6">
                          <div className="text-600">Капитал</div>
                          <div className="font-medium">{formatCurrency(mode.capital)}</div>
                        </div>
                        <div className="col-6">
                          <div className="text-600">Риск</div>
                          <div className="font-medium">{mode.riskLevel}</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-left mb-3">
                      <div className="text-600 text-sm mb-2">Особенности:</div>
                      <ul className="text-sm list-none p-0 m-0">
                        {mode.features.map((feature, index) => (
                          <li key={index} className="flex align-items-center mb-1">
                            <i className="pi pi-check text-green-500 mr-2"></i>
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <Button
                      label={isCurrentMode ? 'Текущий режим' : 'Переключить'}
                      icon={isCurrentMode ? 'pi pi-check' : 'pi pi-arrow-right'}
                      disabled={status === 'locked' || isCurrentMode}
                      loading={loading}
                      onClick={() => handleModeSwitch(mode.mode)}
                      className="w-full"
                      severity={isCurrentMode ? 'success' : 'info'}
                    />
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      </Card>

      {/* График производительности и валидация */}
      <div className="grid mb-4">
        <div className="col-12 xl:col-8">
          <Card title="📈 График производительности" className="h-full">
            <div style={{ height: '300px' }}>
              {loading ? (
                <Skeleton width="100%" height="300px" />
              ) : (
                <Chart 
                  type="line" 
                  data={generatePerformanceChart()} 
                  options={chartOptions} 
                />
              )}
            </div>
          </Card>
        </div>

        <div className="col-12 xl:col-4">
          <Card title="✅ Статус валидации" className="h-full">
            {loading ? (
              <div className="flex flex-column gap-3">
                <Skeleton width="100%" height="2rem" />
                <Skeleton width="100%" height="2rem" />
                <Skeleton width="100%" height="2rem" />
              </div>
            ) : validationResults ? (
              <div className="flex flex-column gap-3">
                <div className="flex justify-content-between align-items-center">
                  <span>Переход к микро-капиталу</span>
                  <Badge 
                    value={validationResults.canSwitchToMicro ? 'Готов' : 'Не готов'}
                    severity={validationResults.canSwitchToMicro ? 'success' : 'danger'}
                  />
                </div>
                <ProgressBar 
                  value={validationResults.microScore || 0} 
                  className="mb-2"
                />
                
                <div className="flex justify-content-between align-items-center">
                  <span>Переход к полной торговле</span>
                  <Badge 
                    value={validationResults.canSwitchToReal ? 'Готов' : 'Не готов'}
                    severity={validationResults.canSwitchToReal ? 'success' : 'danger'}
                  />
                </div>
                <ProgressBar 
                  value={validationResults.realScore || 0} 
                  className="mb-2"
                />
                
                <Divider />
                
                <div className="text-sm text-600">
                  <div>Общий балл: {validationResults.overallScore || 0}/100</div>
                  <div>Последняя проверка: {new Date().toLocaleString('ru-RU')}</div>
                </div>
              </div>
            ) : (
              <Message severity="info" text="Данные валидации недоступны" />
            )}
          </Card>
        </div>
      </div>

      {/* История переходов */}
      <Card title="📋 История переходов между режимами">
        {modeHistory.length > 0 ? (
          <Timeline 
            value={modeHistory} 
            align="alternate" 
            className="customized-timeline"
            marker={(item) => (
              <span 
                className={`flex w-2rem h-2rem align-items-center justify-content-center text-white border-circle z-1 shadow-1`}
                style={{ 
                  backgroundColor: item.status === 'completed' ? '#10B981' : 
                                  item.status === 'in_progress' ? '#F59E0B' : '#EF4444' 
                }}
              >
                <i className={`pi ${
                  item.status === 'completed' ? 'pi-check' :
                  item.status === 'in_progress' ? 'pi-clock' : 'pi-times'
                }`}></i>
              </span>
            )}
            content={(item) => (
              <Card className="mt-3">
                <div className="flex justify-content-between align-items-center mb-2">
                  <span className="font-medium">
                    {item.fromMode.toUpperCase()} → {item.toMode.toUpperCase()}
                  </span>
                  <small className="text-600">
                    {new Date(item.timestamp).toLocaleString('ru-RU')}
                  </small>
                </div>
                <p className="text-600 text-sm mb-2">{item.reason}</p>
                {item.metrics && (
                  <div className="grid text-sm">
                    <div className="col-3">
                      <div className="text-600">Прибыльность</div>
                      <div className="font-medium text-green-500">
                        +{(item.metrics.profitability * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="col-3">
                      <div className="text-600">Шарп</div>
                      <div className="font-medium">{item.metrics.sharpeRatio.toFixed(2)}</div>
                    </div>
                    <div className="col-3">
                      <div className="text-600">Просадка</div>
                      <div className="font-medium text-red-500">
                        -{(item.metrics.maxDrawdown * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="col-3">
                      <div className="text-600">Win Rate</div>
                      <div className="font-medium">{(item.metrics.winRate * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                )}
              </Card>
            )}
          />
        ) : (
          <Message severity="info" text="История переходов пуста" />
        )}
      </Card>

      {/* Диалог настроек режима */}
      <Dialog 
        header="⚙️ Настройки режима торговли" 
        visible={settingsDialogVisible} 
        onHide={() => setSettingsDialogVisible(false)}
        style={{ width: '50vw' }}
        modal
      >
        {modeSettings && (
          <div className="grid">
            <div className="col-12 md:col-6">
              <label htmlFor="maxPositionSize" className="block text-900 font-medium mb-2">
                Максимальный размер позиции (%)
              </label>
              <InputNumber
                id="maxPositionSize"
                value={modeSettings.maxPositionSize}
                onValueChange={(e) => setModeSettings({
                  ...modeSettings,
                  maxPositionSize: e.value || 0
                })}
                suffix="%"
                min={0}
                max={100}
                className="w-full"
              />
            </div>
            
            <div className="col-12 md:col-6">
              <label htmlFor="stopLossPercent" className="block text-900 font-medium mb-2">
                Стоп-лосс (%)
              </label>
              <InputNumber
                id="stopLossPercent"
                value={modeSettings.stopLossPercent}
                onValueChange={(e) => setModeSettings({
                  ...modeSettings,
                  stopLossPercent: e.value || 0
                })}
                suffix="%"
                min={0}
                max={50}
                className="w-full"
              />
            </div>
            
            <div className="col-12 md:col-6">
              <label htmlFor="takeProfitPercent" className="block text-900 font-medium mb-2">
                Тейк-профит (%)
              </label>
              <InputNumber
                id="takeProfitPercent"
                value={modeSettings.takeProfitPercent}
                onValueChange={(e) => setModeSettings({
                  ...modeSettings,
                  takeProfitPercent: e.value || 0
                })}
                suffix="%"
                min={0}
                max={100}
                className="w-full"
              />
            </div>
            
            <div className="col-12 md:col-6">
              <label htmlFor="maxDailyLoss" className="block text-900 font-medium mb-2">
                Максимальный дневной убыток (₽)
              </label>
              <InputNumber
                id="maxDailyLoss"
                value={modeSettings.maxDailyLoss}
                onValueChange={(e) => setModeSettings({
                  ...modeSettings,
                  maxDailyLoss: e.value || 0
                })}
                mode="currency"
                currency="RUB"
                locale="ru-RU"
                className="w-full"
              />
            </div>
            
            <div className="col-12">
              <div className="flex align-items-center">
                <Checkbox
                  inputId="emergencyStop"
                  checked={modeSettings.emergencyStopEnabled}
                  onChange={(e) => setModeSettings({
                    ...modeSettings,
                    emergencyStopEnabled: e.checked || false
                  })}
                />
                <label htmlFor="emergencyStop" className="ml-2">
                  Включить экстренную остановку
                </label>
              </div>
            </div>
            
            <div className="col-12">
              <div className="flex justify-content-end gap-2">
                <Button
                  label="Отмена"
                  icon="pi pi-times"
                  className="p-button-text"
                  onClick={() => setSettingsDialogVisible(false)}
                />
                <Button
                  label="Сохранить"
                  icon="pi pi-check"
                  onClick={handleSaveSettings}
                />
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* Диалог миграции портфеля */}
      <Dialog 
        header="🔄 Миграция портфеля" 
        visible={migrationDialogVisible} 
        onHide={() => setMigrationDialogVisible(false)}
        style={{ width: '40vw' }}
        modal
      >
        <div className="grid">
          <div className="col-12">
            <label htmlFor="targetMode" className="block text-900 font-medium mb-2">
              Целевой режим
            </label>
            <Dropdown
              id="targetMode"
              value={selectedTargetMode}
              onChange={(e) => setSelectedTargetMode(e.value)}
              options={tradingModes.filter(m => m.mode !== currentMode?.mode)}
              optionLabel="name"
              optionValue="mode"
              placeholder="Выберите режим"
              className="w-full"
            />
          </div>
          
          <div className="col-12">
            <Message 
              severity="info" 
              text="Миграция портфеля позволяет безопасно перенести позиции между режимами торговли с сохранением пропорций и минимизацией рисков."
            />
          </div>
          
          <div className="col-12">
            <div className="flex justify-content-end gap-2">
              <Button
                label="Отмена"
                icon="pi pi-times"
                className="p-button-text"
                onClick={() => setMigrationDialogVisible(false)}
              />
              <Button
                label="Начать миграцию"
                icon="pi pi-arrow-right"
                disabled={!selectedTargetMode}
                onClick={() => {
                  // Здесь будет логика миграции
                  setMigrationDialogVisible(false);
                }}
              />
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default TradingModeDashboard;
