import CacheService from '../services/CacheService.js';
import SettingsService from '../services/SettingsService.js';

class TrainingRecommendations {
    constructor() {
        this.recommendations = new Map();
    }

    // Получение персональных рекомендаций для обучения
    async getPersonalizedRecommendations() {
        console.log('🎯 Generating personalized training recommendations...');
        
        try {
            // Анализируем текущее состояние системы
            const systemAnalysis = await this.analyzeSystemState();
            
            // Генерируем рекомендации
            const recommendations = {
                strategy: this.recommendStrategy(systemAnalysis),
                dataPreparation: this.recommendDataPreparation(systemAnalysis),
                hyperparameters: this.recommendHyperparameters(systemAnalysis),
                schedule: this.recommendSchedule(systemAnalysis),
                monitoring: this.recommendMonitoring(systemAnalysis)
            };

            console.log('✅ Personalized recommendations generated');
            return recommendations;

        } catch (error) {
            console.error('❌ Error generating recommendations:', error);
            return this.getDefaultRecommendations();
        }
    }

    // Анализ текущего состояния системы
    async analyzeSystemState() {
        const analysis = {
            dataQuality: await this.analyzeDataQuality(),
            marketConditions: await this.analyzeMarketConditions(),
            modelPerformance: await this.analyzeModelPerformance(),
            systemResources: await this.analyzeSystemResources(),
            userPreferences: await this.analyzeUserPreferences()
        };

        return analysis;
    }

    // Анализ качества данных
    async analyzeDataQuality() {
        try {
            const instruments = await CacheService.getAllInstruments(50);
            let totalQuality = 0;
            let validInstruments = 0;

            for (const instrument of instruments) {
                try {
                    const candles = await CacheService.getCandles(instrument.figi, 'DAY', 180);
                    if (candles.length >= 100) {
                        const quality = this.calculateInstrumentDataQuality(candles);
                        totalQuality += quality;
                        validInstruments++;
                    }
                } catch (error) {
                    // Пропускаем проблемные инструменты
                    continue;
                }
            }

            const averageQuality = validInstruments > 0 ? totalQuality / validInstruments : 0.5;
            
            return {
                score: averageQuality,
                validInstruments: validInstruments,
                totalInstruments: instruments.length,
                coverage: validInstruments / instruments.length
            };
        } catch (error) {
            return { score: 0.5, validInstruments: 0, totalInstruments: 0, coverage: 0 };
        }
    }

    // Расчет качества данных для инструмента
    calculateInstrumentDataQuality(candles) {
        if (candles.length < 10) return 0;

        let quality = 1.0;
        
        // Проверяем на пропуски
        const gaps = this.detectDataGaps(candles);
        quality -= gaps * 0.3;
        
        // Проверяем на аномалии
        const anomalies = this.detectPriceAnomalies(candles);
        quality -= anomalies * 0.2;
        
        // Проверяем объемы
        const volumeIssues = this.detectVolumeIssues(candles);
        quality -= volumeIssues * 0.1;
        
        return Math.max(0, Math.min(1, quality));
    }

    // Анализ рыночных условий
    async analyzeMarketConditions() {
        try {
            // Получаем данные по основным индексам
            const instruments = await CacheService.getAllInstruments(100);
            const indexInstruments = instruments.filter(inst => 
                inst.type === 'index' && 
                ['RTSI', 'IMOEX', 'RTSSTD'].includes(inst.ticker)
            );

            let totalVolatility = 0;
            let totalTrend = 0;
            let validIndices = 0;

            for (const index of indexInstruments) {
                try {
                    const candles = await CacheService.getCandles(index.figi, 'DAY', 30);
                    if (candles.length >= 20) {
                        const volatility = this.calculateVolatility(candles);
                        const trend = this.calculateTrend(candles);
                        
                        totalVolatility += volatility;
                        totalTrend += trend;
                        validIndices++;
                    }
                } catch (error) {
                    continue;
                }
            }

            const avgVolatility = validIndices > 0 ? totalVolatility / validIndices : 0.2;
            const avgTrend = validIndices > 0 ? totalTrend / validIndices : 0;

            return {
                volatility: avgVolatility,
                trend: avgTrend,
                marketPhase: this.determineMarketPhase(avgVolatility, avgTrend),
                indicesAnalyzed: validIndices
            };
        } catch (error) {
            return {
                volatility: 0.2,
                trend: 0,
                marketPhase: 'normal',
                indicesAnalyzed: 0
            };
        }
    }

