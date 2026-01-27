import TradingEngine from './TradingEngine.js';
import SwitchValidator from './SwitchValidator.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import TinkoffApiService from './TinkoffApiService.js';
import CacheService from './CacheService.js';
import Settings from '../models/Settings.js';
import MigrationStatus from '../models/MigrationStatus.js';

/**
 * Сервис миграции портфеля между торговыми режимами
 * Обеспечивает плавный переход от бумажной торговли к реальной
 */
class PortfolioMigrator {
    constructor() {
        this.isInitialized = false;
        
        // Настройки миграции (будут загружены из БД)
        this.migrationSettings = {};
        
        // Текущая активная миграция
        this.currentMigration = null;
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            // Загружаем настройки миграции из базы данных
            await this.loadMigrationSettings();
            
            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Ошибка инициализации PortfolioMigrator:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек миграции из базы данных
     */
    async loadMigrationSettings() {
        try {
            // Загружаем настройки миграции из БД
            this.migrationSettings = {
                maxPositionSize: await Settings.getSetting('migration_max_position_size', 50000),
                maxTotalExposure: await Settings.getSetting('migration_max_total_exposure', 200000),
                migrationSteps: await Settings.getSetting('migration_steps', 5),
                stepDelay: await Settings.getSetting('migration_step_delay', 30000),
                priceTolerance: await Settings.getSetting('migration_price_tolerance', 0.02),
                maxSlippage: await Settings.getSetting('migration_max_slippage', 0.005),
                emergencyStopLoss: await Settings.getSetting('migration_emergency_stop_loss', 0.10),
                minPositionValue: await Settings.getSetting('migration_min_position_value', 1000),
                maxPositionsPerStep: await Settings.getSetting('migration_max_positions_per_step', 3),
                retryAttempts: await Settings.getSetting('migration_retry_attempts', 3),
                retryDelay: await Settings.getSetting('migration_retry_delay', 5000),
                notifyOnStart: await Settings.getSetting('migration_notify_on_start', true),
                notifyOnProgress: await Settings.getSetting('migration_notify_on_progress', true),
                notifyOnComplete: await Settings.getSetting('migration_notify_on_complete', true),
                notifyOnError: await Settings.getSetting('migration_notify_on_error', true),
                requireConfirmation: await Settings.getSetting('migration_require_confirmation', true),
                maxMigrationTime: await Settings.getSetting('migration_max_time', 3600000),
                autoStopOnError: await Settings.getSetting('migration_auto_stop_on_error', true)
            };
            
        } catch (error) {
            console.error('❌ Ошибка загрузки настроек миграции:', error);
            // Используем настройки по умолчанию
            this.migrationSettings = {
                maxPositionSize: 50000,
                maxTotalExposure: 200000,
                migrationSteps: 5,
                stepDelay: 30000,
                priceTolerance: 0.02,
                maxSlippage: 0.005,
                emergencyStopLoss: 0.10,
                minPositionValue: 1000,
                maxPositionsPerStep: 3,
                retryAttempts: 3,
                retryDelay: 5000,
                notifyOnStart: true,
                notifyOnProgress: true,
                notifyOnComplete: true,
                notifyOnError: true,
                requireConfirmation: true,
                maxMigrationTime: 3600000,
                autoStopOnError: true
            };
        }
    }

    /**
     * Создание плана миграции от бумажной торговли к микро-капиталу
     */
    async createMigrationPlan(virtualPortfolio, realCapital) {
        if (!this.isInitialized) {
            throw new Error('PortfolioMigrator не инициализирован');
        }

        try {

            // 1. Валидация готовности к миграции
            const validation = await SwitchValidator.canSwitchToMicro();
            if (!validation.canSwitch) {
                throw new Error(`Система не готова к миграции: ${validation.recommendations.map(r => r.category).join(', ')}`);
            }

            // 2. Анализ виртуального портфеля
            const portfolioAnalysis = await this.analyzeVirtualPortfolio(virtualPortfolio);
            
            // 3. Расчет пропорций для реального капитала
            const proportions = this.calculateProportions(portfolioAnalysis, realCapital);
            
            // 4. Создание пошагового плана миграции
            const migrationPlan = this.createStepByStepPlan(proportions, realCapital);
            
            // 5. Валидация плана
            const planValidation = this.validateMigrationPlan(migrationPlan, realCapital);
            if (!planValidation.isValid) {
                throw new Error(`План миграции невалиден: ${planValidation.errors.join(', ')}`);
            }

            return {
                success: true,
                plan: migrationPlan,
                analysis: portfolioAnalysis,
                proportions,
                validation: planValidation
            };

        } catch (error) {
            console.error('❌ Ошибка создания плана миграции:', error);
            throw error;
        }
    }

    /**
     * Выполнение миграции портфеля
     */
    async executeMigration(migrationPlan, migrationType = 'paper_to_micro') {
        if (!this.isInitialized) {
            throw new Error('PortfolioMigrator не инициализирован');
        }

        if (this.currentMigration) {
            throw new Error('Миграция уже выполняется');
        }

        try {

            // Создаем запись миграции в БД
            this.currentMigration = await MigrationStatus.createMigration({
                type: migrationType,
                virtualPortfolio: { ...TradingEngine.virtualPortfolio },
                plan: migrationPlan,
                settings: this.migrationSettings,
                description: `Миграция от ${migrationType}`,
                createdBy: 'system'
            });

            // Обновляем статус на активный
            await MigrationStatus.updateProgress(this.currentMigration.migrationId, {
                status: 'active',
                currentStep: 0,
                totalSteps: migrationPlan.length,
                progress: 0
            });

            // Уведомление о начале миграции
            await this.notifyMigrationStart();

            // Выполнение каждого шага миграции
            for (let i = 0; i < migrationPlan.length; i++) {
                try {

                    const step = migrationPlan[i];
                    const result = await this.executeMigrationStep(step, i + 1);
                    
                    // Обновляем прогресс в БД
                    const progress = ((i + 1) / migrationPlan.length) * 100;
                    await MigrationStatus.updateProgress(this.currentMigration.migrationId, {
                        currentStep: i + 1,
                        progress: progress,
                        executedTrades: [...(this.currentMigration.executedTrades || []), result],
                        stats: {
                            totalTrades: result.trades.length,
                            successfulTrades: result.trades.filter(t => t.success).length,
                            failedTrades: result.trades.filter(t => !t.success).length,
                            totalValue: result.totalValue,
                            totalCommission: result.trades.reduce((sum, t) => sum + (t.commission || 0), 0)
                        }
                    });
                    
                    // Уведомление о прогрессе
                    await this.notifyMigrationProgress(i + 1, migrationPlan.length, result);
                    
                    // Задержка между шагами
                    if (i < migrationPlan.length - 1) {
                        await this.delay(this.migrationSettings.stepDelay);
                    }
                    
                } catch (error) {
                    console.error(`❌ Ошибка на шаге ${i + 1}:`, error);
                    
                    // Добавляем ошибку в БД
                    const errors = [...(this.currentMigration.errors || [])];
                    errors.push({
                        step: i + 1,
                        error: error.message,
                        timestamp: new Date()
                    });
                    
                    await MigrationStatus.updateProgress(this.currentMigration.migrationId, {
                        errors: errors
                    });
                    
                    // Решение о продолжении или остановке
                    if (this.shouldStopMigration(error)) {
                        await MigrationStatus.updateProgress(this.currentMigration.migrationId, {
                            status: 'failed'
                        });
                        throw new Error(`Миграция остановлена на шаге ${i + 1}: ${error.message}`);
                    }
                }
            }

            // Завершение миграции
            await MigrationStatus.updateProgress(this.currentMigration.migrationId, {
                status: 'completed',
                progress: 100
            });
            
            // Уведомление о завершении
            await this.notifyMigrationComplete();

            const finalMigration = await MigrationStatus.findOne({ 
                where: { migrationId: this.currentMigration.migrationId } 
            });
            
            this.currentMigration = null;
            
            return {
                success: true,
                migration: finalMigration,
                summary: this.generateMigrationSummary(finalMigration)
            };

        } catch (error) {
            console.error('❌ Ошибка выполнения миграции:', error);
            
            // Обновляем статус на неудачный
            if (this.currentMigration) {
                await MigrationStatus.updateProgress(this.currentMigration.migrationId, {
                    status: 'failed'
                });
            }
            
            await this.notifyMigrationError(error);
            this.currentMigration = null;
            throw error;
        }
    }

    /**
     * Анализ виртуального портфеля
     */
    async analyzeVirtualPortfolio(virtualPortfolio) {
        const analysis = {
            totalValue: virtualPortfolio.totalValue,
            cash: virtualPortfolio.cash,
            positions: {},
            totalExposure: 0,
            diversification: 0,
            riskLevel: 'low'
        };

        // Анализ позиций
        for (const [symbol, quantity] of Object.entries(virtualPortfolio.positions)) {
            if (quantity > 0) {
                // Получаем реальную цену
                const prices = await this.getCurrentPrices([symbol]);
                const estimatedPrice = prices[symbol] || 0;
                const value = quantity * estimatedPrice;
                
                analysis.positions[symbol] = {
                    quantity,
                    estimatedPrice,
                    value,
                    percentage: value / virtualPortfolio.totalValue
                };
                
                analysis.totalExposure += value;
            }
        }

        // Расчет диверсификации
        const positionCount = Object.keys(analysis.positions).length;
        analysis.diversification = positionCount > 0 ? 1 / positionCount : 0;

        // Оценка уровня риска
        if (analysis.totalExposure > virtualPortfolio.totalValue * 0.8) {
            analysis.riskLevel = 'high';
        } else if (analysis.totalExposure > virtualPortfolio.totalValue * 0.5) {
            analysis.riskLevel = 'medium';
        }

        return analysis;
    }

    /**
     * Расчет пропорций для реального капитала
     */
    calculateProportions(portfolioAnalysis, realCapital) {
        const proportions = {
            totalCapital: realCapital,
            maxPositionValue: Math.min(
                this.migrationSettings.maxPositionSize,
                realCapital * 0.1 // Максимум 10% от капитала на позицию
            ),
            maxTotalExposure: Math.min(
                this.migrationSettings.maxTotalExposure,
                realCapital * 0.5 // Максимум 50% от капитала в акциях
            ),
            positions: {}
        };

        // Расчет пропорций для каждой позиции
        Object.entries(portfolioAnalysis.positions).forEach(([symbol, position]) => {
            const targetValue = Math.min(
                position.value * (realCapital / portfolioAnalysis.totalValue),
                proportions.maxPositionValue
            );
            
            proportions.positions[symbol] = {
                targetValue,
                targetQuantity: Math.floor(targetValue / position.estimatedPrice),
                currentPercentage: position.percentage,
                targetPercentage: targetValue / realCapital
            };
        });

        return proportions;
    }

    /**
     * Создание пошагового плана миграции
     */
    createStepByStepPlan(proportions, realCapital) {
        const plan = [];
        const positions = Object.entries(proportions.positions);
        
        // Разделяем позиции на шаги
        const positionsPerStep = Math.ceil(positions.length / this.migrationSettings.migrationSteps);
        
        for (let i = 0; i < positions.length; i += positionsPerStep) {
            const stepPositions = positions.slice(i, i + positionsPerStep);
            
            const step = {
                stepNumber: Math.floor(i / positionsPerStep) + 1,
                positions: stepPositions.map(([symbol, data]) => ({
                    symbol,
                    action: 'BUY',
                    quantity: data.targetQuantity,
                    maxPrice: data.targetValue / data.targetQuantity * (1 + this.migrationSettings.priceTolerance),
                    targetValue: data.targetValue,
                    stopLoss: data.targetValue * (1 - this.migrationSettings.emergencyStopLoss)
                })),
                totalValue: stepPositions.reduce((sum, [, data]) => sum + data.targetValue, 0),
                estimatedDuration: this.migrationSettings.stepDelay / 1000
            };
            
            plan.push(step);
        }

        return plan;
    }

    /**
     * Валидация плана миграции
     */
    validateMigrationPlan(migrationPlan, realCapital) {
        const validation = {
            isValid: true,
            errors: [],
            warnings: []
        };

        // Проверка общего воздействия
        const totalExposure = migrationPlan.reduce((sum, step) => sum + step.totalValue, 0);
        if (totalExposure > this.migrationSettings.maxTotalExposure) {
            validation.errors.push(`Общее воздействие ${totalExposure}₽ превышает лимит ${this.migrationSettings.maxTotalExposure}₽`);
        }

        // Проверка каждой позиции
        migrationPlan.forEach(step => {
            step.positions.forEach(position => {
                if (position.targetValue > this.migrationSettings.maxPositionSize) {
                    validation.warnings.push(`Позиция ${position.symbol} ${position.targetValue}₽ превышает рекомендуемый размер`);
                }
            });
        });

        // Проверка достаточности капитала
        if (totalExposure > realCapital * 0.8) {
            validation.warnings.push(`Использование ${(totalExposure / realCapital * 100).toFixed(1)}% капитала может быть рискованным`);
        }

        validation.isValid = validation.errors.length === 0;
        return validation;
    }

    /**
     * Выполнение одного шага миграции
     */
    async executeMigrationStep(step, stepNumber) {
        const stepResult = {
            stepNumber,
            startTime: new Date(),
            endTime: null,
            trades: [],
            errors: [],
            totalValue: 0
        };

        try {
            // Выполнение каждой позиции в шаге
            for (const position of step.positions) {
                try {
                    const trade = await this.executePositionTrade(position);
                    stepResult.trades.push(trade);
                    stepResult.totalValue += trade.executedValue;
                } catch (error) {
                    stepResult.errors.push({
                        symbol: position.symbol,
                        error: error.message
                    });
                }
            }

            stepResult.endTime = new Date();
            stepResult.duration = stepResult.endTime - stepResult.startTime;
            
            return stepResult;

        } catch (error) {
            stepResult.endTime = new Date();
            stepResult.errors.push({
                general: error.message
            });
            throw error;
        }
    }

    /**
     * Выполнение торговой операции для позиции
     */
    async executePositionTrade(position) {
        try {
            // Получение текущей цены
            const currentPrice = await this.getCurrentPrice(position.symbol);
            
            // Проверка толерантности цены
            if (currentPrice > position.maxPrice) {
                throw new Error(`Цена ${currentPrice}₽ превышает максимальную ${position.maxPrice}₽`);
            }

            // Создание торгового сигнала
            const signal = {
                symbol: position.symbol,
                action: position.action,
                quantity: position.quantity,
                price: currentPrice,
                confidence: 1.0, // Максимальная уверенность для миграции
                isMigration: true
            };

            // Исполнение через TradingEngine в режиме micro
            const result = await TradingEngine.executeOrder(signal);
            
            return {
                symbol: position.symbol,
                action: position.action,
                quantity: position.quantity,
                price: currentPrice,
                executedValue: currentPrice * position.quantity,
                commission: result.trade.commission,
                timestamp: new Date(),
                success: true
            };

        } catch (error) {
            console.error(`❌ Ошибка исполнения позиции ${position.symbol}:`, error);
            throw error;
        }
    }

    /**
     * Получение текущей цены инструмента
     */
    async getCurrentPrice(symbol) {
        try {
            // Сначала пробуем получить из кеша
            const instrument = await CacheService.getInstrument(symbol);
            if (instrument && typeof instrument.lastPrice === 'number') {
                return instrument.lastPrice;
            }

            // Если нет в кеше, получаем через API
            const lastPrices = await TinkoffApiService.getLastPrices([symbol]);
            if (lastPrices.lastPrices && lastPrices.lastPrices.length > 0) {
                const priceData = lastPrices.lastPrices[0];
                if (priceData.price) {
                    const units = parseFloat(priceData.price.units || 0);
                    const nano = parseFloat(priceData.price.nano || 0);
                    return units + nano / 1e9;
                }
            }

            // Если ничего не получили, возвращаем 0
            return 0;
        } catch (error) {
            console.error(`❌ Ошибка получения цены для ${symbol}:`, error);
            return 0;
        }
    }

    /**
     * Проверка необходимости остановки миграции
     */
    shouldStopMigration(error) {
        // Останавливаем при критических ошибках
        const criticalErrors = [
            'Недостаточно средств',
            'Превышен лимит риска',
            'Ошибка API брокера'
        ];
        
        return criticalErrors.some(criticalError => 
            error.message.includes(criticalError)
        );
    }

    /**
     * Генерация отчета о миграции
     */
    generateMigrationSummary(migration) {
        if (!migration) return null;
        
        const duration = migration.endTime ? 
            Math.round((new Date(migration.endTime) - new Date(migration.startTime)) / 1000) : 0;
        
        return {
            migrationId: migration.migrationId,
            status: migration.status,
            duration, // секунды
            totalSteps: migration.totalSteps,
            completedSteps: migration.currentStep,
            progress: migration.progress,
            totalTrades: migration.totalTrades,
            successfulTrades: migration.successfulTrades,
            failedTrades: migration.failedTrades,
            successRate: migration.totalTrades > 0 ? 
                (migration.successfulTrades / migration.totalTrades * 100).toFixed(1) : 0,
            totalValue: migration.totalValue,
            totalCommission: migration.totalCommission,
            errors: migration.errors ? migration.errors.length : 0,
            startTime: migration.startTime,
            endTime: migration.endTime
        };
    }

    /**
     * Уведомления о миграции
     */
    async notifyMigrationStart() {
        const message = `🚀 НАЧАЛО МИГРАЦИИ К МИКРО-КАПИТАЛУ\n\n` +
                      `📊 Шагов: ${this.migrationStatus.totalSteps}\n` +
                      `💰 Капитал: ${this.migrationSettings.maxTotalExposure.toLocaleString()} ₽\n` +
                      `⏱️ Ожидаемое время: ${Math.round(this.migrationStatus.totalSteps * this.migrationSettings.stepDelay / 60000)} мин`;
        
        await OptimizedTelegramService.sendAlert(message);
    }

    async notifyMigrationProgress(step, totalSteps, result) {
        const message = `📊 ПРОГРЕСС МИГРАЦИИ: ${step}/${totalSteps}\n\n` +
                      `✅ Успешных сделок: ${result.trades.filter(t => t.success).length}\n` +
                      `💰 Стоимость шага: ${result.totalValue.toLocaleString()} ₽\n` +
                      `⏱️ Время выполнения: ${Math.round(result.duration / 1000)} сек`;
        
        await OptimizedTelegramService.sendAlert(message);
    }

    async notifyMigrationComplete() {
        const summary = this.generateMigrationSummary();
        const message = `🎉 МИГРАЦИЯ ЗАВЕРШЕНА УСПЕШНО!\n\n` +
                      `📊 Выполнено шагов: ${summary.completedSteps}/${summary.totalSteps}\n` +
                      `✅ Успешных сделок: ${summary.successfulTrades}/${summary.totalTrades}\n` +
                      `💰 Общая стоимость: ${summary.totalValue.toLocaleString()} ₽\n` +
                      `⏱️ Время выполнения: ${summary.duration} сек`;
        
        await OptimizedTelegramService.sendAlert(message);
    }

    async notifyMigrationError(error) {
        const message = `❌ ОШИБКА МИГРАЦИИ\n\n` +
                      `🚨 ${error.message}\n` +
                      `📊 Выполнено шагов: ${this.migrationStatus.currentStep}/${this.migrationStatus.totalSteps}\n` +
                      `⏱️ Время до ошибки: ${Math.round((new Date() - this.migrationStatus.startTime) / 1000)} сек`;
        
        await OptimizedTelegramService.sendAlert(message);
    }

    /**
     * Получение статуса миграции
     */
    async getStatus() {
        const activeMigrations = await MigrationStatus.getActiveMigrations();
        
        return {
            isInitialized: this.isInitialized,
            currentMigration: this.currentMigration,
            activeMigrations: activeMigrations.length,
            settings: this.migrationSettings
        };
    }

    /**
     * Остановка миграции
     */
    async stopMigration() {
        if (this.currentMigration) {
            await MigrationStatus.updateProgress(this.currentMigration.migrationId, {
                status: 'cancelled'
            });
            
            await OptimizedTelegramService.sendAlert('🛑 МИГРАЦИЯ ОСТАНОВЛЕНА ПОЛЬЗОВАТЕЛЕМ');

            this.currentMigration = null;
        }
    }

    /**
     * Получение истории миграций
     */
    async getMigrationHistory(limit = 50) {
        try {
            return await MigrationStatus.getMigrationHistory(limit);
        } catch (error) {
            console.error('❌ Ошибка получения истории миграций:', error);
            return [];
        }
    }

    /**
     * Получение активных миграций
     */
    async getActiveMigrations() {
        try {
            return await MigrationStatus.getActiveMigrations();
        } catch (error) {
            console.error('❌ Ошибка получения активных миграций:', error);
            return [];
        }
    }

    /**
     * Очистка старых миграций
     */
    async cleanupOldMigrations(daysOld = 30) {
        try {
            return await MigrationStatus.cleanupOldMigrations(daysOld);
        } catch (error) {
            console.error('❌ Ошибка очистки старых миграций:', error);
            return 0;
        }
    }

    /**
     * Обновление настроек миграции
     */
    async updateMigrationSettings(newSettings) {
        try {
            // Обновляем настройки в базе данных
            for (const [key, value] of Object.entries(newSettings)) {
                const settingKey = `migration_${key}`;
                await Settings.setSetting(settingKey, value, {
                    description: `Настройка миграции: ${key}`,
                    category: 'migration',
                    dataType: typeof value === 'number' ? 'number' : 
                             typeof value === 'boolean' ? 'boolean' : 'string'
                });
            }
            
            // Перезагружаем настройки
            await this.loadMigrationSettings();
            
            return true;
        } catch (error) {
            console.error('❌ Ошибка обновления настроек миграции:', error);
            throw error;
        }
    }

    /**
     * Получение текущих настроек миграции
     */
    getMigrationSettings() {
        return { ...this.migrationSettings };
    }

    /**
     * Утилита задержки
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default new PortfolioMigrator();
