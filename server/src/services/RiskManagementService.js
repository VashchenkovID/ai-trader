import OptimizedTelegramService from './OptimizedTelegramService.js';

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
            const positionSize = this.calculatePositionSize(signal, portfolio, currentPrices);
            if (positionSize > this.limits.maxPositionSize * portfolio.totalValue) {
                validation.warnings.push(`Размер позиции ${positionSize.toFixed(2)}₽ превышает рекомендуемый лимит`);
                validation.adjustedSignal = {
                    ...signal,
                    quantity: Math.floor(this.limits.maxPositionSize * portfolio.totalValue / (currentPrices[signal.symbol] || signal.price))
                };
            }

            // 7. Проверка общего воздействия
            const totalExposure = this.calculateTotalExposure(portfolio);
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
     * Расчет оптимального размера позиции по формуле Келли
     */
    calculatePositionSize(signal, portfolio, currentPrices) {
        const price = currentPrices[signal.symbol] || signal.price;
        const quantity = signal.quantity || 1;
        
        // Базовая формула Келли: f = (bp - q) / b
        // где b = odds, p = вероятность выигрыша, q = вероятность проигрыша
        const winRate = this.stats.winRate || 0.5;
        const averageWin = this.stats.averageWin || 0.01;
        const averageLoss = Math.abs(this.stats.averageLoss) || 0.01;
        
        // Коэффициент Келли
        const kellyFraction = (winRate * averageWin - (1 - winRate) * averageLoss) / averageWin;
        
        // Ограничиваем Келли максимум 25% от капитала
        const maxKellyFraction = Math.min(kellyFraction, 0.25);
        
        // Применяем консервативный подход - используем 1/4 от Келли
        const conservativeFraction = maxKellyFraction * 0.25;
        
        // Рассчитываем размер позиции
        const positionValue = portfolio.totalValue * conservativeFraction;
        const positionQuantity = Math.floor(positionValue / price);
        
        // Ограничиваем максимальным лимитом
        const maxQuantity = Math.floor(this.limits.maxPositionSize * portfolio.totalValue / price);
        
        return Math.min(positionQuantity, maxQuantity, quantity);
    }

    /**
     * Расчет общего воздействия портфеля
     */
    calculateTotalExposure(portfolio) {
        let totalExposure = 0;
        
        for (const [symbol, quantity] of Object.entries(portfolio.positions)) {
            if (quantity > 0) {
                // Здесь нужно получить текущую цену, но для упрощения используем примерную
                const estimatedValue = quantity * 1000; // Примерная цена
                totalExposure += estimatedValue / portfolio.totalValue;
            }
        }
        
        return totalExposure;
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
     * Обновление лимитов
     */
    updateLimits(newLimits) {
        this.limits = { ...this.limits, ...newLimits };
        console.log('⚙️ Лимиты риск-менеджмента обновлены:', newLimits);
    }
}

export default new RiskManagementService();
