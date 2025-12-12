import { WebSocketServer } from 'ws';
import NeuralNetworkService from './NeuralNetworkService.js';
import PerformanceAnalyzer from './PerformanceAnalyzer.js';

class WebSocketService {
    constructor() {
        this.wss = null;
        this.clients = new Set();
    }
    
    // Синглтон паттерн
    static getInstance() {
        if (!WebSocketService.instance) {
            WebSocketService.instance = new WebSocketService();
        }
        return WebSocketService.instance;
    }

    initialize(server, path = '/') {
        // Защита от повторной инициализации
        if (this.wss) {
            console.log('⚠️ WebSocket server already initialized, skipping...');
            return;
        }
        
        console.log('🌐 Initializing WebSocket server...');
        try {
            const stack = new Error().stack;
            if (stack) {
                console.log('🔍 WebSocket initialization called from:', stack.split('\n')[2]?.trim() || 'unknown');
            } else {
                console.log('🔍 WebSocket initialization called from: unknown (no stack trace)');
            }
        } catch (error) {
            console.log('🔍 WebSocket initialization called from: unknown (error getting stack trace)');
        }
        
        try {
            this.wss = new WebSocketServer({ server, path });
            console.log('✅ WebSocket server created successfully');
        } catch (error) {
            console.error('❌ Failed to create WebSocket server:', error);
            return;
        }
        
        // Защита от множественных подключений
        let connectionCount = 0;

        this.wss.on('connection', (ws) => {
        
            // Проверяем, не является ли это внутренним подключением
            const remoteAddress = ws._socket?.remoteAddress;
            const localAddress = ws._socket?.localAddress;
            console.log('🔍 Connection details:', { remoteAddress, localAddress });
            
            // Проверяем глобальный лимит подключений
            if (!checkConnectionLimit()) {
                console.log(`⚠️ Global connection limit reached, closing connection`);
                ws.close(1000, 'Connection limit reached');
                return;
            }
            
            incrementConnectionCount();
            
            // Проверяем, не подключен ли уже этот клиент
            if (this.clients.has(ws)) {
                console.log('⚠️ Duplicate WebSocket connection detected, closing');
                ws.close(1000, 'Duplicate connection');
                return;
            }
            
            console.log(`🔌 New WebSocket client connected (total: ${this.clients.size + 1})`);
            this.clients.add(ws);

            // Отправляем текущий статус при подключении
            this.sendToClient(ws, {
                type: 'status',
                data: NeuralNetworkService.getStatus()
            });

            // Отправляем полный системный статус сразу при подключении
            this.sendInitialSystemStatus(ws);

            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);
                    await this.handleMessage(ws, data);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            });