    // Анализ производительности модели
    async analyzeModelPerformance() {
        // Здесь можно добавить анализ последних результатов обучения
        return {
            lastAccuracy: 0.65, // Примерное значение
            trainingFrequency: 'weekly',
            lastTraining: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 дней назад
            performanceTrend: 'stable'
        };
    }

    // Анализ системных ресурсов
    async analyzeSystemResources() {
        // Простая оценка ресурсов
        return {
            memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
            cpuUsage: process.cpuUsage().user / 1000000, // seconds
            diskSpace: 'sufficient', // Упрощенная оценка
            networkLatency: 'low'
        };
    }

    // Анализ пользовательских предпочтений
    async analyzeUserPreferences() {
        try {
            const settings = await SettingsService.getNeuralNetworkSettings();
            return {
                trainingDays: settings.nn_training_days || 180,
                trainingLimit: settings.nn_training_limit || 50,
                quickTrainingEnabled: settings.nn_quick_training_enabled || false,
                quickTrainingInterval: settings.nn_training_interval || '*/15 * * * *',
                maxPrice: settings.user_max_price || 10000,
                minPrice: settings.user_min_price || 10
            };
        } catch (error) {
            return {
                trainingDays: 180,
                trainingLimit: 50,
                quickTrainingEnabled: false,
                quickTrainingInterval: '*/15 * * * *',
                maxPrice: 10000,
                minPrice: 10
            };
        }
    }

    // Рекомендация стратегии обучения
    recommendStrategy(analysis) {
        const { dataQuality, marketConditions, modelPerformance } = analysis;
        
        let strategy = 'progressive';
        let confidence = 0.7;
        let reasoning = [];

        // Высокая волатильность → Ensemble
        if (marketConditions.volatility > 0.3) {
            strategy = 'ensemble';
            confidence = 0.9;
            reasoning.push('Высокая волатильность рынка требует ансамблевого подхода');
        }
        
        // Низкое качество данных → Progressive
        else if (dataQuality.score < 0.6) {
            strategy = 'progressive';
            confidence = 0.8;
            reasoning.push('Низкое качество данных требует осторожного прогрессивного обучения');
        }
        
        // Хорошие данные + стабильный рынок → Adaptive
        else if (dataQuality.score > 0.8 && marketConditions.volatility < 0.2) {
            strategy = 'adaptive';
            confidence = 0.85;
            reasoning.push('Качественные данные и стабильный рынок позволяют использовать адаптивное обучение');
        }
        
        // Низкая производительность → Transfer Learning
        else if (modelPerformance.lastAccuracy < 0.6) {
            strategy = 'transfer';
            confidence = 0.75;
            reasoning.push('Низкая производительность модели требует transfer learning');
        }

        return {
            strategy,
            confidence,
            reasoning,
            expectedImprovement: this.estimateImprovement(strategy, analysis)
        };
    }

    // Рекомендации по подготовке данных
    recommendDataPreparation(analysis) {
        const { dataQuality, marketConditions } = analysis;
        
        const recommendations = {
            normalization: 'minmax',
            augmentation: false,
            balancing: true,
            featureSelection: true,
            timeFeatures: true,
            marketContext: true
        };

        // Низкое качество данных → больше аугментации
        if (dataQuality.score < 0.7) {
            recommendations.augmentation = true;
            recommendations.normalization = 'robust';
        }

        // Высокая волатильность → больше контекста
        if (marketConditions.volatility > 0.25) {
            recommendations.marketContext = true;
            recommendations.timeFeatures = true;
        }

        return {
            ...recommendations,
            reasoning: this.getDataPrepReasoning(recommendations, analysis)
        };
    }

