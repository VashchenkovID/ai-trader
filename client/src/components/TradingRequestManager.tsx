import React, { useState, useEffect } from 'react';
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
import { Checkbox } from '../components/ui/Checkbox/Checkbox';
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
  
  // Дополнительные фильтры
  const [showHighConfidenceOnly, setShowHighConfidenceOnly] = useState(false);
  const [showUrgentOnly, setShowUrgentOnly] = useState(false);

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
            const statResult = await apiService.getInstrumentStat(figi as string);
            if (statResult.success && statResult.data) {
              const data = statResult.data as { winRate: number; kellyFraction: number | null; totalTrades: number };
              statsMap.set(figi as string, {
                winRate: data.winRate,
                kellyFraction: data.kellyFraction,
                totalTrades: data.totalTrades
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

  // const getWinRateDisplay = (rowData: TradingRequest) => { // Reserved for future use
  //   const winRate = rowData.instrumentStats?.winRate;
  //   const totalTrades = rowData.instrumentStats?.totalTrades;
  //   
  //   if (winRate === undefined || winRate === null) {
  //     return <span style={{ color: 'var(--color-text-secondary)' }}>—</span>;
  //   }
  //   
  //   const winRatePercent = (winRate * 100).toFixed(1);
  //   
  //   // Определяем цвет в зависимости от Win Rate
  //   let variant: 'success' | 'warning' | 'error' | 'info' = 'info';
  //   if (winRate >= 0.6) {
  //     variant = 'success';
  //   } else if (winRate >= 0.5) {
  //     variant = 'warning';
  //   } else {
  //     variant = 'error';
  //   }
  //   
  //   return (
  //     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
  //       <Badge variant={variant} size="sm">{winRatePercent}%</Badge>
  //       {totalTrades !== undefined && totalTrades > 0 && (
  //         <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>({totalTrades})</span>
  //       )}
  //     </div>
  //   );
  // };

  // const getKellyDisplay = (rowData: TradingRequest) => { // Reserved for future use
  //   const kellyFraction = rowData.instrumentStats?.kellyFraction;
  //   
  //   if (kellyFraction === undefined || kellyFraction === null) {
  //     return <span style={{ color: 'var(--color-text-secondary)' }}>—</span>;
  //   }
  //   
  //   const kellyPercent = (kellyFraction * 100).toFixed(2);
  //   
  //   // Определяем цвет в зависимости от Kelly Fraction
  //   let variant: 'success' | 'warning' | 'error' | 'info' = 'info';
  //   if (kellyFraction >= 0.15) {
  //     variant = 'success';
  //   } else if (kellyFraction >= 0.05) {
  //     variant = 'warning';
  //   } else if (kellyFraction > 0) {
  //     variant = 'info';
  //   } else {
  //     variant = 'error';
  //   }
  //   
  //   return <Badge variant={variant} size="sm">{kellyPercent}%</Badge>;
  // };

  // Функции сортировки для вложенных полей (PrimeReact не поддерживает dot notation)
  // const winRateSortFunction = (rowData: TradingRequest) => { // Reserved for future use
  //   return rowData.instrumentStats?.winRate ?? -1; // -1 для сортировки null значений в конец
  // };

  // const kellySortFunction = (rowData: TradingRequest) => { // Reserved for future use
  //   return rowData.instrumentStats?.kellyFraction ?? -1; // -1 для сортировки null значений в конец
  // };

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
        command: () => handleApprove(rowData)
      });
      actions.push({
        label: 'Отклонить',
        command: () => handleReject(rowData)
      });
      actions.push({
        label: 'Отменить',
        command: () => handleCancel(rowData)
      });
    } else if (rowData.status === 'APPROVED') {
      // После одобрения заявка уже считается выполненной пользователем
      // Кнопка "Исполнить" больше не нужна
      actions.push({
        label: 'Отменить',
        command: () => handleCancel(rowData)
      });
    }
    
    if (actions.length === 0) return null;
    
    return (
      <SplitButton
        label={actions[0].label}
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
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '—';
      
      // Формат: ДД.ММ.ГГГГ ЧЧ:ММ
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      return `${day}.${month}.${year} ${hours}:${minutes}`;
    } catch (error) {
      return '—';
    }
  };

  // Определение колонок для таблицы всех заявок
  const getTableColumns = (): DataTableColumn<TradingRequest>[] => [
    {
      key: 'ticker',
      header: 'Тикер',
      sortable: true,
      accessor: (row) => row.ticker,
      render: (_, row) => (
        <div>
          <div className="font-medium">{row.ticker}</div>
          <div className="text-xs text-500">{row.name}</div>
        </div>
      ),
      width: '150px'
    },
    {
      key: 'tradeAction',
      header: 'Действие',
      sortable: true,
      accessor: (row) => row.action,
      render: (_, row) => (
        <Badge variant={row.action === 'BUY' ? 'success' : 'error'} size="sm">
          {translateRecommendation(row.action)}
        </Badge>
      ),
      width: '100px'
    },
    {
      key: 'quantity',
      header: 'Количество',
      sortable: true,
      accessor: (row) => row.quantity,
      width: '100px'
    },
    {
      key: 'priceAtRequest',
      header: 'Цена',
      sortable: true,
      accessor: (row) => row.priceAtRequest,
      render: (_, row) => formatCurrency(row.priceAtRequest),
      align: 'right',
      width: '120px'
    },
    {
      key: 'estimatedAmount',
      header: 'Сумма',
      sortable: true,
      accessor: (row) => row.estimatedAmount,
      render: (_, row) => formatCurrency(row.estimatedAmount),
      align: 'right',
      width: '120px'
    },
    {
      key: 'status',
      header: 'Статус',
      sortable: true,
      accessor: (row) => row.status,
      render: (_, row) => getStatusBadge(row.status),
      width: '120px'
    },
    {
      key: 'confidence',
      header: 'Уверенность',
      sortable: true,
      accessor: (row) => row.confidence,
      render: (_, row) => `${(row.confidence * 100).toFixed(0)}%`,
      align: 'right',
      width: '80px'
    },
    {
      key: 'tradingMode',
      header: 'Режим',
      sortable: true,
      accessor: (row) => row.tradingMode,
      render: (_, row) => getTradingModeBadge(row.tradingMode),
      width: '100px'
    },
    {
      key: 'createdAt',
      header: 'Создано',
      sortable: true,
      accessor: (row) => row.createdAt,
      render: (_, row) => formatDateTime(row.createdAt),
      width: '150px'
    },
    {
      key: 'action',
      header: 'Действия',
      sortable: false,
      render: (_, row) => actionBodyTemplate(row),
      width: '150px'
    }
  ];

  // Определение колонок для таблицы ожидающих заявок
  const getPendingTableColumns = (): DataTableColumn<TradingRequest>[] => [
    {
      key: 'ticker',
      header: 'Тикер',
      sortable: true,
      accessor: (row) => row.ticker,
      render: (_, row) => (
        <div>
          <div className="font-medium">{row.ticker}</div>
          <div className="text-xs text-500">{row.name}</div>
        </div>
      ),
      width: '150px'
    },
    {
      key: 'tradeAction',
      header: 'Действие',
      sortable: true,
      accessor: (row) => row.action,
      render: (_, row) => (
        <Badge variant={row.action === 'BUY' ? 'success' : 'error'} size="sm">
          {translateRecommendation(row.action)}
        </Badge>
      ),
      width: '100px'
    },
    {
      key: 'quantity',
      header: 'Количество',
      sortable: true,
      accessor: (row) => row.quantity,
      width: '100px'
    },
    {
      key: 'priceAtRequest',
      header: 'Цена',
      sortable: true,
      accessor: (row) => row.priceAtRequest,
      render: (_, row) => formatCurrency(row.priceAtRequest),
      align: 'right',
      width: '120px'
    },
    {
      key: 'estimatedAmount',
      header: 'Сумма',
      sortable: true,
      accessor: (row) => row.estimatedAmount,
      render: (_, row) => formatCurrency(row.estimatedAmount),
      align: 'right',
      width: '120px'
    },
    {
      key: 'confidence',
      header: 'Уверенность',
      sortable: true,
      accessor: (row) => row.confidence,
      render: (_, row) => `${(row.confidence * 100).toFixed(0)}%`,
      align: 'right',
      width: '80px'
    },
    {
      key: 'priority',
      header: 'Приоритет',
      sortable: true,
      accessor: (row) => row.priority,
      render: (_, row) => getPriorityBadge(row.priority),
      width: '100px'
    },
    {
      key: 'riskLevel',
      header: 'Риск',
      sortable: true,
      accessor: (row) => row.riskLevel,
      render: (_, row) => getRiskBadge(row.riskLevel),
      width: '100px'
    },
    {
      key: 'createdAt',
      header: 'Создано',
      sortable: true,
      accessor: (row) => row.createdAt,
      render: (_, row) => formatDateTime(row.createdAt),
      width: '150px'
    },
    {
      key: 'action',
      header: 'Действия',
      sortable: false,
      render: (_, row) => actionBodyTemplate(row),
      width: '150px'
    }
  ];

  // Определение колонок для таблицы одобренных заявок
  const getApprovedTableColumns = (): DataTableColumn<TradingRequest>[] => [
    {
      key: 'ticker',
      header: 'Тикер',
      sortable: true,
      accessor: (row) => row.ticker,
      render: (_, row) => (
        <div>
          <div className="font-medium">{row.ticker}</div>
          <div className="text-xs text-500">{row.name}</div>
        </div>
      ),
      width: '150px'
    },
    {
      key: 'tradeAction',
      header: 'Действие',
      sortable: true,
      accessor: (row) => row.action,
      render: (_, row) => (
        <Badge variant={row.action === 'BUY' ? 'success' : 'error'} size="sm">
          {translateRecommendation(row.action)}
        </Badge>
      ),
      width: '100px'
    },
    {
      key: 'quantity',
      header: 'Количество',
      sortable: true,
      accessor: (row) => row.quantity,
      width: '100px'
    },
    {
      key: 'priceAtRequest',
      header: 'Цена запроса',
      sortable: true,
      accessor: (row) => row.priceAtRequest,
      render: (_, row) => formatCurrency(row.priceAtRequest),
      align: 'right',
      width: '120px'
    },
    {
      key: 'actualPrice',
      header: 'Факт. цена',
      sortable: true,
      accessor: (row) => row.actualPrice,
      render: (_, row) => row.actualPrice ? formatCurrency(row.actualPrice) : '—',
      align: 'right',
      width: '120px'
    },
    {
      key: 'estimatedAmount',
      header: 'Сумма',
      sortable: true,
      accessor: (row) => row.estimatedAmount,
      render: (_, row) => formatCurrency(row.estimatedAmount),
      align: 'right',
      width: '120px'
    },
    {
      key: 'status',
      header: 'Статус',
      sortable: true,
      accessor: (row) => row.status,
      render: (_, row) => getStatusBadge(row.status),
      width: '120px'
    },
    {
      key: 'tradingMode',
      header: 'Режим',
      sortable: true,
      accessor: (row) => row.tradingMode,
      render: (_, row) => getTradingModeBadge(row.tradingMode),
      width: '100px'
    },
    {
      key: 'createdAt',
      header: 'Создано',
      sortable: true,
      accessor: (row) => row.createdAt,
      render: (_, row) => formatDateTime(row.createdAt),
      width: '150px'
    }
  ];

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

  const toolbarStart = () => {
    return (
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadData}
          loading={loading}
        >
          Обновить
        </Button>
        
        <Select
          value={selectedMode}
          options={modeOptions}
          onChange={(e) => setSelectedMode(e.target.value)}
          placeholder="Выберите режим"
          style={{ minWidth: '150px', maxWidth: '200px' }}
        />

        <Select
          value={actionFilter}
          options={[
            { label: 'Все', value: 'all' },
            { label: translateRecommendation('BUY'), value: 'BUY' },
            { label: translateRecommendation('SELL'), value: 'SELL' }
          ]}
          onChange={(e) => setActionFilter(e.target.value as 'all' | 'BUY' | 'SELL')}
          placeholder="Действие"
          style={{ minWidth: '120px', maxWidth: '180px' }}
        />
        
        <Checkbox
          label="Высокая уверенность (≥70%)"
          checked={showHighConfidenceOnly}
          onChange={(e) => setShowHighConfidenceOnly(e.target.checked)}
          size="sm"
        />
        
        <Checkbox
          label="Только срочные"
          checked={showUrgentOnly}
          onChange={(e) => setShowUrgentOnly(e.target.checked)}
          size="sm"
        />
        
        <Button
          variant="warning"
          size="sm"
          onClick={async () => {
            await loadCleanupStats();
            setShowCleanupDialog(true);
          }}
        >
          Очистить завершенные
        </Button>
        
        {selectedRequests.length > 0 && (
          <>
            <Button
              variant="success"
              size="sm"
              onClick={handleBulkApprove}
            >
              Одобрить ({selectedRequests.length})
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleBulkReject}
            >
              Отклонить ({selectedRequests.length})
            </Button>
          </>
        )}
      </div>
    );
  };

  const toolbarEnd = () => {
    if (!stats) return null;
    
    return (
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Badge variant="info" size="md">Всего: {stats.total}</Badge>
        <Badge variant="warning" size="md">Ожидают: {stats.pending}</Badge>
        <Badge variant="success" size="md">Исполнено: {stats.executed}</Badge>
      </div>
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

  // Применяем фильтры перед рендером
  const filteredRequests = requests.filter((r) => {
    // Фильтр по действию
    if (actionFilter !== 'all' && r.action !== actionFilter) {
      return false;
    }
    
    // Фильтр по высокой уверенности (>= 70%)
    if (showHighConfidenceOnly && r.confidence < 0.7) {
      return false;
    }
    
    // Фильтр по срочности
    if (showUrgentOnly && r.priority !== 'URGENT') {
      return false;
    }
    
    return true;
  });

  return (
    <div className="trading-request-manager">
      <Toast ref={toast} />
      <ConfirmDialog 
        visible={false}
        message=""
        onAccept={() => {}}
        onReject={() => {}}
      />
      
      <Card variant="default" className="h-full" header="🎯 Торговые заявки">
        <TabView activeIndex={activeTab} onTabChange={(e) => setActiveTab(e.index)}>
          <TabPanel header="Все заявки">
            <Toolbar start={toolbarStart()} end={toolbarEnd()} className="mb-3" />
            
            {filteredRequests.length === 0 ? (
              <Alert variant="info" title="Нет торговых заявок" />
            ) : (
              <DataTable
                data={filteredRequests}
                columns={getTableColumns()}
                selection={selectedRequests}
                onSelectionChange={(selection: TradingRequest[]) => setSelectedRequests(selection)}
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
            <Toolbar start={toolbarStart()} end={toolbarEnd()} className="mb-3" />
            
            {filteredRequests.length === 0 ? (
              <Alert variant="info" title="Нет ожидающих заявок" />
            ) : (
              <DataTable
                data={filteredRequests}
                columns={getPendingTableColumns()}
                selection={selectedRequests}
                onSelectionChange={(selection: TradingRequest[]) => setSelectedRequests(selection)}
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
            <Toolbar start={toolbarStart()} end={toolbarEnd()} className="mb-3" />
            
            {filteredRequests.length === 0 ? (
              <Alert variant="info" title="Нет одобренных заявок" />
            ) : (
              <DataTable
                data={filteredRequests}
                columns={getApprovedTableColumns()}
                paginator
                rows={10}
                loading={loading}
                // size="sm" // DataTable не поддерживает prop size
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
              <textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Добавьте комментарий к одобрению..."
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setShowApprovalDialog(false)}
              >
                Отмена
              </Button>
              <Button
                variant="success"
                size="md"
                onClick={confirmApproval}
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
              <textarea
                id="reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                placeholder="Укажите причину отклонения заявки..."
                required
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setShowRejectionDialog(false)}
              >
                Отмена
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={confirmRejection}
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
                    {cleanupStats.expired !== undefined && (
                      <li>Истекших: <strong>{cleanupStats.expired}</strong></li>
                    )}
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
              Оставьте пустым, чтобы удалить все завершенные заявки (одобренные, отклоненные и истекшие)
            </small>
          </div>

          <Alert variant="warning" title="Внимание!">
            <div>
              Это действие нельзя отменить. Будут удалены все заявки со статусом:
              <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '16px' }}>
                <li>APPROVED (Одобренные)</li>
                <li>REJECTED (Отклоненные)</li>
                <li>EXPIRED (Истекшие)</li>
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
            >
              Отмена
            </Button>
            <Button
              variant="warning"
              size="md"
              onClick={handleCleanup}
              loading={cleaningUp}
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
