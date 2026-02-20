import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../ui/Card/Card';
import { Button } from '../ui/Button/Button';
import { Badge } from '../ui/Badge/Badge';
import { Alert } from '../ui/Alert/Alert';
import { ProgressBar } from '../ui/ProgressBar/ProgressBar';
import { apiService, AutoPaperTradingStatus } from '../../services/apiService';
import { Toast } from 'primereact/toast';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import './AutoPaperTradingSection.css';

interface AutoPaperTradingSectionProps {
  className?: string;
}

const AutoPaperTradingSection: React.FC<AutoPaperTradingSectionProps> = ({ className = '' }) => {
  const [status, setStatus] = useState<AutoPaperTradingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [updatingSettings, setUpdatingSettings] = useState(false);
  const toast = useRef<Toast>(null);

  const phaseLabels = {
    phase1: { name: 'Фаза 1: Консервативная', description: '5 сделок/день, minConfidence 0.8', color: 'info' },
    phase2: { name: 'Фаза 2: Умеренная', description: '10 сделок/день, minConfidence 0.75', color: 'warning' },
    phase3: { name: 'Фаза 3: Активная', description: '15 сделок/день, minConfidence 0.7', color: 'success' }
  };

  const loadStatus = async () => {
    try {
      setLoading(true);
      const data = await apiService.getStatus();
      setStatus(data);
    } catch (error: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: `Не удалось загрузить статус: ${error.message}`,
        life: 5000
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // Обновляем статус каждые 30 секунд
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async () => {
    if (!status) return;

    const action = status.isEnabled ? 'выключить' : 'включить';
    
    confirmDialog({
      message: `Вы уверены, что хотите ${action} автоматическую торговлю?`,
      header: 'Подтверждение',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          setToggling(true);
          if (status.isEnabled) {
            await apiService.disable();
            toast.current?.show({
              severity: 'success',
              summary: 'Успешно',
              detail: 'Автоматическая торговля выключена',
              life: 3000
            });
          } else {
            await apiService.enable();
            toast.current?.show({
              severity: 'success',
              summary: 'Успешно',
              detail: 'Автоматическая торговля включена',
              life: 3000
            });
          }
          await loadStatus();
        } catch (error: any) {
          toast.current?.show({
            severity: 'error',
            summary: 'Ошибка',
            detail: `Не удалось ${action}: ${error.message}`,
            life: 5000
          });
        } finally {
          setToggling(false);
        }
      }
    });
  };

  const handleAdvancePhase = async () => {
    if (!status) return;

    const currentPhase = status.currentPhase;
    const nextPhase = currentPhase === 'phase1' ? 'phase2' : currentPhase === 'phase2' ? 'phase3' : 'phase3';
    
    confirmDialog({
      message: `Вы уверены, что хотите перейти с ${phaseLabels[currentPhase].name} на ${phaseLabels[nextPhase].name}?`,
      header: 'Подтверждение перехода фазы',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          setUpdatingSettings(true);
          await apiService.advancePhase();
          toast.current?.show({
            severity: 'success',
            summary: 'Успешно',
            detail: `Переход на ${phaseLabels[nextPhase].name} выполнен`,
            life: 3000
          });
          await loadStatus();
        } catch (error: any) {
          toast.current?.show({
            severity: 'error',
            summary: 'Ошибка',
            detail: `Не удалось перейти на следующую фазу: ${error.message}`,
            life: 5000
          });
        } finally {
          setUpdatingSettings(false);
        }
      }
    });
  };

  if (!status) {
    return (
      <Card header="Автоматическая торговля" className={className}>
        <div className="auto-paper-trading-section-loading">
          <p>Загрузка...</p>
        </div>
      </Card>
    );
  }

  const phaseInfo = phaseLabels[status.currentPhase];
  const dailyTradesProgress = status.settings.maxDailyTrades > 0 
    ? (status.stats.dailyTrades / status.settings.maxDailyTrades) * 100 
    : 0;

  return (
    <div className={`auto-paper-trading-section ${className}`}>
      <Toast ref={toast} />
      <ConfirmDialog />

      <Card header="🤖 Автоматическая торговля">
        {/* Статус */}
        <div className="auto-paper-trading-section-status">
          <div className="auto-paper-trading-section-status-row">
            <span className="auto-paper-trading-section-status-label">Статус:</span>
            <Badge variant={status.isEnabled ? 'success' : 'neutral'}>
              {status.isEnabled ? '✅ Включена' : '⏸️ Выключена'}
            </Badge>
          </div>
          
          <div className="auto-paper-trading-section-status-row">
            <span className="auto-paper-trading-section-status-label">Фаза:</span>
            <Badge variant={phaseInfo.color as any}>
              {phaseInfo.name}
            </Badge>
          </div>
        </div>

        {/* Описание фазы */}
        <div className="auto-paper-trading-section-phase-info">
          <p className="auto-paper-trading-section-phase-description">
            {phaseInfo.description}
          </p>
        </div>

        {/* Статистика */}
        <div className="auto-paper-trading-section-stats">
          <div className="auto-paper-trading-section-stats-grid">
            <div className="auto-paper-trading-section-stat-item">
              <span className="auto-paper-trading-section-stat-label">Сделок сегодня:</span>
              <span className="auto-paper-trading-section-stat-value">
                {status.stats.dailyTrades} / {status.settings.maxDailyTrades}
              </span>
            </div>
            <div className="auto-paper-trading-section-stat-item">
              <span className="auto-paper-trading-section-stat-label">PnL сегодня:</span>
              <span className={`auto-paper-trading-section-stat-value ${status.stats.dailyPnL >= 0 ? 'positive' : 'negative'}`}>
                {status.stats.dailyPnL >= 0 ? '+' : ''}{status.stats.dailyPnL.toFixed(2)} ₽
              </span>
            </div>
            <div className="auto-paper-trading-section-stat-item">
              <span className="auto-paper-trading-section-stat-label">Всего сделок:</span>
              <span className="auto-paper-trading-section-stat-value">
                {status.stats.totalTrades}
              </span>
            </div>
          </div>

          {/* Прогресс дневных сделок */}
          <div className="auto-paper-trading-section-progress">
            <div className="auto-paper-trading-section-progress-header">
              <span>Использовано дневных сделок</span>
              <span>{status.stats.dailyTrades} / {status.settings.maxDailyTrades}</span>
            </div>
            <ProgressBar 
              value={dailyTradesProgress} 
              variant={dailyTradesProgress >= 80 ? 'error' : dailyTradesProgress >= 60 ? 'warning' : 'success'}
            />
          </div>
        </div>

        {/* Настройки */}
        <div className="auto-paper-trading-section-settings">
          <h4>Текущие настройки</h4>
          <div className="auto-paper-trading-section-settings-grid">
            <div className="auto-paper-trading-section-setting-item">
              <span className="auto-paper-trading-section-setting-label">Min Confidence:</span>
              <span className="auto-paper-trading-section-setting-value">
                {(status.settings.minConfidence * 100).toFixed(0)}%
              </span>
            </div>
            <div className="auto-paper-trading-section-setting-item">
              <span className="auto-paper-trading-section-setting-label">Max Position Size:</span>
              <span className="auto-paper-trading-section-setting-value">
                {(status.settings.maxPositionSize * 100).toFixed(1)}%
              </span>
            </div>
            <div className="auto-paper-trading-section-setting-item">
              <span className="auto-paper-trading-section-setting-label">Max Daily Loss:</span>
              <span className="auto-paper-trading-section-setting-value">
                {(status.settings.maxDailyLoss * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Действия */}
        <div className="auto-paper-trading-section-actions">
          <Button
            icon={status.isEnabled ? <i className="pi pi-pause"></i> : <i className="pi pi-play"></i>}
            onClick={handleToggle}
            loading={toggling}
            variant={status.isEnabled ? 'secondary' : 'success'}
            fullWidth
          >
            {status.isEnabled ? 'Выключить автоматическую торговлю' : 'Включить автоматическую торговлю'}
          </Button>

          {status.currentPhase !== 'phase3' && (
            <Button
              icon={<i className="pi pi-arrow-right"></i>}
              onClick={handleAdvancePhase}
              loading={updatingSettings}
              variant="ghost"
              fullWidth
              disabled={!status.isEnabled}
            >
              Перейти на следующую фазу
            </Button>
          )}

          <Button
            icon={<i className="pi pi-refresh"></i>}
            onClick={loadStatus}
            loading={loading}
            variant="ghost"
            fullWidth
          >
            Обновить статус
          </Button>
        </div>

        {/* Предупреждения */}
        {status.isEnabled && status.stats.dailyTrades >= status.settings.maxDailyTrades * 0.8 && (
          <Alert variant="warning" className="auto-paper-trading-section-alert">
            Приближается лимит дневных сделок ({status.stats.dailyTrades} / {status.settings.maxDailyTrades})
          </Alert>
        )}

        {status.isEnabled && status.stats.dailyPnL < -status.settings.maxDailyLoss * 0.8 && (
          <Alert variant="error" className="auto-paper-trading-section-alert">
            Приближается лимит дневного убытка (текущий PnL: {status.stats.dailyPnL.toFixed(2)} ₽)
          </Alert>
        )}

        {!status.isInitialized && (
          <Alert variant="error" className="auto-paper-trading-section-alert">
            Сервис автоматической торговли не инициализирован
          </Alert>
        )}
      </Card>
    </div>
  );
};

export default AutoPaperTradingSection;