    // Рекомендации по гиперпараметрам
    recommendHyperparameters(analysis) {
        const { dataQuality, marketConditions, systemResources } = analysis;
        
        let learningRate = 0.001;
        let batchSize = 32;
        let epochs = 50;
        let dropout = 0.2;

        // Адаптация под качество данных
        if (dataQuality.score < 0.6) {
            learningRate = 0.0005; // Меньше LR для нестабильных данных
            batchSize = 16; // Меньше batch для лучшего обучения
            epochs = 30; // Меньше эпох чтобы избежать переобучения
        } else if (dataQuality.score > 0.8) {
            learningRate = 0.0015; // Больше LR для качественных данных
            batchSize = 64; // Больше batch для стабильности
            epochs = 70; // Больше эпох для лучшего обучения
        }

        // Адаптация под волатильность
        if (marketConditions.volatility > 0.3) {
            dropout = 0.3; // Больше dropout для волатильного рынка
            learningRate *= 0.8; // Меньше LR для стабильности
        }

        // Адаптация под ресурсы
        if (systemResources.memoryUsage > 500) { // > 500MB
            batchSize = Math.min(batchSize, 16); // Ограничиваем batch size
        }

        return {
            learningRate,
            batchSize,
            epochs,
            dropout,
            optimizer: 'adam',
            validationSplit: 0.2,
            earlyStopping: true,
            reasoning: this.getHyperparamsReasoning({ learningRate, batchSize, epochs, dropout }, analysis)
        };
    }

    // Рекомендации по расписанию
    recommendSchedule(analysis) {
        const { dataQuality, marketConditions, userPreferences } = analysis;
        
        let fullTrainingSchedule = '0 3 * * 1'; // Понедельник в 3:00
        let quickTrainingSchedule = '*/30 * * * *'; // Каждые 30 минут
        let quickTrainingEnabled = true;
        let quickTrainingLimit = 10;

        // Адаптация под качество данных
        if (dataQuality.score < 0.6) {
            fullTrainingSchedule = '0 2 * * 1'; // Раньше для больше времени
            quickTrainingSchedule = '*/60 * * * *'; // Реже для стабильности
            quickTrainingLimit = 5; // Меньше инструментов
        }

        // Адаптация под волатильность
        if (marketConditions.volatility > 0.3) {
            quickTrainingSchedule = '*/15 * * * *'; // Чаще для волатильного рынка
            quickTrainingLimit = 15; // Больше инструментов
        }

        // Учет пользовательских предпочтений
        if (userPreferences.quickTrainingEnabled === false) {
            quickTrainingEnabled = false;
        }

        return {
            fullTrainingSchedule,
            quickTrainingSchedule,
            quickTrainingEnabled,
            quickTrainingLimit,
            reasoning: this.getScheduleReasoning({ fullTrainingSchedule, quickTrainingSchedule, quickTrainingEnabled }, analysis)
        };
    }

    // Рекомендации по мониторингу
    recommendMonitoring(analysis) {
        const { dataQuality, marketConditions, modelPerformance } = analysis;
        
        const monitoring = {
            accuracyThreshold: 0.6,
            performanceCheckInterval: 3600000, // 1 час
            alertOnDegradation: true,
            alertOnOverfitting: true,
            alertOnDataDrift: true,
            performanceHistoryDays: 30
        };

        // Адаптация под качество данных
        if (dataQuality.score < 0.6) {
            monitoring.accuracyThreshold = 0.5; // Ниже порог для некачественных данных
            monitoring.performanceCheckInterval = 1800000; // 30 минут
        }

        // Адаптация под волатильность
        if (marketConditions.volatility > 0.3) {
            monitoring.performanceCheckInterval = 900000; // 15 минут
            monitoring.alertOnDataDrift = true;
        }

        return {
            ...monitoring,
            reasoning: this.getMonitoringReasoning(monitoring, analysis)
        };
    }

    // Вспомогательные методы
    detectDataGaps(candles) {
        let gaps = 0;
        for (let i = 1; i < candles.length; i++) {
            const timeDiff = candles[i].time - candles[i-1].time;
            if (timeDiff > 86400000 * 2) { // Более 2 дней
                gaps++;
            }
        }
        return gaps / candles.length;
    }

    detectPriceAnomalies(candles) {
        const prices = candles.map(c => c.close);
        const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
        const std = Math.sqrt(prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length);
        
        let anomalies = 0;
        for (const price of prices) {
            if (Math.abs(price - mean) > 3 * std) {
                anomalies++;
            }
        }
        return anomalies / prices.length;
    }

    detectVolumeIssues(candles) {
        const volumes = candles.map(c => c.volume);
        const zeroVolumes = volumes.filter(v => v === 0).length;
        return zeroVolumes / volumes.length;
    }

