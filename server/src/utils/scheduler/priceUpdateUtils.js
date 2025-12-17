import { executeWorkerTask } from './workerUtils.js';
import OptimizedTelegramService from '../../services/OptimizedTelegramService.js';

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
        console.log('💰 Price update skipped: full cache update is running');
        return {
            success: true,
            skipped: true,
            message: 'Price update skipped - full cache update is running'
        };
    }
    
    try {
        console.log('💰 Starting price update in worker...');
        
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
        
        console.log(`✅ Price update completed in ${result.duration}s. Updated: ${result.totalUpdated}, Failed: ${result.totalFailed || 0}`);
        
        return result;
    } catch (error) {
        console.error('❌ Price update failed:', error);
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
        console.log('💰 Portfolio prices update skipped: full cache update is running');
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
            console.log('⏭️ Skipping portfolio prices update - trading not available');
            return {
                success: true,
                message: 'Trading not available, update skipped',
                skipped: true
            };
        }
        
        console.log('💰 Starting portfolio prices update in worker...');
        
        const result = await executeWorkerTask(
            'portfolioPricesUpdateWorker.js',
            {},
            {
                getWebSocketService,
                workersSet,
                broadcastType: 'portfolio_prices_update'
            }
        );
        
        const duration = Math.round((Date.now() - startTime) / 1000);
        console.log(`✅ Portfolio prices update completed in ${duration}s. Updated: ${result.totalUpdated}, Failed: ${result.totalFailed || 0}`);
        
        // Пересчитываем стоимость портфеля после обновления цен
        if (recalculatePortfolioValue) {
            try {
                await recalculatePortfolioValue();
            } catch (recalcError) {
                console.warn('⚠️ Error recalculating portfolio value:', recalcError.message);
            }
        }
        
        return result;
    } catch (error) {
        console.error('❌ Portfolio prices update failed:', error);
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
        console.log('📊 Active signals prices update skipped: full cache update is running');
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
            console.log('⏭️ Skipping active signals prices update - trading not available');
            return {
                success: true,
                skipped: true,
                message: 'Trading not available, update skipped'
            };
        }
        
        console.log('📊 Starting active signals prices update in worker...');
        
        const result = await executeWorkerTask(
            'activeSignalsPricesUpdateWorker.js',
            {},
            {
                getWebSocketService,
                workersSet,
                broadcastType: 'active_signals_prices_update'
            }
        );
        
        console.log(`✅ Active signals prices update completed. Updated: ${result.totalUpdated || 0}, Triggered: ${result.triggeredSignals?.length || 0}`);
        
        // Обрабатываем сработавшие сигналы
        if (result.triggeredSignals && result.triggeredSignals.length > 0 && handleTriggeredSignals) {
            await handleTriggeredSignals(result.triggeredSignals);
        }
        
        return result;
    } catch (error) {
        console.error('❌ Active signals prices update failed:', error);
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
        console.log('📋 Trading requests prices update skipped: full cache update is running');
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
            console.log('⏭️ Skipping trading requests prices update - trading not available');
            return {
                success: true,
                skipped: true,
                message: 'Trading not available, update skipped'
            };
        }
        
        console.log('📋 Starting trading requests prices update in worker...');
        
        const result = await executeWorkerTask(
            'tradingRequestsPricesUpdateWorker.js',
            {},
            {
                getWebSocketService,
                workersSet,
                broadcastType: 'trading_requests_prices_update'
            }
        );
        
        console.log(`✅ Trading requests prices update completed. Updated: ${result.totalUpdated || 0}`);
        
        return result;
    } catch (error) {
        console.error('❌ Trading requests prices update failed:', error);
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

        let positionsValue = 0;
        const positions = portfolio.positions || {};
        
        // Получаем цены для всех позиций
        const CacheService = (await import('../../services/CacheService.js')).default;
        const CachedInstrument = (await import('../../models/CachedInstrument.js')).default;
        
        for (const [figi, quantity] of Object.entries(positions)) {
            if (quantity && typeof quantity === 'number' && quantity > 0) {
                try {
                    const instrument = await CachedInstrument.findOne({ where: { figi } });
                    if (instrument && instrument.lastPrice && instrument.lastPrice > 0) {
                        positionsValue += instrument.lastPrice * quantity;
                    }
                } catch (error) {
                    console.warn(`⚠️ Error getting price for ${figi}:`, error.message);
                }
            }
        }

        const cash = portfolio.cash || 0;
        const totalValue = cash + positionsValue;

        // Проверяем состояние подключения к БД перед сохранением
        const sequelize = (await import('../../config/database.js')).default;
        if (sequelize.connectionManager && sequelize.connectionManager.pool) {
            const pool = sequelize.connectionManager.pool;
            if (pool._draining) {
                console.warn('⚠️ Connection pool is draining, skipping portfolio update');
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
            WebSocketService.broadcast({
                type: 'portfolio_value_updated',
                data: {
                    cash,
                    positionsValue,
                    totalValue,
                    initialCapital: portfolio.initialCapital || 1000000,
                    pnl: totalValue - (portfolio.initialCapital || 1000000),
                    pnlPercent: portfolio.initialCapital ? ((totalValue - portfolio.initialCapital) / portfolio.initialCapital) * 100 : 0,
                    timestamp: new Date().toISOString()
                }
            });
        }

        console.log(`💰 Portfolio value recalculated: ${totalValue.toLocaleString('ru-RU')} ₽ (positions: ${positionsValue.toLocaleString('ru-RU')} ₽, cash: ${cash.toLocaleString('ru-RU')} ₽)`);
        
        return {
            cash,
            positionsValue,
            totalValue
        };
    } catch (error) {
        // Обрабатываем ошибку закрытого connection manager
        if (error.message && error.message.includes('connection manager was closed')) {
            console.warn('⚠️ Connection manager was closed during portfolio recalculation, attempting to restore...');
            
            // Пытаемся восстановить соединение через DatabaseConnectionManager
            try {
                const DatabaseConnectionManager = (await import('../../utils/DatabaseConnectionManager.js')).default;
                await DatabaseConnectionManager.reconnect();
                console.log('✅ Connection restored, retrying portfolio recalculation...');
                
                // Повторяем попытку через небольшую задержку
                await new Promise(resolve => setTimeout(resolve, 1000));
                return await recalculatePortfolioValue(context);
            } catch (reconnectError) {
                console.error('❌ Failed to restore connection:', reconnectError.message);
                // Не бросаем ошибку дальше, чтобы не прерывать другие процессы
                return null;
            }
        }
        
        console.error('❌ Error recalculating portfolio value:', error);
        // Не бросаем ошибку дальше, чтобы не прерывать другие процессы
        return null;
    }
}

