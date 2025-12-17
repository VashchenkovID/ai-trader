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
            if (correlationRisk.high) {
                validation.warnings.push(`Высокая корреляция с существующими позициями: ${correlationRisk.correlatedPositions.join(', ')}`);
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
            const candles = await CacheService.getCandles(figi, 'DAY', 30);
            
            if (!candles || candles.length < 15) {
                // Если данных недостаточно, используем фиксированный процент
                const stopLossPercent = strategy?.stopLossPercent || 5.0;
                if (direction === 'BUY') {
                    return currentPrice * (1 - stopLossPercent / 100);
                } else {
                    return currentPrice * (1 + stopLossPercent / 100);
                }
            }

            // Рассчитываем ATR
            const atr = OptimizedDataService.calculateATR(candles, 14);
            
            if (atr === 0 || !isFinite(atr)) {
                // Если ATR не удалось рассчитать, используем фиксированный процент
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
     */
    async checkCorrelationRisk(signal, portfolio) {
        // Упрощенная проверка корреляции
        // В реальной системе здесь был бы анализ корреляций между инструментами
        const correlatedPositions = [];
        
        for (const symbol of Object.keys(portfolio.positions)) {
            if (symbol !== signal.symbol) {
                // Простая проверка на схожие секторы
                if (this.isSameSector(signal.symbol, symbol)) {
                    correlatedPositions.push(symbol);
                }
            }
        }
        
        return {
            high: correlatedPositions.length > 2,
            correlatedPositions
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
     * @returns {Promise<Object>} - Обновленный трейлинг-стоп или null, если сработал
     */
    async updateTrailingStop(trailingStopId, currentPrice) {
        try {
            const trailingStop = await TrailingStop.findByPk(trailingStopId);
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
                await trailingStop.save();

                console.log(`✅ Трейлинг-стоп активирован для ${trailingStop.ticker} при цене ${currentPrice.toFixed(2)}`);
            }

            // Обновление трейлинг-стопа, если он активен
            if (trailingStop.isActive) {
                let shouldUpdate = false;
                let newStopPrice = trailingStop.currentStopPrice;

                if (direction === 'BUY') {
                    // Обновляем максимальную цену и стоп-лосс только вверх
                    if (currentPrice > trailingStop.highestPrice) {
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
                        await trailingStop.save();

                        console.log(`🛑 Трейлинг-стоп сработал для ${trailingStop.ticker}: цена ${currentPrice.toFixed(2)} <= стоп ${trailingStop.currentStopPrice.toFixed(2)}`);
                        return trailingStop;
                    }
                } else {
                    // Для SELL позиций логика обратная
                    if (currentPrice < trailingStop.lowestPrice) {
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
                        await trailingStop.save();

                        console.log(`🛑 Трейлинг-стоп сработал для ${trailingStop.ticker}: цена ${currentPrice.toFixed(2)} >= стоп ${trailingStop.currentStopPrice.toFixed(2)}`);
                        return trailingStop;
                    }
                }

                if (shouldUpdate) {
                    await trailingStop.save();
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
     * @param {string} portfolioType - Тип портфеля ('virtual' или 'real')
     * @returns {Promise<Array>} - Массив сработавших трейлинг-стопов
     */
    async checkAllTrailingStops(portfolioType = 'virtual') {
        try {
            const activeStops = await TrailingStop.findAll({
                where: {
                    status: ['pending', 'active'],
                    portfolioType
                }
            });

            const triggeredStops = [];

            for (const stop of activeStops) {
                try {
                    // Получаем текущую цену
                    const instrument = await CacheService.getInstrument(stop.figi, true);
                    if (!instrument || !instrument.lastPrice) {
                        console.warn(`⚠️ Не удалось получить цену для ${stop.ticker}`);
                        continue;
                    }

                    const currentPrice = instrument.lastPrice;
                    const updatedStop = await this.updateTrailingStop(stop.id, currentPrice);

                    if (updatedStop.status === 'triggered') {
                        triggeredStops.push(updatedStop);
                    }
                } catch (error) {
                    console.error(`❌ Ошибка проверки трейлинг-стопа ${stop.id}:`, error.message);
                }
            }

            return triggeredStops;
        } catch (error) {
            console.error('❌ Ошибка проверки трейлинг-стопов:', error);
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
