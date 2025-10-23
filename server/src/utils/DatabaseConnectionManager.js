import sequelize from '../config/database.js';

/**
 * Менеджер соединений с базой данных
 * Обеспечивает проверку и восстановление соединений
 */
class DatabaseConnectionManager {
    constructor() {
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectDelay = 1000; // 1 секунда
    }

    /**
     * Проверка состояния соединения
     */
    async isConnectionAlive() {
        try {
            await sequelize.authenticate();
            this.isConnected = true;
            this.reconnectAttempts = 0;
            return true;
        } catch (error) {
            this.isConnected = false;
            console.warn('⚠️ Database connection is not alive:', error.message);
            return false;
        }
    }

    /**
     * Восстановление соединения
     */
    async reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            throw new Error(`Max reconnection attempts (${this.maxReconnectAttempts}) exceeded`);
        }

        this.reconnectAttempts++;
        console.log(`🔄 Attempting to reconnect to database (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

        try {
            // Закрываем старое соединение, если оно есть
            if (sequelize.connectionManager) {
                await sequelize.close();
            }

            // Ждем перед попыткой переподключения
            await new Promise(resolve => setTimeout(resolve, this.reconnectDelay * this.reconnectAttempts));

            // Создаем новое соединение
            await sequelize.authenticate();
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            console.log('✅ Database connection restored');
            return true;
        } catch (error) {
            console.error(`❌ Reconnection attempt ${this.reconnectAttempts} failed:`, error.message);
            
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                return await this.reconnect();
            } else {
                throw error;
            }
        }
    }

    /**
     * Безопасное выполнение запроса с автоматическим восстановлением соединения
     */
    async safeQuery(operation, ...args) {
        try {
            // Проверяем соединение
            if (!this.isConnected) {
                await this.reconnect();
            }

            // Выполняем операцию
            return await operation(...args);
        } catch (error) {
            if (error.message.includes('ConnectionManager.getConnection was called after the connection manager was closed')) {
                console.warn('⚠️ Connection was closed, attempting to reconnect...');
                this.isConnected = false;
                
                try {
                    await this.reconnect();
                    // Повторяем операцию после восстановления соединения
                    return await operation(...args);
                } catch (reconnectError) {
                    console.error('❌ Failed to reconnect:', reconnectError.message);
                    throw reconnectError;
                }
            } else {
                throw error;
            }
        }
    }

    /**
     * Инициализация соединения
     */
    async initialize() {
        try {
            await this.isConnectionAlive();
            console.log('✅ Database connection manager initialized');
        } catch (error) {
            console.error('❌ Failed to initialize database connection:', error.message);
            throw error;
        }
    }

    /**
     * Закрытие соединения
     */
    async close() {
        try {
            if (sequelize.connectionManager) {
                await sequelize.close();
            }
            this.isConnected = false;
            console.log('✅ Database connection closed');
        } catch (error) {
            console.error('❌ Error closing database connection:', error.message);
        }
    }

    /**
     * Получение статуса соединения
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts
        };
    }
}

// Создаем единственный экземпляр
const connectionManager = new DatabaseConnectionManager();

export default connectionManager;