            ws.on('close', (code, reason) => {
                console.log(`WebSocket client disconnected (code: ${code}, reason: ${reason})`);
                this.clients.delete(ws);
                decrementConnectionCount();
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                // Не удаляем клиента сразу при ошибке, даем время на восстановление
                // this.clients.delete(ws);
                // decrementConnectionCount();
            });
        });

        console.log('WebSocket server initialized');
    }

    async handleMessage(ws, data) {
        try {
            switch (data.type) {
                case 'ping':
                    this.sendToClient(ws, { type: 'pong', timestamp: Date.now() });
                    break;
                case 'get_status':
                    this.sendToClient(ws, {
                        type: 'status',
                        data: NeuralNetworkService.getStatus()
                    });
                    break;
                case 'get_performance':
                    const performance = await PerformanceAnalyzer.getPerformanceMetrics();
                    this.sendToClient(ws, {
                        type: 'performance',
                        data: performance
                    });
                    break;
                default:
                    console.log('Unknown WebSocket message type:', data.type);
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
            this.sendToClient(ws, {
                type: 'error',
                data: { message: error.message }
            });
        }
    }

    sendToClient(ws, message) {
        if (ws && ws.readyState === ws.OPEN) {
            try {
                // Валидация сообщения перед отправкой
                if (!message || typeof message !== 'object') {
                    console.error('Invalid WebSocket message format:', message);
                    return;
                }
                
                // Убеждаемся, что есть type и data
                if (!message.type) {
                    console.warn('WebSocket message missing type field:', message);
                    message.type = 'unknown';
                }
                
                // Убеждаемся, что есть timestamp
                if (!message.timestamp) {
                    message.timestamp = new Date().toISOString();
                }
                
                const messageStr = JSON.stringify(message);
                ws.send(messageStr);
            } catch (error) {
                console.error('Error sending message to client:', error);
                // Удаляем клиента при ошибке отправки
                this.clients.delete(ws);
                decrementConnectionCount();
            }
        }
    }

    broadcast(message) {
        if (!this.wss) {
            console.warn('WebSocket server not initialized, cannot broadcast');
            return;
        }

        // Валидация сообщения перед рассылкой
        if (!message || typeof message !== 'object') {
            console.error('Invalid WebSocket broadcast message format:', message);
            return;
        }
        
        // Убеждаемся, что есть type и data
        if (!message.type) {
            console.warn('WebSocket broadcast message missing type field:', message);
            message.type = 'unknown';
        }
        
        // Убеждаемся, что есть timestamp
        if (!message.timestamp) {
            message.timestamp = new Date().toISOString();
        }
        
        // Убеждаемся, что data существует
        if (!message.data) {
            message.data = {};
        }

        let sentCount = 0;
        const clientsToRemove = [];

        this.clients.forEach(client => {
            if (client.readyState === client.OPEN) {
                try {
                    const messageStr = JSON.stringify(message);
                    client.send(messageStr);
                    sentCount++;
                } catch (error) {
                    console.error('Error sending broadcast message to client:', error);
                    clientsToRemove.push(client);
                }
            } else {
                clientsToRemove.push(client);
            }
        });
        
        // Удаляем неактивных клиентов
        clientsToRemove.forEach(client => {
            this.clients.delete(client);
            decrementConnectionCount();
        });
    }

    broadcastSystemStatus(status) {
        this.broadcast({
            type: 'system_status_update',
            data: status,
            timestamp: new Date().toISOString()
        });
    }

    broadcastTradingStats(stats) {
        this.broadcast({
            type: 'trading_stats_update',
            data: stats,
            timestamp: new Date().toISOString()
        });
    }

    broadcastTradingSignal(signal) {
        this.broadcast({
            type: 'trading_signal',
            data: {
                figi: signal.figi || '',
                ticker: signal.ticker || '',
                name: signal.name || '',
                signalType: signal.signalType || signal.type || 'BUY', // BUY/SELL
                confidence: signal.confidence || 0,
                entryPrice: signal.entryPrice || signal.price || 0,
                stopLoss: signal.stopLoss || 0,
                takeProfit: signal.takeProfit || 0,
                strategy: signal.strategy || null,
                timestamp: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
        });
    }

    broadcastTrainingProgress(progress) {
        this.broadcast({
            type: 'training_progress',
            data: {
                modelType: progress.modelType || 'neural_network', // neural_network, ensemble, meta_learning, reinforcement_learning
                instrument: progress.instrument || null,
                currentEpoch: progress.currentEpoch || 0,
                totalEpochs: progress.totalEpochs || 0,
                loss: progress.loss || null,
                accuracy: progress.accuracy || null,
                valLoss: progress.valLoss || null,
                valAccuracy: progress.valAccuracy || null,
                eta: progress.eta || null, // Estimated time to completion in seconds
                learningRate: progress.learningRate || null,
                speed: progress.speed || null, // samples per second
                stage: progress.stage || 'training', // training, validation, etc.
                timestamp: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
        });
    }

    broadcastAlert(alert) {
        this.broadcast({
            type: 'alert',
            data: {
                id: alert.id || Date.now().toString(),
                type: alert.type || 'info', // info, warning, error, success
                severity: alert.severity || 'medium', // low, medium, high, critical
                message: alert.message || '',
                title: alert.title || null,
                category: alert.category || 'system', // system, trading, training, cache, etc.
                timestamp: new Date().toISOString(),
                details: alert.details || null
            },
            timestamp: new Date().toISOString()
        });
    }

    broadcastModelMetrics(metrics) {
        this.broadcast({
            type: 'model_metrics',
            data: {
                modelType: metrics.modelType || 'neural_network',
                instrument: metrics.instrument || null,
                figi: metrics.figi || null,
                accuracy: metrics.accuracy || null,
                mae: metrics.mae || null, // Mean Absolute Error
                rmse: metrics.rmse || null, // Root Mean Square Error
                mape: metrics.mape || null, // Mean Absolute Percentage Error
                sharpeRatio: metrics.sharpeRatio || null,
                winRate: metrics.winRate || null,
                totalPredictions: metrics.totalPredictions || 0,
                correctPredictions: metrics.correctPredictions || 0,
                marketComparison: metrics.marketComparison || null, // vs market performance
                lastUpdated: metrics.lastUpdated || new Date().toISOString(),
                timestamp: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
        });
    }

    broadcastError(error) {
        this.broadcast({
            type: 'error',
            data: {
                message: error?.message || 'Unknown error',
                error: error?.toString() || 'Unknown error',
                stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
                timestamp: new Date().toISOString()
            }
        });
    }

    broadcastStatus() {
        this.broadcast({
            type: 'status',
            data: NeuralNetworkService.getStatus(),
            timestamp: new Date().toISOString()
        });
    }

    getActiveConnectionsCount() {
        return this.clients.size;
    }

    // Отправка начального системного статуса при подключении
    async sendInitialSystemStatus(ws) {
        try {
            // Получаем сервисы из глобального ServiceManager
            const { getService } = await import('./GlobalServiceManager.js');
            const NeuralNetworkService = getService('NeuralNetworkService');
            const TradingEngine = getService('TradingEngine');
            const EnsembleService = getService('EnsembleService');
            
            // Получаем реальный статус системы с полными данными
            let neuralNetworkStatus = {};
            if (NeuralNetworkService) {
                try {
                    // Используем getModelStatus() для получения полных данных
                    neuralNetworkStatus = NeuralNetworkService.getModelStatus();
                } catch (error) {
                    console.warn('Error getting neural network status:', error);
                    // Fallback к базовому статусу
                    neuralNetworkStatus = {
                        status: NeuralNetworkService.isTraining ? 'training' : (NeuralNetworkService.isActive ? 'active' : 'off'),
                        isTraining: NeuralNetworkService.isTraining || false,
                        isActive: NeuralNetworkService.isActive || false,
                        isLoaded: !!NeuralNetworkService.model
                    };
                }
            }
            
            // Получаем статус ансамбля
            let ensembleStatus = {};
            if (EnsembleService) {
                try {
                    ensembleStatus = EnsembleService.getEnsembleStats();
                } catch (error) {
                    console.warn('Error getting ensemble status:', error);
                    ensembleStatus = {
                        isInitialized: EnsembleService.isInitialized || false,
                        isTraining: EnsembleService.isTraining || false
                    };
                }
            }
            
            const systemStatus = {
                neuralNetwork: neuralNetworkStatus,
                websocket: this.getStatus(), // {isConnected, clientsCount, isInitialized}
                database: { 
                    status: 'connected', 
                    lastQuery: new Date().toISOString() 
                },
                trading: { 
                    status: TradingEngine?.isActive ? 'active' : 'inactive',
                    mode: TradingEngine?.mode || 'paper',
                    isActive: TradingEngine?.isActive || false
                },
                ensemble: ensembleStatus
            };
            
            // Отправляем системный статус
            this.sendToClient(ws, {
                type: 'system_status_update',
                data: systemStatus,
                timestamp: new Date().toISOString()
            });

            // Отправляем статус кеша
            const SchedulerService = getService('SchedulerService');
            if (SchedulerService) {
                const cacheStatus = await SchedulerService.getCacheStatus();
                this.sendToClient(ws, {
                    type: 'cache_status_update',
                    data: cacheStatus,
                    timestamp: new Date().toISOString()
                });
            }

            // Отправляем торговую статистику
            if (TradingEngine) {
                try {
                    const portfolio = await TradingEngine.getVirtualPortfolioValue();
                    const stats = await TradingEngine.calculateTradingStats();
                    const Recommendation = (await import('../models/Recommendation.js')).default;
                    // Получаем топ-3 рекомендации - по одной для каждой стратегии
                    const topBuys = await Recommendation.getTopRecommendationsByStrategies();

                    const tradingStats = {
                        portfolioValue: portfolio.totalValue,
                        cash: portfolio.cash,
                        totalPnL: stats.totalReturn || 0,
                        winRate: (stats.winRate || 0) * 100,
                        totalTrades: stats.totalTrades || 0,
                        successfulTrades: Math.round((stats.totalTrades || 0) * (stats.winRate || 0)),
                        recommendations: topBuys.map(rec => ({
                            figi: rec.figi,
                            ticker: rec.ticker,
                            name: rec.name,
                            recommendation: rec.recommendation || 'BUY',
                            confidence: rec.strategyData?.strategyConfidence || rec.strategyData?.confidence || rec.confidence || 0,
                            score: rec.strategyData?.score || rec.score || 0,
                            strategyType: rec.strategyType || null,
                            horizon: rec.horizon || null
                        }))
                    };
                    
                    this.sendToClient(ws, {
                        type: 'trading_stats_update',
                        data: tradingStats,
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    console.warn('Could not get trading stats for initial send:', error.message);
                }
            }

            console.log('📡 Initial system status sent to new client');
        } catch (error) {
            console.error('❌ Error sending initial system status:', error);
        }
    }

    getStatus() {
        return {
            isConnected: this.wss !== null,
            clientsCount: this.clients.size,
            isInitialized: this.wss !== null
        };
    }
}

// Глобальный экземпляр
let globalWebSocketService = null;
let connectionCount = 0;
const MAX_CONNECTIONS = 5;

// Функция для получения глобального экземпляра
export function getWebSocketService() {
    if (!globalWebSocketService) {
        globalWebSocketService = new WebSocketService();
        console.log('🌐 Created global WebSocketService instance');
    } else {
        console.log('🔄 Reusing existing WebSocketService instance');
    }
    return globalWebSocketService;
}

// Глобальная защита от множественных подключений
export function checkConnectionLimit() {
    if (connectionCount >= MAX_CONNECTIONS) {
        console.log(`⚠️ Connection limit reached (${connectionCount}/${MAX_CONNECTIONS}), blocking new connections`);
        return false;
    }
    return true;
}

export function incrementConnectionCount() {
    connectionCount++;
    console.log(`🔌 Connection count: ${connectionCount}/${MAX_CONNECTIONS}`);
}

export function decrementConnectionCount() {
    connectionCount = Math.max(0, connectionCount - 1);
    console.log(`🔌 Connection count: ${connectionCount}/${MAX_CONNECTIONS}`);
}

export default WebSocketService;