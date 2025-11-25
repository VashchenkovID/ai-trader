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
            // Добавляем отладочную информацию
            try {
                const stack = new Error().stack;
                if (stack) {
                    console.log('🔍 WebSocket connection attempt from:', stack.split('\n')[2]?.trim() || 'unknown');
                    console.log('🔍 Full stack trace:', stack.split('\n').slice(0, 10).join('\n'));
                } else {
                    console.log('🔍 WebSocket connection attempt from: unknown (no stack trace)');
                }
            } catch (error) {
                console.log('🔍 WebSocket connection attempt from: unknown (error getting stack trace)');
            }
            
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
                ws.send(JSON.stringify(message));
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

        const messageStr = JSON.stringify(message);
        let sentCount = 0;

        this.clients.forEach(client => {
            if (client.readyState === client.OPEN) {
                try {
                    client.send(messageStr);
                    sentCount++;
                } catch (error) {
                    console.error('Error sending message to client:', error);
                    this.clients.delete(client);
                }
            } else {
                this.clients.delete(client);
            }
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

    broadcastError(error) {
        this.broadcast({
            type: 'error',
            data: {
                message: error.message,
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
            
            // Получаем реальный статус системы
            const systemStatus = {
                neuralNetwork: {
                    status: NeuralNetworkService?.isTraining ? 'training' : 'active',
                    isTraining: NeuralNetworkService?.isTraining || false,
                    lastAnalysis: NeuralNetworkService?.lastAnalysisTime || null
                },
                websocket: { 
                    status: 'connected', 
                    clients: this.getStatus().clientsCount
                },
                database: { 
                    status: 'connected', 
                    lastQuery: new Date().toISOString() 
                },
                trading: { 
                    status: TradingEngine?.isActive ? 'active' : 'inactive',
                    mode: TradingEngine?.mode || 'paper'
                }
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
                    const topBuys = await Recommendation.getTopRecommendations(3, 'BUY');

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
                            recommendation: rec.recommendation,
                            confidence: rec.confidence,
                            score: rec.score
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