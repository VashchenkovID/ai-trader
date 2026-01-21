/**
 * Компонент синхронизации портфеля со стратегиями
 * Фаза 1, задача 1.2: Синхронизация портфеля
 */

import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button/Button';
import { Card } from '../ui/Card/Card';
import { Alert } from '../ui/Alert/Alert';
import { Badge } from '../ui/Badge/Badge';
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

  const handleSync = async () => {
    try {
      setSyncing(true);
      setSyncResult(null);
      
      toast.current?.show({
        severity: 'info',
        summary: 'Синхронизация',
        detail: 'Запуск синхронизации портфеля...',
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
      
      <Card className="portfolio-sync-card">
        <div className="portfolio-sync-header">
          <h2>Синхронизация портфеля со стратегиями</h2>
          <p className="portfolio-sync-description">
            Сопоставляет позиции из реального портфеля с одобренными торговыми заявками
            и создает связи между позициями и стратегиями.
          </p>
        </div>

        <div className="portfolio-sync-controls">
          <div className="sync-input-group">
            <label htmlFor="lookback-hours">
              Период поиска заявок (часов):
            </label>
            <input
              id="lookback-hours"
              type="number"
              min="1"
              max="168"
              value={maxLookbackHours}
              onChange={(e) => setMaxLookbackHours(parseInt(e.target.value) || 48)}
              disabled={syncing}
            />
          </div>
          
          <Button
            onClick={handleSync}
            disabled={syncing}
            loading={syncing}
            variant="primary"
          >
            {syncing ? 'Синхронизация...' : 'Синхронизировать портфель'}
          </Button>
        </div>

        {syncStatus && (
          <div className="sync-status-section">
            <h3>Статус последней синхронизации</h3>
            <div className="sync-status-info">
              <div className="status-item">
                <span className="status-label">Последняя синхронизация:</span>
                <span className="status-value">{formatDate(syncStatus.lastSync)}</span>
              </div>
              <div className="status-item">
                <span className="status-label">Сопоставлено позиций:</span>
                <Badge variant="success">{syncStatus.positionsMatched}</Badge>
              </div>
              <div className="status-item">
                <span className="status-label">Несоответствий:</span>
                <Badge variant={syncStatus.positionsUnmatched > 0 ? 'warning' : 'success'}>
                  {syncStatus.positionsUnmatched}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {syncResult && (
          <div className="sync-result-section">
            <h3>Результаты синхронизации</h3>
            
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
                <h4>Несоответствия:</h4>
                
                {syncResult.unmatchedBuys.length > 0 && (
                  <div className="mismatch-group">
                    <strong>Позиции без BUY заявок ({syncResult.unmatchedBuys.length}):</strong>
                    <ul>
                      {syncResult.unmatchedBuys.slice(0, 5).map((item, idx) => (
                        <li key={idx}>FIGI: {item.figi}, количество: {item.quantity}</li>
                      ))}
                      {syncResult.unmatchedBuys.length > 5 && (
                        <li>... и еще {syncResult.unmatchedBuys.length - 5}</li>
                      )}
                    </ul>
                  </div>
                )}

                {syncResult.requestsWithoutPosition.length > 0 && (
                  <div className="mismatch-group">
                    <strong>BUY заявки без позиций ({syncResult.requestsWithoutPosition.length}):</strong>
                    <ul>
                      {syncResult.requestsWithoutPosition.slice(0, 5).map((item, idx) => (
                        <li key={idx}>
                          {item.ticker} ({item.figi}) - {item.quantity} шт.
                        </li>
                      ))}
                      {syncResult.requestsWithoutPosition.length > 5 && (
                        <li>... и еще {syncResult.requestsWithoutPosition.length - 5}</li>
                      )}
                    </ul>
                  </div>
                )}

                {syncResult.warnings && syncResult.warnings.length > 0 && (
                  <div className="mismatch-group">
                    <strong>Предупреждения:</strong>
                    <ul>
                      {syncResult.warnings.map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {mismatches && (
          <div className="mismatches-section">
            <div className="mismatches-header">
              <h3>Текущие несоответствия</h3>
              <Button
                onClick={loadMismatches}
                disabled={loadingMismatches}
                variant="secondary"
              >
                {loadingMismatches ? 'Загрузка...' : 'Обновить'}
              </Button>
            </div>

            {mismatches.positionsWithoutStrategy.length > 0 && (
              <Alert variant="warning" className="mismatch-alert">
                <strong>Позиции без стратегии ({mismatches.positionsWithoutStrategy.length}):</strong>
                <ul>
                  {mismatches.positionsWithoutStrategy.slice(0, 10).map((item, idx) => (
                    <li key={idx}>
                      FIGI: {item.figi}, количество: {item.quantity}
                    </li>
                  ))}
                  {mismatches.positionsWithoutStrategy.length > 10 && (
                    <li>... и еще {mismatches.positionsWithoutStrategy.length - 10}</li>
                  )}
                </ul>
              </Alert>
            )}

            {mismatches.requestsWithoutPosition.length > 0 && (
              <Alert variant="info" className="mismatch-alert">
                <strong>Заявки без позиций ({mismatches.requestsWithoutPosition.length}):</strong>
                <ul>
                  {mismatches.requestsWithoutPosition.slice(0, 10).map((item, idx) => (
                    <li key={idx}>
                      {item.ticker} ({item.figi}) - {item.quantity} шт.
                      {item.approvedAt && (
                        <span className="mismatch-date">
                          {' '}одобрена: {formatDate(item.approvedAt)}
                        </span>
                      )}
                    </li>
                  ))}
                  {mismatches.requestsWithoutPosition.length > 10 && (
                    <li>... и еще {mismatches.requestsWithoutPosition.length - 10}</li>
                  )}
                </ul>
              </Alert>
            )}

            {mismatches.positionsWithoutStrategy.length === 0 &&
              mismatches.requestsWithoutPosition.length === 0 && (
              <Alert variant="success">
                Все позиции сопоставлены со стратегиями
              </Alert>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default PortfolioSync;

