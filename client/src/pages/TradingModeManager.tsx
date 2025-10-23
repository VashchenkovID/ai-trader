import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { ProgressBar } from 'primereact/progressbar';
import { TabView, TabPanel } from 'primereact/tabview';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Toast } from 'primereact/toast';
import { useRef } from 'react';
import { ConfirmDialog } from 'primereact/confirmdialog';
import { apiService } from '../services/apiService';

interface TradingModeManagerProps {
  className?: string;
}

interface TradingMode {
  mode: string;
  name: string;
  description: string;
  capital: number;
  riskLevel: string;
  status: 'active' | 'available' | 'locked';
  requirements: string[];
}

interface ValidationResult {
  canSwitch: boolean;
  requirements: Array<{
    name: string;
    status: 'passed' | 'failed' | 'warning';
    message: string;
    value?: any;
    threshold?: any;
  }>;
  overallScore: number;
  recommendations: string[];
}

const TradingModeManager: React.FC<TradingModeManagerProps> = ({ className = '' }) => {
  const [currentMode, setCurrentMode] = useState<any>(null);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [tradingStats, setTradingStats] = useState<any>(null);
  const [riskStatus, setRiskStatus] = useState<any>(null);
  const [microValidation, setMicroValidation] = useState<ValidationResult | null>(null);
  const [fullValidation, setFullValidation] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useRef<Toast>(null);

  // Определение режимов торговли
  const tradingModes: TradingMode[] = [
    {
      mode: 'paper',
      name: '📄 Бумажная торговля',
      description: 'Обучение и тестирование стратегий на виртуальных деньгах',
      capital: 1000000,
      riskLevel: 'Низкий',
      status: 'active',
      requirements: [
        'Инициализация системы',
        'Настройка базовых параметров'
      ]
    },
    {
      mode: 'micro',
      name: '🔬 Микро-капитал',
      description: 'Торговля с минимальным капиталом для проверки стратегий',
      capital: 10000,
      riskLevel: 'Средний',
      status: 'available',
      requirements: [
        '2-3 месяца прибыльной торговли',
        'Стабильность результатов',
        'Контроль рисков',
        'Коэффициент Шарпа > 1.0'
      ]
    },
    {
      mode: 'real',
      name: '💰 Полная торговля',
      description: 'Торговля с полным капиталом на реальном рынке',
      capital: 100000,
      riskLevel: 'Высокий',
      status: 'locked',
      requirements: [
        '6+ месяцев стабильной прибыльности',
        'Высокий коэффициент Шарпа',
        'Низкая просадка',
        'Проверенная система риск-менеджмента'
      ]
    }
  ];

  // Загрузка данных
  const loadData = async () => {
    try {
      setRefreshing(true);
      const [
        modeResponse,
        portfolioResponse,
        statsResponse,
        riskResponse,
        microValidationResponse,
        fullValidationResponse
      ] = await Promise.all([
        apiService.getCurrentTradingMode(),
        apiService.getTradingPortfolio(),
        apiService.getTradingStats(),
        apiService.getRiskManagementStatus(),
        apiService.canSwitchToMicro(),
        apiService.canSwitchToFull()
      ]);

      if (modeResponse.success) {
        setCurrentMode(modeResponse);
      }

      if (portfolioResponse.success) {
        setPortfolio(portfolioResponse.data);
      }

      if (statsResponse.success) {
        setTradingStats(statsResponse.data);
      }

      if (riskResponse.success) {
        setRiskStatus(riskResponse.status);
      }

      if (microValidationResponse.success) {
        setMicroValidation(microValidationResponse.validation);
      }

      if (fullValidationResponse.success) {
        setFullValidation(fullValidationResponse.validation);
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
      const response = await apiService.switchTradingMode(newMode);
      
      if (response.success) {
        toast.current?.show({
          severity: 'success',
          summary: 'Успех',
          detail: `Режим торговли изменен на ${newMode.toUpperCase()}`
        });
        await loadData();
      }
    } catch (error) {
      console.error('Error switching trading mode:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось переключить режим торговли'
      });
    } finally {
      setLoading(false);
    }
  };

  // Получение статуса режима
  const getModeStatus = (mode: string) => {
    if (currentMode?.mode === mode) return 'active';
    if (mode === 'micro' && microValidation?.canSwitch) return 'available';
    if (mode === 'real' && fullValidation?.canSwitch) return 'available';
    return 'locked';
  };

  // Получение цвета для статуса
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'available': return 'info';
      case 'locked': return 'danger';
      default: return 'secondary';
    }
  };

  // Получение цвета для валидации
  const getValidationColor = (status: string) => {
    switch (status) {
      case 'passed': return 'success';
      case 'warning': return 'warning';
      case 'failed': return 'danger';
      default: return 'secondary';
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
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`trading-mode-manager ${className}`}>
      <Toast ref={toast} />
      <ConfirmDialog />
      
      {/* Заголовок */}
      <Card className="mb-4">
        <div className="flex justify-content-between align-items-center mb-3">
          <h2 className="m-0">🎯 Управление состоянием обучения</h2>
          <Button
            icon="pi pi-refresh"
            label="Обновить"
            loading={refreshing}
            onClick={loadData}
            size="small"
          />
        </div>
        
        {/* Текущий режим */}
        {currentMode && (
          <div className="text-center p-4 border-round surface-100">
            <div className="text-2xl font-bold text-primary mb-2">
              Текущий режим: {currentMode.mode?.toUpperCase()}
            </div>
            <div className="text-600">
              {tradingModes.find(m => m.mode === currentMode.mode)?.description}
            </div>
          </div>
        )}
      </Card>

      <TabView>
        {/* Режимы торговли */}
        <TabPanel header="🔄 Режимы торговли" leftIcon="pi pi-cog">
          <div className="grid">
            {tradingModes.map((mode) => {
              const status = getModeStatus(mode.mode);
              const isCurrentMode = currentMode?.mode === mode.mode;
              
              return (
                <div key={mode.mode} className="col-12 md:col-4">
                  <Card 
                    className={`h-full ${isCurrentMode ? 'border-primary' : ''}`}
                    title={mode.name}
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
                        <div>Капитал: {formatCurrency(mode.capital)}</div>
                        <div>Риск: {mode.riskLevel}</div>
                      </div>
                      
                      <Button
                        label={isCurrentMode ? 'Текущий режим' : 'Переключить'}
                        icon={isCurrentMode ? 'pi pi-check' : 'pi pi-arrow-right'}
                        disabled={status === 'locked' || isCurrentMode}
                        loading={loading}
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

        {/* Валидация перехода */}
        <TabPanel header="✅ Валидация перехода" leftIcon="pi pi-check-circle">
          <div className="grid">
            {/* Микро-капитал */}
            <div className="col-12 md:col-6">
              <Card title="🔬 Переход к микро-капиталу">
                {microValidation ? (
                  <div>
                    <div className="flex justify-content-between align-items-center mb-3">
                      <span>Общий балл</span>
                      <Badge 
                        value={`${microValidation.overallScore}/100`}
                        severity={microValidation.overallScore >= 80 ? 'success' : 
                                 microValidation.overallScore >= 60 ? 'warning' : 'danger'}
                      />
                    </div>
                    
                    <ProgressBar 
                      value={microValidation.overallScore} 
                      className="mb-3"
                    />
                    
                    <div className="text-sm">
                      {microValidation.requirements.map((req, index) => (
                        <div key={index} className="flex justify-content-between align-items-center mb-2">
                          <span>{req.name}</span>
                          <Badge 
                            value={req.status}
                            severity={getValidationColor(req.status)}
                          />
                        </div>
                      ))}
                    </div>
                    
                    {microValidation.recommendations.length > 0 && (
                      <div className="mt-3">
                        <h4>Рекомендации:</h4>
                        <ul className="text-sm">
                          {microValidation.recommendations.map((rec, index) => (
                            <li key={index}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-600">Загрузка...</div>
                )}
              </Card>
            </div>

            {/* Полная торговля */}
            <div className="col-12 md:col-6">
              <Card title="💰 Переход к полной торговле">
                {fullValidation ? (
                  <div>
                    <div className="flex justify-content-between align-items-center mb-3">
                      <span>Общий балл</span>
                      <Badge 
                        value={`${fullValidation.overallScore}/100`}
                        severity={fullValidation.overallScore >= 90 ? 'success' : 
                                 fullValidation.overallScore >= 70 ? 'warning' : 'danger'}
                      />
                    </div>
                    
                    <ProgressBar 
                      value={fullValidation.overallScore} 
                      className="mb-3"
                    />
                    
                    <div className="text-sm">
                      {fullValidation.requirements.map((req, index) => (
                        <div key={index} className="flex justify-content-between align-items-center mb-2">
                          <span>{req.name}</span>
                          <Badge 
                            value={req.status}
                            severity={getValidationColor(req.status)}
                          />
                        </div>
                      ))}
                    </div>
                    
                    {fullValidation.recommendations.length > 0 && (
                      <div className="mt-3">
                        <h4>Рекомендации:</h4>
                        <ul className="text-sm">
                          {fullValidation.recommendations.map((rec, index) => (
                            <li key={index}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-600">Загрузка...</div>
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
                        <span className={tradingStats.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}>
                          {formatCurrency(tradingStats.totalProfit || 0)}
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

        {/* Управление рисками */}
        <TabPanel header="🛡️ Управление рисками" leftIcon="pi pi-shield">
          <div className="grid">
            <div className="col-12">
              <Card title="Статус риск-менеджмента">
                {riskStatus ? (
                  <div>
                    <div className="grid">
                      <div className="col-12 md:col-3">
                        <div className="text-center p-3 border-round surface-100">
                          <div className="text-xl font-bold text-primary">
                            {formatPercent(riskStatus.maxPositionSize || 0)}
                          </div>
                          <div className="text-sm text-600">Макс. позиция</div>
                        </div>
                      </div>
                      <div className="col-12 md:col-3">
                        <div className="text-center p-3 border-round surface-100">
                          <div className="text-xl font-bold text-orange-500">
                            {formatPercent(riskStatus.maxDrawdown || 0)}
                          </div>
                          <div className="text-sm text-600">Макс. просадка</div>
                        </div>
                      </div>
                      <div className="col-12 md:col-3">
                        <div className="text-center p-3 border-round surface-100">
                          <div className="text-xl font-bold text-blue-500">
                            {riskStatus.consecutiveLosses || 0}
                          </div>
                          <div className="text-sm text-600">Убытки подряд</div>
                        </div>
                      </div>
                      <div className="col-12 md:col-3">
                        <div className="text-center p-3 border-round surface-100">
                          <Badge 
                            value={riskStatus.emergencyStop ? 'Активна' : 'Отключена'}
                            severity={riskStatus.emergencyStop ? 'danger' : 'success'}
                          />
                          <div className="text-sm text-600 mt-2">Экстренная остановка</div>
                        </div>
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
      </TabView>
    </div>
  );
};

export default TradingModeManager;
