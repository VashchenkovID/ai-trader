import React, {useEffect, useRef, useState} from 'react';
import {Skeleton} from '../../components/ui/Skeleton/Skeleton.tsx';
import {Toast} from 'primereact/toast';
import {ProgressBar} from '../../components/ui/ProgressBar/ProgressBar.tsx';
import {apiService} from '../../services/apiService.ts';
import {useWebSocketData} from '../../components/WebSocketDataProvider.tsx';
import TradingSummaryCard from '../../components/dashboard/TradingSummaryCard/TradingSummaryCard.tsx';
import HeroMetricsCard from '../../components/dashboard/HeroMetricsCard/HeroMetricsCard.tsx';
import MacroDataPreview from '../../components/dashboard/MacroDataPreview/MacroDataPreview.tsx';
import RebalancingStatusCard from '../../components/dashboard/RebalancingStatusCard/RebalancingStatusCard.tsx';
import ActiveTradingRequestsCard from '../../components/dashboard/ActiveTradingRequestsCard/ActiveTradingRequestsCard.tsx';
import RecentTradesCard from '../../components/dashboard/RecentTradesCard/RecentTradesCard.tsx';
import CriticalAlertsCard from '../../components/dashboard/CriticalAlertsCard/CriticalAlertsCard.tsx';
import QuickActionsCard from '../../components/dashboard/QuickActionsCard/QuickActionsCard.tsx';
import {Card} from '../../components/ui/Card/Card.tsx';
import {Badge as UIBadge} from '../../components/ui/Badge/Badge.tsx';
import './Dashboard.css';

interface DashboardProps {
    className?: string;
}

const translateStatus = (status: string): string => {
    const translations: { [key: string]: string } = {
        'active': 'Активен',
        'ready': 'Готов',
        'training': 'Обучение',
        'off': 'Выключен',
        'not_loaded': 'Не загружен',
        'initialized': 'Инициализирован',
        'unknown': 'Неизвестно',
        'connected': 'Подключен',
        'inactive': 'Неактивен',
        'paper': 'Бумажная',
        'real': 'Реальная',
        'live': 'Реальная',
        'sandbox': 'Песочница'
    };
    return translations[status.toLowerCase()] || status;
};

const translateMode = (mode: string): string => {
    const modeTranslations: { [key: string]: string } = {
        'paper': 'Бумажная',
        'real': 'Реальная',
        'live': 'Реальная',
        'sandbox': 'Песочница',
        'unknown': 'Неизвестно'
    };
    return modeTranslations[mode.toLowerCase()] || mode;
};

