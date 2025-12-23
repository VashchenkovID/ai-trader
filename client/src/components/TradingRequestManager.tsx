import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../components/ui/Card/Card';
import { Button } from '../components/ui/Button/Button';
import { Badge } from '../components/ui/Badge/Badge';
import { Modal } from '../components/ui/Modal/Modal';
import { Input } from '../components/ui/Input/Input';
import { Toast } from 'primereact/toast';
import { ConfirmDialog, confirmDialog } from '../components/ui/ConfirmDialog/ConfirmDialog';
import { TabView, TabPanel } from '../components/ui/TabView/TabView';
import { Skeleton } from '../components/ui/Skeleton/Skeleton';
import { Alert } from '../components/ui/Alert/Alert';
import { Toolbar } from '../components/ui/Toolbar/Toolbar';
import { SplitButton } from '../components/ui/SplitButton/SplitButton';
import { Select } from '../components/ui/Select/Select';
import { DataTable, DataTableColumn } from '../components/ui/Table/DataTable';
import { apiService } from '../services/apiService';
import { translateRecommendation } from '../utils/recommendationTranslator';

interface TradingRequest {
  id: string;
  figi: string;
  ticker: string;
  name: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  priceAtRequest: number;
  estimatedAmount: number;
  confidence: number;
  score: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'CANCELLED' | 'EXPIRED';
  reasoning: string;
  createdAt: string;
  expiresAt: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  tradingMode: 'paper' | 'micro' | 'real';
  userComment?: string;
  rejectionReason?: string;
  actualPrice?: number;
  commission?: number;
  // Статистика инструмента (загружается отдельно)
  instrumentStats?: {
    winRate: number;
    kellyFraction: number | null;
    totalTrades: number;
  };
}

