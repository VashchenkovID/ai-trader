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
            console.log('🚀 Инициализация TradingModeManager...');
            
            // Загружаем текущий режим из настроек
            this.currentMode = await Settings.getSetting('trading_mode', 'paper');
            
            this.isInitialized = true;
            console.log(`✅ TradingModeManager инициализирован. Текущий режим: ${this.currentMode}`);
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
                timestamp: new Date().toISOString()
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
                    minConfidence: 0.6
                },
                micro: {
                    maxPositionSize: 0.02, // 2% от капитала
                    maxDrawdown: 0.05,     // 5% просадка
                    emergencyStop: true,
                    minConfidence: 0.7
                },
                real: {
                    maxPositionSize: 0.01, // 1% от капитала
                    maxDrawdown: 0.03,     // 3% просадка
                    emergencyStop: true,
                    minConfidence: 0.8
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

            // Для перехода к реальной торговле нужны дополнительные проверки
            if (mode === 'real') {
                // Здесь можно добавить проверки готовности к реальной торговле
                return {
                    canSwitch: true,
                    warnings: ['Режим реальной торговли требует особой осторожности']
                };
            }

            return {
                canSwitch: true,
                warnings: []
            };
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
}

export default new TradingModeManager();
