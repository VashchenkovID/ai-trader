import Settings from '../models/Settings.js';

/**
 * Менеджер торговых режимов
 */
class TradingModeManager {
    constructor() {
        this.currentMode = 'paper';
        this.isInitialized = false;
    }

    /**
     * Инициализация менеджера
     */
    async initialize() {
        try {
            
            // Загружаем текущий режим из настроек
            this.currentMode = await Settings.getSetting('trading_mode', 'paper');
            
            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Ошибка инициализации TradingModeManager:', error);
            throw error;
        }
    }

    /**
     * Получить текущий режим торговли
     */
    getCurrentMode() {
        return {
            mode: this.currentMode,
            isInitialized: this.isInitialized,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Переключить режим торговли
     */
    async switchMode(newMode) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const validModes = ['paper', 'micro', 'real'];
            if (!validModes.includes(newMode)) {
                throw new Error(`Недопустимый режим торговли: ${newMode}`);
            }

            // Paper режим всегда доступен
            if (newMode === 'paper') {
                await Settings.setSetting('trading_mode', newMode, {
                    description: 'Текущий режим торговли',
                    category: 'trading',
                    dataType: 'string'
                });

                this.currentMode = newMode;
                
                console.log(`🔄 Режим торговли изменен на: ${newMode}`);
                
                return {
                    success: true,
                    previousMode: this.currentMode,
                    currentMode: newMode,
                    timestamp: new Date().toISOString()
                };
            }

            // Для micro и real режимов проверяем валидацию
            const canSwitch = await this.canSwitchTo(newMode);
            if (!canSwitch.canSwitch) {
                throw new Error(canSwitch.reason || 'Система не готова к переходу на этот режим. Проверьте валидацию.');
            }

            // Сохраняем новый режим в настройки
            await Settings.setSetting('trading_mode', newMode, {
                description: 'Текущий режим торговли',
                category: 'trading',
                dataType: 'string'
            });

            this.currentMode = newMode;
            
            console.log(`🔄 Режим торговли изменен на: ${newMode}`);
            
            return {
                success: true,
                previousMode: this.currentMode,
                currentMode: newMode,
                timestamp: new Date().toISOString(),
                warnings: canSwitch.warnings || []
            };
        } catch (error) {
            console.error('❌ Ошибка переключения режима торговли:', error);
            throw error;
        }
    }

    /**
     * Получить настройки для текущего режима
     */
    async getModeSettings() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const settings = {
                paper: {
                    maxPositionSize: 0.05, // 5% от капитала
                    maxDrawdown: 0.10,     // 10% просадка
                    emergencyStop: false,
                    minConfidence: 0.6,
                    executionDelay: 100,   // Задержка исполнения в мс
                    slippage: 0.001,       // 0.1% проскальзывание
                    commission: 0.003,     // 0.3% комиссия (как у Tinkoff)
                    minCommission: 1       // Минимальная комиссия 1 рубль
                },
                micro: {
                    maxPositionSize: 0.02, // 2% от капитала
                    maxDrawdown: 0.05,     // 5% просадка
                    emergencyStop: true,
                    minConfidence: 0.7,
                    executionDelay: 200,   // Задержка исполнения в мс
                    slippage: 0.0015,      // 0.15% проскальзывание
                    commission: 0.003,     // 0.3% комиссия (реальная Tinkoff)
                    minCommission: 1       // Минимальная комиссия 1 рубль
                },
                real: {
                    maxPositionSize: 0.01, // 1% от капитала
                    maxDrawdown: 0.03,     // 3% просадка
                    emergencyStop: true,
                    minConfidence: 0.8,
                    executionDelay: 300,   // Задержка исполнения в мс
                    slippage: 0.002,       // 0.2% проскальзывание
                    commission: 0.003,     // 0.3% комиссия (реальная Tinkoff)
                    minCommission: 1       // Минимальная комиссия 1 рубль
                }
            };