const TradingRequestManager: React.FC = () => {
  const [requests, setRequests] = useState<TradingRequest[]>([]);
  const [selectedRequests, setSelectedRequests] = useState<TradingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedMode, setSelectedMode] = useState<string>('all');
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [currentRequest, setCurrentRequest] = useState<TradingRequest | null>(null);
  const [comment, setComment] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [stats, setStats] = useState<any>(null);
  const [cleanupStats, setCleanupStats] = useState<any>(null);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [cleanupOlderThanDays, setCleanupOlderThanDays] = useState<number | null>(null);
  const [cleaningUp, setCleaningUp] = useState(false);
  const toast = React.useRef<Toast>(null);

  // Фильтр по направлению сделки (BUY/SELL)
  const [actionFilter, setActionFilter] = useState<'all' | 'BUY' | 'SELL'>('all');

  const modeOptions = [
    { label: 'Все режимы', value: 'all' },
    { label: 'Paper Trading', value: 'paper' },
    { label: 'Micro Trading', value: 'micro' },
    { label: 'Real Trading', value: 'real' }
  ];

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Обновляем каждые 30 секунд
    return () => clearInterval(interval);
  }, [activeTab, selectedMode]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const tradingMode = selectedMode === 'all' ? undefined : selectedMode;
      
      let requestsData;
      switch (activeTab) {
        case 0: // Все заявки
          requestsData = await apiService.getTradingRequests(undefined, 50, tradingMode);
          break;
        case 1: // Ожидающие
          requestsData = await apiService.getTradingRequests('PENDING', 50, tradingMode);
          break;
        case 2: // Одобренные
          requestsData = await apiService.getTradingRequests('APPROVED', 50, tradingMode);
          break;
        default:
          requestsData = await apiService.getTradingRequests(undefined, 50, tradingMode);
      }
      
      // Обрабатываем ответ - может быть массив или объект с data
      const requests = Array.isArray(requestsData) ? requestsData : (requestsData?.data || []);
      
      // Загружаем статистику по инструментам для каждой заявки
      // Оптимизация: получаем уникальные FIGI и загружаем статистику для них
      const uniqueFigis = [...new Set(requests.map((req: TradingRequest) => req.figi))];
      const statsMap = new Map<string, any>();
      
      // Загружаем статистику для всех уникальных инструментов параллельно
      await Promise.allSettled(
        uniqueFigis.map(async (figi) => {
          try {
            const statResult = await apiService.getInstrumentStat(figi);
            if (statResult.success && statResult.data) {
              statsMap.set(figi, {
                winRate: statResult.data.winRate,
                kellyFraction: statResult.data.kellyFraction,
                totalTrades: statResult.data.totalTrades
              });
            }
          } catch (error) {
            // Игнорируем ошибки загрузки статистики
            console.warn(`Не удалось загрузить статистику для ${figi}:`, error);
          }
        })
      );
      
      // Добавляем статистику к каждой заявке
      const requestsWithStats = requests.map((req: TradingRequest) => ({
        ...req,
        instrumentStats: statsMap.get(req.figi)
      }));
      
      setRequests(requestsWithStats);
      
      // Загружаем статистику (опционально, если метод существует)
      try {
        const statsData = await apiService.getTradingRequestStats?.(tradingMode);
        setStats(statsData);
        
        // Загружаем статистику по всем режимам (опционально)
        try {
          const statsByModeData = await apiService.getTradingRequestStatsByMode?.();
          if (statsByModeData) {
            // Можно использовать для отображения статистики по режимам
            console.log('Stats by mode:', statsByModeData);
          }
        } catch (error) {
          console.warn('Stats by mode not available:', error);
        }
      } catch (error) {
        console.warn('Stats not available:', error);
      }
      
    } catch (error) {
      console.error('Error loading trading requests:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить торговые заявки'
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      PENDING: { variant: 'warning' as const, label: 'Ожидает' },
      APPROVED: { variant: 'info' as const, label: 'Одобрена' },
      REJECTED: { variant: 'error' as const, label: 'Отклонена' },
      EXECUTED: { variant: 'success' as const, label: 'Исполнена' },
      CANCELLED: { variant: 'neutral' as const, label: 'Отменена' },
      EXPIRED: { variant: 'neutral' as const, label: 'Истекла' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || { variant: 'neutral' as const, label: status };
    return <Badge variant={config.variant} size="md">{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const priorityConfig = {
      LOW: { variant: 'neutral' as const, label: 'Низкий' },
      NORMAL: { variant: 'info' as const, label: 'Обычный' },
      HIGH: { variant: 'warning' as const, label: 'Высокий' },
      URGENT: { variant: 'error' as const, label: 'Срочный' }
    };
    
    const config = priorityConfig[priority as keyof typeof priorityConfig] || { variant: 'neutral' as const, label: priority };
    return <Badge variant={config.variant} size="sm">{config.label}</Badge>;
  };

  const getRiskBadge = (risk: string) => {
    const riskConfig = {
      LOW: { variant: 'success' as const, label: 'Низкий' },
      MEDIUM: { variant: 'warning' as const, label: 'Средний' },
      HIGH: { variant: 'error' as const, label: 'Высокий' }
    };
    
    const config = riskConfig[risk as keyof typeof riskConfig] || { variant: 'neutral' as const, label: risk };
    return <Badge variant={config.variant} size="sm">{config.label}</Badge>;
  };

  const getTradingModeBadge = (mode: string) => {
    const modeConfig = {
      paper: { variant: 'info' as const, label: 'Paper', icon: '📝' },
      micro: { variant: 'warning' as const, label: 'Micro', icon: '🔬' },
      real: { variant: 'error' as const, label: 'Real', icon: '💰' }
    };
    
    const config = modeConfig[mode as keyof typeof modeConfig] || { variant: 'neutral' as const, label: mode, icon: '❓' };
    return (
      <Badge variant={config.variant} size="sm">
        {config.icon} {config.label}
      </Badge>
    );
  };

  const getWinRateDisplay = (rowData: TradingRequest) => {
    const winRate = rowData.instrumentStats?.winRate;
    const totalTrades = rowData.instrumentStats?.totalTrades;
    
    if (winRate === undefined || winRate === null) {
      return <span style={{ color: 'var(--color-text-secondary)' }}>—</span>;
    }
    
    const winRatePercent = (winRate * 100).toFixed(1);
    
    // Определяем цвет в зависимости от Win Rate
    let variant: 'success' | 'warning' | 'error' | 'info' = 'info';
    if (winRate >= 0.6) {
      variant = 'success';
    } else if (winRate >= 0.5) {
      variant = 'warning';
    } else {
      variant = 'error';
    }
    
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Badge variant={variant} size="sm">{winRatePercent}%</Badge>
        {totalTrades !== undefined && totalTrades > 0 && (
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>({totalTrades})</span>
        )}
      </div>
    );
  };

  const getKellyDisplay = (rowData: TradingRequest) => {
    const kellyFraction = rowData.instrumentStats?.kellyFraction;
    
    if (kellyFraction === undefined || kellyFraction === null) {
      return <span style={{ color: 'var(--color-text-secondary)' }}>—</span>;
    }
    
    const kellyPercent = (kellyFraction * 100).toFixed(2);
    
    // Определяем цвет в зависимости от Kelly Fraction
    let variant: 'success' | 'warning' | 'error' | 'info' = 'info';
    if (kellyFraction >= 0.15) {
      variant = 'success';
    } else if (kellyFraction >= 0.05) {
      variant = 'warning';
    } else if (kellyFraction > 0) {
      variant = 'info';
    } else {
      variant = 'error';
    }
    
    return <Badge variant={variant} size="sm">{kellyPercent}%</Badge>;
  };

  // Функции сортировки для вложенных полей (PrimeReact не поддерживает dot notation)
  const winRateSortFunction = (rowData: TradingRequest) => {
    return rowData.instrumentStats?.winRate ?? -1; // -1 для сортировки null значений в конец
  };

  const kellySortFunction = (rowData: TradingRequest) => {
    return rowData.instrumentStats?.kellyFraction ?? -1; // -1 для сортировки null значений в конец
  };

  const handleApprove = (request: TradingRequest) => {
    setCurrentRequest(request);
    setComment('');
    setShowApprovalDialog(true);
  };

  const handleReject = (request: TradingRequest) => {
    setCurrentRequest(request);
    setRejectionReason('');
    setShowRejectionDialog(true);
  };

  const confirmApproval = async () => {
    if (!currentRequest) return;
    
    try {
      await apiService.approveTradingRequest(currentRequest.id, comment);
      toast.current?.show({
        severity: 'success',
        summary: 'Успешно',
        detail: `Заявка ${currentRequest.ticker} одобрена`
      });
      setShowApprovalDialog(false);
      loadData();
    } catch (error) {
      console.error('Error approving request:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось одобрить заявку'
      });
    }
  };

  const confirmRejection = async () => {
    if (!currentRequest || !rejectionReason.trim()) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Предупреждение',
        detail: 'Укажите причину отклонения'
      });
      return;
    }
    
    try {
      await apiService.rejectTradingRequest(currentRequest.id, rejectionReason);
      toast.current?.show({
        severity: 'info',
        summary: 'Заявка отклонена',
        detail: `Заявка ${currentRequest.ticker} отклонена`
      });
      setShowRejectionDialog(false);
      setRejectionReason('');
      setCurrentRequest(null);
      await loadData();
    } catch (error: any) {
      console.error('Error rejecting request:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Не удалось отклонить заявку';
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: errorMessage
      });
    }
  };


  const handleCancel = (request: TradingRequest) => {
    confirmDialog({
      message: `Отменить заявку ${request.action} ${request.ticker}?`,
      header: 'Подтверждение отмены',
      icon: 'pi pi-question-circle',
      accept: async () => {
        try {
          await apiService.cancelTradingRequest(request.id, 'Отменено пользователем');
          toast.current?.show({
            severity: 'info',
            summary: 'Отменено',
            detail: `Заявка ${request.ticker} отменена`
          });
          loadData();
        } catch (error) {
          console.error('Error cancelling request:', error);
          toast.current?.show({
            severity: 'error',
            summary: 'Ошибка',
            detail: 'Не удалось отменить заявку'
          });
        }
      }
    });
  };

  const handleBulkApprove = async () => {
    if (selectedRequests.length === 0) return;
    
    try {
      const requestIds = selectedRequests.map(r => r.id);
      await apiService.bulkApproveTradingRequests(requestIds, 'Массовое одобрение');
      toast.current?.show({
        severity: 'success',
        summary: 'Успешно',
        detail: `Одобрено ${selectedRequests.length} заявок`
      });
      setSelectedRequests([]);
      loadData();
    } catch (error) {
      console.error('Error bulk approving:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось одобрить заявки'
      });
    }
  };

  const handleBulkReject = async () => {
    if (selectedRequests.length === 0) return;
    
    confirmDialog({
      message: `Отклонить ${selectedRequests.length} заявок?`,
      header: 'Массовое отклонение',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          const requestIds = selectedRequests.map(r => r.id);
          await apiService.bulkRejectTradingRequests(requestIds, 'Массовое отклонение');
          toast.current?.show({
            severity: 'info',
            summary: 'Отклонено',
            detail: `Отклонено ${selectedRequests.length} заявок`
          });
          setSelectedRequests([]);
          loadData();
        } catch (error) {
          console.error('Error bulk rejecting:', error);
          toast.current?.show({
            severity: 'error',
            summary: 'Ошибка',
            detail: 'Не удалось отклонить заявки'
          });
        }
      }
    });
  };

  const actionBodyTemplate = (rowData: TradingRequest) => {
    const actions = [];
    
    if (rowData.status === 'PENDING') {
      actions.push({
        label: 'Одобрить',
        icon: 'pi pi-check',
        command: () => handleApprove(rowData)
      });
      actions.push({
        label: 'Отклонить',
        icon: 'pi pi-times',
        command: () => handleReject(rowData)
      });
      actions.push({
        label: 'Отменить',
        icon: 'pi pi-ban',
        command: () => handleCancel(rowData)
      });
    } else if (rowData.status === 'APPROVED') {
      // После одобрения заявка уже считается выполненной пользователем
      // Кнопка "Исполнить" больше не нужна
      actions.push({
        label: 'Отменить',
        icon: 'pi pi-ban',
        command: () => handleCancel(rowData)
      });
    }
    
    if (actions.length === 0) return null;
    
    return (
      <SplitButton
        label={actions[0].label}
        icon={actions[0].icon}
        onClick={actions[0].command}
        model={actions.slice(1)}
        size="sm"
      />
    );
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB'
    }).format(value);
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('ru-RU');
  };

  const loadCleanupStats = async () => {
    try {
      const tradingMode = selectedMode === 'all' ? undefined : selectedMode;
      const stats = await apiService.getCompletedRequestsStats(tradingMode);
      setCleanupStats(stats);
    } catch (error) {
      console.error('Error loading cleanup stats:', error);
    }
  };

  const handleCleanup = async () => {
    try {
      setCleaningUp(true);
      const tradingMode = selectedMode === 'all' ? undefined : selectedMode;
      const result = await apiService.cleanupCompletedRequests({
        olderThanDays: cleanupOlderThanDays || undefined,
        tradingMode
      });
      
      toast.current?.show({
        severity: 'success',
        summary: 'Очистка завершена',
        detail: `Удалено ${result.data?.deletedCount || 0} завершенных заявок`
      });
      
      setShowCleanupDialog(false);
      setCleanupOlderThanDays(null);
      await loadData();
      await loadCleanupStats();
    } catch (error: any) {
      console.error('Error cleaning up requests:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: error?.response?.data?.message || 'Не удалось очистить заявки'
      });
    } finally {
      setCleaningUp(false);
    }
  };

  const toolbarTemplate = () => {
    return (
      <>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            loading={loading}
            icon="pi pi-refresh"
          >
            Обновить
          </Button>
          
          <Select
            value={selectedMode}
            options={modeOptions}
            onChange={(value) => setSelectedMode(value)}
            placeholder="Выберите режим"
            style={{ minWidth: '150px' }}
          />

          <Select
            value={actionFilter}
            options={[
              { label: 'Все', value: 'all' },
              { label: translateRecommendation('BUY'), value: 'BUY' },
              { label: translateRecommendation('SELL'), value: 'SELL' }
            ]}
            onChange={(value) => setActionFilter(value as 'all' | 'BUY' | 'SELL')}
            placeholder="Действие"
            style={{ minWidth: '150px' }}
          />
          
          <Button
            variant="warning"
            size="sm"
            onClick={async () => {
              await loadCleanupStats();
              setShowCleanupDialog(true);
            }}
            icon="pi pi-trash"
          >
            Очистить завершенные
          </Button>
          
          {selectedRequests.length > 0 && (
            <>
              <Button
                variant="success"
                size="sm"
                onClick={handleBulkApprove}
                icon="pi pi-check"
              >
                Одобрить ({selectedRequests.length})
              </Button>
              <Button
                variant="error"
                size="sm"
                onClick={handleBulkReject}
                icon="pi pi-times"
              >
                Отклонить ({selectedRequests.length})
              </Button>
            </>
          )}
        </div>
        
        {stats && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <Badge variant="info" size="md">Всего: {stats.total}</Badge>
            <Badge variant="warning" size="md">Ожидают: {stats.pending}</Badge>
            <Badge variant="success" size="md">Исполнено: {stats.executed}</Badge>
          </div>
        )}
      </>
    );
  };

  if (loading && requests.length === 0) {
    return (
      <Card variant="default" className="h-full" header="🎯 Торговые заявки">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3, 4, 5].map((item) => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px' }}>
              <Skeleton variant="rectangular" width="48px" height="48px" />
              <div style={{ flex: 1 }}>
                <Skeleton variant="text" width="100%" height="16px" style={{ marginBottom: '8px' }} />
                <Skeleton variant="text" width="75%" height="12px" />
              </div>
              <Skeleton variant="rectangular" width="80px" height="32px" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  // Применяем фильтр по действию перед рендером
  const filteredRequests = requests.filter((r) => {
    if (actionFilter === 'all') return true;
    return r.action === actionFilter;
  });

  return (
    <div className="trading-request-manager">
      <Toast ref={toast} />
      <ConfirmDialog />
      
      <Card variant="default" className="h-full" header="🎯 Торговые заявки">
        <TabView activeIndex={activeTab} onTabChange={(e) => setActiveTab(e.index)}>
          <TabPanel header="Все заявки">
            <Toolbar start={toolbarTemplate()} className="mb-3" />
            
            {filteredRequests.length === 0 ? (
              <Alert variant="info" title="Нет торговых заявок" />
            ) : (
              <DataTable
                data={filteredRequests}
                columns={getTableColumns()}
                selection={selectedRequests}
                onSelectionChange={(selection) => setSelectedRequests(selection)}
                selectionMode="multiple"
                paginator
                rows={10}
                loading={loading}
                sortMode="multiple"
                removableSort
                size="sm"
                emptyMessage="Нет торговых заявок"
              />
            )}
          </TabPanel>
          
          <TabPanel header="Ожидающие">
            <Toolbar start={toolbarTemplate()} className="mb-3" />
            
            {filteredRequests.length === 0 ? (
              <Alert variant="info" title="Нет ожидающих заявок" />
            ) : (
              <DataTable
                data={filteredRequests}
                columns={getPendingTableColumns()}
                selection={selectedRequests}
                onSelectionChange={(selection) => setSelectedRequests(selection)}
                selectionMode="multiple"
                paginator
                rows={10}
                loading={loading}
                size="sm"
                emptyMessage="Нет ожидающих заявок"
              />
            )}
          </TabPanel>
          
          <TabPanel header="Одобренные">
            <Toolbar start={toolbarTemplate()} className="mb-3" />
            
            {filteredRequests.length === 0 ? (
              <Alert variant="info" title="Нет одобренных заявок" />
            ) : (
              <DataTable
                data={filteredRequests}
                columns={getApprovedTableColumns()}
                paginator
                rows={10}
                loading={loading}
                size="sm"
                emptyMessage="Нет одобренных заявок"
              />
            )}
          </TabPanel>
        </TabView>
      </Card>

      {/* Диалог одобрения */}
      <Modal
        isOpen={showApprovalDialog}
        onClose={() => setShowApprovalDialog(false)}
        title="Одобрение заявки"
        size="sm"
      >
        {currentRequest && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <strong>{currentRequest.action} {currentRequest.ticker}</strong>
              <div>Количество: {currentRequest.quantity}</div>
              <div>Сумма: {formatCurrency(currentRequest.estimatedAmount)}</div>
              <div>Уверенность: {(currentRequest.confidence * 100).toFixed(1)}%</div>
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <label htmlFor="comment" style={{ display: 'block', marginBottom: '8px' }}>Комментарий (необязательно)</label>
              <Input
                id="comment"
                type="textarea"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Добавьте комментарий к одобрению..."
                style={{ width: '100%' }}
              />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setShowApprovalDialog(false)}
                icon="pi pi-times"
              >
                Отмена
              </Button>
              <Button
                variant="success"
                size="md"
                onClick={confirmApproval}
                icon="pi pi-check"
              >
                Одобрить
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Диалог отклонения */}
      <Modal
        isOpen={showRejectionDialog}
        onClose={() => setShowRejectionDialog(false)}
        title="Отклонение заявки"
        size="sm"
      >
        {currentRequest && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <strong>{currentRequest.action} {currentRequest.ticker}</strong>
              <div>Количество: {currentRequest.quantity}</div>
              <div>Сумма: {formatCurrency(currentRequest.estimatedAmount)}</div>
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <label htmlFor="reason" style={{ display: 'block', marginBottom: '8px' }}>Причина отклонения *</label>
              <Input
                id="reason"
                type="textarea"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                placeholder="Укажите причину отклонения заявки..."
                required
                style={{ width: '100%' }}
              />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setShowRejectionDialog(false)}
                icon="pi pi-times"
              >
                Отмена
              </Button>
              <Button
                variant="error"
                size="md"
                onClick={confirmRejection}
                icon="pi pi-ban"
                disabled={!rejectionReason.trim()}
              >
                Отклонить
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Диалог очистки завершенных заявок */}
      <Modal
        isOpen={showCleanupDialog}
        onClose={() => {
          setShowCleanupDialog(false);
          setCleanupOlderThanDays(null);
        }}
        title="🧹 Очистка завершенных заявок"
        size="md"
      >
        <div>
          {cleanupStats && (
            <div style={{ marginBottom: '16px' }}>
              <Alert variant="info" title="Статистика завершенных заявок">
                <div>
                  <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '16px' }}>
                    <li>Всего: <strong>{cleanupStats.total}</strong></li>
                    <li>Одобренных: <strong>{cleanupStats.approved}</strong></li>
                    <li>Отклоненных: <strong>{cleanupStats.rejected}</strong></li>
                    {cleanupStats.oldestDate && (
                      <li>Самая старая: {new Date(cleanupStats.oldestDate).toLocaleDateString('ru-RU')}</li>
                    )}
                    {cleanupStats.newestDate && (
                      <li>Самая новая: {new Date(cleanupStats.newestDate).toLocaleDateString('ru-RU')}</li>
                    )}
                  </ul>
                </div>
              </Alert>
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="olderThanDays" style={{ display: 'block', marginBottom: '8px' }}>
              Удалять заявки старше (дней):
            </label>
            <Input
              id="olderThanDays"
              type="number"
              min="0"
              value={cleanupOlderThanDays || ''}
              onChange={(e) => setCleanupOlderThanDays(e.target.value ? parseInt(e.target.value) : null)}
              placeholder="Оставить пустым для удаления всех"
              style={{ width: '100%' }}
            />
            <small style={{ color: 'var(--color-text-secondary)', display: 'block', marginTop: '4px' }}>
              Оставьте пустым, чтобы удалить все завершенные заявки (одобренные и отклоненные)
            </small>
          </div>

          <Alert variant="warning" title="Внимание!">
            <div>
              Это действие нельзя отменить. Будут удалены все заявки со статусом:
              <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '16px' }}>
                <li>APPROVED (Одобренные)</li>
                <li>REJECTED (Отклоненные)</li>
              </ul>
            </div>
          </Alert>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                setShowCleanupDialog(false);
                setCleanupOlderThanDays(null);
              }}
              icon="pi pi-times"
            >
              Отмена
            </Button>
            <Button
              variant="warning"
              size="md"
              onClick={handleCleanup}
              loading={cleaningUp}
              icon="pi pi-trash"
            >
              Очистить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TradingRequestManager;
