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
import './LogsMonitoringSection.css';

interface LoggingSettings {
  logLevel: string;
  logToFile: boolean;
  logToConsole: boolean;
  maxLogFileSize: number;
  maxLogFiles: number;
  logRetentionDays: number;
}

interface MonitoringSettings {
  monitoringEnabled: boolean;
  metricsCollectionInterval: number;
  alertOnErrors: boolean;
  alertOnSlowRequests: boolean;
  slowRequestThreshold: number;
  alertOnHighMemory: boolean;
  highMemoryThreshold: number;
}

interface SystemStatus {
  neuralNetwork: any;
  websocket: any;
  trading: any;
  database: any;
  ensemble: any;
  timestamp: string;
}

interface PerformanceMetrics {
  responseTime: number;
  throughput: number;
  errorRate: number;
  cacheHitRate: number;
}

const LogsMonitoringSection: React.FC = () => {
  const [loggingSettings, setLoggingSettings] = useState<LoggingSettings | null>(null);
  const [monitoringSettings, setMonitoringSettings] = useState<MonitoringSettings | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [autoRefresh, setAutoRefresh] = useState(true);
  const toast = useRef<Toast>(null);

  useEffect(() => {
    loadData();
    
    // Автообновление статуса и метрик каждые 10 секунд
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadSystemStatus();
        loadPerformanceMetrics();
      }, 10000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadLoggingSettings(),
        loadMonitoringSettings(),
        loadSystemStatus(),
        loadPerformanceMetrics()
      ]);
    } catch (error: any) {
      console.error('Error loading logs and monitoring data:', error);
      showToast('error', 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  };

  const loadLoggingSettings = async () => {
    try {
      const allSettings = await apiService.getSettings();
      const loggingSettingsArray = Array.isArray(allSettings) 
        ? allSettings.filter(s => s.category === 'logging' || s.key?.startsWith('log_'))
        : [];

      const settingsMap: Partial<LoggingSettings> = {
        logLevel: 'info',
        logToFile: true,
        logToConsole: true,
        maxLogFileSize: 5242880, // 5MB
        maxLogFiles: 5,
        logRetentionDays: 30
      };

      loggingSettingsArray.forEach(setting => {
        const key = setting.key.replace(/^log_/, '').replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        let value: any = setting.value;
        
        if (setting.dataType === 'number') {
          value = typeof value === 'string' ? parseFloat(value) : value;
        } else if (setting.dataType === 'boolean') {
          value = typeof value === 'string' ? value === 'true' : value;
        }
        
        (settingsMap as any)[key] = value;
      });

      setLoggingSettings(settingsMap as LoggingSettings);
    } catch (error) {
      console.error('Error loading logging settings:', error);
      // Устанавливаем значения по умолчанию
      setLoggingSettings({
        logLevel: 'info',
        logToFile: true,
        logToConsole: true,
        maxLogFileSize: 5242880,
        maxLogFiles: 5,
        logRetentionDays: 30
      });
    }
  };

  const loadMonitoringSettings = async () => {
    try {
      const allSettings = await apiService.getSettings();
      const monitoringSettingsArray = Array.isArray(allSettings) 
        ? allSettings.filter(s => s.category === 'monitoring' || s.key?.startsWith('monitoring_'))
        : [];

      const settingsMap: Partial<MonitoringSettings> = {
        monitoringEnabled: true,
        metricsCollectionInterval: 60,
        alertOnErrors: true,
        alertOnSlowRequests: true,
        slowRequestThreshold: 1000,
        alertOnHighMemory: true,
        highMemoryThreshold: 100
      };

      monitoringSettingsArray.forEach(setting => {
        const key = setting.key.replace(/^monitoring_/, '').replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        let value: any = setting.value;
        
        if (setting.dataType === 'number') {
          value = typeof value === 'string' ? parseFloat(value) : value;
        } else if (setting.dataType === 'boolean') {
          value = typeof value === 'string' ? value === 'true' : value;
        }
        
        (settingsMap as any)[key] = value;
      });

      setMonitoringSettings(settingsMap as MonitoringSettings);
    } catch (error) {
      console.error('Error loading monitoring settings:', error);
      // Устанавливаем значения по умолчанию
      setMonitoringSettings({
        monitoringEnabled: true,
        metricsCollectionInterval: 60,
        alertOnErrors: true,
        alertOnSlowRequests: true,
        slowRequestThreshold: 1000,
        alertOnHighMemory: true,
        highMemoryThreshold: 100
      });
    }
  };

  const loadSystemStatus = async () => {
    try {
      const status = await apiService.getSystemStatus();
      setSystemStatus(status);
    } catch (error) {
      console.error('Error loading system status:', error);
    }
  };

  const loadPerformanceMetrics = async () => {
    try {
      const metrics = await apiService.getPerformanceMetrics();
      setPerformanceMetrics(metrics);
    } catch (error) {
      console.error('Error loading performance metrics:', error);
    }
  };

  const handleUpdateLogging = useCallback(async (key: string, value: any) => {
    if (!loggingSettings) return;
    
    try {
      setSaving(prev => ({ ...prev, [`log_${key}`]: true }));
      
      const snakeKey = `log_${key.replace(/([A-Z])/g, '_$1').toLowerCase()}`;
      await apiService.updateSettings({ [snakeKey]: value });
      
      setLoggingSettings(prev => prev ? { ...prev, [key]: value } : null);
      showToast('success', 'Настройка логирования обновлена');
    } catch (error: any) {
      console.error(`Error updating logging setting ${key}:`, error);
      showToast('error', `Ошибка обновления: ${error.message}`);
    } finally {
      setSaving(prev => ({ ...prev, [`log_${key}`]: false }));
    }
  }, [loggingSettings]);

  const handleUpdateMonitoring = useCallback(async (key: string, value: any) => {
    if (!monitoringSettings) return;
    
    try {
      setSaving(prev => ({ ...prev, [`monitoring_${key}`]: true }));
      
      const snakeKey = `monitoring_${key.replace(/([A-Z])/g, '_$1').toLowerCase()}`;
      await apiService.updateSettings({ [snakeKey]: value });
      
      setMonitoringSettings(prev => prev ? { ...prev, [key]: value } : null);
      showToast('success', 'Настройка мониторинга обновлена');
    } catch (error: any) {
      console.error(`Error updating monitoring setting ${key}:`, error);
      showToast('error', `Ошибка обновления: ${error.message}`);
    } finally {
      setSaving(prev => ({ ...prev, [`monitoring_${key}`]: false }));
    }
  }, [monitoringSettings]);

  const handleExportLogs = async () => {
    try {
      // TODO: Добавить метод для экспорта логов
      showToast('info', 'Экспорт логов будет реализован позже');
    } catch (error: any) {
      showToast('error', `Ошибка экспорта: ${error.message}`);
    }
  };

  const showToast = (severity: 'success' | 'error' | 'info' | 'warn', message: string) => {
    if (toast.current) {
      toast.current.show({ severity, summary: message, life: 3000 });
    }
  };

  const getStatusBadge = (status: any): { variant: string; label: string } => {
    if (!status || status.error) {
      return { variant: 'error', label: 'Ошибка' };
    }
    
    // Проверяем поле status
    const statusValue = status.status;
    
    if (statusValue === 'connected' || statusValue === 'active' || statusValue === 'ready') {
      return { variant: 'success', label: 'Работает' };
    }
    
    if (statusValue === 'training') {
      return { variant: 'info', label: 'Обучается' };
    }
    
    if (statusValue === 'inactive') {
      // Проверяем, инициализирован ли сервис
      if (status.isInitialized === false) {
        return { variant: 'error', label: 'Не инициализирован' };
      }
      return { variant: 'warning', label: 'Неактивен' };
    }
    
    // Fallback: проверяем isInitialized и isActive напрямую
    if (status.isInitialized === true) {
      if (status.isActive === true) {
        return { variant: 'success', label: 'Работает' };
      }
      return { variant: 'warning', label: 'Неактивен' };
    }
    
    return { variant: 'warning', label: 'Неизвестно' };
  };

  if (loading) {
    return (
      <div className="logs-monitoring-section">
        <Card>
          <Skeleton height="200px" />
        </Card>
      </div>
    );
  }

  return (
    <div className="logs-monitoring-section">
      <Toast ref={toast} />
      
      <div className="logs-monitoring-grid">
        {/* Настройки логирования */}
        <Card className="logs-monitoring-card">
          <div className="logs-monitoring-card-header">
            <h3>Настройки логирования</h3>
          </div>
          <Divider />
          
          <div className="logs-monitoring-form">
            <div className="logs-monitoring-field">
              <label>Уровень логирования</label>
              <Select
                value={loggingSettings?.logLevel || 'info'}
                onChange={(value) => handleUpdateLogging('logLevel', value)}
                options={[
                  { value: 'error', label: 'Error (только ошибки)' },
                  { value: 'warn', label: 'Warn (предупреждения и ошибки)' },
                  { value: 'info', label: 'Info (информация, предупреждения, ошибки)' },
                  { value: 'debug', label: 'Debug (все сообщения)' }
                ]}
                disabled={saving['log_logLevel']}
              />
              <span className="logs-monitoring-hint">
                Минимальный уровень важности сообщений для логирования
              </span>
            </div>
            
            <div className="logs-monitoring-field">
              <div className="logs-monitoring-switch">
                <label>Логирование в файл</label>
                <InputSwitch
                  checked={loggingSettings?.logToFile ?? true}
                  onChange={(e) => handleUpdateLogging('logToFile', e.value)}
                />
              </div>
              <span className="logs-monitoring-hint">
                Сохранять логи в файлы на сервере
              </span>
            </div>
            
            <div className="logs-monitoring-field">
              <div className="logs-monitoring-switch">
                <label>Логирование в консоль</label>
                <InputSwitch
                  checked={loggingSettings?.logToConsole ?? true}
                  onChange={(e) => handleUpdateLogging('logToConsole', e.value)}
                />
              </div>
              <span className="logs-monitoring-hint">
                Выводить логи в консоль сервера
              </span>
            </div>
            
            <div className="logs-monitoring-field">
              <label>Максимальный размер файла (MB)</label>
              <InputNumber
                value={loggingSettings ? loggingSettings.maxLogFileSize / 1024 / 1024 : 5}
                onChange={(value) => handleUpdateLogging('maxLogFileSize', (value || 5) * 1024 * 1024)}
                min={1}
                max={100}
                step={1}
                disabled={saving['log_maxLogFileSize']}
              />
              <span className="logs-monitoring-hint">
                Максимальный размер одного лог-файла (1 - 100 MB)
              </span>
            </div>
            
            <div className="logs-monitoring-field">
              <label>Максимальное количество файлов</label>
              <InputNumber
                value={loggingSettings?.maxLogFiles || 5}
                onChange={(value) => handleUpdateLogging('maxLogFiles', value)}
                min={1}
                max={20}
                step={1}
                disabled={saving['log_maxLogFiles']}
              />
              <span className="logs-monitoring-hint">
                Количество ротируемых лог-файлов (1 - 20)
              </span>
            </div>
            
            <div className="logs-monitoring-field">
              <label>Хранение логов (дни)</label>
              <InputNumber
                value={loggingSettings?.logRetentionDays || 30}
                onChange={(value) => handleUpdateLogging('logRetentionDays', value)}
                min={1}
                max={365}
                step={1}
                disabled={saving['log_logRetentionDays']}
              />
              <span className="logs-monitoring-hint">
                Количество дней хранения логов (1 - 365)
              </span>
            </div>
            
            <Button
              variant="secondary"
              onClick={handleExportLogs}
            >
              Экспорт логов
            </Button>
          </div>
        </Card>

        {/* Настройки мониторинга */}
        <Card className="logs-monitoring-card">
          <div className="logs-monitoring-card-header">
            <h3>Настройки мониторинга</h3>
          </div>
          <Divider />
          
          <div className="logs-monitoring-form">
            <div className="logs-monitoring-field">
              <div className="logs-monitoring-switch">
                <label>Мониторинг включен</label>
                <InputSwitch
                  checked={monitoringSettings?.monitoringEnabled ?? true}
                  onChange={(e) => handleUpdateMonitoring('monitoringEnabled', e.value)}
                />
              </div>
              <span className="logs-monitoring-hint">
                Включить сбор метрик производительности
              </span>
            </div>
            
            <div className="logs-monitoring-field">
              <label>Интервал сбора метрик (секунды)</label>
              <InputNumber
                value={monitoringSettings?.metricsCollectionInterval || 60}
                onChange={(value) => handleUpdateMonitoring('metricsCollectionInterval', value)}
                min={10}
                max={300}
                step={10}
                disabled={saving['monitoring_metricsCollectionInterval']}
              />
              <span className="logs-monitoring-hint">
                Как часто собирать метрики производительности (10 - 300 сек)
              </span>
            </div>
            
            <div className="logs-monitoring-field">
              <div className="logs-monitoring-switch">
                <label>Алерты на ошибки</label>
                <InputSwitch
                  checked={monitoringSettings?.alertOnErrors ?? true}
                  onChange={(e) => handleUpdateMonitoring('alertOnErrors', e.value)}
                />
              </div>
              <span className="logs-monitoring-hint">
                Отправлять уведомления при возникновении ошибок
              </span>
            </div>
            
            <div className="logs-monitoring-field">
              <div className="logs-monitoring-switch">
                <label>Алерты на медленные запросы</label>
                <InputSwitch
                  checked={monitoringSettings?.alertOnSlowRequests ?? true}
                  onChange={(e) => handleUpdateMonitoring('alertOnSlowRequests', e.value)}
                />
              </div>
              <span className="logs-monitoring-hint">
                Отправлять уведомления о медленных запросах
              </span>
            </div>
            
            {monitoringSettings?.alertOnSlowRequests && (
              <div className="logs-monitoring-field">
                <label>Порог медленного запроса (мс)</label>
                <InputNumber
                  value={monitoringSettings?.slowRequestThreshold || 1000}
                  onChange={(value) => handleUpdateMonitoring('slowRequestThreshold', value)}
                  min={100}
                  max={10000}
                  step={100}
                  disabled={saving['monitoring_slowRequestThreshold']}
                />
                <span className="logs-monitoring-hint">
                  Время выполнения запроса, после которого он считается медленным (100 - 10000 мс)
                </span>
              </div>
            )}
            
            <div className="logs-monitoring-field">
              <div className="logs-monitoring-switch">
                <label>Алерты на высокое потребление памяти</label>
                <InputSwitch
                  checked={monitoringSettings?.alertOnHighMemory ?? true}
                  onChange={(e) => handleUpdateMonitoring('alertOnHighMemory', e.value)}
                />
              </div>
              <span className="logs-monitoring-hint">
                Отправлять уведомления при высоком потреблении памяти
              </span>
            </div>
            
            {monitoringSettings?.alertOnHighMemory && (
              <div className="logs-monitoring-field">
                <label>Порог потребления памяти (MB)</label>
                <InputNumber
                  value={monitoringSettings?.highMemoryThreshold || 100}
                  onChange={(value) => handleUpdateMonitoring('highMemoryThreshold', value)}
                  min={10}
                  max={1000}
                  step={10}
                  disabled={saving['monitoring_highMemoryThreshold']}
                />
                <span className="logs-monitoring-hint">
                  Потребление памяти, после которого отправляется алерт (10 - 1000 MB)
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* Статус системы */}
        <Card className="logs-monitoring-card">
          <div className="logs-monitoring-card-header">
            <h3>Статус системы</h3>
            <div className="logs-monitoring-switch">
              <label style={{ fontSize: '12px' }}>Автообновление</label>
              <InputSwitch
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.value)}
              />
            </div>
          </div>
          <Divider />
          
          <div className="logs-monitoring-form">
            {systemStatus && (
              <>
                <div className="logs-monitoring-status-item">
                  <div className="logs-monitoring-status-label">
                    <span>Нейросеть</span>
                    {(() => {
                      const { variant, label } = getStatusBadge(systemStatus.neuralNetwork);
                      return <Badge variant={variant as any}>{label}</Badge>;
                    })()}
                  </div>
                </div>
                
                <div className="logs-monitoring-status-item">
                  <div className="logs-monitoring-status-label">
                    <span>WebSocket</span>
                    {(() => {
                      const { variant, label } = getStatusBadge(systemStatus.websocket);
                      return <Badge variant={variant as any}>{label}</Badge>;
                    })()}
                  </div>
                </div>
                
                <div className="logs-monitoring-status-item">
                  <div className="logs-monitoring-status-label">
                    <span>Торговый движок</span>
                    {(() => {
                      const { variant, label } = getStatusBadge(systemStatus.trading);
                      return <Badge variant={variant as any}>{label}</Badge>;
                    })()}
                  </div>
                </div>
                
                <div className="logs-monitoring-status-item">
                  <div className="logs-monitoring-status-label">
                    <span>База данных</span>
                    {(() => {
                      const { variant, label } = getStatusBadge(systemStatus.database);
                      return <Badge variant={variant as any}>{label}</Badge>;
                    })()}
                  </div>
                </div>
                
                <div className="logs-monitoring-status-item">
                  <div className="logs-monitoring-status-label">
                    <span>Ансамбль</span>
                    {(() => {
                      const { variant, label } = getStatusBadge(systemStatus.ensemble);
                      return <Badge variant={variant as any}>{label}</Badge>;
                    })()}
                  </div>
                </div>
                
                <div className="logs-monitoring-info">
                  <strong>Последнее обновление:</strong> {new Date(systemStatus.timestamp).toLocaleString('ru-RU')}
                </div>
              </>
            )}
            
            <Button
              variant="secondary"
              onClick={loadSystemStatus}
              disabled={!systemStatus}
            >
              Обновить статус
            </Button>
          </div>
        </Card>

        {/* Метрики производительности */}
        <Card className="logs-monitoring-card">
          <div className="logs-monitoring-card-header">
            <h3>Метрики производительности</h3>
          </div>
          <Divider />
          
          <div className="logs-monitoring-form">
            {performanceMetrics && (
              <>
                <div className="logs-monitoring-metric">
                  <div className="logs-monitoring-metric-label">Время отклика</div>
                  <div className="logs-monitoring-metric-value">
                    {performanceMetrics.responseTime.toFixed(2)} мс
                  </div>
                </div>
                
                <div className="logs-monitoring-metric">
                  <div className="logs-monitoring-metric-label">Пропускная способность</div>
                  <div className="logs-monitoring-metric-value">
                    {performanceMetrics.throughput.toFixed(2)} req/s
                  </div>
                </div>
                
                <div className="logs-monitoring-metric">
                  <div className="logs-monitoring-metric-label">Частота ошибок</div>
                  <div className="logs-monitoring-metric-value">
                    {performanceMetrics.errorRate.toFixed(2)}%
                  </div>
                </div>
                
                <div className="logs-monitoring-metric">
                  <div className="logs-monitoring-metric-label">Cache Hit Rate</div>
                  <div className="logs-monitoring-metric-value">
                    {performanceMetrics.cacheHitRate.toFixed(2)}%
                  </div>
                </div>
              </>
            )}
            
            <Button
              variant="secondary"
              onClick={loadPerformanceMetrics}
              disabled={!performanceMetrics}
            >
              Обновить метрики
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default LogsMonitoringSection;

