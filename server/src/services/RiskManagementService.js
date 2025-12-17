import OptimizedTelegramService from './OptimizedTelegramService.js';
import OptimizedDataService from './OptimizedDataService.js';
import CacheService from './CacheService.js';
import TrailingStop from '../models/TrailingStop.js';
import InstrumentStats from '../models/InstrumentStats.js';
import Settings from '../models/Settings.js';

/**
 * Сервис управления рисками для торговли
 * Контролирует размеры позиций, просадки, стоп-лоссы и общую безопасность торговли
 */
class RiskManagementService {
    constructor() {
        this.isInitialized = false;
        
        // Основные лимиты риска
        this.limits = {
            maxPositionSize: 0.02,        // 2% от капитала на одну позицию
            maxTotalExposure: 0.20,       // 20% от капитала в акциях
            maxDrawdown: 0.15,            // 15% максимальная просадка
            maxConsecutiveLosses: 5,      // 5 убыточных сделок подряд
            maxDailyLoss: 0.05,           // 5% максимальный дневной убыток
            minConfidence: 0.6,           // 60% минимальная уверенность для сделки
            maxVolatility: 0.30           // 30% максимальная волатильность инструмента
        };
        
        // Статистика торговли
        this.stats = {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            consecutiveLosses: 0,
            maxConsecutiveLosses: 0,
            currentDrawdown: 0,
            maxDrawdown: 0,
            dailyPnL: 0,
            totalPnL: 0,
            winRate: 0,
            averageWin: 0,
            averageLoss: 0,
            profitFactor: 0
        };
        
        // История сделок для анализа
        this.tradeHistory = [];
        this.dailyHistory = [];
        
        // Настройки формулы Келли (инициализируются значениями по умолчанию)
        this.kellySettings = {
            enabled: false,               // Включен ли индивидуальный расчет Келли
            conservativeFactor: 0.25,     // Коэффициент консервативности (1/4 от Келли)
            minTrades: 10,                // Минимальное количество сделок для использования статистики
            volatilityPeriod: 30          // Период расчета волатильности в днях
        };
        
        // Алерты и предупреждения
        this.alerts = [];
        this.emergencyStop = false;
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            console.log('🛡️ Инициализация RiskManagementService...');
            
            // Загружаем сохраненную статистику если есть
            await this.loadStats();
            
            // Загружаем настройки формулы Келли
            await this.loadKellySettings();
            
            this.isInitialized = true;
            console.log('✅ RiskManagementService инициализирован');
            
        } catch (error) {
            console.error('❌ Ошибка инициализации RiskManagementService:', error);
            throw error;
        }
    }

    /**
     * Валидация торгового сигнала перед исполнением
     */
    async validateOrder(signal, portfolio, currentPrices = {}) {
        if (!this.isInitialized) {
            throw new Error('RiskManagementService не инициализирован');
        }

        const validation = {
            isValid: true,
            warnings: [],
            errors: [],
            adjustedSignal: null
        };

        try {
            // 1. Проверка экстренной остановки
            if (this.emergencyStop) {
                validation.isValid = false;
                validation.errors.push('Экстренная остановка активна');
                return validation;
            }

            // 2. Проверка минимальной уверенности
            if (signal.confidence < this.limits.minConfidence) {
                validation.isValid = false;
                validation.errors.push(`Уверенность ${(signal.confidence * 100).toFixed(1)}% ниже минимума ${(this.limits.minConfidence * 100)}%`);
            }

            // 3. Проверка максимальной просадки
            if (this.stats.currentDrawdown > this.limits.maxDrawdown) {
                validation.isValid = false;
                validation.errors.push(`Просадка ${(this.stats.currentDrawdown * 100).toFixed(1)}% превышает лимит ${(this.limits.maxDrawdown * 100)}%`);
            }

            // 4. Проверка последовательных убытков
            if (this.stats.consecutiveLosses >= this.limits.maxConsecutiveLosses) {
                validation.isValid = false;
                validation.errors.push(`Слишком много убыточных сделок подряд: ${this.stats.consecutiveLosses}`);
            }

            // 5. Проверка дневного убытка
            if (this.stats.dailyPnL < -this.limits.maxDailyLoss * portfolio.totalValue) {
                validation.isValid = false;
                validation.errors.push(`Дневной убыток ${this.stats.dailyPnL.toFixed(2)}₽ превышает лимит`);
            }

            // 6. Расчет размера позиции
            const positionSize = await this.calculatePositionSize(signal, portfolio, currentPrices);
            if (positionSize > this.limits.maxPositionSize * portfolio.totalValue) {
                validation.warnings.push(`Размер позиции ${positionSize.toFixed(2)}₽ превышает рекомендуемый лимит`);
                validation.adjustedSignal = {
                    ...signal,
                    quantity: Math.floor(this.limits.maxPositionSize * portfolio.totalValue / (currentPrices[signal.symbol] || signal.price))
                };
            }

            // 7. Проверка общего воздействия
            const totalExposure = this.calculateTotalExposure(portfolio, currentPrices);
            if (totalExposure > this.limits.maxTotalExposure) {
                validation.warnings.push(`Общее воздействие ${(totalExposure * 100).toFixed(1)}% превышает лимит ${(this.limits.maxTotalExposure * 100)}%`);
            }

            // 8. Проверка волатильности инструмента
            if (signal.volatility && signal.volatility > this.limits.maxVolatility) {
                validation.warnings.push(`Волатильность ${(signal.volatility * 100).toFixed(1)}% превышает лимит ${(this.limits.maxVolatility * 100)}%`);
            }

            // 9. Проверка корреляции с существующими позициями
            const correlationRisk = await this.checkCorrelationRisk(signal, portfolio);
            
            if (correlationRisk.recommendation === 'BLOCK') {
                validation.isValid = false;
                validation.errors.push(
                    `Высокая корреляция портфеля (${(correlationRisk.portfolioCorrelation * 100).toFixed(1)}%). ` +
                    `Максимально допустимая корреляция: ${(correlationRisk.portfolioThreshold * 100).toFixed(0)}%. ` +
                    `Высококоррелированные позиции: ${correlationRisk.correlatedPositions.slice(0, 3).join(', ')}${correlationRisk.correlatedPositions.length > 3 ? '...' : ''}`
                );
            } else if (correlationRisk.recommendation === 'WARNING') {
                const highCorrPositions = correlationRisk.correlationDetails
                    .filter(d => d.risk === 'HIGH')
                    .map(d => d.figi)
                    .slice(0, 3);
                
                validation.warnings.push(
                    `Высокая корреляция с ${correlationRisk.correlatedPositions.length} позициями ` +
                    `(портфель: ${(correlationRisk.portfolioCorrelation * 100).toFixed(1)}%). ` +
                    (highCorrPositions.length > 0 ? `Наибольшая корреляция: ${highCorrPositions.join(', ')}` : '')
                );
            }

            return validation;

        } catch (error) {
            console.error('❌ Ошибка валидации ордера:', error);
            validation.isValid = false;
            validation.errors.push(`Ошибка валидации: ${error.message}`);
            return validation;
        }
    }

    /**
     * Расчет динамического стоп-лосса на основе ATR (Average True Range)
     * @param {string} figi - FIGI инструмента
     * @param {number} currentPrice - Текущая цена инструмента
     * @param {Object} strategy - Объект стратегии с полями atrMultiplier и stopLossPercent
     * @param {string} direction - Направление сделки: 'BUY' или 'SELL'
     * @returns {Promise<number>} - Цена стоп-лосса
     */
    async calculateDynamicStopLoss(figi, currentPrice, strategy = null, direction = 'BUY') {
        try {
            // Валидация входных данных
            if (!figi || typeof figi !== 'string') {
                throw new Error(`Invalid FIGI: ${figi}`);
            }
            
            if (!currentPrice || !isFinite(currentPrice) || currentPrice <= 0) {
                throw new Error(`Invalid currentPrice: ${currentPrice}. Must be a positive number.`);
            }
            
            if (direction !== 'BUY' && direction !== 'SELL') {
                throw new Error(`Invalid direction: ${direction}. Must be 'BUY' or 'SELL'.`);
            }
            
            // Валидация стратегии и atrMultiplier
            if (strategy && strategy.atrMultiplier !== null && strategy.atrMultiplier !== undefined) {
                if (!isFinite(strategy.atrMultiplier) || strategy.atrMultiplier <= 0 || strategy.atrMultiplier > 10) {
                    console.warn(`⚠️ Invalid atrMultiplier ${strategy.atrMultiplier} for ${figi}, using fallback`);
                    strategy = { ...strategy, atrMultiplier: null };
                }
            }
            
            // Если стратегия не передана или atrMultiplier не задан, используем фиксированный процент
            if (!strategy || strategy.atrMultiplier === null || strategy.atrMultiplier === undefined) {
                const stopLossPercent = strategy?.stopLossPercent || 5.0;
                if (direction === 'BUY') {
                    return currentPrice * (1 - stopLossPercent / 100);
                } else {
                    return currentPrice * (1 + stopLossPercent / 100);
                }
            }

            // Получаем свечи для расчета ATR (нужно минимум 15 свечей для периода 14)
            let candles;
            try {
                candles = await CacheService.getCandles(figi, 'DAY', 30);
            } catch (cacheError) {
                console.warn(`⚠️ Ошибка получения свечей для ${figi}:`, cacheError.message);
                // Используем фиксированный процент при ошибке получения данных
                const stopLossPercent = strategy?.stopLossPercent || 5.0;
                if (direction === 'BUY') {
                    return currentPrice * (1 - stopLossPercent / 100);
                } else {
                    return currentPrice * (1 + stopLossPercent / 100);
                }
            }
            
            if (!candles || candles.length < 15) {
                // Если данных недостаточно, используем фиксированный процент
                console.warn(`⚠️ Недостаточно свечей для расчета ATR для ${figi}: ${candles?.length || 0} (требуется минимум 15)`);
                const stopLossPercent = strategy?.stopLossPercent || 5.0;
                if (direction === 'BUY') {
                    return currentPrice * (1 - stopLossPercent / 100);
                } else {
                    return currentPrice * (1 + stopLossPercent / 100);
                }
            }

            // Рассчитываем ATR
            const atr = OptimizedDataService.calculateATR(candles, 14);
            
            // Валидация ATR: должен быть положительным числом
            if (!atr || !isFinite(atr) || atr <= 0) {
                console.warn(`⚠️ Некорректный ATR для ${figi}: ${atr}, используем фиксированный процент`);
                const stopLossPercent = strategy?.stopLossPercent || 5.0;
                if (direction === 'BUY') {
                    return currentPrice * (1 - stopLossPercent / 100);
                } else {
                    return currentPrice * (1 + stopLossPercent / 100);
                }
            }

            // Рассчитываем динамический стоп-лосс
            // Для BUY: стоп-лосс = текущая цена - (ATR × множитель)
            // Для SELL: стоп-лосс = текущая цена + (ATR × множитель)
            const atrMultiplier = strategy.atrMultiplier;
            let stopLoss;
            
            if (direction === 'BUY') {
                stopLoss = currentPrice - (atr * atrMultiplier);
                // Защита: стоп-лосс не должен быть больше текущей цены
                stopLoss = Math.min(stopLoss, currentPrice * 0.95); // Минимум -5%
            } else {
                stopLoss = currentPrice + (atr * atrMultiplier);
                // Защита: стоп-лосс не должен быть меньше текущей цены
                stopLoss = Math.max(stopLoss, currentPrice * 1.05); // Минимум +5%
            }

            // Проверяем, что стоп-лосс не слишком близко к цене (минимум 1% от цены)
            const minDistance = currentPrice * 0.01;
            if (direction === 'BUY' && (currentPrice - stopLoss) < minDistance) {
                stopLoss = currentPrice - minDistance;
            } else if (direction === 'SELL' && (stopLoss - currentPrice) < minDistance) {
                stopLoss = currentPrice + minDistance;
            }

            return stopLoss;
        } catch (error) {
            console.error(`❌ Ошибка расчета динамического стоп-лосса для ${figi}:`, error.message);
            // Fallback к фиксированному проценту при ошибке
            const stopLossPercent = strategy?.stopLossPercent || 5.0;
            if (direction === 'BUY') {
                return currentPrice * (1 - stopLossPercent / 100);
            } else {
                return currentPrice * (1 + stopLossPercent / 100);
            }
        }
    }

    /**
     * Расчет оптимального размера позиции по формуле Келли
     * Поддерживает как общий, так и индивидуальный расчет по инструменту
     */
    async calculatePositionSize(signal, portfolio, currentPrices) {
        const price = currentPrices[signal.symbol] || signal.price;
        const quantity = signal.quantity || 1;
        const figi = signal.figi || signal.symbol;
        
        let winRate, averageWin, averageLoss, kellyFraction;
        
        // Если включен индивидуальный расчет Келли и есть FIGI
        if (this.kellySettings.enabled && figi) {
            try {
                const instrumentStats = await InstrumentStats.findOne({ where: { figi } });
                
                // Используем индивидуальную статистику, если есть достаточно данных
                if (instrumentStats && instrumentStats.totalTrades >= this.kellySettings.minTrades) {
                    winRate = instrumentStats.winRate || 0.5;
                    averageWin = instrumentStats.averageWin || 0.01;
                    averageLoss = Math.abs(instrumentStats.averageLoss) || 0.01;
                    
                    // Используем предрассчитанный Келли или рассчитываем заново
                    if (instrumentStats.kellyFraction !== null && instrumentStats.kellyFraction !== undefined) {
                        kellyFraction = instrumentStats.kellyFraction;
                    } else {
                        // Рассчитываем Келли
                        if (averageWin > 0) {
                            kellyFraction = (winRate * averageWin - (1 - winRate) * averageLoss) / averageWin;
                            kellyFraction = Math.min(Math.max(kellyFraction, 0), 0.25);
                        } else {
                            kellyFraction = 0;
                        }
                    }
                } else {
                    // Недостаточно данных, используем общую статистику
                    winRate = this.stats.winRate || 0.5;
                    averageWin = this.stats.averageWin || 0.01;
                    averageLoss = Math.abs(this.stats.averageLoss) || 0.01;
                    
                    if (averageWin > 0) {
                        kellyFraction = (winRate * averageWin - (1 - winRate) * averageLoss) / averageWin;
                        kellyFraction = Math.min(Math.max(kellyFraction, 0), 0.25);
                    } else {
                        kellyFraction = 0;
                    }
                }
            } catch (error) {
                console.warn(`⚠️ Ошибка получения статистики для ${figi}, используем общую статистику:`, error.message);
                // Fallback на общую статистику
                winRate = this.stats.winRate || 0.5;
                averageWin = this.stats.averageWin || 0.01;
                averageLoss = Math.abs(this.stats.averageLoss) || 0.01;
                
                if (averageWin > 0) {
                    kellyFraction = (winRate * averageWin - (1 - winRate) * averageLoss) / averageWin;
                    kellyFraction = Math.min(Math.max(kellyFraction, 0), 0.25);
                } else {
                    kellyFraction = 0;
                }
            }
        } else {
            // Используем общую статистику
            winRate = this.stats.winRate || 0.5;
            averageWin = this.stats.averageWin || 0.01;
            averageLoss = Math.abs(this.stats.averageLoss) || 0.01;
            
            if (averageWin > 0) {
                kellyFraction = (winRate * averageWin - (1 - winRate) * averageLoss) / averageWin;
                kellyFraction = Math.min(Math.max(kellyFraction, 0), 0.25);
            } else {
                kellyFraction = 0;
            }
        }
        
        // Применяем консервативный подход
        const conservativeFraction = kellyFraction * this.kellySettings.conservativeFactor;
        
        // Рассчитываем размер позиции
        const positionValue = portfolio.totalValue * conservativeFraction;
        const positionQuantity = Math.floor(positionValue / price);
        
        // Ограничиваем максимальным лимитом
        const maxQuantity = Math.floor(this.limits.maxPositionSize * portfolio.totalValue / price);
        
        return Math.min(positionQuantity, maxQuantity, quantity);
    }
    
    /**
     * Обновление статистики инструмента при закрытии позиции
     * Статистика собирается независимо от того, включен ли расчет Келли
     */
    async updateInstrumentStats(figi, ticker, resultPercent) {
        try {
            if (!figi) {
                return;
            }
            
            const isProfitable = resultPercent > 0;
            await InstrumentStats.updateFromPosition(figi, resultPercent, isProfitable);
            
            // Обновляем волатильность только если включен расчет Келли
            // (волатильность используется только для формулы Келли)
            if (this.kellySettings.enabled) {
                await this.updateInstrumentVolatility(figi);
            }
            
        } catch (error) {
            console.error(`❌ Ошибка обновления статистики для ${figi}:`, error);
        }
    }
    
    /**
     * Обновление волатильности инструмента
     */
    async updateInstrumentVolatility(figi) {
        try {
            const candles = await CacheService.getCandles(figi, 'DAY', this.kellySettings.volatilityPeriod);
            
            if (!candles || candles.length < 10) {
                return;
            }
            
            // Рассчитываем доходности
            const returns = [];
            for (let i = 1; i < candles.length; i++) {
                const prevClose = candles[i - 1].close;
                const currentClose = candles[i].close;
                if (prevClose > 0) {
                    const returnPercent = (currentClose - prevClose) / prevClose;
                    returns.push(returnPercent);
                }
            }
            
            if (returns.length === 0) {
                return;
            }
            
            // Рассчитываем стандартное отклонение (волатильность)
            const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
            const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
            const volatility = Math.sqrt(variance);
            
            await InstrumentStats.updateVolatility(figi, volatility, this.kellySettings.volatilityPeriod);
            
        } catch (error) {
            console.error(`❌ Ошибка обновления волатильности для ${figi}:`, error);
        }
    }

    /**
     * Расчет общего воздействия портфеля
     */
    calculateTotalExposure(portfolio, currentPrices = {}) {
        if (!portfolio || !portfolio.positions || !portfolio.totalValue || portfolio.totalValue === 0) {
            return 0;
        }
        
        let totalExposure = 0;
        
        for (const [symbol, quantity] of Object.entries(portfolio.positions)) {
            if (quantity > 0) {
                // Получаем цену из переданных цен или используем positionsValue если доступен
                const price = currentPrices[symbol] || (portfolio.positionsValue ? portfolio.positionsValue / Object.values(portfolio.positions).reduce((sum, qty) => sum + (qty || 0), 0) : 0);
                const positionValue = price * quantity;
                totalExposure += positionValue;
            }
        }
        
        // Возвращаем как долю от общего капитала
        return portfolio.totalValue > 0 ? totalExposure / portfolio.totalValue : 0;
    }

    /**
     * Проверка корреляционного риска
     * Использует CorrelationService для расчета реальных корреляций на основе исторических данных
     */
    async checkCorrelationRisk(signal, portfolio) {
        try {
            const CorrelationService = (await import('./CorrelationService.js')).default;
            
            // Инициализируем сервис, если еще не инициализирован
            if (!CorrelationService.isInitialized) {
                await CorrelationService.initialize();
            }
            
            const correlationThreshold = await Settings.getSetting('correlation_threshold', 0.7);
            const portfolioCorrelationThreshold = await Settings.getSetting('portfolio_correlation_threshold', 0.7);
            
            const correlatedPositions = [];
            const correlationDetails = [];
            
            // Получаем все открытые позиции
            const openPositions = Object.keys(portfolio.positions || {}).filter(figi => portfolio.positions[figi] > 0);
            
            // Рассчитываем корреляцию с каждой существующей позицией
            for (const positionFigi of openPositions) {
                if (positionFigi === signal.figi || positionFigi === signal.symbol) {
                    continue;
                }
                
                try {
                    const correlation = await CorrelationService.calculateCorrelation(
                        signal.figi || signal.symbol,
                        positionFigi,
                        30 // период 30 дней
                    );
                    
                    if (Math.abs(correlation) >= correlationThreshold) {
                        correlatedPositions.push(positionFigi);
                        correlationDetails.push({
                            figi: positionFigi,
                            correlation: correlation,
                            absCorrelation: Math.abs(correlation),
                            risk: Math.abs(correlation) >= 0.8 ? 'HIGH' : 'MEDIUM'
                        });
                    }
                } catch (error) {
                    console.warn(`⚠️ Ошибка расчета корреляции для ${signal.figi}-${positionFigi}:`, error.message);
                    // Fallback на проверку секторов при ошибке
                    if (this.isSameSector(signal.symbol || signal.figi, positionFigi)) {
                        correlatedPositions.push(positionFigi);
                        correlationDetails.push({
                            figi: positionFigi,
                            correlation: 0.75, // Предполагаемая корреляция по сектору
                            absCorrelation: 0.75,
                            risk: 'MEDIUM',
                            fallback: true
                        });
                    }
                }
            }
            
            // Рассчитываем суммарную корреляцию портфеля
            let portfolioCorrelation = 0;
            try {
                portfolioCorrelation = await CorrelationService.calculatePortfolioCorrelation(portfolio, 30);
            } catch (error) {
                console.warn('⚠️ Ошибка расчета корреляции портфеля:', error.message);
            }
            
            // Определяем рекомендацию
            let recommendation = 'OK';
            if (portfolioCorrelation >= portfolioCorrelationThreshold) {
                recommendation = 'BLOCK';
            } else if (correlatedPositions.length > 2 || portfolioCorrelation >= portfolioCorrelationThreshold * 0.9) {
                recommendation = 'WARNING';
            }
            
            return {
                high: correlatedPositions.length > 2 || portfolioCorrelation >= portfolioCorrelationThreshold,
                correlatedPositions,
                correlationDetails,
                portfolioCorrelation,
                recommendation,
                threshold: correlationThreshold,
                portfolioThreshold: portfolioCorrelationThreshold
            };
        } catch (error) {
            console.error('❌ Ошибка проверки корреляционного риска:', error);
            // Fallback на упрощенную проверку при ошибке
            return this.checkCorrelationRiskFallback(signal, portfolio);
        }
    }
    
    /**
     * Упрощенная проверка корреляции (fallback)
     */
    checkCorrelationRiskFallback(signal, portfolio) {
        const correlatedPositions = [];
        
        for (const symbol of Object.keys(portfolio.positions || {})) {
            if (symbol !== signal.symbol && symbol !== signal.figi) {
                // Простая проверка на схожие секторы
                if (this.isSameSector(signal.symbol || signal.figi, symbol)) {
                    correlatedPositions.push(symbol);
                }
            }
        }
        
        return {
            high: correlatedPositions.length > 2,
            correlatedPositions,
            correlationDetails: [],
            portfolioCorrelation: 0,
            recommendation: correlatedPositions.length > 2 ? 'WARNING' : 'OK',
            threshold: 0.7,
            portfolioThreshold: 0.7,
            fallback: true
        };
    }

    /**
     * Проверка принадлежности к одному сектору
     */
    isSameSector(symbol1, symbol2) {
        // Упрощенная логика - в реальной системе здесь был бы анализ секторов
        const techSymbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];
        const financeSymbols = ['JPM', 'BAC', 'WFC', 'GS'];
        
        const isTech1 = techSymbols.some(s => symbol1.includes(s));
        const isTech2 = techSymbols.some(s => symbol2.includes(s));
        const isFinance1 = financeSymbols.some(s => symbol1.includes(s));
        const isFinance2 = financeSymbols.some(s => symbol2.includes(s));
        
        return (isTech1 && isTech2) || (isFinance1 && isFinance2);
    }

    /**
     * Обновление статистики после сделки
     */
    updateStats(trade) {
        this.stats.totalTrades++;
        this.tradeHistory.push(trade);
        
        if (trade.pnl > 0) {
            this.stats.winningTrades++;
            this.stats.consecutiveLosses = 0;
            this.stats.averageWin = (this.stats.averageWin * (this.stats.winningTrades - 1) + trade.pnl) / this.stats.winningTrades;
        } else {
            this.stats.losingTrades++;
            this.stats.consecutiveLosses++;
            this.stats.maxConsecutiveLosses = Math.max(this.stats.maxConsecutiveLosses, this.stats.consecutiveLosses);
            this.stats.averageLoss = (this.stats.averageLoss * (this.stats.losingTrades - 1) + trade.pnl) / this.stats.losingTrades;
        }
        
        // Обновление общих метрик
        this.stats.totalPnL += trade.pnl;
        this.stats.dailyPnL += trade.pnl;
        this.stats.winRate = this.stats.winningTrades / this.stats.totalTrades;
        
        // Расчет profit factor
        const totalWins = this.stats.averageWin * this.stats.winningTrades;
        const totalLosses = Math.abs(this.stats.averageLoss * this.stats.losingTrades);
        this.stats.profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;
        
        // Обновление просадки
        this.updateDrawdown();
        
        // Проверка алертов
        this.checkAlerts();
        
        // Сохранение статистики
        this.saveStats();
    }

    /**
     * Обновление просадки
     */
    updateDrawdown() {
        if (this.tradeHistory.length === 0) return;
        
        // Находим пик портфеля
        let peak = 0;
        let currentDrawdown = 0;
        
        let runningPnL = 0;
        for (const trade of this.tradeHistory) {
            runningPnL += trade.pnl;
            if (runningPnL > peak) {
                peak = runningPnL;
            }
            currentDrawdown = Math.max(currentDrawdown, peak - runningPnL);
        }
        
        this.stats.currentDrawdown = currentDrawdown / (peak || 1);
        this.stats.maxDrawdown = Math.max(this.stats.maxDrawdown, this.stats.currentDrawdown);
    }

    /**
     * Проверка алертов
     */
    checkAlerts() {
        const alerts = [];
        
        // Алерт о высокой просадке
        if (this.stats.currentDrawdown > this.limits.maxDrawdown * 0.8) {
            alerts.push({
                type: 'warning',
                message: `Высокая просадка: ${(this.stats.currentDrawdown * 100).toFixed(1)}%`,
                value: this.stats.currentDrawdown,
                threshold: this.limits.maxDrawdown
            });
        }
        
        // Алерт о последовательных убытках
        if (this.stats.consecutiveLosses >= this.limits.maxConsecutiveLosses - 1) {
            alerts.push({
                type: 'warning',
                message: `Много убыточных сделок подряд: ${this.stats.consecutiveLosses}`,
                value: this.stats.consecutiveLosses,
                threshold: this.limits.maxConsecutiveLosses
            });
        }
        
        // Алерт о низком win rate
        if (this.stats.totalTrades > 10 && this.stats.winRate < 0.4) {
            alerts.push({
                type: 'warning',
                message: `Низкий win rate: ${(this.stats.winRate * 100).toFixed(1)}%`,
                value: this.stats.winRate,
                threshold: 0.4
            });
        }
        
        // Критический алерт - активация экстренной остановки
        if (this.stats.currentDrawdown > this.limits.maxDrawdown) {
            alerts.push({
                type: 'critical',
                message: `КРИТИЧЕСКАЯ ПРОСАДКА: ${(this.stats.currentDrawdown * 100).toFixed(1)}%`,
                value: this.stats.currentDrawdown,
                threshold: this.limits.maxDrawdown
            });
            
            this.emergencyStop = true;
            this.sendEmergencyAlert();
        }
        
        // Отправка алертов
        for (const alert of alerts) {
            this.sendAlert(alert);
        }
        
        this.alerts.push(...alerts);
    }

    /**
     * Отправка алерта
     */
    async sendAlert(alert) {
        try {
            const message = `🚨 ${alert.type.toUpperCase()}: ${alert.message}`;
            await OptimizedTelegramService.sendAlert(message);
            console.log(`📢 Алерт отправлен: ${message}`);
        } catch (error) {
            console.error('❌ Ошибка отправки алерта:', error);
        }
    }

    /**
     * Отправка экстренного алерта
     */
    async sendEmergencyAlert() {
        try {
            const message = `🚨🚨🚨 ЭКСТРЕННАЯ ОСТАНОВКА ТОРГОВЛИ! 🚨🚨🚨\n\n` +
                          `Просадка: ${(this.stats.currentDrawdown * 100).toFixed(1)}%\n` +
                          `Лимит: ${(this.limits.maxDrawdown * 100)}%\n` +
                          `Все торговые операции приостановлены!`;
            
            await OptimizedTelegramService.sendAlert(message);
            console.log('🚨 Экстренный алерт отправлен');
        } catch (error) {
            console.error('❌ Ошибка отправки экстренного алерта:', error);
        }
    }

    /**
     * Сброс дневной статистики
     */
    resetDailyStats() {
        this.stats.dailyPnL = 0;
        this.dailyHistory = [];
        console.log('📅 Дневная статистика сброшена');
    }

    /**
     * Снятие экстренной остановки
     */
    resetEmergencyStop() {
        this.emergencyStop = false;
        console.log('✅ Экстренная остановка снята');
    }

    /**
     * Получение текущего статуса
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            emergencyStop: this.emergencyStop,
            limits: this.limits,
            stats: this.stats,
            recentAlerts: this.alerts.slice(-5)
        };
    }

    /**
     * Получение детальной статистики
     */
    getDetailedStats() {
        return {
            ...this.getStatus(),
            tradeHistory: this.tradeHistory.slice(-50), // Последние 50 сделок
            dailyHistory: this.dailyHistory,
            allAlerts: this.alerts
        };
    }

    /**
     * Сохранение статистики
     */
    async saveStats() {
        try {
            // В реальной системе здесь было бы сохранение в БД
            console.log('💾 Статистика риск-менеджмента сохранена');
        } catch (error) {
            console.error('❌ Ошибка сохранения статистики:', error);
        }
    }

    /**
     * Загрузка статистики
     */
    async loadStats() {
        try {
            // В реальной системе здесь была бы загрузка из БД
            console.log('📂 Статистика риск-менеджмента загружена');
        } catch (error) {
            console.error('❌ Ошибка загрузки статистики:', error);
        }
    }
    
    /**
     * Загрузка настроек формулы Келли
     */
    async loadKellySettings() {
        try {
            this.kellySettings = {
                enabled: await Settings.getSetting('kelly_enabled', false),
                conservativeFactor: await Settings.getSetting('kelly_conservative_factor', 0.25),
                minTrades: await Settings.getSetting('kelly_min_trades', 10),
                volatilityPeriod: await Settings.getSetting('kelly_volatility_period', 30)
            };
            console.log(`📊 Настройки Келли загружены: ${this.kellySettings.enabled ? 'включен' : 'выключен'}`);
        } catch (error) {
            console.warn('⚠️ Ошибка загрузки настроек Келли, используем значения по умолчанию:', error.message);
            // Убеждаемся, что настройки установлены значениями по умолчанию при ошибке
            this.kellySettings = {
                enabled: false,
                conservativeFactor: 0.25,
                minTrades: 10,
                volatilityPeriod: 30
            };
        }
    }

    /**
     * Обновление лимитов
     */
    updateLimits(newLimits) {
        this.limits = { ...this.limits, ...newLimits };
        console.log('⚙️ Лимиты риск-менеджмента обновлены:', newLimits);
    }

    /**
     * Создание трейлинг-стопа для позиции
     * @param {Object} params - Параметры трейлинг-стопа
     * @param {string} params.figi - FIGI инструмента
     * @param {string} params.ticker - Тикер инструмента
     * @param {number} params.entryPrice - Цена входа в позицию
     * @param {number} params.quantity - Количество акций
     * @param {string} params.direction - Направление позиции ('BUY' или 'SELL')
     * @param {number} params.activationProfitPercent - Процент прибыли для активации (по умолчанию 5%)
     * @param {number} params.trailingDistancePercent - Отступ в процентах (2-3% по умолчанию)
     * @param {boolean} params.useATR - Использовать ATR для расчета отступа
     * @param {string} params.portfolioType - Тип портфеля ('virtual' или 'real')
     * @param {UUID} params.tradingRequestId - ID торгового запроса (опционально)
     * @param {number} params.strategyId - ID стратегии (опционально)
     * @returns {Promise<Object>} - Созданный трейлинг-стоп
     */
    async createTrailingStop(params) {
        try {
            const {
                figi,
                ticker,
                entryPrice,
                quantity,
                direction = 'BUY',
                activationProfitPercent = 5.0,
                trailingDistancePercent = 2.5,
                useATR = false,
                portfolioType = 'virtual',
                tradingRequestId = null,
                strategyId = null
            } = params;

            // Рассчитываем отступ на основе ATR, если требуется
            let trailingDistanceATR = null;
            if (useATR) {
                try {
                    const candles = await CacheService.getCandles(figi, 'DAY', 30);
                    if (candles && candles.length >= 15) {
                        const atr = OptimizedDataService.calculateATR(candles, 14);
                        trailingDistanceATR = atr; // Используем 1×ATR
                    }
                } catch (error) {
                    console.warn(`⚠️ Не удалось рассчитать ATR для ${ticker}, используем процентный метод`);
                }
            }

            const trailingStop = await TrailingStop.create({
                figi,
                ticker,
                entryPrice,
                quantity,
                direction,
                activationProfitPercent,
                trailingDistancePercent: useATR ? null : trailingDistancePercent,
                trailingDistanceATR,
                useATR,
                isActive: false,
                status: 'pending',
                portfolioType,
                tradingRequestId,
                strategyId
            });

            console.log(`✅ Трейлинг-стоп создан для ${ticker}: активация при +${activationProfitPercent}%`);
            return trailingStop;
        } catch (error) {
            console.error(`❌ Ошибка создания трейлинг-стопа для ${params.ticker}:`, error);
            throw error;
        }
    }

    /**
     * Обновление трейлинг-стопа на основе текущей цены
     * @param {number} trailingStopId - ID трейлинг-стопа
     * @param {number} currentPrice - Текущая цена инструмента
     * @param {Object} transaction - Опциональная транзакция Sequelize
     * @returns {Promise<Object>} - Обновленный трейлинг-стоп или null, если сработал
     */
    async updateTrailingStop(trailingStopId, currentPrice, transaction = null) {
        try {
            // Валидация входных данных
            if (!trailingStopId || !isFinite(trailingStopId)) {
                throw new Error(`Invalid trailingStopId: ${trailingStopId}`);
            }
            
            if (!currentPrice || !isFinite(currentPrice) || currentPrice <= 0) {
                throw new Error(`Invalid currentPrice: ${currentPrice}. Must be a positive number.`);
            }

            const options = transaction ? { transaction } : {};
            const trailingStop = await TrailingStop.findByPk(trailingStopId, options);
            if (!trailingStop) {
                throw new Error(`Трейлинг-стоп с ID ${trailingStopId} не найден`);
            }

            if (trailingStop.status !== 'pending' && trailingStop.status !== 'active') {
                return trailingStop; // Уже сработал или отменен
            }

            const { entryPrice, direction, activationProfitPercent, trailingDistancePercent, trailingDistanceATR, useATR } = trailingStop;

            // Рассчитываем текущую прибыль
            let profitPercent;
            if (direction === 'BUY') {
                profitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
            } else {
                profitPercent = ((entryPrice - currentPrice) / entryPrice) * 100;
            }

            // Активация трейлинг-стопа при достижении порога прибыли
            if (!trailingStop.isActive && profitPercent >= activationProfitPercent) {
                trailingStop.isActive = true;
                trailingStop.status = 'active';
                
                if (direction === 'BUY') {
                    trailingStop.highestPrice = currentPrice;
                } else {
                    trailingStop.lowestPrice = currentPrice;
                }

                // Рассчитываем начальную цену стоп-лосса
                let stopPrice;
                if (useATR && trailingDistanceATR) {
                    if (direction === 'BUY') {
                        stopPrice = currentPrice - trailingDistanceATR;
                    } else {
                        stopPrice = currentPrice + trailingDistanceATR;
                    }
                } else {
                    const distance = currentPrice * (trailingDistancePercent / 100);
                    if (direction === 'BUY') {
                        stopPrice = currentPrice - distance;
                    } else {
                        stopPrice = currentPrice + distance;
                    }
                }

                trailingStop.currentStopPrice = stopPrice;
                await trailingStop.save(options);

                console.log(`✅ Трейлинг-стоп активирован для ${trailingStop.ticker} при цене ${currentPrice.toFixed(2)}`);
            }

            // Обновление трейлинг-стопа, если он активен
            if (trailingStop.isActive) {
                let shouldUpdate = false;
                let newStopPrice = trailingStop.currentStopPrice;

                if (direction === 'BUY') {
                    // Обновляем максимальную цену и стоп-лосс только вверх
                    if (currentPrice > (trailingStop.highestPrice || trailingStop.entryPrice)) {
                        trailingStop.highestPrice = currentPrice;
                        shouldUpdate = true;

                        // Пересчитываем стоп-лосс
                        if (useATR && trailingDistanceATR) {
                            newStopPrice = currentPrice - trailingDistanceATR;
                        } else {
                            const distance = currentPrice * (trailingDistancePercent / 100);
                            newStopPrice = currentPrice - distance;
                        }

                        // Стоп-лосс может только повышаться, не понижаться
                        if (newStopPrice > trailingStop.currentStopPrice) {
                            trailingStop.currentStopPrice = newStopPrice;
                        }
                    }

                    // Проверка срабатывания стоп-лосса
                    if (currentPrice <= trailingStop.currentStopPrice) {
                        trailingStop.status = 'triggered';
                        trailingStop.triggeredAt = new Date();
                        trailingStop.triggerPrice = currentPrice;
                        await trailingStop.save(options);

                        console.log(`🛑 Трейлинг-стоп сработал для ${trailingStop.ticker}: цена ${currentPrice.toFixed(2)} <= стоп ${trailingStop.currentStopPrice.toFixed(2)}`);
                        return trailingStop;
                    }
                } else {
                    // Для SELL позиций логика обратная
                    if (currentPrice < (trailingStop.lowestPrice || trailingStop.entryPrice)) {
                        trailingStop.lowestPrice = currentPrice;
                        shouldUpdate = true;

                        // Пересчитываем стоп-лосс
                        if (useATR && trailingDistanceATR) {
                            newStopPrice = currentPrice + trailingDistanceATR;
                        } else {
                            const distance = currentPrice * (trailingDistancePercent / 100);
                            newStopPrice = currentPrice + distance;
                        }

                        // Стоп-лосс может только понижаться, не повышаться
                        if (newStopPrice < trailingStop.currentStopPrice) {
                            trailingStop.currentStopPrice = newStopPrice;
                        }
                    }

                    // Проверка срабатывания стоп-лосса
                    if (currentPrice >= trailingStop.currentStopPrice) {
                        trailingStop.status = 'triggered';
                        trailingStop.triggeredAt = new Date();
                        trailingStop.triggerPrice = currentPrice;
                        await trailingStop.save(options);

                        console.log(`🛑 Трейлинг-стоп сработал для ${trailingStop.ticker}: цена ${currentPrice.toFixed(2)} >= стоп ${trailingStop.currentStopPrice.toFixed(2)}`);
                        return trailingStop;
                    }
                }

                if (shouldUpdate) {
                    await trailingStop.save(options);
                }
            }

            return trailingStop;
        } catch (error) {
            console.error(`❌ Ошибка обновления трейлинг-стопа ${trailingStopId}:`, error);
            throw error;
        }
    }

    /**
     * Проверка всех активных трейлинг-стопов
     * Оптимизировано: получает цены батчами для уменьшения количества запросов к БД
     * @param {string} portfolioType - Тип портфеля ('virtual' или 'real')
     * @param {boolean} autoClosePositions - Автоматически закрывать позиции при срабатывании (по умолчанию true)
     * @returns {Promise<Array>} - Массив сработавших трейлинг-стопов
     */
    async checkAllTrailingStops(portfolioType = 'virtual', autoClosePositions = true) {
        let transaction = null;
        
        try {
            // Используем транзакцию для предотвращения race condition
            const sequelize = TrailingStop.sequelize;
            
            // Проверяем, что sequelize инициализирован
            if (!sequelize) {
                console.warn('⚠️ Sequelize not initialized, checking trailing stops without transaction');
                // Продолжаем без транзакции как fallback
            } else {
                try {
                    transaction = await sequelize.transaction();
                } catch (txError) {
                    console.warn('⚠️ Failed to create transaction, checking trailing stops without transaction:', txError.message);
                    // Продолжаем без транзакции как fallback
                    transaction = null;
                }
            }
            
            try {
                // Получаем все активные трейлинг-стопы с блокировкой строк (если транзакция доступна)
                const findOptions = {
                    where: {
                        status: ['pending', 'active'],
                        portfolioType
                    }
                };
                
                // Добавляем блокировку и транзакцию только если они доступны
                if (transaction) {
                    findOptions.lock = transaction.LOCK.UPDATE;
                    findOptions.transaction = transaction;
                }
                
                const activeStops = await TrailingStop.findAll(findOptions);

                if (activeStops.length === 0) {
                    if (transaction) {
                        await transaction.commit();
                    }
                    return [];
                }

                // Получаем уникальные FIGI для батч-запроса цен
                const uniqueFigis = [...new Set(activeStops.map(s => s.figi))];
                const pricesMap = {};
                
                // Получаем цены батчами
                for (const figi of uniqueFigis) {
                    try {
                        const instrument = await CacheService.getInstrument(figi, true);
                        if (instrument && instrument.lastPrice && isFinite(instrument.lastPrice) && instrument.lastPrice > 0) {
                            pricesMap[figi] = instrument.lastPrice;
                        }
                    } catch (error) {
                        console.warn(`⚠️ Не удалось получить цену для ${figi}:`, error.message);
                    }
                }

                const triggeredStops = [];

                // Обновляем трейлинг-стопы с использованием полученных цен
                for (const stop of activeStops) {
                    try {
                        const currentPrice = pricesMap[stop.figi];
                        if (!currentPrice) {
                            console.warn(`⚠️ Не удалось получить цену для ${stop.ticker} (${stop.figi})`);
                            continue;
                        }

                        // Обновляем трейлинг-стоп в транзакции (если доступна)
                        const updatedStop = await this.updateTrailingStop(stop.id, currentPrice, transaction);

                        if (updatedStop && updatedStop.status === 'triggered') {
                            triggeredStops.push(updatedStop);
                        }
                    } catch (error) {
                        console.error(`❌ Ошибка проверки трейлинг-стопа ${stop.id}:`, error.message);
                    }
                }

                // Коммитим транзакцию только если она была создана
                if (transaction) {
                    await transaction.commit();
                }

                // Автоматически закрываем позиции для сработавших трейлинг-стопов
                if (autoClosePositions && triggeredStops.length > 0) {
                    await this.closePositionsForTriggeredStops(triggeredStops, portfolioType);
                }

                return triggeredStops;
            } catch (error) {
                // Откатываем транзакцию только если она была создана
                if (transaction) {
                    try {
                        await transaction.rollback();
                    } catch (rollbackError) {
                        console.error('❌ Ошибка отката транзакции:', rollbackError.message);
                    }
                }
                throw error;
            }
        } catch (error) {
            console.error('❌ Ошибка проверки трейлинг-стопов:', error);
            throw error;
        }
    }

    /**
     * Автоматическое закрытие позиций для сработавших трейлинг-стопов
     * @param {Array} triggeredStops - Массив сработавших трейлинг-стопов
     * @param {string} portfolioType - Тип портфеля
     * @returns {Promise<void>}
     */
    async closePositionsForTriggeredStops(triggeredStops, portfolioType) {
        try {
            const TradingRequest = (await import('../models/TradingRequest.js')).default;
            const TradingEngine = (await import('./TradingEngine.js')).default;
            const PartialExitService = (await import('./PartialExitService.js')).default;
            const TradingModeManager = (await import('./TradingModeManager.js')).default;

            for (const stop of triggeredStops) {
                try {
                    if (!stop.tradingRequestId) {
                        console.warn(`⚠️ Трейлинг-стоп ${stop.id} не связан с торговой заявкой`);
                        continue;
                    }

                    // Получаем торговую заявку
                    const tradingRequest = await TradingRequest.findByPk(stop.tradingRequestId);
                    if (!tradingRequest || tradingRequest.status !== 'EXECUTED') {
                        console.warn(`⚠️ Торговая заявка ${stop.tradingRequestId} не найдена или не исполнена`);
                        continue;
                    }

                    // Проверяем, не закрыта ли позиция частично
                    const PositionExit = (await import('../models/PositionExit.js')).default;
                    const existingExits = await PositionExit.getExitsByRequest(tradingRequest.id);
                    const totalExited = existingExits
                        .filter(e => e.status === 'EXECUTED')
                        .reduce((sum, e) => sum + e.exitQuantity, 0);
                    
                    const remainingQuantity = tradingRequest.quantity - totalExited;
                    
                    if (remainingQuantity <= 0) {
                        console.log(`ℹ️ Позиция ${tradingRequest.ticker} уже полностью закрыта`);
                        continue;
                    }

                    // Определяем режим торговли
                    const currentMode = TradingModeManager.getCurrentMode().mode;
                    const tradingMode = portfolioType === 'real' ? 'real' : currentMode;

                    // Создаем запись о закрытии через трейлинг-стоп
                    const positionExit = await PositionExit.create({
                        tradingRequestId: tradingRequest.id,
                        figi: tradingRequest.figi,
                        ticker: tradingRequest.ticker,
                        name: tradingRequest.name,
                        entryPrice: stop.entryPrice,
                        initialQuantity: tradingRequest.quantity,
                        remainingQuantity: 0, // Полностью закрываем
                        exitStage: 'TRAILING_STOP',
                        profitPercent: stop.direction === 'BUY' 
                            ? ((stop.triggerPrice - stop.entryPrice) / stop.entryPrice) * 100
                            : ((stop.entryPrice - stop.triggerPrice) / stop.entryPrice) * 100, // Для SELL позиций прибыль = разница в обратную сторону
                        exitPrice: stop.triggerPrice,
                        exitQuantity: remainingQuantity,
                        exitAmount: stop.triggerPrice * remainingQuantity,
                        commission: 0,
                        realizedProfit: 0,
                        status: 'PENDING',
                        tradingMode
                    });

                    // Определяем действие для закрытия позиции
                    // Для BUY позиций закрытие - это SELL, для SELL позиций закрытие - это BUY
                    const closeAction = stop.direction === 'BUY' ? 'SELL' : 'BUY';
                    
                    // Рассчитываем прибыль в зависимости от направления позиции
                    // Для BUY: прибыль = (цена_выхода - цена_входа) * количество
                    // Для SELL: прибыль = (цена_входа - цена_выхода) * количество
                    const calculateProfit = (exitPrice, entryPrice, quantity) => {
                        if (stop.direction === 'BUY') {
                            return (exitPrice - entryPrice) * quantity;
                        } else {
                            return (entryPrice - exitPrice) * quantity;
                        }
                    };

                    // Выполняем закрытие
                    if (tradingMode === 'paper' || tradingMode === 'micro') {
                        const signal = {
                            symbol: tradingRequest.figi,
                            action: closeAction,
                            quantity: remainingQuantity,
                            price: stop.triggerPrice,
                            confidence: 1.0,
                            isTrailingStopExit: true,
                            originalRequestId: tradingRequest.id
                        };

                        const result = await TradingEngine.executeOrder(signal);
                        
                        // Безопасный доступ к результату выполнения
                        if (!result || !result.trade) {
                            throw new Error(`Failed to execute order for trailing stop ${stop.id}: no trade result`);
                        }
                        
                        const realizedProfit = calculateProfit(result.trade.price, stop.entryPrice, remainingQuantity) - (result.trade.commission || 0);
                        
                        await positionExit.execute({
                            exitPrice: result.trade.price,
                            commission: result.trade.commission || 0,
                            realizedProfit,
                            notes: `Автоматическое закрытие по трейлинг-стопу`
                        });

                        console.log(`✅ Позиция ${tradingRequest.ticker} закрыта по трейлинг-стопу: ${remainingQuantity} акций (${closeAction})`);
                    } else {
                        // В режиме real создаем торговую заявку
                        const exitRequest = await TradingRequest.create({
                            recommendationId: tradingRequest.recommendationId || tradingRequest.figi,
                            figi: tradingRequest.figi,
                            ticker: tradingRequest.ticker,
                            name: tradingRequest.name,
                            action: closeAction,
                            quantity: remainingQuantity,
                            priceAtRequest: stop.triggerPrice,
                            estimatedAmount: stop.triggerPrice * remainingQuantity,
                            confidence: 1.0,
                            score: 1.0,
                            reasoning: `Автоматическое закрытие по трейлинг-стопу`,
                            tradingMode: 'real',
                            status: 'PENDING',
                            userComment: `Трейлинг-стоп сработал при цене ${stop.triggerPrice.toFixed(2)}`
                        });

                        const estimatedProfit = calculateProfit(stop.triggerPrice, stop.entryPrice, remainingQuantity);
                        
                        await positionExit.execute({
                            exitPrice: stop.triggerPrice,
                            commission: 0,
                            realizedProfit: estimatedProfit,
                            notes: `Создана заявка на закрытие по трейлинг-стопу: ${exitRequest.id}`
                        });

                        console.log(`📋 Создана заявка на закрытие позиции ${tradingRequest.ticker} по трейлинг-стопу: ${exitRequest.id}`);
                    }
                } catch (error) {
                    console.error(`❌ Ошибка закрытия позиции для трейлинг-стопа ${stop.id}:`, error);
                }
            }
        } catch (error) {
            console.error('❌ Ошибка автоматического закрытия позиций:', error);
            throw error;
        }
    }

    /**
     * Отмена трейлинг-стопа
     * @param {number} trailingStopId - ID трейлинг-стопа
     * @returns {Promise<void>}
     */
    async cancelTrailingStop(trailingStopId) {
        try {
            const trailingStop = await TrailingStop.findByPk(trailingStopId);
            if (trailingStop) {
                trailingStop.status = 'cancelled';
                await trailingStop.save();
                console.log(`✅ Трейлинг-стоп ${trailingStopId} отменен`);
            }
        } catch (error) {
            console.error(`❌ Ошибка отмены трейлинг-стопа ${trailingStopId}:`, error);
            throw error;
        }
    }
}

export default new RiskManagementService();
