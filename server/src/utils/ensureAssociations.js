/**
 * Утилита для гарантированной установки ассоциаций между моделями
 * Используется в worker'ах и сервисах, где ассоциации могут не быть установлены
 */

export async function ensureAssociations() {
    try {
        const TradingRequest = (await import('../models/TradingRequest.js')).default;
        const TradingStrategy = (await import('../models/TradingStrategy.js')).default;
        const PositionStrategy = (await import('../models/PositionStrategy.js')).default;
        const Recommendation = (await import('../models/Recommendation.js')).default;
        const BacktestResult = (await import('../models/BacktestResult.js')).default;
        
        // Ждем немного, чтобы ассоциации из моделей установились (если они устанавливаются асинхронно)
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const associationsSet = {
            TradingRequest: false,
            PositionStrategy: false,
            Recommendation: false,
            BacktestResult: false
        };
        
        // Устанавливаем ассоциации для TradingRequest
        if (!TradingRequest.associations || !TradingRequest.associations.strategy) {
            TradingRequest.belongsTo(TradingStrategy, {
                foreignKey: 'strategyId',
                as: 'strategy'
            });
            associationsSet.TradingRequest = true;
        }
        
        // Устанавливаем ассоциации для PositionStrategy
        if (!PositionStrategy.associations || !PositionStrategy.associations.strategy) {
            PositionStrategy.belongsTo(TradingStrategy, {
                foreignKey: 'strategyId',
                as: 'strategy'
            });
            PositionStrategy.belongsTo(TradingRequest, {
                foreignKey: 'positionId',
                as: 'position'
            });
            associationsSet.PositionStrategy = true;
        }
        
        // Устанавливаем ассоциации для Recommendation
        if (!Recommendation.associations || !Recommendation.associations.strategy) {
            Recommendation.belongsTo(TradingStrategy, {
                foreignKey: 'strategyId',
                as: 'strategy'
            });
            associationsSet.Recommendation = true;
        }
        
        // Устанавливаем ассоциации для BacktestResult
        if (!BacktestResult.associations || !BacktestResult.associations.strategy) {
            BacktestResult.belongsTo(TradingStrategy, {
                foreignKey: 'strategyId',
                as: 'strategy'
            });
            associationsSet.BacktestResult = true;
        }
        
        const setCount = Object.values(associationsSet).filter(Boolean).length;
        if (setCount > 0) {
            console.log(`✅ [ensureAssociations] Set ${setCount} association(s):`, 
                Object.entries(associationsSet)
                    .filter(([_, set]) => set)
                    .map(([model]) => model)
                    .join(', '));
        }
        
        return associationsSet;
    } catch (error) {
        console.warn('⚠️ [ensureAssociations] Could not set associations:', error.message);
        // Пробуем установить еще раз без проверки
        try {
            const TradingRequest = (await import('../models/TradingRequest.js')).default;
            const TradingStrategy = (await import('../models/TradingStrategy.js')).default;
            const PositionStrategy = (await import('../models/PositionStrategy.js')).default;
            const Recommendation = (await import('../models/Recommendation.js')).default;
            const BacktestResult = (await import('../models/BacktestResult.js')).default;
            
            TradingRequest.belongsTo(TradingStrategy, {
                foreignKey: 'strategyId',
                as: 'strategy'
            });
            
            PositionStrategy.belongsTo(TradingStrategy, {
                foreignKey: 'strategyId',
                as: 'strategy'
            });
            PositionStrategy.belongsTo(TradingRequest, {
                foreignKey: 'positionId',
                as: 'position'
            });
            
            Recommendation.belongsTo(TradingStrategy, {
                foreignKey: 'strategyId',
                as: 'strategy'
            });
            
            BacktestResult.belongsTo(TradingStrategy, {
                foreignKey: 'strategyId',
                as: 'strategy'
            });
            
            console.log('✅ [ensureAssociations] Associations set on retry');
        } catch (retryError) {
            console.error('❌ [ensureAssociations] Failed to set associations even on retry:', retryError.message);
            throw retryError;
        }
    }
}

