/**
 * Компонент синхронизации портфеля со стратегиями
 * Фаза 1, задача 1.2: Синхронизация портфеля
 */

import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button/Button';
import { Card } from '../ui/Card/Card';
import { Alert } from '../ui/Alert/Alert';
import { Badge } from '../ui/Badge/Badge';
import { InputNumber } from '../ui/InputNumber/InputNumber';
import { DataTable } from '../ui/Table/DataTable';
import { Divider } from '../ui/Divider/Divider';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { InfoTooltip } from '../ui/InfoTooltip/InfoTooltip';
import { ProgressBar } from '../ui/ProgressBar/ProgressBar';
import { Toast } from 'primereact/toast';
import { apiService } from '../../services/apiService';
import './PortfolioSync.css';

interface SyncResult {
  success: boolean;
  matched: number;
  created: number;
  updated: number;
  unmatchedBuys: Array<{ figi: string; quantity: number }>;
  unmatchedSells: Array<{ figi: string; beforeQuantity: number; afterQuantity: number }>;
  unmatchedClosed: Array<{ figi: string; beforeQuantity: number }>;
  requestsWithoutPosition: Array<{ requestId: string; figi: string; ticker: string; quantity: number }>;
  sellRequestsWithoutPosition: Array<{ requestId: string; figi: string; ticker: string; quantity: number }>;
  errors: string[];
  warnings: string[];
  duration?: number;
  timestamp?: string;
}

interface SyncStatus {
  lastSync: string | null;
  positionsMatched: number;
  positionsUnmatched: number;
  details?: SyncResult;
}

interface Mismatches {
  positionsWithoutStrategy: Array<{ figi: string; quantity: number }>;
  requestsWithoutPosition: Array<{ requestId: string; figi: string; ticker: string; quantity: number; approvedAt?: string }>;
}

