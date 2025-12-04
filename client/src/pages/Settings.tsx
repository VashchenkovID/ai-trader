import React, { useState, useEffect, useRef } from 'react';
import { Card } from 'primereact/card';
import { TabView, TabPanel } from 'primereact/tabview';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Dialog } from 'primereact/dialog';
import { Tag } from 'primereact/tag';
import { Badge } from 'primereact/badge';
import { Divider } from 'primereact/divider';
import { Toolbar } from 'primereact/toolbar';
import { SplitButton } from 'primereact/splitbutton';
import { ConfirmDialog } from 'primereact/confirmdialog';
import { Slider } from 'primereact/slider';
import { InputTextarea } from 'primereact/inputtextarea';
import { Calendar } from 'primereact/calendar';
import { ToggleButton } from 'primereact/togglebutton';
import { ProgressBar } from 'primereact/progressbar';
import { Chip } from 'primereact/chip';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { apiService } from '../services/apiService';
import SettingsStats from '../components/SettingsStats';
import NewsManagement from '../components/NewsManagement';
import { useWebSocketData } from '../components/WebSocketDataProvider';

interface Setting {
  key: string;
  value: any;
  description: string;
  category: string;
  dataType: string;
  isEditable: boolean;
  minValue?: number;
  maxValue?: number;
  options?: any[];
  lastUpdated: string;
  unit?: string;
  group?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  requiresRestart?: boolean;
  validation?: {
    pattern?: string;
    message?: string;
  };
}

interface SystemInfo {
  version: string;
  uptime: number;
  memory: {
    used: number;
    total: number;
  };
  cpu: {
    usage: number;
    cores: number;
  };
  database: {
    status: string;
    connections: number;
  };
  services: {
    [key: string]: {
      status: string;
      uptime: number;
      memory: number;
    };
  };
}

