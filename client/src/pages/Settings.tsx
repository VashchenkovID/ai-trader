import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Toast } from 'primereact/toast';
import { apiService, CacheStatus } from '../services/apiService';
import { useWebSocketData } from '../components/WebSocketDataProvider';
import { TabView, TabPanel } from '../components/ui/TabView/TabView';
import SettingsHeader from '../components/settings/SettingsHeader';
import SystemInfoCard from '../components/settings/SystemInfoCard';
import PerformanceMetricsCard from '../components/settings/PerformanceMetricsCard';
import CacheManagementCard from '../components/settings/CacheManagementCard';
import ServicesStatusCard from '../components/settings/ServicesStatusCard';
import PreflightCheckCard from '../components/settings/PreflightCheckCard';
import SchedulerStatusCard from '../components/settings/SchedulerStatusCard';
import TradingModeSection from '../components/settings/TradingModeSection';
import StrategiesSection from '../components/settings/StrategiesSection';
import NotificationsSection from '../components/settings/NotificationsSection';
import RiskManagementSection from '../components/settings/RiskManagementSection';
import PortfolioSettingsSection from '../components/settings/PortfolioSettingsSection';
import TrainingSettingsSection from '../components/settings/TrainingSettingsSection';
import LogsMonitoringSection from '../components/settings/LogsMonitoringSection';
import QuarterlyDataSection from '../components/settings/QuarterlyDataSection';
import SettingsTabs from '../components/settings/SettingsTabs';
import './Settings.css';

interface SettingsProps {
  className?: string;
}

interface Setting {
  key: string;
  value: any;
  type: string;
  module: string;
  description?: string;
  min?: number;
  max?: number;
  options?: string[];
}

interface ServicesStatus {
  [key: string]: {
    isInitialized: boolean;
    isActive?: boolean;
    status?: string;
  };
}

interface SchedulerStatus {
  isRunning: boolean;
  tasks: Array<{
    name: string;
    schedule: string;
    lastRun?: string;
    nextRun?: string;
  }>;
}

interface PreflightCheckResults {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
  }>;
}

interface PerformanceMetrics {
  responseTime: number;
  throughput: number;
  errorRate: number;
  cacheHitRate: number;
}