    calculateVolatility(candles) {
        const prices = candles.map(c => c.close);
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
        const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
        const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
        return Math.sqrt(variance);
    }

    calculateTrend(candles) {
        const prices = candles.map(c => c.close);
        const firstHalf = prices.slice(0, Math.floor(prices.length / 2));
        const secondHalf = prices.slice(Math.floor(prices.length / 2));
        
        const firstAvg = firstHalf.reduce((sum, price) => sum + price, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, price) => sum + price, 0) / secondHalf.length;
        
        return (secondAvg - firstAvg) / firstAvg;
    }

    determineMarketPhase(volatility, trend) {
        if (volatility > 0.3) return 'volatile';
        if (trend > 0.1) return 'bullish';
        if (trend < -0.1) return 'bearish';
        return 'normal';
    }

    estimateImprovement(strategy, analysis) {
        const baseAccuracy = analysis.modelPerformance.lastAccuracy;
        const improvements = {
            'progressive': 0.05,
            'ensemble': 0.15,
            'adaptive': 0.10,
            'transfer': 0.12,
            'reinforcement': 0.08
        };
        
        return Math.min(0.95, baseAccuracy + improvements[strategy]);
    }

    getDataPrepReasoning(recommendations, analysis) {
        const reasons = [];
        
        if (recommendations.augmentation) {
            reasons.push('Аугментация данных поможет увеличить обучающую выборку');
        }
        
        if (recommendations.normalization === 'robust') {
            reasons.push('Robust нормализация устойчива к выбросам');
        }
        
        if (recommendations.marketContext) {
            reasons.push('Рыночный контекст улучшит качество предсказаний');
        }
        
        return reasons;
    }

    getHyperparamsReasoning(params, analysis) {
        const reasons = [];
        
        if (params.learningRate < 0.001) {
            reasons.push('Пониженный learning rate для стабильного обучения');
        }
        
        if (params.dropout > 0.2) {
            reasons.push('Увеличенный dropout для предотвращения переобучения');
        }
        
        if (params.batchSize < 32) {
            reasons.push('Меньший batch size для лучшего обучения на малых данных');
        }
        
        return reasons;
    }

    getScheduleReasoning(schedule, analysis) {
        const reasons = [];
        
        if (schedule.quickTrainingEnabled) {
            reasons.push('Быстрое обучение поможет адаптироваться к изменениям рынка');
        }
        
        if (schedule.quickTrainingSchedule === '*/15 * * * *') {
            reasons.push('Частое обучение необходимо при высокой волатильности');
        }
        
        return reasons;
    }

    getMonitoringReasoning(monitoring, analysis) {
        const reasons = [];
        
        if (monitoring.performanceCheckInterval < 3600000) {
            reasons.push('Частые проверки необходимы для нестабильных условий');
        }
        
        if (monitoring.alertOnDataDrift) {
            reasons.push('Мониторинг дрейфа данных критичен для волатильного рынка');
        }
        
        return reasons;
    }

    // Получение рекомендаций по умолчанию
    getDefaultRecommendations() {
        return {
            strategy: {
                strategy: 'progressive',
                confidence: 0.7,
                reasoning: ['Используется безопасная стратегия по умолчанию'],
                expectedImprovement: 0.7
            },
            dataPreparation: {
                normalization: 'minmax',
                augmentation: false,
                balancing: true,
                featureSelection: true,
                timeFeatures: true,
                marketContext: false,
                reasoning: ['Базовые настройки подготовки данных']
            },
            hyperparameters: {
                learningRate: 0.001,
                batchSize: 32,
                epochs: 50,
                dropout: 0.2,
                optimizer: 'adam',
                validationSplit: 0.2,
                earlyStopping: true,
                reasoning: ['Стандартные гиперпараметры']
            },
            schedule: {
                fullTrainingSchedule: '0 3 * * 1',
                quickTrainingSchedule: '*/30 * * * *',
                quickTrainingEnabled: true,
                quickTrainingLimit: 10,
                reasoning: ['Базовое расписание обучения']
            },
            monitoring: {
                accuracyThreshold: 0.6,
                performanceCheckInterval: 3600000,
                alertOnDegradation: true,
                alertOnOverfitting: true,
                alertOnDataDrift: false,
                performanceHistoryDays: 30,
                reasoning: ['Стандартный мониторинг']
            }
        };
    }
}

export default new TrainingRecommendations();