const PortfolioSync: React.FC = () => {
  const [syncing, setSyncing] = useState(false);
  const [syncingRealPortfolio, setSyncingRealPortfolio] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [mismatches, setMismatches] = useState<Mismatches | null>(null);
  const [loadingMismatches, setLoadingMismatches] = useState(false);
  const [maxLookbackHours, setMaxLookbackHours] = useState(48);
  const toast = React.useRef<Toast>(null);

  useEffect(() => {
    loadSyncStatus();
    loadMismatches();
  }, []);

  const loadSyncStatus = async () => {
    try {
      const response = await apiService.getPortfolioSyncStatus();
      setSyncStatus(response.data || response);
    } catch (error: any) {
      console.error('Error loading sync status:', error);
    }
  };

  const loadMismatches = async () => {
    try {
      setLoadingMismatches(true);
      const response = await apiService.getPortfolioMismatches();
      setMismatches(response.data || response);
    } catch (error: any) {
      console.error('Error loading mismatches:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить несоответствия',
        life: 3000
      });
    } finally {
      setLoadingMismatches(false);
    }
  };

  const handleSyncRealPortfolio = async () => {
    try {
      setSyncingRealPortfolio(true);
      
      toast.current?.show({
        severity: 'info',
        summary: 'Обновление портфеля',
        detail: 'Загрузка данных из Tinkoff API...',
        life: 2000
      });

      await apiService.syncRealPortfolio();
      
      toast.current?.show({
        severity: 'success',
        summary: 'Портфель обновлен',
        detail: 'Данные из Tinkoff API успешно загружены',
        life: 3000
      });

      // После обновления реального портфеля можно запустить синхронизацию со стратегиями
      // Но не делаем это автоматически, чтобы пользователь мог контролировать процесс

    } catch (error: any) {
      console.error('Error syncing real portfolio:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка обновления портфеля',
        detail: error.response?.data?.message || error.message || 'Не удалось обновить портфель из Tinkoff API',
        life: 5000
      });
    } finally {
      setSyncingRealPortfolio(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setSyncResult(null);
      
      toast.current?.show({
        severity: 'info',
        summary: 'Синхронизация',
        detail: 'Запуск синхронизации портфеля со стратегиями...',
        life: 2000
      });

      const response = await apiService.syncPortfolioWithStrategies({
        maxLookbackHours,
        silent: false,
        createMissingPositions: false
      });

      const result = response.data || response;
      setSyncResult(result);

      if (result.success) {
        toast.current?.show({
          severity: 'success',
          summary: 'Синхронизация завершена',
          detail: `Сопоставлено: ${result.matched}, создано: ${result.created}, обновлено: ${result.updated}`,
          life: 5000
        });
      } else {
        toast.current?.show({
          severity: 'warn',
          summary: 'Синхронизация завершена с предупреждениями',
          detail: result.errors?.join(', ') || 'Обнаружены несоответствия',
          life: 5000
        });
      }

      // Обновляем статус и несоответствия
      await loadSyncStatus();
      await loadMismatches();

    } catch (error: any) {
      console.error('Error syncing portfolio:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка синхронизации',
        detail: error.response?.data?.message || error.message || 'Не удалось синхронизировать портфель',
        life: 5000
      });
    } finally {
      setSyncing(false);
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Никогда';
    try {
      return new Date(dateString).toLocaleString('ru-RU');
    } catch {
      return dateString;
    }
  };

  return (
    <div className="portfolio-sync">
      <Toast ref={toast} />
      
      <Card variant="default" className="portfolio-sync-card">
        <div className="portfolio-sync-header">
          <h2 className="portfolio-sync-title">
            <i className="pi pi-sync"></i> Синхронизация портфеля со стратегиями
          </h2>
          <p className="portfolio-sync-description">
            Сопоставляет позиции из реального портфеля с одобренными торговыми заявками
            и создает связи между позициями и стратегиями.
          </p>
        </div>

        <div className="portfolio-sync-actions">
          <div className="portfolio-sync-action-group">
            <div className="portfolio-sync-action-label">Обновление данных</div>
            <Button
              onClick={handleSyncRealPortfolio}
              disabled={syncingRealPortfolio}
              loading={syncingRealPortfolio}
              variant="secondary"
              icon={<i className="pi pi-download"></i>}
              fullWidth
              size="sm"
            >
              {syncingRealPortfolio ? 'Обновление...' : 'Обновить реальный портфель'}
            </Button>
            <p className="portfolio-sync-action-hint">
              Загружает актуальные данные из Tinkoff API
            </p>
          </div>

          <div className="portfolio-sync-action-group">
            <div className="portfolio-sync-action-label">Синхронизация со стратегиями</div>
            <div className="portfolio-sync-controls">
              <div className="sync-input-group">
                <InputNumber
                  id="lookback-hours"
                  label="Период поиска (ч)"
                  value={maxLookbackHours}
                  onValueChange={(e) => setMaxLookbackHours(e.value || 48)}
                  min={1}
                  max={168}
                  step={1}
                  disabled={syncing}
                  showButtons={true}
                  buttonLayout="horizontal"
                  size="sm"
                  fullWidth
                />
              </div>
              
              <Button
                onClick={handleSync}
                disabled={syncing}
                loading={syncing}
                variant="primary"
                icon={<i className="pi pi-sync"></i>}
                fullWidth
                size="sm"
              >
                {syncing ? 'Синхронизация...' : 'Синхронизировать'}
              </Button>
            </div>
            <p className="portfolio-sync-action-hint">
              <InfoTooltip explanation="Сопоставляет позиции с одобренными заявками и создает связи со стратегиями">
                <i className="pi pi-info-circle"></i>
              </InfoTooltip>
              {' '}Сопоставляет позиции с одобренными заявками
            </p>
          </div>
        </div>

        {(syncStatus || mismatches) && (
          <>
            <Divider spacing="md" />
            <div className="sync-info-grid">
              {syncStatus && (
                <div className="sync-status-section">
                  <h3 className="sync-section-title">
                    <i className="pi pi-chart-bar"></i> Статус последней синхронизации
                  </h3>
                  <div className="sync-status-info">
                    <div className="status-item">
                      <span className="status-label">Последняя синхронизация:</span>
                      <span className="status-value">{formatDate(syncStatus.lastSync)}</span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">Сопоставлено позиций:</span>
                      <Badge variant="success" size="sm" icon={<i className="pi pi-check"></i>}>
                        {syncStatus.positionsMatched}
                      </Badge>
                    </div>
                    <div className="status-item">
                      <span className="status-label">Несоответствий:</span>
                      <Badge 
                        variant={syncStatus.positionsUnmatched > 0 ? 'warning' : 'success'} 
                        size="sm"
                        icon={syncStatus.positionsUnmatched > 0 ? <i className="pi pi-exclamation-triangle"></i> : <i className="pi pi-check"></i>}
                      >
                        {syncStatus.positionsUnmatched}
                      </Badge>
                    </div>
                    {syncStatus.positionsMatched > 0 && (
                      <div className="status-item">
                        <span className="status-label">Процент сопоставления:</span>
                        <ProgressBar
                          value={(syncStatus.positionsMatched / (syncStatus.positionsMatched + syncStatus.positionsUnmatched)) * 100}
                          variant={syncStatus.positionsUnmatched > 0 ? 'warning' : 'success'}
                          showLabel={true}
                          size="sm"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {loadingMismatches ? (
                <div className="mismatches-section">
                  <Skeleton variant="rectangular" size="lg" />
                  <Skeleton variant="text" size="md" />
                  <Skeleton variant="text" size="md" />
                </div>
              ) : mismatches && (
                <div className="mismatches-section">
                  <div className="mismatches-header">
                    <h3 className="sync-section-title">
                      <i className="pi pi-exclamation-triangle"></i> Текущие несоответствия
                    </h3>
                    <Button
                      onClick={loadMismatches}
                      disabled={loadingMismatches}
                      variant="secondary"
                      size="sm"
                      icon={<i className="pi pi-refresh"></i>}
                    >
                      {loadingMismatches ? 'Загрузка...' : 'Обновить'}
                    </Button>
                  </div>

                  {mismatches.positionsWithoutStrategy.length > 0 && (
                    <>
                      <Alert variant="warning" className="mismatch-alert">
                        <strong>Позиции без стратегии ({mismatches.positionsWithoutStrategy.length}):</strong>
                      </Alert>
                      <DataTable
                        data={mismatches.positionsWithoutStrategy}
                        columns={[
                          { key: 'figi', header: 'FIGI', render: (item) => item.figi || 'N/A' },
                          { key: 'quantity', header: 'Количество', render: (item) => (item.quantity != null ? item.quantity.toLocaleString() : 'N/A') }
                        ]}
                        paginator={mismatches.positionsWithoutStrategy.length > 10}
                        rows={10}
                        emptyMessage="Нет данных"
                        size="sm"
                      />
                    </>
                  )}

                  {mismatches.requestsWithoutPosition.length > 0 && (
                    <>
                      <Alert variant="info" className="mismatch-alert">
                        <strong>Заявки без позиций ({mismatches.requestsWithoutPosition.length}):</strong>
                      </Alert>
                      <DataTable
                        data={mismatches.requestsWithoutPosition}
                        columns={[
                          { key: 'ticker', header: 'Тикер', render: (item) => item.ticker || 'N/A' },
                          { key: 'figi', header: 'FIGI', render: (item) => item.figi || 'N/A' },
                          { key: 'quantity', header: 'Количество', render: (item) => (item.quantity != null ? item.quantity.toLocaleString() : 'N/A') },
                          { 
                            key: 'approvedAt', 
                            header: 'Одобрена', 
                            render: (item) => item.approvedAt ? formatDate(item.approvedAt) : 'N/A'
                          }
                        ]}
                        paginator={mismatches.requestsWithoutPosition.length > 10}
                        rows={10}
                        emptyMessage="Нет данных"
                        size="sm"
                      />
                    </>
                  )}

                  {mismatches.positionsWithoutStrategy.length === 0 &&
                    mismatches.requestsWithoutPosition.length === 0 && (
                    <Alert variant="success">
                      <i className="pi pi-check-circle"></i> Все позиции сопоставлены со стратегиями
                    </Alert>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {syncResult && (
          <>
            <Divider spacing="md" />
            <div className="sync-result-section">
              <h3 className="sync-section-title">
                <i className="pi pi-chart-line"></i> Результаты синхронизации
              </h3>
            
            {syncResult.success ? (
              <Alert variant="success" className="sync-result-alert">
                <strong>Синхронизация успешно завершена</strong>
                <div className="sync-result-stats">
                  <div>Сопоставлено: <strong>{syncResult.matched}</strong></div>
                  <div>Создано стратегий: <strong>{syncResult.created}</strong></div>
                  <div>Обновлено: <strong>{syncResult.updated}</strong></div>
                  {syncResult.duration && (
                    <div>Время выполнения: <strong>{formatDuration(syncResult.duration)}</strong></div>
                  )}
                </div>
              </Alert>
            ) : (
              <Alert variant="error" className="sync-result-alert">
                <strong>Синхронизация завершена с ошибками</strong>
                {syncResult.errors && syncResult.errors.length > 0 && (
                  <ul>
                    {syncResult.errors.map((error, idx) => (
                      <li key={idx}>{error}</li>
                    ))}
                  </ul>
                )}
              </Alert>
            )}

            {(syncResult.unmatchedBuys?.length > 0 ||
              syncResult.unmatchedSells?.length > 0 ||
              syncResult.unmatchedClosed?.length > 0 ||
              syncResult.requestsWithoutPosition?.length > 0 ||
              syncResult.sellRequestsWithoutPosition?.length > 0) && (
              <div className="sync-mismatches">
                <Divider spacing="md" />
                <h4>Несоответствия:</h4>
                
                {syncResult.unmatchedBuys.length > 0 && (
                  <div className="mismatch-group">
                    <Alert variant="warning" className="mismatch-alert">
                      <strong>Позиции без BUY заявок ({syncResult.unmatchedBuys.length}):</strong>
                    </Alert>
                    <DataTable
                      data={syncResult.unmatchedBuys}
                      columns={[
                        { key: 'figi', header: 'FIGI', render: (item) => item.figi || 'N/A' },
                        { key: 'quantity', header: 'Количество', render: (item) => (item.quantity != null ? item.quantity.toLocaleString() : 'N/A') }
                      ]}
                      paginator={syncResult.unmatchedBuys.length > 5}
                      rows={5}
                      emptyMessage="Нет данных"
                      size="sm"
                    />
                  </div>
                )}

                {syncResult.requestsWithoutPosition.length > 0 && (
                  <div className="mismatch-group">
                    <Alert variant="info" className="mismatch-alert">
                      <strong>BUY заявки без позиций ({syncResult.requestsWithoutPosition.length}):</strong>
                    </Alert>
                    <DataTable
                      data={syncResult.requestsWithoutPosition}
                      columns={[
                        { key: 'ticker', header: 'Тикер', render: (item) => item.ticker || 'N/A' },
                        { key: 'figi', header: 'FIGI', render: (item) => item.figi || 'N/A' },
                        { key: 'quantity', header: 'Количество', render: (item) => (item.quantity != null ? item.quantity.toLocaleString() : 'N/A') }
                      ]}
                      paginator={syncResult.requestsWithoutPosition.length > 5}
                      rows={5}
                      emptyMessage="Нет данных"
                      size="sm"
                    />
                  </div>
                )}

                {syncResult.warnings && syncResult.warnings.length > 0 && (
                  <div className="mismatch-group">
                    <Alert variant="warning" className="mismatch-alert">
                      <strong>Предупреждения:</strong>
                      <ul>
                        {syncResult.warnings.map((warning, idx) => (
                          <li key={idx}>{warning}</li>
                        ))}
                      </ul>
                    </Alert>
                  </div>
                )}
              </div>
            )}
          </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default PortfolioSync;