const Settings: React.FC<SettingsProps> = ({ className = '' }) => {
  const { isConnected, systemStatus } = useWebSocketData();
  const toast = useRef<Toast>(null);

  // Настройки
  const [settings, setSettings] = useState<Setting[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(true);

  // Кеш
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [cacheUpdating, setCacheUpdating] = useState(false);
  
  // Новости
  const [newsUpdating, setNewsUpdating] = useState(false);

  // Сервисы
  const [servicesStatus, setServicesStatus] = useState<ServicesStatus | null>(null);
  const [serviceInitializing, setServiceInitializing] = useState<Record<string, boolean>>({});

  // Планировщик
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);

  // Preflight
  const [preflightResults, setPreflightResults] = useState<PreflightCheckResults | null>(null);
  const [preflightRunning, setPreflightRunning] = useState(false);

  // Производительность
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);

  // Загрузка данных
  useEffect(() => {
    loadAllData();
    const interval = setInterval(() => {
      loadCacheStatus();
      loadSchedulerStatus();
      loadPerformanceMetrics();
    }, 30000); // Обновление каждые 30 секунд

    return () => clearInterval(interval);
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadSettings(),
        loadCacheStatus(),
        loadServicesStatus(),
        loadSchedulerStatus(),
        loadPerformanceMetrics()
      ]);
    } catch (error) {
      console.error('Error loading settings data:', error);
      showToast('error', 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const result = await apiService.getSettings();
      // Преобразуем результат в формат Setting[]
      const formattedSettings: Setting[] = Array.isArray(result) 
        ? result.map((s: any) => ({
            key: s.key || '',
            value: s.value !== undefined ? s.value : '',
            type: s.type || s.dataType || 'string',
            module: s.module || s.category || 'other',
            description: s.description || '',
            min: s.min || s.minValue,
            max: s.max || s.maxValue,
            options: s.options
          }))
        : [];
      setSettings(formattedSettings);
    } catch (error) {
      console.error('Error loading settings:', error);
      // Не показываем toast для ошибки загрузки настроек, так как это может быть нормально
      // если эндпоинт еще не реализован
      setSettings([]);
    }
  };

  const loadCacheStatus = async () => {
    try {
      const status = await apiService.getCacheStatus();
      setCacheStatus(status);
    } catch (error) {
      console.error('Error loading cache status:', error);
    }
  };

  const loadServicesStatus = async () => {
    try {
      // Пытаемся получить статус через API
      try {
        const systemStatusFromAPI = await apiService.getSystemStatus();
        if (systemStatusFromAPI) {
          const status: ServicesStatus = {
            IntegratedAI: {
              isInitialized: systemStatusFromAPI.ensemble?.isInitialized || systemStatusFromAPI.ensemble?.isActive || false,
              isActive: systemStatusFromAPI.ensemble?.isActive || false
            },
            Ensemble: {
              isInitialized: systemStatusFromAPI.ensemble?.isInitialized || systemStatusFromAPI.ensemble?.isActive || false,
              isActive: systemStatusFromAPI.ensemble?.isActive || false
            },
            NeuralNetwork: {
              isInitialized: systemStatusFromAPI.neuralNetwork?.isLoaded || systemStatusFromAPI.neuralNetwork?.isInitialized || false,
              isActive: !systemStatusFromAPI.neuralNetwork?.isTraining && (systemStatusFromAPI.neuralNetwork?.isLoaded || false)
            },
            TradingEngine: {
              isInitialized: systemStatusFromAPI.tradingEngine?.isInitialized || (systemStatusFromAPI as any).trading?.isInitialized || false,
              isActive: systemStatusFromAPI.tradingEngine?.isActive || (systemStatusFromAPI as any).trading?.isActive || false
            }
          };
          setServicesStatus(status);
          return;
        }
      } catch (apiError) {
        console.warn('Error loading services status from API, using WebSocket data:', apiError);
      }

      // Fallback на WebSocket данные
      if (systemStatus) {
        const status: ServicesStatus = {
          IntegratedAI: {
            isInitialized: systemStatus.ensemble?.isInitialized || false,
            isActive: systemStatus.ensemble?.isActive || false
          },
          Ensemble: {
            isInitialized: systemStatus.ensemble?.isInitialized || false,
            isActive: systemStatus.ensemble?.isActive || false
          },
          NeuralNetwork: {
            isInitialized: systemStatus.neuralNetwork?.isLoaded || systemStatus.neuralNetwork?.isInitialized || false,
            isActive: !systemStatus.neuralNetwork?.isTraining && (systemStatus.neuralNetwork?.isLoaded || false)
          },
          TradingEngine: {
            isInitialized: (systemStatus as any).trading?.isInitialized || systemStatus.tradingEngine?.isInitialized || false,
            isActive: (systemStatus as any).trading?.isActive || systemStatus.tradingEngine?.isActive || false
          }
        };
        setServicesStatus(status);
      } else {
        // Если нет данных, устанавливаем пустой статус
        setServicesStatus({});
      }
    } catch (error) {
      console.error('Error loading services status:', error);
      setServicesStatus({});
    }
  };

  const loadSchedulerStatus = async () => {
    try {
      const status = await apiService.getSchedulerStatus();
      // Нормализуем данные: преобразуем isInitialized в isRunning если нужно
      const normalizedStatus = {
        ...status,
        isRunning: status.isRunning ?? status.isInitialized ?? false
      };
      setSchedulerStatus(normalizedStatus);
    } catch (error) {
      console.error('Error loading scheduler status:', error);
      // Устанавливаем null вместо undefined, чтобы показать скелетон
      setSchedulerStatus(null);
    }
  };

  const loadPerformanceMetrics = async () => {
    try {
      const metrics: any = await apiService.getPerformanceMetrics();
      if (metrics && typeof metrics === 'object') {
        setPerformanceMetrics({
          responseTime: Number(metrics.responseTime) || 0,
          throughput: Number(metrics.throughput) || 0,
          errorRate: Number(metrics.errorRate) || 0,
          cacheHitRate: Number(metrics.cacheHitRate) || 0
        });
      } else {
        setPerformanceMetrics({
          responseTime: 0,
          throughput: 0,
          errorRate: 0,
          cacheHitRate: 0
        });
      }
    } catch (error) {
      console.error('Error loading performance metrics:', error);
      // Устанавливаем null вместо undefined, чтобы показать скелетон
      setPerformanceMetrics(null);
    }
  };

  // Обработчики (мемоизация)
  const handleUpdateSetting = useCallback(async (key: string, value: any) => {
    try {
      await apiService.updateSettings({ [key]: value });
      setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
      showToast('success', 'Настройка обновлена');
    } catch (error) {
      console.error('Error updating setting:', error);
      showToast('error', 'Ошибка обновления настройки');
    }
  }, []);

  const handleRefreshCache = useCallback(async () => {
    setCacheUpdating(true);
    try {
      await apiService.refreshCache();
      showToast('success', 'Кеш обновлен');
      await loadCacheStatus();
    } catch (error) {
      console.error('Error refreshing cache:', error);
      showToast('error', 'Ошибка обновления кеша');
    } finally {
      setCacheUpdating(false);
    }
  }, []);

  const handleFullRefreshCache = useCallback(async () => {
    if (!window.confirm('Полное обновление кеша может занять много времени. Продолжить?')) {
      return;
    }
    setCacheUpdating(true);
    try {
      await apiService.fullRefreshCache();
      showToast('success', 'Полное обновление кеша запущено');
      await loadCacheStatus();
    } catch (error) {
      console.error('Error full refreshing cache:', error);
      showToast('error', 'Ошибка полного обновления кеша');
    } finally {
      setCacheUpdating(false);
    }
  }, []);

  const handleUpdateNews = useCallback(async () => {
    setNewsUpdating(true);
    try {
      await apiService.updateNews();
      showToast('success', 'Обновление новостей запущено');
    } catch (error) {
      console.error('Error updating news:', error);
      showToast('error', 'Ошибка обновления новостей');
    } finally {
      setNewsUpdating(false);
    }
  }, []);

  const handleInitializeService = useCallback(async (serviceName: string) => {
    setServiceInitializing(prev => ({ ...prev, [serviceName]: true }));
    try {
      switch (serviceName) {
        case 'IntegratedAI':
          await apiService.initializeAI();
          break;
        case 'Ensemble':
          await apiService.initializeEnsemble();
          break;
        case 'MetaLearning':
          await apiService.initializeMetaLearning();
          break;
        case 'ReinforcementLearning':
          await apiService.initializeReinforcementLearning();
          break;
        case 'Notifications':
          // TODO: Добавить метод initializeNotifications в apiService
          throw new Error('Инициализация уведомлений пока не реализована');
          break;
        default:
          throw new Error(`Unknown service: ${serviceName}`);
      }
      showToast('success', `Сервис ${serviceName} инициализирован`);
      await loadServicesStatus();
    } catch (error) {
      console.error(`Error initializing ${serviceName}:`, error);
      showToast('error', `Ошибка инициализации ${serviceName}`);
    } finally {
      setServiceInitializing(prev => ({ ...prev, [serviceName]: false }));
    }
  }, []);

  const handleRunPreflightCheck = useCallback(async () => {
    setPreflightRunning(true);
    try {
      const response = await apiService.runPreflightCheck();
      // API возвращает { success: true, results: {...} }
      const results = response.results || response;
      setPreflightResults(results);
      showToast('success', 'Проверка готовности завершена');
    } catch (error) {
      console.error('Error running preflight check:', error);
      showToast('error', 'Ошибка проверки готовности');
      // Устанавливаем пустой результат при ошибке
      setPreflightResults({
        passed: false,
        checks: [{
          name: 'error',
          passed: false,
          message: 'Ошибка выполнения проверки'
        }]
      });
    } finally {
      setPreflightRunning(false);
    }
  }, []);

  const showToast = useCallback((severity: 'success' | 'error' | 'info' | 'warn', message: string) => {
    if (toast.current) {
      toast.current.show({ severity, summary: message, life: 3000 });
    }
  }, []);

  // Группировка настроек по модулям (мемоизация)
  const settingsByModule = useMemo(() => {
    return settings.reduce((acc, setting) => {
      const module = setting.module || 'other';
      if (!acc[module]) {
        acc[module] = [];
      }
      acc[module].push(setting);
      return acc;
    }, {} as Record<string, Setting[]>);
  }, [settings]);

  // Фильтрация настроек (мемоизация)
  const filteredSettings = useMemo(() => {
    if (!searchQuery) return settings;
    const query = searchQuery.toLowerCase();
    return settings.filter(s => 
      s.key.toLowerCase().includes(query) ||
      (s.description || '').toLowerCase().includes(query)
    );
  }, [settings, searchQuery]);

  return (
    <div className={`settings ${className}`}>
      <SettingsHeader 
        isConnected={isConnected}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <TabView>
        <TabPanel header="Обзор">
          <div className="settings-overview-grid">
            <div className="settings-overview-item settings-animate-delay-1">
              <SystemInfoCard systemStatus={systemStatus} />
            </div>
            <div className="settings-overview-item settings-animate-delay-2">
              <PerformanceMetricsCard metrics={performanceMetrics} />
            </div>
            <div className="settings-overview-item settings-animate-delay-3">
              <CacheManagementCard
                cacheStatus={cacheStatus}
                cacheUpdating={cacheUpdating}
                onRefresh={handleRefreshCache}
                onFullRefresh={handleFullRefreshCache}
                newsUpdating={newsUpdating}
                onUpdateNews={handleUpdateNews}
              />
            </div>
            <div className="settings-overview-item settings-animate-delay-4">
              <ServicesStatusCard
                servicesStatus={servicesStatus}
                serviceInitializing={serviceInitializing}
                onInitialize={handleInitializeService}
              />
            </div>
            <div className="settings-overview-item settings-animate-delay-5">
              <PreflightCheckCard
                preflightResults={preflightResults}
                preflightRunning={preflightRunning}
                onRun={handleRunPreflightCheck}
              />
            </div>
            <div className="settings-overview-item settings-animate-delay-6">
              <SchedulerStatusCard schedulerStatus={schedulerStatus} />
            </div>
          </div>
        </TabPanel>

        <TabPanel header="Режимы торговли">
          <div className="settings-trading-mode-container">
            <TradingModeSection />
          </div>
        </TabPanel>

        <TabPanel header="Стратегии">
          <div className="settings-strategies-container">
            <StrategiesSection />
          </div>
        </TabPanel>

        <TabPanel header="Уведомления">
          <div className="settings-notifications-container">
            <NotificationsSection />
          </div>
        </TabPanel>

        <TabPanel header="Риск-менеджмент">
          <div className="settings-risk-management-container">
            <RiskManagementSection />
          </div>
        </TabPanel>

        <TabPanel header="Портфель">
          <div className="settings-portfolio-container">
            <PortfolioSettingsSection />
          </div>
        </TabPanel>

        <TabPanel header="Обучение нейросетей">
          <div className="settings-training-container">
            <TrainingSettingsSection />
          </div>
        </TabPanel>

        <TabPanel header="Квартальные данные">
          <div className="settings-quarterly-data-container">
            <QuarterlyDataSection />
          </div>
        </TabPanel>

        <TabPanel header="Логи и мониторинг">
          <div className="settings-logs-container">
            <LogsMonitoringSection />
          </div>
        </TabPanel>

        <SettingsTabs
          settingsByModule={settingsByModule}
          filteredSettings={filteredSettings}
          onUpdateSetting={handleUpdateSetting}
        />
      </TabView>

      <Toast ref={toast} />
    </div>
  );
};

export default Settings;

