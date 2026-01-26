import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const RealPortfolio = sequelize.define('RealPortfolio', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    
    // Денежные средства
    cash: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Денежные средства в реальном портфеле'
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
        comment: 'История сделок реального портфеля'
    },
    
    // Общая стоимость портфеля
    totalValue: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Общая стоимость портфеля (cash + positions value)'
    },
    
    // Стоимость позиций
    positionsValue: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Стоимость всех позиций'
    },
    
    // Начальный капитал (для расчета PnL)
    initialCapital: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Начальный капитал при создании портфеля (если известен)'
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
        comment: 'Время последнего обновления портфеля из Tinkoff API'
    }
}, {
    tableName: 'real_portfolio',
    timestamps: true,
    indexes: [
        {
            fields: ['lastUpdated']
        }
    ]
});

// Статические методы
RealPortfolio.getCurrent = async function() {
    try {
        // У нас всегда один реальный портфель, ищем по ID=1 или просто первую запись
        let portfolio = await this.findByPk(1);
        
        // Если нет записи с ID=1, ищем любую запись
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
            console.log(`📊 Найден реальный портфель в БД: ID=${portfolio.id}, cash=${portfolio.cash}, позиций=${positionsCount}, totalValue=${portfolio.totalValue}`);
        } else {
            console.log('📊 Реальный портфель не найден в БД');
        }
        
        return portfolio;
    } catch (error) {
        console.error('❌ Ошибка получения реального портфеля:', error);
        return null;
    }
};

RealPortfolio.savePortfolio = async function(portfolioData) {
    try {
        // У нас всегда один реальный портфель, ищем по ID=1 или просто первую запись
        let portfolio = await this.findByPk(1);
        
        // Если нет записи с ID=1, ищем любую запись
        if (!portfolio) {
            portfolio = await this.findOne();
        }
        
        if (!portfolio) {
            // Создаем новый портфель с ID=1
            console.log('📊 Создание нового реального портфеля в БД...');
            const totalValue = portfolioData.totalValue || 0;
            // При первом создании портфеля initialCapital устанавливается равным totalValue
            // Это позволяет правильно рассчитывать PnL от общей суммы портфеля
            const initialCapital = portfolioData.initialCapital || (totalValue > 0 ? totalValue : null);
            portfolio = await this.create({
                id: 1, // Явно указываем ID=1
                cash: portfolioData.cash || 0,
                positions: portfolioData.positions || {},
                trades: portfolioData.trades || [],
                totalValue: totalValue,
                positionsValue: portfolioData.positionsValue || 0,
                initialCapital: initialCapital,
                version: 1,
                lastUpdated: new Date()
            });
            console.log(`✅ Новый реальный портфель создан в БД: ID=${portfolio.id}, totalValue=${portfolio.totalValue}, initialCapital=${portfolio.initialCapital}`);
        } else {
            // Обновляем существующий портфель
            console.log(`📊 Обновление реального портфеля в БД: ID=${portfolio.id}`);
            const positionsCount = portfolioData.positions && typeof portfolioData.positions === 'object' && !Array.isArray(portfolioData.positions)
                ? Object.keys(portfolioData.positions).length
                : 0;
            const tradesCount = Array.isArray(portfolioData.trades) ? portfolioData.trades.length : 0;
            
            console.log(`   💰 Наличные: ${portfolioData.cash}`);
            console.log(`   📈 Позиций: ${positionsCount}`);
            console.log(`   💼 Общая стоимость: ${portfolioData.totalValue}`);
            console.log(`   📊 Сделок: ${tradesCount}`);
            
            // Логируем позиции перед сохранением
            if (portfolioData.positions && typeof portfolioData.positions === 'object' && !Array.isArray(portfolioData.positions)) {
                const positionsEntries = Object.entries(portfolioData.positions);
                console.log(`   📋 Позиции для сохранения (${positionsEntries.length}):`);
                positionsEntries.forEach(([figi, qty]) => {
                    console.log(`      - ${figi}: ${qty} units`);
                });
            }
            
            // При обновлении портфеля, если initialCapital не установлен, устанавливаем его равным текущему totalValue
            // Это позволяет правильно рассчитывать PnL от общей суммы портфеля
            const totalValue = portfolioData.totalValue || 0;
            let initialCapital = portfolioData.initialCapital;
            if (!initialCapital && !portfolio.initialCapital && totalValue > 0) {
                // Если initialCapital не был установлен ранее, устанавливаем его равным текущему totalValue
                initialCapital = totalValue;
                console.log(`   💰 Установка initialCapital = totalValue: ${initialCapital} RUB`);
            } else {
                // Сохраняем существующий initialCapital, если он уже был установлен
                initialCapital = initialCapital || portfolio.initialCapital;
            }
            
            await portfolio.update({
                cash: portfolioData.cash || 0,
                positions: portfolioData.positions || {},
                trades: portfolioData.trades || [],
                totalValue: totalValue,
                positionsValue: portfolioData.positionsValue || 0,
                initialCapital: initialCapital,
                lastUpdated: new Date()
            });
            
            // Проверяем, что данные действительно обновились
            await portfolio.reload();
            
            // Проверяем сохраненные позиции
            let savedPositions = portfolio.positions;
            if (typeof savedPositions === 'string') {
                try {
                    savedPositions = JSON.parse(savedPositions);
                } catch (e) {
                    console.warn('⚠️ Ошибка парсинга сохраненных positions:', e.message);
                    savedPositions = {};
                }
            }
            const savedPositionsCount = savedPositions && typeof savedPositions === 'object' && !Array.isArray(savedPositions)
                ? Object.keys(savedPositions).length
                : 0;
            
            console.log(`✅ Реальный портфель обновлен в БД: ID=${portfolio.id}, totalValue=${portfolio.totalValue}, savedPositions=${savedPositionsCount}`);
            if (savedPositionsCount > 0) {
                console.log(`   📋 Сохраненные позиции:`, Object.entries(savedPositions).map(([figi, qty]) => `${figi}:${qty}`).join(', '));
            }
        }
        
        return portfolio;
    } catch (error) {
        console.error('❌ Ошибка сохранения реального портфеля:', error);
        throw error;
    }
};

export default RealPortfolio;

