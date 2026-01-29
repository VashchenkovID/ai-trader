import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import { Op } from 'sequelize';

/**
 * Модель для кеширования корреляций между инструментами
 * Хранит результаты расчета корреляции Пирсона для оптимизации производительности
 */
const CorrelationCache = sequelize.define('CorrelationCache', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    
    // Пара инструментов (упорядочены лексикографически для симметричности)
    figi1: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'FIGI первого инструмента (лексикографически меньший)'
    },
    figi2: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'FIGI второго инструмента (лексикографически больший)'
    },
    
    // Результат корреляции
    correlation: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: -1,
            max: 1
        },
        comment: 'Коэффициент корреляции Пирсона (-1 до +1)'
    },
    
    // Параметры расчета
    period: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 30,
        comment: 'Период расчета корреляции в днях'
    },
    
    // Временные метки
    calculatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Время расчета корреляции'
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Время истечения кеша (обычно +24 часа от calculatedAt)'
    },
    
    // Метаданные
    dataPoints: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Количество точек данных, использованных для расчета'
    }
}, {
    tableName: 'correlation_cache',
    timestamps: true,
    indexes: [
        {
            fields: ['figi1', 'figi2', 'period'],
            unique: true,
            name: 'unique_correlation_pair'
        },
        {
            fields: ['expiresAt'],
            name: 'idx_expires_at'
        },
        {
            fields: ['figi1'],
            name: 'idx_figi1'
        },
        {
            fields: ['figi2'],
            name: 'idx_figi2'
        }
    ]
});

/**
 * Статический метод для получения или расчета корреляции
 * Автоматически использует кеш и обновляет его при необходимости
 */
CorrelationCache.getOrCalculate = async function(figi1, figi2, period = 30, calculateFn) {
    // Нормализуем порядок FIGI для симметричности
    const [normalizedFigi1, normalizedFigi2] = figi1 < figi2 ? [figi1, figi2] : [figi2, figi1];
    
    // Проверяем кеш
    const cached = await this.findOne({
        where: {
            figi1: normalizedFigi1,
            figi2: normalizedFigi2,
            period,
            expiresAt: {
                [Op.gt]: new Date()
            }
        }
    });
    
    if (cached) {
        return cached.correlation;
    }
    
    // Если нет в кеше или истек, рассчитываем
    if (!calculateFn) {
        throw new Error('calculateFn is required when cache miss');
    }
    
    const correlation = await calculateFn();
    const ttl = 24 * 60 * 60 * 1000; // 24 часа
    const expiresAt = new Date(Date.now() + ttl);
    
    // Сохраняем в кеш
    await this.upsert({
        figi1: normalizedFigi1,
        figi2: normalizedFigi2,
        correlation,
        period,
        calculatedAt: new Date(),
        expiresAt
    });
    
    return correlation;
};

/**
 * Очистка устаревших записей из кеша
 */
CorrelationCache.cleanExpired = async function() {
    try {
        const deleted = await this.destroy({
            where: {
                expiresAt: {
                    [Op.lt]: new Date()
                }
            }
        });
    
        return deleted;
    } catch (error) {
        // Если таблица не существует, это не критично
        if (error.name === 'SequelizeDatabaseError' && error.parent?.code === '42P01') {
            // Таблица будет создана при синхронизации БД
            return 0;
        }
        // Для других ошибок логируем и возвращаем 0
        console.warn('⚠️ Не удалось очистить устаревшие записи из кеша корреляций:', error.message);
        return 0;
    }
};

/**
 * Получение всех корреляций для инструмента
 */
CorrelationCache.getCorrelationsForInstrument = async function(figi, period = 30) {
    const correlations = await this.findAll({
        where: {
            [Op.or]: [
                { figi1: figi, period },
                { figi2: figi, period }
            ],
            expiresAt: {
                [Op.gt]: new Date()
            }
        }
    });
    
    // Преобразуем в удобный формат
    const result = {};
    for (const cache of correlations) {
        const otherFigi = cache.figi1 === figi ? cache.figi2 : cache.figi1;
        result[otherFigi] = cache.correlation;
    }
    
    return result;
};

export default CorrelationCache;

