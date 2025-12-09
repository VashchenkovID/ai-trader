import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const TrainingState = sequelize.define('TrainingState', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    
    // Тип обучения: 'quick' или 'full'
    trainingType: {
        type: DataTypes.ENUM('quick', 'full'),
        allowNull: false,
        defaultValue: 'quick'
    },
    
    // Индекс последнего обработанного инструмента для циклической ротации
    lastProcessedIndex: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    
    // Время последнего запуска быстрого обучения
    lastRunTime: {
        type: DataTypes.DATE,
        allowNull: true
    },
    
    // Количество обработанных инструментов за сегодня
    dailyProcessedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    
    // Дата последнего сброса счетчика (для ежедневного сброса)
    lastResetDate: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    
    // Статистика: общее количество успешных обучений
    totalSuccessfulTrainings: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    
    // Статистика: общее количество ошибок
    totalErrors: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    
    // Среднее время выполнения быстрого обучения (в секундах)
    averageExecutionTime: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    
    // Метаданные (JSON) для хранения дополнительной информации
    metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {}
    }
}, {
    tableName: 'training_states',
    timestamps: true,
    indexes: [
        {
            fields: ['trainingType']
        },
        {
            fields: ['lastRunTime']
        }
    ]
});

// Метод для получения или создания состояния обучения
TrainingState.getOrCreateState = async function(trainingType = 'quick') {
    let state = await this.findOne({
        where: { trainingType }
    });
    
    if (!state) {
        state = await this.create({
            trainingType,
            lastProcessedIndex: 0,
            dailyProcessedCount: 0,
            lastResetDate: new Date().toISOString().split('T')[0]
        });
    }
    
    // Сбрасываем счетчик, если прошла новая дата
    const today = new Date().toISOString().split('T')[0];
    if (state.lastResetDate !== today) {
        state.dailyProcessedCount = 0;
        state.lastResetDate = today;
        await state.save();
    }
    
    return state;
};

// Метод для обновления состояния после обучения
TrainingState.updateAfterTraining = async function(trainingType, options = {}) {
    const {
        processedCount = 0,
        successCount = 0,
        errorCount = 0,
        executionTimeSeconds = 0
    } = options;
    
    const state = await this.getOrCreateState(trainingType);
    
    state.lastProcessedIndex = (state.lastProcessedIndex + processedCount) % 10000; // Циклический счетчик
    state.lastRunTime = new Date();
    state.dailyProcessedCount += processedCount;
    state.totalSuccessfulTrainings += successCount;
    state.totalErrors += errorCount;
    
    // Обновляем среднее время выполнения
    if (executionTimeSeconds > 0) {
        const totalRuns = state.totalSuccessfulTrainings + state.totalErrors;
        if (totalRuns > 0) {
            state.averageExecutionTime = 
                ((state.averageExecutionTime || 0) * (totalRuns - 1) + executionTimeSeconds) / totalRuns;
        } else {
            state.averageExecutionTime = executionTimeSeconds;
        }
    }
    
    await state.save();
    return state;
};

export default TrainingState;