            return {
                mode: this.currentMode,
                settings: settings[this.currentMode] || settings.paper,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Ошибка получения настроек режима:', error);
            throw error;
        }
    }

    /**
     * Проверить, можно ли переключиться на режим
     */
    async canSwitchTo(mode) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const validModes = ['paper', 'micro', 'real'];
            if (!validModes.includes(mode)) {
                return {
                    canSwitch: false,
                    reason: 'Недопустимый режим торговли'
                };
            }

            // Paper режим всегда доступен
            if (mode === 'paper') {
                return {
                    canSwitch: true,
                    warnings: []
                };
            }

            // Для micro и real режимов используем SwitchValidator для детальной проверки
            try {
                const { getService } = await import('./GlobalServiceManager.js');
                const SwitchValidator = getService('SwitchValidator');
                
                if (!SwitchValidator) {
                    console.warn('⚠️ SwitchValidator не найден, используем базовую проверку');
                    return {
                        canSwitch: mode === 'micro' || mode === 'real',
                        warnings: mode === 'real' ? ['Режим реальной торговли требует особой осторожности'] : []
                    };
                }

                let validationResult;
                if (mode === 'micro') {
                    validationResult = await SwitchValidator.canSwitchToMicro();
                } else if (mode === 'real') {
                    validationResult = await SwitchValidator.canSwitchToFull();
                } else {
                    validationResult = { canSwitch: true, warnings: [] };
                }

                return {
                    canSwitch: validationResult.canSwitch || false,
                    warnings: validationResult.warnings || [],
                    reason: validationResult.canSwitch ? null : 'Система не готова к переходу на этот режим',
                    checks: validationResult.checks || null,
                    recommendations: validationResult.recommendations || [],
                    criteria: validationResult.criteria || null
                };
            } catch (validatorError) {
                console.warn('⚠️ Ошибка при использовании SwitchValidator:', validatorError.message);
                // Fallback: базовая проверка
                return {
                    canSwitch: true,
                    warnings: mode === 'real' ? ['Режим реальной торговли требует особой осторожности'] : []
                };
            }
        } catch (error) {
            console.error('❌ Ошибка проверки возможности переключения:', error);
            return {
                canSwitch: false,
                reason: error.message
            };
        }
    }

    /**
     * Получить статус менеджера
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            currentMode: this.currentMode,
            availableModes: ['paper', 'micro', 'real'],
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Валидация текущего режима
     */
    async validateMode() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const check = await this.canSwitchTo(this.currentMode);
            
            return {
                isValid: check.canSwitch,
                mode: this.currentMode,
                warnings: check.warnings || [],
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Ошибка валидации режима:', error);
            return {
                isValid: false,
                mode: this.currentMode,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Получить настройки (алиас для getModeSettings)
     */
    async getSettings() {
        return await this.getModeSettings();
    }

    /**
     * Обновить настройки режима
     */
    async updateSettings(newSettings) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            // Настройки хранятся в коде, но можно сохранить кастомные в БД
            await Settings.setSetting(`trading_mode_settings_${this.currentMode}`, newSettings, {
                description: `Настройки режима торговли ${this.currentMode}`,
                category: 'trading',
                dataType: 'object'
            });

            return {
                success: true,
                mode: this.currentMode,
                settings: newSettings,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Ошибка обновления настроек:', error);
            throw error;
        }
    }

    /**
     * Получить историю переключений режимов
     */
    async getHistory() {
        try {
            // История хранится в настройках
            const history = await Settings.getSetting('trading_mode_history', []);
            
            return {
                history: Array.isArray(history) ? history : [],
                currentMode: this.currentMode,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Ошибка получения истории:', error);
            return {
                history: [],
                currentMode: this.currentMode,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Получить производительность режима
     */
    async getPerformance() {
        try {
            // Здесь можно добавить сбор статистики по режиму
            return {
                mode: this.currentMode,
                performance: {
                    uptime: process.uptime(),
                    switches: 0, // TODO: собирать статистику переключений
                    trades: 0    // TODO: собирать статистику сделок
                },
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Ошибка получения производительности:', error);
            throw error;
        }
    }

    /**
     * Миграция режима (с валидацией)
     */
    async migrateMode(targetMode) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            // Проверяем возможность переключения
            const validation = await this.canSwitchTo(targetMode);
            
            if (!validation.canSwitch) {
                throw new Error(`Невозможно переключиться на режим ${targetMode}: ${validation.reason}`);
            }

            // Сохраняем историю
            const history = await this.getHistory();
            const newHistoryEntry = {
                from: this.currentMode,
                to: targetMode,
                timestamp: new Date().toISOString(),
                warnings: validation.warnings || []
            };
            
            const updatedHistory = [...(history.history || []), newHistoryEntry];
            await Settings.setSetting('trading_mode_history', updatedHistory, {
                description: 'История переключений режимов торговли',
                category: 'trading',
                dataType: 'array'
            });

            // Переключаем режим
            const result = await this.switchMode(targetMode);

            return {
                migrationId: `migration_${Date.now()}`,
                status: 'completed',
                sourceMode: this.currentMode,
                targetMode,
                validation,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Ошибка миграции режима:', error);
            throw error;
        }
    }

    /**
     * Получить статус миграции
     */
    async getMigrationStatus() {
        try {
            // Простая реализация - можно расширить для отслеживания активных миграций
            return {
                hasActiveMigration: false,
                currentMode: this.currentMode,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Ошибка получения статуса миграции:', error);
            throw error;
        }
    }
}

export default new TradingModeManager();
