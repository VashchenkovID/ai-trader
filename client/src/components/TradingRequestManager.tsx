import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { Dialog } from 'primereact/dialog';
import { InputTextarea } from 'primereact/inputtextarea';
import { Toast } from 'primereact/toast';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { TabView, TabPanel } from 'primereact/tabview';
import { Skeleton } from 'primereact/skeleton';
import { Message } from 'primereact/message';
import { Toolbar } from 'primereact/toolbar';
import { SplitButton } from 'primereact/splitbutton';
import { Dropdown } from 'primereact/dropdown';
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
      setRequests(requests);
      
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
      PENDING: { severity: 'warning', label: 'Ожидает' },
      APPROVED: { severity: 'info', label: 'Одобрена' },
      REJECTED: { severity: 'danger', label: 'Отклонена' },
      EXECUTED: { severity: 'success', label: 'Исполнена' },
      CANCELLED: { severity: 'secondary', label: 'Отменена' },
      EXPIRED: { severity: 'secondary', label: 'Истекла' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || { severity: 'secondary', label: status };
    return <Badge value={config.label} severity={config.severity as any} />;
  };

  const getPriorityBadge = (priority: string) => {
    const priorityConfig = {
      LOW: { severity: 'secondary', label: 'Низкий' },
      NORMAL: { severity: 'info', label: 'Обычный' },
      HIGH: { severity: 'warning', label: 'Высокий' },
      URGENT: { severity: 'danger', label: 'Срочный' }
    };
    
    const config = priorityConfig[priority as keyof typeof priorityConfig] || { severity: 'secondary', label: priority };
    return <Badge value={config.label} severity={config.severity as any} />;
  };

  const getRiskBadge = (risk: string) => {
    const riskConfig = {
      LOW: { severity: 'success', label: 'Низкий' },
      MEDIUM: { severity: 'warning', label: 'Средний' },
      HIGH: { severity: 'danger', label: 'Высокий' }
    };
    
    const config = riskConfig[risk as keyof typeof riskConfig] || { severity: 'secondary', label: risk };
    return <Badge value={config.label} severity={config.severity as any} />;
  };

  const getTradingModeBadge = (mode: string) => {
    const modeConfig = {
      paper: { severity: 'info', label: 'Paper', icon: '📝' },
      micro: { severity: 'warning', label: 'Micro', icon: '🔬' },
      real: { severity: 'danger', label: 'Real', icon: '💰' }
    };
    
    const config = modeConfig[mode as keyof typeof modeConfig] || { severity: 'secondary', label: mode, icon: '❓' };
    return (
      <Badge 
        value={`${config.icon} ${config.label}`} 
        severity={config.severity as any} 
      />
    );
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
        size="small"
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
      <div className="flex justify-content-between align-items-center">
        <div className="flex gap-2 align-items-center">
          <Button
            label="Обновить"
            icon="pi pi-refresh"
            onClick={loadData}
            loading={loading}
            size="small"
          />
          
          <Dropdown
            value={selectedMode}
            options={modeOptions}
            onChange={(e: any) => setSelectedMode(e.value)}
            placeholder="Выберите режим"
            className="w-10rem"
          />

          <Dropdown
            value={actionFilter}
            options={[
              { label: 'Все', value: 'all' },
              { label: translateRecommendation('BUY'), value: 'BUY' },
              { label: translateRecommendation('SELL'), value: 'SELL' }
            ]}
            onChange={(e: any) => setActionFilter(e.value)}
            placeholder="Действие"
            className="w-10rem"
          />
          
          <Button
            label="Очистить завершенные"
            icon="pi pi-trash"
            onClick={async () => {
              await loadCleanupStats();
              setShowCleanupDialog(true);
            }}
            size="small"
            severity="warning"
            outlined
          />
          
          {selectedRequests.length > 0 && (
            <>
              <Button
                label={`Одобрить (${selectedRequests.length})`}
                icon="pi pi-check"
                onClick={handleBulkApprove}
                severity="success"
                size="small"
              />
              <Button
                label={`Отклонить (${selectedRequests.length})`}
                icon="pi pi-times"
                onClick={handleBulkReject}
                severity="danger"
                size="small"
              />
            </>
          )}
        </div>
        
        <div className="flex gap-2">
          {stats && (
            <div className="flex gap-2">
              <Badge value={`Всего: ${stats.total}`} severity="info" />
              <Badge value={`Ожидают: ${stats.pending}`} severity="warning" />
              <Badge value={`Исполнено: ${stats.executed}`} severity="success" />
            </div>
          )}
          
        </div>
      </div>
    );
  };

  if (loading && requests.length === 0) {
    return (
      <Card title="🎯 Торговые заявки" className="h-full">
        <div className="grid">
          {[1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="col-12">
              <div className="flex align-items-center gap-3 p-3">
                <Skeleton width="3rem" height="3rem" />
                <div className="flex-1">
                  <Skeleton width="100%" height="1rem" className="mb-2" />
                  <Skeleton width="75%" height="0.8rem" />
                </div>
                <Skeleton width="5rem" height="2rem" />
              </div>
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
      
      <Card title="🎯 Торговые заявки" className="h-full">
        <TabView activeIndex={activeTab} onTabChange={(e) => setActiveTab(e.index)}>
          <TabPanel header="Все заявки">
            <Toolbar start={toolbarTemplate} className="mb-3" />
            
            {filteredRequests.length === 0 ? (
              <Message severity="info" text="Нет торговых заявок" />
            ) : (
              <DataTable
                value={filteredRequests}
                selection={selectedRequests}
                onSelectionChange={(e: any) => setSelectedRequests(e.value)}
                selectionMode="multiple"
                paginator
                rows={10}
                loading={loading}
                sortMode="multiple"
                removableSort
                className="p-datatable-sm"
              >
                <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} />
                
                <Column
                  field="ticker"
                  header="Инструмент"
                  sortable
                  body={(rowData) => (
                    <div>
                      <div className="font-bold">{rowData.ticker}</div>
                      <div className="text-sm text-600">{rowData.name}</div>
                    </div>
                  )}
                />
                
                <Column
                  field="action"
                  header="Действие"
                  sortable
                  body={(rowData) => (
                    <Badge
                      value={translateRecommendation(rowData.action)}
                      severity={rowData.action === 'BUY' ? 'success' : 'danger'}
                    />
                  )}
                />
                
                <Column
                  field="quantity"
                  header="Количество"
                  sortable
                />
                
                <Column
                  field="estimatedAmount"
                  header="Сумма"
                  sortable
                  body={(rowData) => formatCurrency(rowData.estimatedAmount)}
                />
                
                <Column
                  field="confidence"
                  header="Уверенность"
                  sortable
                  body={(rowData) => `${(rowData.confidence * 100).toFixed(1)}%`}
                />
                
                <Column
                  field="status"
                  header="Статус"
                  sortable
                  body={(rowData) => getStatusBadge(rowData.status)}
                />
                
                <Column
                  field="priority"
                  header="Приоритет"
                  sortable
                  body={(rowData) => getPriorityBadge(rowData.priority)}
                />
                
                <Column
                  field="riskLevel"
                  header="Риск"
                  sortable
                  body={(rowData) => getRiskBadge(rowData.riskLevel)}
                />
                
                <Column
                  field="tradingMode"
                  header="Режим"
                  sortable
                  body={(rowData) => getTradingModeBadge(rowData.tradingMode)}
                />
                
                <Column
                  field="createdAt"
                  header="Создана"
                  sortable
                  body={(rowData) => formatDateTime(rowData.createdAt)}
                />
                
                <Column
                  header="Действия"
                  body={actionBodyTemplate}
                  headerStyle={{ width: '8rem' }}
                />
              </DataTable>
            )}
          </TabPanel>
          
          <TabPanel header="Ожидающие">
            <Toolbar start={toolbarTemplate} className="mb-3" />
            
            {filteredRequests.length === 0 ? (
              <Message severity="info" text="Нет ожидающих заявок" />
            ) : (
              <DataTable
                value={filteredRequests}
                selection={selectedRequests}
                onSelectionChange={(e: any) => setSelectedRequests(e.value)}
                selectionMode="multiple"
                paginator
                rows={10}
                loading={loading}
                className="p-datatable-sm"
              >
                <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} />
                <Column field="ticker" header="Инструмент" sortable />
                <Column field="action" header="Действие" sortable body={(rowData) => (
                  <Badge value={translateRecommendation(rowData.action)} severity={rowData.action === 'BUY' ? 'success' : 'danger'} />
                )} />
                <Column field="quantity" header="Количество" sortable />
                <Column field="estimatedAmount" header="Сумма" sortable body={(rowData) => formatCurrency(rowData.estimatedAmount)} />
                <Column field="confidence" header="Уверенность" sortable body={(rowData) => `${(rowData.confidence * 100).toFixed(1)}%`} />
                <Column field="priority" header="Приоритет" sortable body={(rowData) => getPriorityBadge(rowData.priority)} />
                <Column header="Действия" body={actionBodyTemplate} />
              </DataTable>
            )}
          </TabPanel>
          
          <TabPanel header="Одобренные">
            <Toolbar start={toolbarTemplate} className="mb-3" />
            
            {filteredRequests.length === 0 ? (
              <Message severity="info" text="Нет одобренных заявок" />
            ) : (
              <DataTable
                value={filteredRequests}
                paginator
                rows={10}
                loading={loading}
                className="p-datatable-sm"
              >
                <Column field="ticker" header="Инструмент" sortable />
                <Column field="action" header="Действие" sortable body={(rowData) => (
                  <Badge value={translateRecommendation(rowData.action)} severity={rowData.action === 'BUY' ? 'success' : 'danger'} />
                )} />
                <Column field="quantity" header="Количество" sortable />
                <Column field="estimatedAmount" header="Сумма" sortable body={(rowData) => formatCurrency(rowData.estimatedAmount)} />
                <Column field="approvedAt" header="Одобрена" sortable body={(rowData) => formatDateTime(rowData.approvedAt)} />
                <Column header="Действия" body={actionBodyTemplate} />
              </DataTable>
            )}
          </TabPanel>
        </TabView>
      </Card>

      {/* Диалог одобрения */}
      <Dialog
        header="Одобрение заявки"
        visible={showApprovalDialog}
        onHide={() => setShowApprovalDialog(false)}
        style={{ width: '450px' }}
      >
        {currentRequest && (
          <div>
            <div className="mb-3">
              <strong>{currentRequest.action} {currentRequest.ticker}</strong>
              <div>Количество: {currentRequest.quantity}</div>
              <div>Сумма: {formatCurrency(currentRequest.estimatedAmount)}</div>
              <div>Уверенность: {(currentRequest.confidence * 100).toFixed(1)}%</div>
            </div>
            
            <div className="field">
              <label htmlFor="comment">Комментарий (необязательно)</label>
              <InputTextarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="w-full"
                placeholder="Добавьте комментарий к одобрению..."
              />
            </div>
            
            <div className="flex justify-content-end gap-2 mt-3">
              <Button
                label="Отмена"
                icon="pi pi-times"
                onClick={() => setShowApprovalDialog(false)}
                severity="secondary"
              />
              <Button
                label="Одобрить"
                icon="pi pi-check"
                onClick={confirmApproval}
                severity="success"
              />
            </div>
          </div>
        )}
      </Dialog>

      {/* Диалог отклонения */}
      <Dialog
        header="Отклонение заявки"
        visible={showRejectionDialog}
        onHide={() => setShowRejectionDialog(false)}
        style={{ width: '450px' }}
      >
        {currentRequest && (
          <div>
            <div className="mb-3">
              <strong>{currentRequest.action} {currentRequest.ticker}</strong>
              <div>Количество: {currentRequest.quantity}</div>
              <div>Сумма: {formatCurrency(currentRequest.estimatedAmount)}</div>
            </div>
            
            <div className="field">
              <label htmlFor="reason">Причина отклонения *</label>
              <InputTextarea
                id="reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                className="w-full"
                placeholder="Укажите причину отклонения заявки..."
                required
              />
            </div>
            
            <div className="flex justify-content-end gap-2 mt-3">
              <Button
                label="Отмена"
                icon="pi pi-times"
                onClick={() => setShowRejectionDialog(false)}
                severity="secondary"
              />
              <Button
                label="Отклонить"
                icon="pi pi-ban"
                onClick={confirmRejection}
                severity="danger"
                disabled={!rejectionReason.trim()}
              />
            </div>
          </div>
        )}
      </Dialog>

      {/* Диалог очистки завершенных заявок */}
      <Dialog
        header="🧹 Очистка завершенных заявок"
        visible={showCleanupDialog}
        style={{ width: '500px' }}
        onHide={() => {
          setShowCleanupDialog(false);
          setCleanupOlderThanDays(null);
        }}
        footer={
          <div className="flex justify-content-end gap-2">
            <Button
              label="Отмена"
              icon="pi pi-times"
              onClick={() => {
                setShowCleanupDialog(false);
                setCleanupOlderThanDays(null);
              }}
              severity="secondary"
            />
            <Button
              label="Очистить"
              icon="pi pi-trash"
              onClick={handleCleanup}
              loading={cleaningUp}
              severity="warning"
            />
          </div>
        }
      >
        <div>
          {cleanupStats && (
            <div className="mb-4">
              <Message severity="info" className="mb-3">
                <div>
                  <strong>Статистика завершенных заявок:</strong>
                  <ul className="mt-2 mb-0 pl-4">
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
              </Message>
            </div>
          )}

          <div className="mb-3">
            <label htmlFor="olderThanDays" className="block mb-2">
              Удалять заявки старше (дней):
            </label>
            <div className="flex gap-2 align-items-center">
              <input
                id="olderThanDays"
                type="number"
                min="0"
                value={cleanupOlderThanDays || ''}
                onChange={(e) => setCleanupOlderThanDays(e.target.value ? parseInt(e.target.value) : null)}
                className="p-inputtext p-component w-full"
                placeholder="Оставить пустым для удаления всех"
              />
            </div>
            <small className="text-600">
              Оставьте пустым, чтобы удалить все завершенные заявки (одобренные и отклоненные)
            </small>
          </div>

          <Message severity="warn" className="mt-3">
            <div>
              <strong>Внимание!</strong> Это действие нельзя отменить. Будут удалены все заявки со статусом:
              <ul className="mt-2 mb-0 pl-4">
                <li>APPROVED (Одобренные)</li>
                <li>REJECTED (Отклоненные)</li>
              </ul>
            </div>
          </Message>
        </div>
      </Dialog>
    </div>
  );
};

export default TradingRequestManager;
