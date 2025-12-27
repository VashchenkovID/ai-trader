import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../ui/Card/Card';
import { Button } from '../ui/Button/Button';
import { Alert } from '../ui/Alert/Alert';
import { Input } from '../ui/Input/Input';
import { InputNumber } from '../ui/InputNumber/InputNumber';
import { InputSwitch } from 'primereact/inputswitch';
import { Divider } from '../ui/Divider/Divider';
import { apiService } from '../../services/apiService';
import { Toast } from 'primereact/toast';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import './NotificationsSection.css';

interface NotificationSettings {
  // Telegram
  telegramEnabled: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramTestConnection?: boolean;
  
  // Trading hours notifications
  openingNotificationsEnabled: boolean;
  openingNotificationMinutes: number;
  closingNotificationsEnabled: boolean;
  closingNotificationMinutes: number;
  
  // Notification types
  signalNotificationsEnabled: boolean;
  tradeNotificationsEnabled: boolean;
  errorNotificationsEnabled: boolean;
  metricsNotificationsEnabled: boolean;
  
  // WebSocket
  websocketEnabled: boolean;
  
  // Browser
  soundEnabled: boolean;
  pushEnabled: boolean;
}

interface NotificationsSectionProps {
  className?: string;
}

const NotificationsSection: React.FC<NotificationsSectionProps> = ({ className = '' }) => {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const toast = useRef<Toast>(null);

  // Загрузка настроек
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      
      // Загружаем TradingNotificationSettings
      let tradingNotificationSettings: any = {};
      try {
        tradingNotificationSettings = await apiService.getNotificationSettings();
      } catch (error) {
        console.warn('Error loading TradingNotificationSettings, using defaults:', error);
      }

      // Загружаем настройки из категории notifications
      let notificationSettings: any[] = [];
      try {
        const allSettings = await apiService.getSettings();
        notificationSettings = Array.isArray(allSettings) 
          ? allSettings.filter(s => (s as any).module === 'notifications' || s.category === 'notifications')
          : [];
      } catch (error) {
        console.warn('Error loading notification settings from Settings model:', error);
      }

      // Формируем объект настроек
      const settingsMap: Partial<NotificationSettings> = {};
      
      notificationSettings.forEach(setting => {
        const key = setting.key.replace('notifications_', '').replace('telegram_', '');
        settingsMap[key as keyof NotificationSettings] = setting.value;
      });

      // Объединяем с TradingNotificationSettings
      const mergedSettings: NotificationSettings = {
        telegramEnabled: tradingNotificationSettings?.telegramEnabled ?? (settingsMap as any).telegramNotificationsEnabled ?? true,
        telegramBotToken: '', // Не показываем токен из env, пользователь должен ввести
        telegramChatId: '', // Не показываем chatId из env, пользователь должен ввести
        openingNotificationsEnabled: tradingNotificationSettings?.openingNotificationsEnabled ?? true,
        openingNotificationMinutes: tradingNotificationSettings?.openingNotificationMinutes ?? 15,
        closingNotificationsEnabled: tradingNotificationSettings?.closingNotificationsEnabled ?? true,
        closingNotificationMinutes: tradingNotificationSettings?.closingNotificationMinutes ?? 15,
        signalNotificationsEnabled: settingsMap.signalNotificationsEnabled ?? true,
        tradeNotificationsEnabled: settingsMap.tradeNotificationsEnabled ?? true,
        errorNotificationsEnabled: settingsMap.errorNotificationsEnabled ?? true,
        metricsNotificationsEnabled: settingsMap.metricsNotificationsEnabled ?? false,
        websocketEnabled: tradingNotificationSettings?.websocketEnabled ?? true,
        soundEnabled: tradingNotificationSettings?.soundEnabled ?? true,
        pushEnabled: tradingNotificationSettings?.pushEnabled ?? false,
      };

      setSettings(mergedSettings);
    } catch (error: any) {
      console.error('Error loading notification settings:', error);
      showToast('error', 'Не удалось загрузить настройки уведомлений');
      // Устанавливаем значения по умолчанию
      setSettings({
        telegramEnabled: true,
        openingNotificationsEnabled: true,
        openingNotificationMinutes: 15,
        closingNotificationsEnabled: true,
        closingNotificationMinutes: 15,
        signalNotificationsEnabled: true,
        tradeNotificationsEnabled: true,
        errorNotificationsEnabled: true,
        metricsNotificationsEnabled: false,
        websocketEnabled: true,
        soundEnabled: true,
        pushEnabled: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = useCallback(async (key: keyof NotificationSettings, value: any) => {
    if (!settings) return;

    const updatedSettings = { ...settings, [key]: value };
    setSettings(updatedSettings);

    try {
      // Определяем, куда сохранять настройку
      const isTradingNotificationSetting = [
        'telegramEnabled',
        'openingNotificationsEnabled',
        'openingNotificationMinutes',
        'closingNotificationsEnabled',
        'closingNotificationMinutes',
        'websocketEnabled',
        'soundEnabled',
        'pushEnabled'
      ].includes(key);

      if (isTradingNotificationSetting) {
        // Сохраняем в TradingNotificationSettings
        await apiService.updateNotificationSettings({ [key]: value });
      } else {
        // Сохраняем в Settings модель
        await apiService.updateSettings({ [`notifications_${key}`]: value });
      }
      
      showToast('success', 'Настройка обновлена');
    } catch (error: any) {
      console.error('Error updating notification setting:', error);
      showToast('error', 'Не удалось обновить настройку');
      // Откатываем изменение
      setSettings(settings);
    }
  }, [settings]);

  const handleTestTelegram = async () => {
    if (!settings?.telegramBotToken || !settings?.telegramChatId) {
      showToast('warn', 'Укажите токен бота и ID чата');
      return;
    }

    setTestingTelegram(true);
    try {
      await apiService.testTelegramConnection(settings.telegramBotToken, settings.telegramChatId);
      showToast('success', 'Тестовое сообщение отправлено успешно');
    } catch (error: any) {
      console.error('Error testing Telegram:', error);
      showToast('error', error.response?.data?.message || 'Ошибка при тестировании Telegram');
    } finally {
      setTestingTelegram(false);
    }
  };

  const showToast = useCallback((severity: 'success' | 'error' | 'info' | 'warn', message: string) => {
    if (toast.current) {
      toast.current.show({ severity, summary: message, life: 3000 });
    }
  }, []);

  const renderSwitch = useCallback((key: keyof NotificationSettings, label: string, description?: string) => {
    if (!settings) return null;

    return (
      <div className="notifications-setting-item">
        <div className="notifications-setting-label">
          <label className="notifications-setting-label-text">{label}</label>
          {description && (
            <span className="notifications-setting-description">{description}</span>
          )}
        </div>
        <div className="notifications-setting-control">
          <InputSwitch
            checked={settings[key] as boolean}
            onChange={(e) => handleUpdate(key, e.value)}
          />
        </div>
      </div>
    );
  }, [settings, handleUpdate]);

  const renderNumberInput = useCallback((
    key: keyof NotificationSettings, 
    label: string, 
    description?: string,
    min?: number,
    max?: number
  ) => {
    if (!settings) return null;

    return (
      <div className="notifications-setting-item">
        <div className="notifications-setting-label">
          <label className="notifications-setting-label-text">{label}</label>
          {description && (
            <span className="notifications-setting-description">{description}</span>
          )}
        </div>
        <div className="notifications-setting-control">
          <InputNumber
            value={settings[key] as number}
            onValueChange={(e) => handleUpdate(key, e.value || 0)}
            min={min}
            max={max}
            step={1}
            showButtons
            buttonLayout="horizontal"
            size="sm"
          />
        </div>
      </div>
    );
  }, [settings, handleUpdate]);

  const renderTextInput = useCallback((
    key: keyof NotificationSettings,
    label: string,
    description?: string,
    type: 'text' | 'password' = 'text',
    placeholder?: string
  ) => {
    if (!settings) return null;

    return (
      <div className="notifications-setting-item">
        <div className="notifications-setting-label">
          <label className="notifications-setting-label-text">{label}</label>
          {description && (
            <span className="notifications-setting-description">{description}</span>
          )}
        </div>
        <div className="notifications-setting-control">
          <Input
            type={type}
            value={settings[key] as string || ''}
            onChange={(e) => handleUpdate(key, e.target.value)}
            placeholder={placeholder}
            fullWidth
          />
        </div>
      </div>
    );
  }, [settings, handleUpdate]);

  if (loading) {
    return (
      <div className={`notifications-section ${className}`}>
        <Skeleton height={400} />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className={`notifications-section ${className}`}>
        <Alert variant="error" title="Ошибка">
        Не удалось загрузить настройки уведомлений
      </Alert>
      </div>
    );
  }

  return (
    <div className={`notifications-section ${className}`}>
      <Toast ref={toast} />

      {/* Telegram Settings */}
      <Card
        header={
          <div className="notifications-card-header">
            <h3 className="notifications-card-title">📱 Telegram уведомления</h3>
            <p className="notifications-card-subtitle">Настройки Telegram бота для отправки уведомлений</p>
          </div>
        }
        className="notifications-card"
      >
        {renderSwitch('telegramEnabled', 'Включить Telegram уведомления', 'Отправлять уведомления через Telegram бота')}
        
        {settings.telegramEnabled && (
          <>
            <Divider />
            {renderTextInput(
              'telegramBotToken',
              'Токен бота',
              'Токен Telegram бота (получить у @BotFather)',
              'password',
              'Введите токен бота'
            )}
            {renderTextInput(
              'telegramChatId',
              'ID чата/канала',
              'ID чата или канала для отправки уведомлений',
              'text',
              'Введите ID чата'
            )}
            <div className="notifications-action-buttons">
              <Button
                variant="secondary"
                onClick={handleTestTelegram}
                loading={testingTelegram}
                icon={<i className="pi pi-send"></i>}
              >
                Отправить тестовое сообщение
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* Trading Hours Notifications */}
      <Card
        header={
          <div className="notifications-card-header">
            <h3 className="notifications-card-title">🕐 Уведомления о торговых часах</h3>
            <p className="notifications-card-subtitle">Настройки уведомлений об открытии и закрытии торгов</p>
          </div>
        }
        className="notifications-card"
      >
        {renderSwitch(
          'openingNotificationsEnabled',
          'Уведомления об открытии торгов',
          'Получать уведомления перед открытием торговой сессии'
        )}
        {settings.openingNotificationsEnabled && (
          <>
            <Divider />
            {renderNumberInput(
              'openingNotificationMinutes',
              'За сколько минут до открытия',
              'За сколько минут до открытия торгов отправлять уведомление',
              1,
              60
            )}
          </>
        )}
        
        <Divider />
        
        {renderSwitch(
          'closingNotificationsEnabled',
          'Уведомления о закрытии торгов',
          'Получать уведомления перед закрытием торговой сессии'
        )}
        {settings.closingNotificationsEnabled && (
          <>
            <Divider />
            {renderNumberInput(
              'closingNotificationMinutes',
              'За сколько минут до закрытия',
              'За сколько минут до закрытия торгов отправлять уведомление',
              1,
              60
            )}
          </>
        )}
      </Card>

      {/* Notification Types */}
      <Card
        header={
          <div className="notifications-card-header">
            <h3 className="notifications-card-title">🔔 Типы уведомлений</h3>
            <p className="notifications-card-subtitle">Выберите, какие события должны отправлять уведомления</p>
          </div>
        }
        className="notifications-card"
      >
        {renderSwitch(
          'signalNotificationsEnabled',
          'Торговые сигналы',
          'Уведомления о новых торговых сигналах'
        )}
        <Divider />
        {renderSwitch(
          'tradeNotificationsEnabled',
          'Сделки',
          'Уведомления об открытии и закрытии позиций'
        )}
        <Divider />
        {renderSwitch(
          'errorNotificationsEnabled',
          'Ошибки',
          'Уведомления об ошибках и критических событиях'
        )}
        <Divider />
        {renderSwitch(
          'metricsNotificationsEnabled',
          'Метрики производительности',
          'Периодические отчеты о производительности системы'
        )}
      </Card>

      {/* Browser Notifications */}
      <Card
        header={
          <div className="notifications-card-header">
            <h3 className="notifications-card-title">🌐 Уведомления в браузере</h3>
            <p className="notifications-card-subtitle">Настройки уведомлений в интерфейсе приложения</p>
          </div>
        }
        className="notifications-card"
      >
        {renderSwitch(
          'websocketEnabled',
          'WebSocket уведомления',
          'Получать уведомления через WebSocket в реальном времени'
        )}
        <Divider />
        {renderSwitch(
          'soundEnabled',
          'Звуковые уведомления',
          'Воспроизводить звук при получении уведомлений'
        )}
        <Divider />
        {renderSwitch(
          'pushEnabled',
          'Push уведомления браузера',
          'Использовать браузерные push уведомления (требует разрешения)'
        )}
      </Card>
    </div>
  );
};

export default NotificationsSection;