interface PerformanceMetrics {
  responseTime: number;
  throughput: number;
  errorRate: number;
  cacheHitRate: number;
}

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [originalSettings, setOriginalSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importData, setImportData] = useState('');
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [showAdvancedMode, setShowAdvancedMode] = useState(false);
  const [showSystemDialog, setShowSystemDialog] = useState(false);
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const toast = useRef<Toast>(null);
  const { isConnected } = useWebSocketData();

  // Группировка настроек по модулям
  const moduleGroups = {
    'Обзор': ['overview', 'dashboard'],
    'Система': ['system', 'general', 'database', 'server'],
    'Нейросети': ['neural_network', 'nn_', 'training', 'model'],
    'Торговля': ['trading', 'portfolio', 'risk_management', 'broker'],
    'AI Сервисы': ['ai_', 'ensemble', 'meta_learning', 'reinforcement_learning'],
    'Уведомления': ['notification', 'telegram', 'news', 'alert'],
    'Безопасность': ['security', 'auth', 'encryption', 'api_key'],
    'Производительность': ['performance', 'cache', 'caching', 'optimization'],
    'Мониторинг': ['monitoring', 'logging', 'metrics', 'health'],
    'Резервное копирование': ['backup', 'restore', 'export', 'import'],
    'Разработчики': ['debug', 'dev', 'developer', 'advanced']
  };

  // Категории настроек с иконками
  const categoryIcons = {
    'Обзор': 'pi pi-home',
    'Система': 'pi pi-cog',
    'Нейросети': 'pi pi-brain',
    'Торговля': 'pi pi-chart-line',
    'AI Сервисы': 'pi pi-sparkles',
    'Уведомления': 'pi pi-bell',
    'Безопасность': 'pi pi-shield',
    'Производительность': 'pi pi-bolt',
    'Мониторинг': 'pi pi-eye',
    'Резервное копирование': 'pi pi-save',
    'Разработчики': 'pi pi-code'
  };

  useEffect(() => {
    loadSettings();
    loadSystemInfo();
    loadPerformanceMetrics();
    
    // Обновляем системную информацию каждые 30 секунд
    const interval = setInterval(() => {
      loadSystemInfo();
      loadPerformanceMetrics();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // Обновление данных из WebSocket
  useEffect(() => {
    // Временно отключено - требует рефакторинга для нового WebSocketDataProvider
    // TODO: Реализовать обновление данных из нового провайдера
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await apiService.getSettings();
      setSettings(data);
      setOriginalSettings(JSON.parse(JSON.stringify(data))); // Deep copy
    } catch (error) {
      console.error('Error loading settings:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить настройки'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSystemInfo = async () => {
    try {
      const data = await apiService.getSystemStatus();
      setSystemInfo({
        version: (data as any).version || '1.0.0',
        uptime: (data as any).uptime || 0,
        memory: {
          used: (data as any).memory?.heapUsed || 0,
          total: (data as any).memory?.heapTotal || 0
        },
        cpu: {
          usage: (data as any).cpu?.usage || 0,
          cores: (data as any).cpu?.cores || 1
        },
        database: {
          status: (data as any).database?.status || 'unknown',
          connections: (data as any).database?.connections || 0
        },
        services: (data as any).services || {}
      });
    } catch (error) {
      console.warn('Could not load system info:', error);
    }
  };

  const loadPerformanceMetrics = async () => {
    try {
      const data = await apiService.getPerformanceMetrics();
      setPerformanceMetrics({
        responseTime: (data as any).responseTime || 0,
        throughput: (data as any).throughput || 0,
        errorRate: (data as any).errorRate || 0,
        cacheHitRate: (data as any).cacheHitRate || 0
      });
    } catch (error) {
      console.warn('Could not load performance metrics:', error);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      const settingsToSave = settings.reduce((acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      }, {} as Record<string, any>);

      await apiService.updateSettings(settingsToSave);
      
      toast.current?.show({
        severity: 'success',
        summary: 'Успешно',
        detail: 'Настройки сохранены'
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось сохранить настройки'
      });
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => prev.map(setting => 
      setting.key === key ? { ...setting, value } : setting
    ));
  };

  // Проверка изменений
  const hasChanges = () => {
    return settings.some(setting => {
      const original = originalSettings.find(orig => orig.key === setting.key);
      return original && JSON.stringify(original.value) !== JSON.stringify(setting.value);
    });
  };

  // Сброс к исходным значениям
  const resetToOriginal = () => {
    setSettings(JSON.parse(JSON.stringify(originalSettings)));
    toast.current?.show({
      severity: 'info',
      summary: 'Сброс',
      detail: 'Настройки возвращены к исходным значениям'
    });
  };

  // Сброс к значениям по умолчанию
  const resetToDefaults = () => {
    // Здесь можно добавить логику сброса к значениям по умолчанию
    toast.current?.show({
      severity: 'info',
      summary: 'Сброс',
      detail: 'Настройки сброшены к значениям по умолчанию'
    });
  };

  // Экспорт настроек
  const exportSettings = () => {
    const exportData = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as Record<string, any>);

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `settings-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);

    toast.current?.show({
      severity: 'success',
      summary: 'Экспорт',
      detail: 'Настройки экспортированы'
    });
  };

  // Импорт настроек
  const importSettings = () => {
    try {
      const importedData = JSON.parse(importData);
      const updatedSettings = settings.map(setting => ({
        ...setting,
        value: importedData[setting.key] !== undefined ? importedData[setting.key] : setting.value
      }));
      setSettings(updatedSettings);
      setShowImportDialog(false);
      setImportData('');
      
      toast.current?.show({
        severity: 'success',
        summary: 'Импорт',
        detail: 'Настройки импортированы'
      });
    } catch (error) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Неверный формат JSON'
      });
    }
  };

  // Валидация значения
  const validateValue = (setting: Setting, value: any) => {
    if (setting.dataType === 'number') {
      if (setting.minValue !== undefined && value < setting.minValue) {
        return `Значение не может быть меньше ${setting.minValue}`;
      }
      if (setting.maxValue !== undefined && value > setting.maxValue) {
        return `Значение не может быть больше ${setting.maxValue}`;
      }
    }
    return null;
  };

  const getModuleSettings = (moduleName: string) => {
    const keywords = moduleGroups[moduleName as keyof typeof moduleGroups];
    let filteredSettings = settings.filter(setting => 
      keywords.some(keyword => setting.key.toLowerCase().includes(keyword.toLowerCase()))
    );

    // Применяем поиск если есть поисковый запрос
    if (searchTerm) {
      filteredSettings = filteredSettings.filter(setting =>
        setting.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
        setting.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return filteredSettings;
  };

  const renderSettingInput = (setting: Setting) => {
    const { key, value, dataType, minValue, maxValue, options, unit } = setting;
    const validationError = validateValue(setting, value);

    const inputProps = {
      disabled: !setting.isEditable,
      className: `w-full ${validationError ? 'p-invalid' : ''}`
    };

    switch (dataType) {
      case 'boolean':
        return (
          <div>
            <ToggleButton
              checked={value}
              onChange={(e) => updateSetting(key, e.value)}
              disabled={!setting.isEditable}
              onLabel="Включено"
              offLabel="Выключено"
              className="w-full"
            />
            {validationError && (
              <small className="p-error block mt-1">{validationError}</small>
            )}
          </div>
        );

      case 'number':
        return (
          <div>
            <div className="p-inputgroup">
              <InputNumber
                value={value}
                onValueChange={(e) => updateSetting(key, e.value)}
                min={minValue}
                max={maxValue}
                {...inputProps}
              />
              {unit && (
                <span className="p-inputgroup-addon">{unit}</span>
              )}
            </div>
            {validationError && (
              <small className="p-error block mt-1">{validationError}</small>
            )}
          </div>
        );

      case 'slider':
        return (
          <div>
            <div className="flex align-items-center gap-3">
              <Slider
                value={value}
                onChange={(e) => updateSetting(key, e.value)}
                min={minValue || 0}
                max={maxValue || 100}
                disabled={!setting.isEditable}
                className="flex-1"
              />
              <span className="text-sm font-medium w-4rem text-right">
                {value}{unit && ` ${unit}`}
              </span>
            </div>
            {validationError && (
              <small className="p-error block mt-1">{validationError}</small>
            )}
          </div>
        );

      case 'select':
        return (
          <div>
            <Dropdown
              value={value}
              options={options?.map(opt => ({ label: opt, value: opt })) || []}
              onChange={(e) => updateSetting(key, e.value)}
              {...inputProps}
            />
            {validationError && (
              <small className="p-error block mt-1">{validationError}</small>
            )}
          </div>
        );

      case 'textarea':
        return (
          <div>
            <InputTextarea
              value={value}
              onChange={(e) => updateSetting(key, e.target.value)}
              rows={3}
              {...inputProps}
            />
            {validationError && (
              <small className="p-error block mt-1">{validationError}</small>
            )}
          </div>
        );

      case 'password':
        return (
          <div>
            <InputText
              type="password"
              value={value}
              onChange={(e) => updateSetting(key, e.target.value)}
              {...inputProps}
            />
            {validationError && (
              <small className="p-error block mt-1">{validationError}</small>
            )}
          </div>
        );

      case 'date':
        return (
          <div>
            <Calendar
              value={value ? new Date(value) : null}
              onChange={(e) => updateSetting(key, e.value instanceof Date ? e.value.toISOString() : e.value)}
              disabled={!setting.isEditable}
              className="w-full"
            />
            {validationError && (
              <small className="p-error block mt-1">{validationError}</small>
            )}
          </div>
        );

      case 'string':
      default:
        return (
          <div>
            <InputText
              value={value}
              onChange={(e) => updateSetting(key, e.target.value)}
              {...inputProps}
            />
            {validationError && (
              <small className="p-error block mt-1">{validationError}</small>
            )}
          </div>
        );
    }
  };

  // Рендер обзорной вкладки
  const renderOverviewTab = () => {
    return (
      <div className="grid">
        {/* Системная информация */}
        <div className="col-12 lg:col-6">
          <Card title="🖥️ Системная информация" className="h-full">
            {systemInfo ? (
              <div className="flex flex-column gap-3">
                <div className="flex justify-content-between">
                  <span>Версия:</span>
                  <Chip label={systemInfo.version} />
                </div>
                <div className="flex justify-content-between">
                  <span>Время работы:</span>
                  <span>{Math.floor(systemInfo.uptime / 3600)}ч {Math.floor((systemInfo.uptime % 3600) / 60)}м</span>
                </div>
                <div>
                  <div className="flex justify-content-between mb-2">
                    <span>Память:</span>
                    <span>{Math.round(systemInfo.memory.used / 1024 / 1024)}MB / {Math.round(systemInfo.memory.total / 1024 / 1024)}MB</span>
                  </div>
                  <ProgressBar 
                    value={(systemInfo.memory.used / systemInfo.memory.total) * 100} 
                    className="h-1rem"
                  />
                </div>
                <div className="flex justify-content-between">
                  <span>CPU ядер:</span>
                  <span>{systemInfo.cpu.cores}</span>
                </div>
                <div className="flex justify-content-between">
                  <span>База данных:</span>
                  <Tag 
                    value={systemInfo.database.status} 
                    severity={systemInfo.database.status === 'connected' ? 'success' : 'danger'}
                  />
                </div>
                {isConnected && (
                  <div className="flex justify-content-between">
                    <span>WebSocket:</span>
                    <Tag value="Подключен" severity="success" />
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <i className="pi pi-spin pi-spinner text-2xl"></i>
              </div>
            )}
          </Card>
        </div>

        {/* Производительность */}
        <div className="col-12 lg:col-6">
          <Card title="⚡ Производительность" className="h-full">
            {performanceMetrics ? (
              <div className="flex flex-column gap-3">
                <div className="flex justify-content-between">
                  <span>Время отклика:</span>
                  <span>{performanceMetrics.responseTime}мс</span>
                </div>
                <div className="flex justify-content-between">
                  <span>Пропускная способность:</span>
                  <span>{performanceMetrics.throughput} req/s</span>
                </div>
                <div>
                  <div className="flex justify-content-between mb-2">
                    <span>Частота ошибок:</span>
                    <span>{performanceMetrics.errorRate.toFixed(2)}%</span>
                  </div>
                  <ProgressBar 
                    value={performanceMetrics.errorRate} 
                    className="h-1rem"
                    color={performanceMetrics.errorRate > 5 ? '#ef4444' : '#10b981'}
                  />
                </div>
                <div>
                  <div className="flex justify-content-between mb-2">
                    <span>Попадание в кеш:</span>
                    <span>{performanceMetrics.cacheHitRate.toFixed(1)}%</span>
                  </div>
                  <ProgressBar 
                    value={performanceMetrics.cacheHitRate} 
                    className="h-1rem"
                  />
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <i className="pi pi-spin pi-spinner text-2xl"></i>
              </div>
            )}
          </Card>
        </div>

        {/* Быстрые настройки */}
        <div className="col-12">
          <Card title="⚙️ Быстрые настройки">
            <div className="grid">
              {settings.filter(s => s.priority === 'high' || s.priority === 'critical').slice(0, 6).map(setting => {
                const hasChanged = originalSettings.find(orig => orig.key === setting.key)?.value !== setting.value;
                return (
                  <div key={setting.key} className="col-12 md:col-6 lg:col-4">
                    <div className={`p-3 border-round surface-100 ${hasChanged ? 'border-orange-300 border-2' : ''}`}>
                      <div className="flex justify-content-between align-items-start mb-2">
                        <label className="font-semibold text-sm">
                          {setting.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </label>
                        {setting.priority === 'critical' && (
                          <i className="pi pi-exclamation-triangle text-red-500" title="Критическая настройка"></i>
                        )}
                      </div>
                      <p className="text-xs text-600 mb-2">{setting.description}</p>
                      {renderSettingInput(setting)}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Статистика настроек */}
        <div className="col-12">
          <Card title="📊 Статистика настроек">
            <div className="grid">
              <div className="col-12 md:col-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-500">{settings.length}</div>
                  <div className="text-sm text-600">Всего настроек</div>
                </div>
              </div>
              <div className="col-12 md:col-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-500">
                    {settings.filter(s => s.isEditable).length}
                  </div>
                  <div className="text-sm text-600">Редактируемых</div>
                </div>
              </div>
              <div className="col-12 md:col-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-500">
                    {settings.filter(s => originalSettings.find(orig => orig.key === s.key)?.value !== s.value).length}
                  </div>
                  <div className="text-sm text-600">Изменено</div>
                </div>
              </div>
              <div className="col-12 md:col-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-500">
                    {settings.filter(s => s.priority === 'critical').length}
                  </div>
                  <div className="text-sm text-600">Критических</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  };

  const renderModuleTab = (moduleName: string) => {
    // Специальная обработка для обзорной вкладки
    if (moduleName === 'Обзор') {
      return renderOverviewTab();
    }

    // Специальная обработка для вкладки "Уведомления" - добавляем управление новостями
    if (moduleName === 'Уведомления') {
      const moduleSettings = getModuleSettings(moduleName);
      return (
        <div className="flex flex-column gap-4">
          {/* Компонент управления новостями */}
          <NewsManagement />
          
          {/* Настройки уведомлений */}
          {moduleSettings.length > 0 && (
            <>
              <Divider />
              <h4 className="text-xl font-semibold mb-3">Настройки уведомлений</h4>
              {Object.entries(
                moduleSettings.reduce((acc, setting) => {
                  const category = setting.category || 'Общие';
                  if (!acc[category]) {
                    acc[category] = [];
                  }
                  acc[category].push(setting);
                  return acc;
                }, {} as Record<string, Setting[]>)
              ).map(([category, categorySettings]) => (
                <div key={category}>
                  <Divider align="left">
                    <Tag value={category} severity="info" />
                  </Divider>
                  <div className="grid">
                    {categorySettings.map((setting) => {
                      const hasChanged = originalSettings.find(orig => orig.key === setting.key)?.value !== setting.value;
                      return (
                        <div key={setting.key} className="col-12 md:col-6 lg:col-4">
                          <Card className={`h-full ${hasChanged ? 'border-orange-300' : ''}`}>
                            <div className="flex flex-column gap-3">
                              <div className="flex justify-content-between align-items-start">
                                <div className="flex-1">
                                  <label className="font-semibold text-sm text-gray-700">
                                    {setting.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                  </label>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {setting.description}
                                  </p>
                                </div>
                                <div className="flex align-items-center gap-1">
                                  {hasChanged && (
                                    <Badge value="Изменено" severity="warning" size="normal" />
                                  )}
                                  {!setting.isEditable && (
                                    <i className="pi pi-lock text-gray-400" title="Только для чтения"></i>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex align-items-center gap-2">
                                {renderSettingInput(setting)}
                              </div>

                              <div className="flex justify-content-between align-items-center">
                                <div className="text-xs text-gray-400">
                                  Обновлено: {new Date(setting.lastUpdated).toLocaleString('ru-RU')}
                                </div>
                                <Tag 
                                  value={setting.dataType} 
                                  severity="info" 
                                />
                              </div>
                            </div>
                          </Card>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      );
    }

    const moduleSettings = getModuleSettings(moduleName);
    
    if (moduleSettings.length === 0) {
      return (
        <div className="text-center text-gray-500 py-8">
          <i className="pi pi-info-circle text-2xl mb-2"></i>
          <p>Настройки для этого модуля не найдены</p>
        </div>
      );
    }

    // Группировка по категориям
    const groupedSettings = moduleSettings.reduce((acc, setting) => {
      const category = setting.category || 'Общие';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(setting);
      return acc;
    }, {} as Record<string, Setting[]>);

    return (
      <div className="flex flex-column gap-4">
        {Object.entries(groupedSettings).map(([category, categorySettings]) => (
          <div key={category}>
            <Divider align="left">
              <Tag value={category} severity="info" />
            </Divider>
            <div className="grid">
              {categorySettings.map((setting) => {
                const hasChanged = originalSettings.find(orig => orig.key === setting.key)?.value !== setting.value;
                return (
                  <div key={setting.key} className="col-12 md:col-6 lg:col-4">
                    <Card className={`h-full ${hasChanged ? 'border-orange-300' : ''}`}>
                      <div className="flex flex-column gap-3">
                        <div className="flex justify-content-between align-items-start">
                          <div className="flex-1">
                            <label className="font-semibold text-sm text-gray-700">
                              {setting.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </label>
                            <p className="text-xs text-gray-500 mt-1">
                              {setting.description}
                            </p>
                          </div>
                          <div className="flex align-items-center gap-1">
                            {hasChanged && (
                              <Badge value="Изменено" severity="warning" size="normal" />
                            )}
                            {!setting.isEditable && (
                              <i className="pi pi-lock text-gray-400" title="Только для чтения"></i>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex align-items-center gap-2">
                          {renderSettingInput(setting)}
                        </div>

                        <div className="flex justify-content-between align-items-center">
                          <div className="text-xs text-gray-400">
                            Обновлено: {new Date(setting.lastUpdated).toLocaleString('ru-RU')}
                          </div>
                          <Tag 
                            value={setting.dataType} 
                            severity="info" 
                          />
                        </div>
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const getModuleDescription = (moduleName: string) => {
    const descriptions = {
      'Обзор': 'Общая информация о системе, производительности и быстрые настройки',
      'Система': 'Общие настройки системы, базы данных и основные параметры',
      'Нейросети': 'Настройки обучения и работы нейронных сетей',
      'Торговля': 'Параметры торгового движка, портфеля и риск-менеджмента',
      'AI Сервисы': 'Конфигурация всех AI сервисов (ансамбль, мета-обучение, RL)',
      'Уведомления': 'Настройки Telegram, новостей и системы уведомлений',
      'Безопасность': 'Настройки безопасности, аутентификации и шифрования',
      'Производительность': 'Параметры кеширования и оптимизации производительности',
      'Мониторинг': 'Настройки логирования, метрик и мониторинга системы',
      'Резервное копирование': 'Параметры резервного копирования и восстановления данных',
      'Разработчики': 'Отладочные настройки и параметры для разработчиков'
    };
    return descriptions[moduleName as keyof typeof descriptions] || '';
  };

  // Панель инструментов
  const toolbarLeft = (
    <div className="flex align-items-center gap-3">
      <div className="p-input-icon-left">
        <i className="pi pi-search" />
        <InputText
          placeholder="Поиск настроек..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-20rem"
        />
      </div>
      <ToggleButton
        checked={showAdvancedMode}
        onChange={(e) => setShowAdvancedMode(e.value)}
        onLabel="Расширенный режим"
        offLabel="Обычный режим"
        onIcon="pi pi-cog"
        offIcon="pi pi-user"
        className="p-button-sm"
      />
      {hasChanges() && (
        <Badge value="Есть изменения" severity="warning" />
      )}
      {isConnected && (
        <Badge value="LIVE" severity="success" />
      )}
    </div>
  );

  const toolbarRight = (
    <div className="flex align-items-center gap-2">
      <Button
        icon="pi pi-info-circle"
        label="Система"
        onClick={() => setShowSystemDialog(true)}
        className="p-button-outlined p-button-sm"
      />
      <SplitButton
        label="Действия"
        icon="pi pi-cog"
        className="p-button-sm"
        model={[
          {
            label: 'Сбросить к исходным',
            icon: 'pi pi-refresh',
            command: resetToOriginal
          },
          {
            label: 'Сбросить к умолчанию',
            icon: 'pi pi-undo',
            command: resetToDefaults
          },
          {
            separator: true
          },
          {
            label: 'Экспорт настроек',
            icon: 'pi pi-download',
            command: exportSettings
          },
          {
            label: 'Импорт настроек',
            icon: 'pi pi-upload',
            command: () => setShowImportDialog(true)
          },
          {
            separator: true
          },
          {
            label: 'Резервная копия',
            icon: 'pi pi-save',
            command: () => setShowBackupDialog(true)
          },
          {
            label: 'Перезагрузить настройки',
            icon: 'pi pi-replay',
            command: loadSettings
          }
        ]}
      />
      <Button
        label="Сохранить"
        icon="pi pi-save"
        onClick={saveSettings}
        loading={saving}
        disabled={!hasChanges()}
        className="p-button-success p-button-sm"
      />
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-content-center align-items-center" style={{ height: '400px' }}>
        <i className="pi pi-spin pi-spinner text-4xl"></i>
      </div>
    );
  }

  return (
    <div className="p-4">
      <Toast ref={toast} />
      <ConfirmDialog />
      
      <div className="mb-4">
        <h1 className="text-3xl font-bold mb-2">Настройки системы</h1>
        <p className="text-gray-600">
          Управление конфигурацией всех модулей торговой системы
        </p>
      </div>

      <Toolbar left={toolbarLeft} right={toolbarRight} className="mb-4" />

      <TabView>
        {/* Вкладка статистики */}
        <TabPanel 
          header={
            <div className="flex align-items-center gap-2">
              <i className="pi pi-chart-bar"></i>
              <span>Статистика</span>
            </div>
          }
        >
          <SettingsStats settings={settings} originalSettings={originalSettings} />
        </TabPanel>

        {/* Вкладки модулей */}
        {Object.keys(moduleGroups).map((moduleName) => {
          const moduleSettings = getModuleSettings(moduleName);
          const icon = categoryIcons[moduleName as keyof typeof categoryIcons] || 'pi pi-cog';
          return (
            <TabPanel 
              key={moduleName} 
              header={
                <div className="flex align-items-center gap-2">
                  <i className={icon}></i>
                  <span>{moduleName}</span>
                  {moduleSettings.length > 0 && moduleName !== 'Обзор' && (
                    <Badge value={moduleSettings.length} severity="info" />
                  )}
                </div>
              }
            >
              <div className="mb-4">
                <h3 className="text-xl font-semibold mb-2 flex align-items-center gap-2">
                  <i className={icon}></i>
                  {moduleName}
                </h3>
                <p className="text-gray-600 text-sm">
                  {getModuleDescription(moduleName)}
                </p>
              </div>
              {renderModuleTab(moduleName)}
            </TabPanel>
          );
        })}
      </TabView>

      {/* Диалог импорта настроек */}
      <Dialog
        header="Импорт настроек"
        visible={showImportDialog}
        style={{ width: '50vw' }}
        onHide={() => setShowImportDialog(false)}
      >
        <div className="flex flex-column gap-3">
          <p>Вставьте JSON с настройками:</p>
          <textarea
            value={importData}
            onChange={(e) => setImportData(e.target.value)}
            className="w-full"
            rows={10}
            placeholder='{"setting_key": "value", ...}'
          />
          <div className="flex justify-content-end gap-2">
            <Button
              label="Отмена"
              icon="pi pi-times"
              onClick={() => setShowImportDialog(false)}
              className="p-button-secondary"
            />
            <Button
              label="Импортировать"
              icon="pi pi-upload"
              onClick={importSettings}
              className="p-button-success"
            />
          </div>
        </div>
      </Dialog>

      {/* Диалог системной информации */}
      <Dialog
        header="Системная информация"
        visible={showSystemDialog}
        style={{ width: '70vw' }}
        onHide={() => setShowSystemDialog(false)}
      >
        <div className="grid">
          <div className="col-12 md:col-6">
            <h4>Общая информация</h4>
            {systemInfo && (
              <div className="flex flex-column gap-2">
                <div className="flex justify-content-between">
                  <span>Версия:</span>
                  <strong>{systemInfo.version}</strong>
                </div>
                <div className="flex justify-content-between">
                  <span>Время работы:</span>
                  <strong>{Math.floor(systemInfo.uptime / 3600)}ч {Math.floor((systemInfo.uptime % 3600) / 60)}м</strong>
                </div>
                <div className="flex justify-content-between">
                  <span>CPU ядер:</span>
                  <strong>{systemInfo.cpu.cores}</strong>
                </div>
                <div className="flex justify-content-between">
                  <span>Память:</span>
                  <strong>{Math.round(systemInfo.memory.used / 1024 / 1024)}MB / {Math.round(systemInfo.memory.total / 1024 / 1024)}MB</strong>
                </div>
              </div>
            )}
          </div>
          
          <div className="col-12 md:col-6">
            <h4>Производительность</h4>
            {performanceMetrics && (
              <div className="flex flex-column gap-2">
                <div className="flex justify-content-between">
                  <span>Время отклика:</span>
                  <strong>{performanceMetrics.responseTime}мс</strong>
                </div>
                <div className="flex justify-content-between">
                  <span>Пропускная способность:</span>
                  <strong>{performanceMetrics.throughput} req/s</strong>
                </div>
                <div className="flex justify-content-between">
                  <span>Частота ошибок:</span>
                  <strong>{performanceMetrics.errorRate.toFixed(2)}%</strong>
                </div>
                <div className="flex justify-content-between">
                  <span>Попадание в кеш:</span>
                  <strong>{performanceMetrics.cacheHitRate.toFixed(1)}%</strong>
                </div>
              </div>
            )}
          </div>

          {systemInfo && Object.keys(systemInfo.services).length > 0 && (
            <div className="col-12">
              <h4>Сервисы</h4>
              <DataTable value={Object.entries(systemInfo.services).map(([name, info]) => ({ name, ...info }))}>
                <Column field="name" header="Сервис" />
                <Column 
                  field="status" 
                  header="Статус" 
                  body={(rowData) => (
                    <Tag 
                      value={rowData.status} 
                      severity={rowData.status === 'active' ? 'success' : 'danger'}
                    />
                  )}
                />
                <Column 
                  field="uptime" 
                  header="Время работы" 
                  body={(rowData) => `${Math.floor(rowData.uptime / 3600)}ч ${Math.floor((rowData.uptime % 3600) / 60)}м`}
                />
                <Column 
                  field="memory" 
                  header="Память" 
                  body={(rowData) => `${Math.round(rowData.memory / 1024 / 1024)}MB`}
                />
              </DataTable>
            </div>
          )}
        </div>
      </Dialog>

      {/* Диалог резервного копирования */}
      <Dialog
        header="Резервное копирование"
        visible={showBackupDialog}
        style={{ width: '50vw' }}
        onHide={() => setShowBackupDialog(false)}
      >
        <div className="flex flex-column gap-4">
          <div>
            <h4>Создать резервную копию</h4>
            <p className="text-600">
              Создайте полную резервную копию всех настроек системы для последующего восстановления.
            </p>
            <Button
              label="Создать резервную копию"
              icon="pi pi-download"
              onClick={exportSettings}
              className="p-button-success"
            />
          </div>
          
          <Divider />
          
          <div>
            <h4>Восстановить из резервной копии</h4>
            <p className="text-600">
              Загрузите файл резервной копии для восстановления настроек.
            </p>
            <Button
              label="Выбрать файл"
              icon="pi pi-upload"
              onClick={() => {
                setShowBackupDialog(false);
                setShowImportDialog(true);
              }}
              className="p-button-outlined"
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default Settings;