const getStatusBadge = (status: any) => {
    if (!status) return <UIBadge variant="info" size="sm">Неизвестно</UIBadge>;

    // Если это строка
    if (typeof status === 'string') {
        const statusMap: { [key: string]: 'success' | 'warning' | 'error' | 'info' } = {
            'active': 'success',
            'ready': 'success',
            'training': 'warning',
            'off': 'error',
            'not_loaded': 'error',
            'initialized': 'info',
            'unknown': 'info',
            'connected': 'success',
            'inactive': 'warning'
        };
        const translatedStatus = translateStatus(status);
        return <UIBadge variant={statusMap[status] || 'info'} size="sm">{translatedStatus}</UIBadge>;
    }

    // Обработка объектов с полем status
    if (status.hasOwnProperty('status')) {
        const statusValue = status.status;
        const statusMap: { [key: string]: 'success' | 'warning' | 'error' | 'info' } = {
            'active': 'success',
            'connected': 'success',
            'training': 'warning',
            'inactive': 'warning',
            'off': 'error',
            'not_loaded': 'error',
            'unknown': 'info'
        };

        let badgeText = translateStatus(statusValue);
        if (status.hasOwnProperty('mode')) {
            const translatedMode = translateMode(status.mode);
            badgeText = `${badgeText} (${translatedMode})`;
        }

        return <UIBadge variant={statusMap[statusValue] || 'info'} size="sm">{badgeText}</UIBadge>;
    }

    // Обработка разных форматов объектов статуса

    // NeuralNetworkService: {isLoaded, isTraining, status}
    if (status.hasOwnProperty('isLoaded')) {
        if (status.isTraining) {
            return <UIBadge variant="warning" size="sm">Обучение</UIBadge>;
        } else if (status.isLoaded) {
            return <UIBadge variant="success" size="sm">Готов</UIBadge>;
        } else {
            return <UIBadge variant="error" size="sm">Не загружен</UIBadge>;
        }
    }

    // WebSocketService: {isConnected, clientsCount, isInitialized}
    if (status.hasOwnProperty('isConnected')) {
        if (status.isConnected && status.isInitialized) {
            return <UIBadge variant="success" size="sm">Активен</UIBadge>;
        } else {
            return <UIBadge variant="error" size="sm">Отключен</UIBadge>;
        }
    }

    // TradingEngine: {isInitialized, isActive, currentMode, mode}
    if (status.hasOwnProperty('isInitialized') && status.hasOwnProperty('currentMode')) {
        const mode = status.mode || (typeof status.currentMode === 'string' ? status.currentMode : status.currentMode?.mode) || 'unknown';
        const translatedMode = translateMode(mode);
        if (status.isActive) {
            return <UIBadge variant="success" size="sm">Активен ({translatedMode})</UIBadge>;
        } else if (status.isInitialized) {
            return <UIBadge variant="warning" size="sm">Неактивен ({translatedMode})</UIBadge>;
        } else {
            return <UIBadge variant="error" size="sm">Не инициализирован</UIBadge>;
        }
    }

    // EnsembleService: {models, weights, performance}
    if (status.hasOwnProperty('models') || status.hasOwnProperty('loadedModels')) {
        const modelCount = status.loadedModels || Object.keys(status.models || {}).length;
        if (modelCount > 0) {
            return <UIBadge variant="success" size="sm">Активен ({modelCount} моделей)</UIBadge>;
        } else {
            return <UIBadge variant="warning" size="sm">Модели не загружены</UIBadge>;
        }
    }

    // Fallback для других объектов
    if (status.isActive) {
        return <UIBadge variant="success" size="sm">Активен</UIBadge>;
    } else if (status.isTraining) {
        return <UIBadge variant="warning" size="sm">Обучение</UIBadge>;
    } else if (status.isInitialized) {
        return <UIBadge variant="info" size="sm">Инициализирован</UIBadge>;
    } else {
        return <UIBadge variant="error" size="sm">Отключен</UIBadge>;
    }
};

