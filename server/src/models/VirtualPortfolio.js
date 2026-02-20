import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const VirtualPortfolio = sequelize.define('VirtualPortfolio', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    
    // Денежные средства
    cash: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 1000000, // 1 млн руб начальный капитал
        comment: 'Денежные средства в виртуальном портфеле'
    },
    
    // Позиции (JSON: { FIGI: quantity })
    positions: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
        comment: 'Позиции в портфеле: { FIGI: quantity }'
    },
    
    // История сделок (JSON массив)
    trades: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
        comment: 'История сделок виртуального портфеля'
    },
    
    // Общая стоимость портфеля
    totalValue: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 1000000,
        comment: 'Общая стоимость портфеля (cash + positions value)'
    },
    
    // Начальный капитал (для расчета PnL)
    initialCapital: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 1000000,
        comment: 'Начальный капитал при создании портфеля'
    },
    
    // Метаданные
    version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: 'Версия структуры портфеля (для миграций)'
    },
    
    lastUpdated: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Время последнего обновления портфеля'
    }
}, {
    tableName: 'virtual_portfolio',
    timestamps: true,
    indexes: [
        {
            fields: ['lastUpdated']
        }
    ]
});

// Статические методы
VirtualPortfolio.getCurrent = async function() {
    try {
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверяем состояние connection manager перед использованием
        if (sequelize.connectionManager && sequelize.connectionManager.pool) {
            const pool = sequelize.connectionManager.pool;
            if (pool._draining) {
                console.warn('⚠️ Connection pool is draining, cannot get portfolio');
                return null;
            }
        }
        
        // У нас всегда один виртуальный портфель, ищем по ID=1 или просто первую запись
        let portfolio = await this.findByPk(1);
        
        // Если нет записи с ID=1, ищем любую запись (на случай если ID другой)
        if (!portfolio) {
            portfolio = await this.findOne();
        }
        
        if (portfolio) {
            // Проверяем, что positions правильно десериализованы
            let positions = portfolio.positions;
            if (typeof positions === 'string') {
                try {
                    positions = JSON.parse(positions);
                } catch (e) {
                    console.warn('⚠️ Ошибка парсинга positions в getCurrent:', e.message);
                    positions = {};
                }
            }
            const positionsCount = positions && typeof positions === 'object' && !Array.isArray(positions) 
                ? Object.keys(positions).length 
                : 0;
            console.log(`📊 Найден виртуальный портфель в БД: ID=${portfolio.id}, cash=${portfolio.cash}, позиций=${positionsCount}`);
            if (positionsCount > 0) {
                console.log(`   📋 Позиции в БД:`, Object.entries(positions).map(([figi, qty]) => `${figi}: ${qty}`).join(', '));
            }
        } else {
            console.log('📊 Виртуальный портфель не найден в БД');
        }
        
        return portfolio;
    } catch (error) {
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Обрабатываем ошибку закрытого connection manager
        if (error.message && error.message.includes('connection manager was closed')) {
            console.warn('⚠️ Connection manager was closed, attempting to restore...');
            
            // Пытаемся восстановить соединение
            try {
                const DatabaseConnectionManager = (await import('../utils/DatabaseConnectionManager.js')).default;
                await DatabaseConnectionManager.reconnect();
                
                // Повторяем попытку после небольшой задержки
                await new Promise(resolve => setTimeout(resolve, 1000));
                return await this.getCurrent();
            } catch (reconnectError) {
                console.error('❌ Failed to restore connection:', reconnectError.message);
                return null;
            }
        }
        
        console.error('❌ Ошибка получения виртуального портфеля:', error);
        return null;
    }
};

VirtualPortfolio.savePortfolio = async function(portfolioData) {
    try {
        // У нас всегда один виртуальный портфель, ищем по ID=1 или просто первую запись
        let portfolio = await this.findByPk(1);
        
        // Если нет записи с ID=1, ищем любую запись
        if (!portfolio) {
            portfolio = await this.findOne();
        }
        
        if (!portfolio) {
            // Создаем новый портфель с ID=1
            console.log('📊 Создание нового виртуального портфеля в БД...');
            // Используем 50 млн по умолчанию для нового портфеля
            const defaultInitialCapital = 50000000; // 50 млн руб
            portfolio = await this.create({
                id: 1, // Явно указываем ID=1
                cash: portfolioData.cash || defaultInitialCapital,
                positions: portfolioData.positions || {},
                trades: portfolioData.trades || [],
                totalValue: portfolioData.totalValue || portfolioData.cash || defaultInitialCapital,
                initialCapital: portfolioData.initialCapital || defaultInitialCapital,
                version: 1,
                lastUpdated: new Date()
            });
            console.log(`✅ Новый виртуальный портфель создан в БД: ID=${portfolio.id}`);
        } else {
            // Обновляем существующий портфель
            console.log(`📊 Обновление виртуального портфеля в БД: ID=${portfolio.id}`);
            const positionsCount = portfolioData.positions && typeof portfolioData.positions === 'object' && !Array.isArray(portfolioData.positions)
                ? Object.keys(portfolioData.positions).length
                : 0;
            const tradesCount = Array.isArray(portfolioData.trades) ? portfolioData.trades.length : 0;
            
            console.log(`   💰 Наличные: ${portfolioData.cash}`);
            console.log(`   📈 Позиций: ${positionsCount}`);
            if (positionsCount > 0) {
                console.log(`   📋 Позиции:`, Object.entries(portfolioData.positions).map(([figi, qty]) => `${figi}: ${qty}`).join(', '));
            }
            console.log(`   💼 Общая стоимость: ${portfolioData.totalValue}`);
            console.log(`   📊 Сделок: ${tradesCount}`);
            
            await portfolio.update({
                cash: portfolioData.cash,
                positions: portfolioData.positions || {},
                trades: portfolioData.trades || [],
                totalValue: portfolioData.totalValue,
                lastUpdated: new Date()
            });
            
            // Проверяем, что данные действительно обновились
            await portfolio.reload();
            const updatedPositions = portfolio.positions;
            const updatedPositionsCount = updatedPositions && typeof updatedPositions === 'object' && !Array.isArray(updatedPositions)
                ? Object.keys(updatedPositions).length
                : 0;
            
            console.log(`✅ Виртуальный портфель обновлен в БД: ID=${portfolio.id}`);
            console.log(`   ✅ Проверка: cash=${portfolio.cash}, позиций=${updatedPositionsCount}, totalValue=${portfolio.totalValue}`);
        }
        
        return portfolio;
    } catch (error) {
        console.error('❌ Ошибка сохранения виртуального портфеля:', error);
        throw error;
    }
};

VirtualPortfolio.resetPortfolio = async function(initialCapital = 50000000) {
    try {
        // Создаем новый портфель с начальным капиталом
        const portfolio = await this.create({
            cash: initialCapital,
            positions: {},
            trades: [],
            totalValue: initialCapital,
            initialCapital: initialCapital,
            version: 1,
            lastUpdated: new Date()
        });
        
        return portfolio;
    } catch (error) {
        console.error('❌ Ошибка сброса виртуального портфеля:', error);
        throw error;
    }
};

export default VirtualPortfolio;

