import { executeWorkerTask } from './workerUtils.js';
import OptimizedTelegramService from '../../services/OptimizedTelegramService.js';
import LoggerService from '../../services/LoggerService.js';

/**
 * Утилиты для обновления цен
 */

/**
 * Выполняет обновление цен инструментов
 * @param {Object} context - Контекст выполнения
 * @param {Function} context.getWebSocketService - Функция получения WebSocket сервиса
 * @param {Set} context.workersSet - Set для отслеживания workers
 * @param {Function} context.checkFullCacheUpdate - Функция проверки полного обновления кеша
 * @returns {Promise<Object>} Результат обновления
 */
export async function performPriceUpdate(context) {
    const { getWebSocketService, workersSet, checkFullCacheUpdate } = context;
    
    // Проверяем, не идет ли полное обновление кеша
    if (checkFullCacheUpdate && checkFullCacheUpdate()) {
        if (LoggerService.isInitialized) {
            LoggerService.info('Price update skipped: full cache update is running', {
                service: 'priceUpdateUtils',
                operation: 'performPriceUpdate'
            });
        } else {
            console.log('💰 Price update skipped: full cache update is running');
        }
        return {
            success: true,
            skipped: true,
            message: 'Price update skipped - full cache update is running'
        };
    }
    
    try {
        if (LoggerService.isInitialized) {
            LoggerService.info('Starting price update in worker', {
                service: 'priceUpdateUtils',
                operation: 'performPriceUpdate'
            });
        } else {
            console.log('💰 Starting price update in worker...');
        }
        
        const result = await executeWorkerTask(
            'priceUpdateWorker.js',
            {
                instrumentsLimit: 1000 // Обновляем цены для всех инструментов
            },
            {
                getWebSocketService,
                workersSet,
                broadcastType: 'price_update'
            }
        );
        
        // Проверяем, что результат существует и имеет нужные свойства
        if (!result || typeof result !== 'object') {
            if (LoggerService.isInitialized) {
                LoggerService.warn('Price update returned invalid result', {
                    service: 'priceUpdateUtils',
                    operation: 'performPriceUpdate',
                    result: result
                });
            } else {
                console.warn('⚠️ Price update returned invalid result:', result);
            }
            return {
                success: true,
                message: 'Price update completed',
                totalUpdated: 0,
                totalFailed: 0,
                duration: 0
            };
        }
        
        const duration = (result && result.duration) ? result.duration : 0;
        const totalUpdated = (result && result.totalUpdated) ? result.totalUpdated : 0;
        const totalFailed = (result && result.totalFailed) ? result.totalFailed : 0;
        
        if (LoggerService.isInitialized) {
            LoggerService.info('Price update completed', {
                service: 'priceUpdateUtils',
                operation: 'performPriceUpdate',
                duration,
                totalUpdated,
                totalFailed
            });
        } else {
            console.log(`✅ Price update completed in ${duration}s. Updated: ${totalUpdated}, Failed: ${totalFailed}`);
        }
        
        return {
            ...result,
            duration,
            totalUpdated,
            totalFailed
        };
    } catch (error) {
        if (LoggerService.isInitialized) {
            LoggerService.error('Price update failed', {
                service: 'priceUpdateUtils',
                operation: 'performPriceUpdate',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
        } else {
            console.error('❌ Price update failed:', error);
        }
        throw error;
    }
}

/**
 * Выполняет обновление цен портфеля
 * @param {Object} context - Контекст выполнения
 * @param {Function} context.getWebSocketService - Функция получения WebSocket сервиса
 * @param {Set} context.workersSet - Set для отслеживания workers
 * @param {Function} context.checkFullCacheUpdate - Функция проверки полного обновления кеша
 * @param {Function} context.recalculatePortfolioValue - Функция пересчета стоимости портфеля
 * @returns {Promise<Object>} Результат обновления
 */
export async function performPortfolioPricesUpdate(context) {
    const { getWebSocketService, workersSet, checkFullCacheUpdate, recalculatePortfolioValue } = context;
    
    // Проверяем, не идет ли полное обновление кеша
    if (checkFullCacheUpdate && checkFullCacheUpdate()) {
        if (LoggerService.isInitialized) {
            LoggerService.info('Portfolio prices update skipped: full cache update is running', {
                service: 'priceUpdateUtils',
                operation: 'performPortfolioPricesUpdate'
            });
        } else {
            console.log('💰 Portfolio prices update skipped: full cache update is running');
        }
        return {
            success: true,
            skipped: true,
            message: 'Portfolio prices update skipped - full cache update is running'
        };
    }
    
    const startTime = Date.now();
    
    try {
        // Проверяем, доступна ли торговля
        const TinkoffApiService = (await import('../../services/TinkoffApiService.js')).default;
        const isTradingAvailable = await TinkoffApiService.isTradingAvailable();
        
        if (!isTradingAvailable) {
            if (LoggerService.isInitialized) {
                LoggerService.info('Skipping portfolio prices update - trading not available', {
                    service: 'priceUpdateUtils',
                    operation: 'performPortfolioPricesUpdate'
                });
            } else {
                console.log('⏭️ Skipping portfolio prices update - trading not available');
            }
            return {
                success: true,
                message: 'Trading not available, update skipped',
                skipped: true
            };
        }
        
        if (LoggerService.isInitialized) {
            LoggerService.info('Starting portfolio prices update in worker', {
                service: 'priceUpdateUtils',
                operation: 'performPortfolioPricesUpdate'
            });
        } else {
            console.log('💰 Starting portfolio prices update in worker...');
        }
        
        const result = await executeWorkerTask(
            'portfolioPricesUpdateWorker.js',
            {},
            {
                getWebSocketService,
                workersSet,
                broadcastType: 'portfolio_prices_update'
            }
        );
        
        // Проверяем, что результат существует
        if (!result || typeof result !== 'object') {
            if (LoggerService.isInitialized) {
                LoggerService.warn('Portfolio prices update returned invalid result', {
                    service: 'priceUpdateUtils',
                    operation: 'performPortfolioPricesUpdate',
                    result: result
                });
            } else {
                console.warn('⚠️ Portfolio prices update returned invalid result:', result);
            }
            const duration = Math.round((Date.now() - startTime) / 1000);
            return {
                success: true,
                message: 'Portfolio prices update completed',
                totalUpdated: 0,
                totalFailed: 0,
                duration
            };
        }
        
        const duration = (result && result.duration) ? result.duration : Math.round((Date.now() - startTime) / 1000);
        const totalUpdated = (result && result.totalUpdated) ? result.totalUpdated : 0;
        const totalFailed = (result && result.totalFailed) ? result.totalFailed : 0;
        
        if (LoggerService.isInitialized) {
            LoggerService.info('Portfolio prices update completed', {
                service: 'priceUpdateUtils',
                operation: 'performPortfolioPricesUpdate',
                duration,
                totalUpdated,
                totalFailed
            });
        } else {
            console.log(`✅ Portfolio prices update completed in ${duration}s. Updated: ${totalUpdated}, Failed: ${totalFailed}`);
        }
        
        // Пересчитываем стоимость портфеля после обновления цен
        if (recalculatePortfolioValue) {
            try {
                await recalculatePortfolioValue();
            } catch (recalcError) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Error recalculating portfolio value', {
                        service: 'priceUpdateUtils',
                        operation: 'performPortfolioPricesUpdate',
                        error: {
                            message: recalcError.message,
                            stack: recalcError.stack
                        }
                    });
                } else {
                    console.warn('⚠️ Error recalculating portfolio value:', recalcError.message);
                }
            }
        }
        
        return result;
    } catch (error) {
        if (LoggerService.isInitialized) {
            LoggerService.error('Portfolio prices update failed', {
                service: 'priceUpdateUtils',
                operation: 'performPortfolioPricesUpdate',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
        } else {
            console.error('❌ Portfolio prices update failed:', error);
        }
        throw error;
    }
}

/**
 * Выполняет обновление цен активных сигналов
 * @param {Object} context - Контекст выполнения
 * @param {Function} context.getWebSocketService - Функция получения WebSocket сервиса
 * @param {Set} context.workersSet - Set для отслеживания workers
 * @param {Function} context.checkFullCacheUpdate - Функция проверки полного обновления кеша
 * @param {Function} context.handleTriggeredSignals - Функция обработки сработавших сигналов
 * @returns {Promise<Object>} Результат обновления
 */
export async function performActiveSignalsPricesUpdate(context) {
    const { getWebSocketService, workersSet, checkFullCacheUpdate, handleTriggeredSignals } = context;
    
    // Проверяем, не идет ли полное обновление кеша
    if (checkFullCacheUpdate && checkFullCacheUpdate()) {
        if (LoggerService.isInitialized) {
            LoggerService.info('Active signals prices update skipped: full cache update is running', {
                service: 'priceUpdateUtils',
                operation: 'performActiveSignalsPricesUpdate'
            });
        } else {
            console.log('📊 Active signals prices update skipped: full cache update is running');
        }
        return {
            success: true,
            skipped: true,
            message: 'Active signals prices update skipped - full cache update is running'
        };
    }
    
    try {
        // Проверяем, доступна ли торговля
        const TinkoffApiService = (await import('../../services/TinkoffApiService.js')).default;
        const isTradingAvailable = await TinkoffApiService.isTradingAvailable();
        
        if (!isTradingAvailable) {
            if (LoggerService.isInitialized) {
                LoggerService.info('Skipping active signals prices update - trading not available', {
                    service: 'priceUpdateUtils',
                    operation: 'performActiveSignalsPricesUpdate'
                });
            } else {
                console.log('⏭️ Skipping active signals prices update - trading not available');
            }
            return {
                success: true,
                skipped: true,
                message: 'Trading not available, update skipped'
            };
        }
        
        if (LoggerService.isInitialized) {
            LoggerService.info('Starting active signals prices update in worker', {
                service: 'priceUpdateUtils',
                operation: 'performActiveSignalsPricesUpdate'
            });
        } else {
            console.log('📊 Starting active signals prices update in worker...');
        }
        
        const result = await executeWorkerTask(
            'activeSignalsPricesUpdateWorker.js',
            {},
            {
                getWebSocketService,
                workersSet,
                broadcastType: 'active_signals_prices_update'
            }
        );
        
        // Проверяем, что результат существует
        if (!result || typeof result !== 'object') {
            if (LoggerService.isInitialized) {
                LoggerService.warn('Active signals prices update returned invalid result', {
                    service: 'priceUpdateUtils',
                    operation: 'performActiveSignalsPricesUpdate',
                    result: result
                });
            } else {
                console.warn('⚠️ Active signals prices update returned invalid result:', result);
            }
            return {
                success: true,
                message: 'Active signals prices update completed',
                totalUpdated: 0,
                triggeredSignals: []
            };
        }
        
        const totalUpdated = (result && result.totalUpdated) ? result.totalUpdated : 0;
        const triggeredSignals = (result && result.triggeredSignals) ? result.triggeredSignals : [];
        
        if (LoggerService.isInitialized) {
            LoggerService.info('Active signals prices update completed', {
                service: 'priceUpdateUtils',
                operation: 'performActiveSignalsPricesUpdate',
                totalUpdated,
                triggeredCount: triggeredSignals.length
            });
        } else {
            console.log(`✅ Active signals prices update completed. Updated: ${totalUpdated}, Triggered: ${triggeredSignals.length}`);
        }
        
        // Обрабатываем сработавшие сигналы
        if (result.triggeredSignals && result.triggeredSignals.length > 0 && handleTriggeredSignals) {
            await handleTriggeredSignals(result.triggeredSignals);
        }
        
        return result;
    } catch (error) {
        if (LoggerService.isInitialized) {
            LoggerService.error('Active signals prices update failed', {
                service: 'priceUpdateUtils',
                operation: 'performActiveSignalsPricesUpdate',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
        } else {
            console.error('❌ Active signals prices update failed:', error);
        }
        throw error;
    }
}

/**
 * Выполняет обновление цен активных торговых заявок
 * @param {Object} context - Контекст выполнения
 * @param {Function} context.getWebSocketService - Функция получения WebSocket сервиса
 * @param {Set} context.workersSet - Set для отслеживания workers
 * @param {Function} context.checkFullCacheUpdate - Функция проверки полного обновления кеша
 * @returns {Promise<Object>} Результат обновления
 */
export async function performTradingRequestsPricesUpdate(context) {
    const { getWebSocketService, workersSet, checkFullCacheUpdate } = context;
    
    // Проверяем, не идет ли полное обновление кеша
    if (checkFullCacheUpdate && checkFullCacheUpdate()) {
        if (LoggerService.isInitialized) {
            LoggerService.info('Trading requests prices update skipped: full cache update is running', {
                service: 'priceUpdateUtils',
                operation: 'performTradingRequestsPricesUpdate'
            });
        } else {
            console.log('📋 Trading requests prices update skipped: full cache update is running');
        }
        return {
            success: true,
            skipped: true,
            message: 'Trading requests prices update skipped - full cache update is running'
        };
    }
    
    try {
        // Проверяем, доступна ли торговля
        const TinkoffApiService = (await import('../../services/TinkoffApiService.js')).default;
        const isTradingAvailable = await TinkoffApiService.isTradingAvailable();
        
        if (!isTradingAvailable) {
            if (LoggerService.isInitialized) {
                LoggerService.info('Skipping trading requests prices update - trading not available', {
                    service: 'priceUpdateUtils',
                    operation: 'performTradingRequestsPricesUpdate'
                });
            } else {
                console.log('⏭️ Skipping trading requests prices update - trading not available');
            }
            return {
                success: true,
                skipped: true,
                message: 'Trading not available, update skipped'
            };
        }
        
        if (LoggerService.isInitialized) {
            LoggerService.info('Starting trading requests prices update in worker', {
                service: 'priceUpdateUtils',
                operation: 'performTradingRequestsPricesUpdate'
            });
        } else {
            console.log('📋 Starting trading requests prices update in worker...');
        }
        
        const result = await executeWorkerTask(
            'tradingRequestsPricesUpdateWorker.js',
            {},
            {
                getWebSocketService,
                workersSet,
                broadcastType: 'trading_requests_prices_update'
            }
        );
        
        // Проверяем, что результат существует
        if (!result || typeof result !== 'object') {
            if (LoggerService.isInitialized) {
                LoggerService.warn('Trading requests prices update returned invalid result', {
                    service: 'priceUpdateUtils',
                    operation: 'performTradingRequestsPricesUpdate',
                    result: result
                });
            } else {
                console.warn('⚠️ Trading requests prices update returned invalid result:', result);
            }
            return {
                success: true,
                message: 'Trading requests prices update completed',
                totalUpdated: 0
            };
        }
        
        // Убеждаемся, что все необходимые поля присутствуют
        return {
            ...result,
            totalUpdated: (result && result.totalUpdated) ? result.totalUpdated : 0,
            success: result.success !== undefined ? result.success : true
        };
    } catch (error) {
        if (LoggerService.isInitialized) {
            LoggerService.error('Trading requests prices update failed', {
                service: 'priceUpdateUtils',
                operation: 'performTradingRequestsPricesUpdate',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
        } else {
            console.error('❌ Trading requests prices update failed:', error);
        }
        throw error;
    }
}

/**
 * Пересчитывает стоимость портфеля на основе обновленных цен
 * @param {Object} context - Контекст выполнения
 * @param {Function} context.getWebSocketService - Функция получения WebSocket сервиса
 * @returns {Promise<void>}
 */
export async function recalculatePortfolioValue(context) {
    const { getWebSocketService } = context;
    
    try {
        const TradingEngine = (await import('../../services/TradingEngine.js')).default;
        const portfolio = await TradingEngine.getPortfolioValue();
        
        if (!portfolio || !portfolio.positions) {
            return;
        }

        const trades = portfolio?.trades || [];
        const rawPositions = portfolio.positions || {};
        
        // РАССЧИТЫВАЕМ ПОЗИЦИИ С УЧЕТОМ СТРАТЕГИЙ (как в /api/portfolio)
        const { calculatePositionsWithStrategies, calculatePnLFromPositions } = await import('../portfolioPositionsCalculator.js');
        const positionsByFigi = await calculatePositionsWithStrategies(portfolio, rawPositions, trades);
        
        // РАССЧИТЫВАЕМ P&L ИЗ ПОЗИЦИЙ С УЧЕТОМ СТРАТЕГИЙ
        const pnlResult = await calculatePnLFromPositions(portfolio, positionsByFigi, rawPositions);
        
        const positionsValue = pnlResult.positionsValue > 0 ? pnlResult.positionsValue : (portfolio?.positionsValue || 0);
        const aggregatedPositions = pnlResult.aggregatedPositions;

        const cash = portfolio.cash || 0;
        const totalValue = cash + positionsValue;

        // Проверяем состояние подключения к БД перед сохранением
        const sequelize = (await import('../../config/database.js')).default;
        if (sequelize.connectionManager && sequelize.connectionManager.pool) {
            const pool = sequelize.connectionManager.pool;
            if (pool._draining) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('Connection pool is draining, skipping portfolio update', {
                        service: 'priceUpdateUtils',
                        operation: 'recalculatePortfolioValue'
                    });
                } else {
                    console.warn('⚠️ Connection pool is draining, skipping portfolio update');
                }
                return {
                    cash,
                    positionsValue,
                    totalValue
                };
            }
        }

        // Сохраняем обновленную стоимость портфеля
        const VirtualPortfolio = (await import('../../models/VirtualPortfolio.js')).default;
        const savedPortfolio = await VirtualPortfolio.getCurrent();
        if (savedPortfolio) {
            await savedPortfolio.update({
                totalValue: totalValue,
                lastUpdated: new Date()
            });
        }

        // Отправляем обновление через WebSocket
        const WebSocketService = await getWebSocketService();
        if (WebSocketService) {
            // Используем рассчитанные данные из pnlResult
            WebSocketService.broadcast({
                type: 'portfolio_value_updated',
                data: {
                    cash,
                    positionsValue,
                    totalValue,
                    initialCapital: portfolio.initialCapital || 1000000,
                    pnl: {
                        total: pnlResult.totalPnL,
                        totalPercent: pnlResult.totalPnLPercent,
                        realized: pnlResult.realizedPnL,
                        realizedPercent: pnlResult.realizedPnLPercent,
                        unrealized: pnlResult.unrealizedPnL
                    },
                    timestamp: new Date().toISOString()
                }
            });
        }

        if (LoggerService.isInitialized) {
            LoggerService.info('Portfolio value recalculated', {
                service: 'priceUpdateUtils',
                operation: 'recalculatePortfolioValue',
                totalValue,
                positionsValue,
                cash
            });
        } else {
            console.log(`💰 Portfolio value recalculated: ${totalValue.toLocaleString('ru-RU')} ₽ (positions: ${positionsValue.toLocaleString('ru-RU')} ₽, cash: ${cash.toLocaleString('ru-RU')} ₽)`);
        }
        
        return {
            cash,
            positionsValue,
            totalValue
        };
    } catch (error) {
        // Обрабатываем ошибку закрытого connection manager
        if (error.message && error.message.includes('connection manager was closed')) {
            if (LoggerService.isInitialized) {
                LoggerService.warn('Connection manager was closed during portfolio recalculation, attempting to restore', {
                    service: 'priceUpdateUtils',
                    operation: 'recalculatePortfolioValue',
                    error: {
                        message: error.message
                    }
                });
            } else {
                console.warn('⚠️ Connection manager was closed during portfolio recalculation, attempting to restore...');
            }
            
            // Пытаемся восстановить соединение через DatabaseConnectionManager
            try {
                const DatabaseConnectionManager = (await import('../../utils/DatabaseConnectionManager.js')).default;
                await DatabaseConnectionManager.reconnect();
                
                if (LoggerService.isInitialized) {
                    LoggerService.info('Connection restored, retrying portfolio recalculation', {
                        service: 'priceUpdateUtils',
                        operation: 'recalculatePortfolioValue'
                    });
                } else {
                    console.log('✅ Connection restored, retrying portfolio recalculation...');
                }
                
                // Повторяем попытку через небольшую задержку
                await new Promise(resolve => setTimeout(resolve, 1000));
                return await recalculatePortfolioValue(context);
            } catch (reconnectError) {
                if (LoggerService.isInitialized) {
                    LoggerService.error('Failed to restore connection', {
                        service: 'priceUpdateUtils',
                        operation: 'recalculatePortfolioValue',
                        error: {
                            message: reconnectError.message,
                            stack: reconnectError.stack
                        }
                    });
                } else {
                    console.error('❌ Failed to restore connection:', reconnectError.message);
                }
                // Не бросаем ошибку дальше, чтобы не прерывать другие процессы
                return null;
            }
        }
        
        if (LoggerService.isInitialized) {
            LoggerService.error('Error recalculating portfolio value', {
                service: 'priceUpdateUtils',
                operation: 'recalculatePortfolioValue',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
        } else {
            console.error('❌ Error recalculating portfolio value:', error);
        }
        // Не бросаем ошибку дальше, чтобы не прерывать другие процессы
        return null;
    }
}