const Dashboard: React.FC<DashboardProps> = ({className = ''}) => {
    // Используем новый WebSocket провайдер
    const {
        systemStatus,
        systemResources,
        tradingStats,
        trainingStatus,
        isConnected
    } = useWebSocketData();

    // Локальное состояние
    const [sharpeRatio, setSharpeRatio] = useState<number | null>(null);

    const toast = useRef<Toast | null>(null);

    // Загрузка Sharpe Ratio
    const loadSharpeRatio = async () => {
        try {
            const summary = await apiService.getAdvancedMetricsSummary('daily', 30);
            if (summary.success && summary.data) {
                // Проверяем baseMetrics.sharpeRatio
                const sharpeValue = summary.data.baseMetrics?.sharpeRatio;
                if (sharpeValue != null && !isNaN(sharpeValue)) {
                    setSharpeRatio(sharpeValue);
                } else {
                    // Если sharpeRatio равен 0 или null, все равно устанавливаем его (может быть 0 если нет волатильности)
                    setSharpeRatio(sharpeValue !== undefined ? sharpeValue : null);
                }
            } else {
                setSharpeRatio(null);
            }
        } catch (error) {
            console.error('Error loading Sharpe Ratio:', error);
            setSharpeRatio(null);
        }
    };

    useEffect(() => {
        loadSharpeRatio();

        // Обновляем Sharpe Ratio каждые 5 минут
        const interval = setInterval(loadSharpeRatio, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    // Определяем, учится ли любая из нейросетей
    const isAnyNetworkTraining = !!(trainingStatus && (
        trainingStatus.neuralNetwork?.isTraining ||
        trainingStatus.ensemble?.isTraining ||
        trainingStatus.metaLearning?.isTraining ||
        trainingStatus.reinforcementLearning?.isTraining
    ));

    return (
        <div className={`dashboard ${className}`}>
            <div className="grid">
                {/* Заголовок и статус подключения */}
                <div className="col-12">
                    <Card variant="glass" className="h-full">
                        <div className="dashboard-header">
                            <div className="dashboard-title-section">
                                <div className="dashboard-title-wrapper">
                                    <h1 className="dashboard-title">📊 Панель управления</h1>
                                    {isConnected && (
                                        <UIBadge variant="success" size="md">
                                            LIVE
                                        </UIBadge>
                                    )}
                                </div>
                                <p className="dashboard-subtitle">
                                    Мониторинг торговой системы и нейросетей
                                    {isConnected &&
                                        <span className="dashboard-subtitle-live"> • Данные в реальном времени</span>}
                                </p>
                                {systemStatus && (
                                    <small className="dashboard-updated">
                                        Обновлено: {new Date().toLocaleString('ru-RU')}
                                    </small>
                                )}
                            </div>

                            <div className="dashboard-connection-status">
                                <div className="dashboard-connection-indicator">
                                    <div className="dashboard-connection-icon">
                                        {isConnected ? '🟢' : '🔴'}
                                    </div>
                                    <div className="dashboard-connection-text">
                                        {isConnected ? 'Подключено к серверу' : 'Отключено от сервера'}
                                    </div>
                                    <small className="dashboard-connection-hint">
                                        {isConnected ? 'Данные обновляются в реальном времени' : 'Попытка переподключения...'}
                                    </small>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Верхняя панель "Ключевые метрики" (Hero Section) */}
                <div className="col-12 animate-fade-in">
                    <div className="dashboard-training-badge-wrapper">
                        <div></div>
                        {isAnyNetworkTraining && (
                            <UIBadge variant="warning" size="md" icon={<i className="pi pi-spin pi-spinner mr-1"></i>}>
                                Обучение нейросетей
                            </UIBadge>
                        )}
                    </div>
                    <HeroMetricsCard tradingStats={tradingStats} sharpeRatio={sharpeRatio}/>
                </div>
            </div>

            {/* Состояние системы, Торговая активность */}
            <div className="dashboard-cards-grid">
                <div className="animate-slide-up dashboard-animate-delay-3">
                    <Card
                        variant="glass"
                        header={<span>Состояние системы</span>}
                        className="h-full"
                        key={systemStatus ? JSON.stringify(systemStatus) : 'loading'}
                    >
                        {!systemStatus ? (
                            <div className="grid">
                                {[1, 2, 3, 4].map((item) => (
                                    <div key={item} className="col-6">
                                        <div className="dashboard-skeleton-item">
                                            <Skeleton variant="text" size="md" className="dashboard-skeleton-large"/>
                                            <Skeleton variant="text" size="sm" className="dashboard-skeleton-medium"/>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : systemStatus ? (
                            <div className="flex flex-column gap-2">
                                {/* Статусы системы - компактная сетка 2x2 */}
                                <div className="dashboard-system-status-grid">
                                    <div className="dashboard-status-item">
                                        <div className="dashboard-status-item-content">
                                            <div className="dashboard-status-item-label">Нейросеть</div>
                                            <div>{getStatusBadge(systemStatus.neuralNetwork)}</div>
                                        </div>
                                    </div>
                                    <div className="dashboard-status-item">
                                        <div className="dashboard-status-item-content">
                                            <div className="dashboard-status-item-label">WebSocket</div>
                                            <div>{getStatusBadge(systemStatus.websocket)}</div>
                                        </div>
                                    </div>
                                    <div className="dashboard-status-item">
                                        <div className="dashboard-status-item-content">
                                            <div className="dashboard-status-item-label">Движок</div>
                                            <div>{getStatusBadge(systemStatus.trading)}</div>
                                        </div>
                                    </div>
                                    <div className="dashboard-status-item">
                                        <div className="dashboard-status-item-content">
                                            <div className="dashboard-status-item-label">База данных</div>
                                            <div>{getStatusBadge(systemStatus.database)}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Ресурсы сервера - горизонтально */}
                                <details className="dashboard-server-resources" open>
                                    <summary className="dashboard-server-resources-summary">
                                        Ресурсы сервера
                                        <i className="pi pi-chevron-down ml-2 dashboard-server-resources-summary-icon"></i>
                                    </summary>
                                    <div className="dashboard-server-resources-content">
                                        <div className="dashboard-server-resources-row">
                                            <div className="dashboard-server-resources-item">
                                                <div className="dashboard-server-resources-label-row">
                                                    <span className="dashboard-server-resources-label">CPU</span>
                                                    <span className="dashboard-server-resources-value">
                            {systemResources?.cpu?.usage != null
                                ? `${systemResources.cpu.usage.toFixed(1)}%`
                                : '—'}
                          </span>
                                                </div>
                                                {systemResources?.cpu?.usage != null && (
                                                    <ProgressBar
                                                        value={systemResources.cpu.usage}
                                                        variant={systemResources.cpu.usage < 70 ? 'success' : systemResources.cpu.usage < 90 ? 'warning' : 'error'}
                                                        size="sm"
                                                        showLabel={false}
                                                    />
                                                )}
                                            </div>
                                            <div className="dashboard-server-resources-divider"></div>
                                            <div className="dashboard-server-resources-item">
                                                <div className="dashboard-server-resources-label-row">
                                                    <span className="dashboard-server-resources-label">Память</span>
                                                    <span className="dashboard-server-resources-value">
                            {systemResources?.memory?.usage != null
                                ? `${systemResources.memory.usage}%`
                                : '—'}
                          </span>
                                                </div>
                                                {systemResources?.memory?.usage != null && (
                                                    <ProgressBar
                                                        value={systemResources.memory.usage}
                                                        variant={systemResources.memory.usage < 70 ? 'success' : systemResources.memory.usage < 90 ? 'warning' : 'error'}
                                                        size="sm"
                                                        showLabel={false}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </details>
                            </div>
                        ) : (
                            <div className="dashboard-empty-state">
                                <p className="dashboard-empty-state-text">Нет данных о статусе системы</p>
                            </div>
                        )}
                    </Card>
                </div>

                {/* Блок "Торговая активность" */}
                <div className="animate-slide-up dashboard-animate-delay-4">
                    <TradingSummaryCard tradingStats={tradingStats}/>
                </div>

                {/* Статус ребалансировки */}
                <div className="animate-slide-up dashboard-animate-delay-5">
                    <RebalancingStatusCard/>
                </div>
            </div>

            {/* Вторая строка: Торговые заявки, последние сделки, быстрые действия */}
            <div className="grid dashboard-section">
                <div className="col-12 md:col-6 lg:col-4 animate-fade-in dashboard-animate-delay-6">
                    <ActiveTradingRequestsCard/>
                </div>
                <div className="col-12 md:col-6 lg:col-4 animate-fade-in dashboard-animate-delay-6">
                    <RecentTradesCard maxTrades={5}/>
                </div>
                <div className="col-12 md:col-6 lg:col-4 animate-fade-in dashboard-animate-delay-6">
                    <QuickActionsCard/>
                </div>
            </div>

            {/* Критические алерты (показывается только если есть) */}
            <div className="grid dashboard-section">
                <div className="col-12 animate-fade-in dashboard-animate-delay-7">
                    <CriticalAlertsCard maxAlerts={3}/>
                </div>
            </div>

            {/* Макроэкономические данные */}
            <div className="grid dashboard-section">
                <div className="col-12 animate-fade-in dashboard-animate-delay-7">
                    <MacroDataPreview/>
                </div>
            </div>

            <Toast ref={toast}/>
        </div>
    );
};

export default Dashboard;

