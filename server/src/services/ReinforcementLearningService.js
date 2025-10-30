import * as tf from '@tensorflow/tfjs';
import ModelManager from '../utils/ModelManager.js';
import CacheService from './CacheService.js';
import WebSocketService from './WebSocketService.js';
import OptimizedAnalysisService from './OptimizedAnalysisService.js';
import { getService } from './GlobalServiceManager.js';

/**
 * Сервис Reinforcement Learning
 * Использует Deep Q-Network (DQN) для обучения торговым стратегиям
 */
class ReinforcementLearningService {
    constructor() {
        this.agent = null;
        this.targetAgent = null;
        this.memory = [];
        this.priorities = [];
        this.isInitialized = false;
        this.isTraining = false;
        this.trainingFigiLocks = new Set();
        this.config = {
            stateSize: 20,
            actionSize: 3,
            learningRate: 0.001,
            gamma: 0.95,
            epsilon: 1.0,
            epsilonMin: 0.01,
            epsilonDecay: 0.995,
            batchSize: 32,
            maxMemorySize: 10000,
            updateTargetFreq: 100,
            prioritizedReplayAlpha: 0.6, // приоритетность сэмплинга
            prioritizedReplayBeta: 0.4,  // важность IS весов (можно не использовать на первом этапе)
            prioritizedReplayEps: 1e-6
        };
        this.stats = {
            totalEpisodes: 0,
            averageReward: 0,
            bestReward: -Infinity,
            winRate: 0,
            epsilon: 1.0,
            memorySize: 0
        };
    }

    /**
     * Инициализация RL агента
     */
    async initialize() {
        try {
            console.log('🤖 Initializing Reinforcement Learning Service...');
            
            // Сначала пытаемся загрузить существующую модель
            await this.loadModel();
            
            // Если модель не загружена, создаем новую
            if (!this.agent) {
                console.log('Creating new RL agent...');
                this.agent = this.createDQN();
                this.targetAgent = this.createDQN();
                this.targetAgent.setWeights(this.agent.getWeights());
            }
            
            this.isInitialized = true;
            console.log('✅ Reinforcement Learning Service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize RL Service:', error);
            throw error;
        }
    }

    /**
     * Создание DQN сети
     */
    createDQN() {
        const model = tf.sequential({
            layers: [
                tf.layers.dense({
                    units: 128,
                    activation: 'relu',
                    inputShape: [this.config.stateSize],
                    kernelInitializer: 'heUniform'
                }),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.dense({
                    units: 64,
                    activation: 'relu',
                    kernelInitializer: 'heUniform'
                }),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.dense({
                    units: 32,
                    activation: 'relu',
                    kernelInitializer: 'heUniform'
                }),
                tf.layers.dense({
                    units: this.config.actionSize,
                    activation: 'linear',
                    kernelInitializer: 'glorotUniform'
                })
            ]
        });

        model.compile({
            optimizer: tf.train.adam(this.config.learningRate),
            loss: 'meanSquaredError',
            metrics: ['mae']
        });

        return model;
    }

    /**
     * Обучение RL агента
     */
    async train(figi, options = {}) {
        const {
            episodes = 50,
            days = 30,
            initialPortfolio = { cash: 10000, position: 0, total_value: 10000 }
        } = options;

        // Получаем TrainingStatusService один раз
        const trainingStatusService = getService('TrainingStatusService');
        
        try {
            // Глобальный лок для RL
            if (this.isTraining) {
                console.warn(`⚠️ RL training already in progress, skipping new start for ${figi}`);
                return { success: false, error: 'RL training already in progress' };
            }
            // Per-FIGI лок
            if (this.trainingFigiLocks.has(figi)) {
                console.warn(`⚠️ RL training already running for ${figi}, skipping duplicate start`);
                return { success: false, error: 'RL training already running for this FIGI' };
            }
            console.log(`🤖 Starting RL training for ${figi}...`);
            
            // Обновляем статус обучения
            if (trainingStatusService) {
                trainingStatusService.startTraining('reinforcementLearning', 1);
            }
            
            // Тёплый старт/инициализация
            if (!this.isInitialized) {
                await this.initialize();
            } else if (!this.agent) {
                await this.loadModel();
                if (!this.agent) {
                    this.agent = this.createDQN();
                    this.targetAgent = this.createDQN();
                    this.targetAgent.setWeights(this.agent.getWeights());
                }
            }
            this.isTraining = true;
            this.trainingFigiLocks.add(figi);
            this.stats.totalEpisodes = 0;
            this.stats.averageReward = 0;
            this.stats.bestReward = -Infinity;

            // Получаем исторические данные
            const candles = await CacheService.getCandles(figi, 'DAY', days);
            if (candles.length < 30) {
                throw new Error(`Insufficient data: ${candles.length} candles`);
            }

            const results = [];
            let bestReward = -Infinity;

            for (let episode = 0; episode < episodes; episode++) {
                const result = await this.runEpisode(candles, initialPortfolio, episode);
                results.push(result);
                if (result.totalReward > bestReward) {
                    bestReward = result.totalReward;
                    await this.saveBestCheckpoint(bestReward);
                }
                
                this.stats.totalEpisodes++;
                this.stats.averageReward = (this.stats.averageReward * (episode) + result.totalReward) / (episode + 1);
                this.stats.bestReward = Math.max(this.stats.bestReward, result.totalReward);
                this.stats.epsilon = this.config.epsilon;
                this.stats.memorySize = this.memory.length;

                // Обновляем целевую сеть
                if (episode % this.config.updateTargetFreq === 0) {
                    this.targetAgent.setWeights(this.agent.getWeights());
                }

                // Уведомляем о прогрессе
                this.broadcastTrainingProgress(episode, episodes, result);
            }

            console.log('✅ RL training completed');
            // Сохраняем обновлённую модель для накопления знаний
            await this.saveModel();
            
            // Завершаем обучение
            if (trainingStatusService) {
                trainingStatusService.completeTraining('reinforcementLearning', true);
            }
            
            return {
                success: true,
                results,
                stats: this.stats
            };

        } catch (error) {
            console.error('❌ RL training failed:', error);
            
            // Завершаем обучение с ошибкой
            if (trainingStatusService) {
                trainingStatusService.completeTraining('reinforcementLearning', false);
            }
            
            // Временный алерт в Telegram
            try {
                const OptimizedTelegramService = (await import('./OptimizedTelegramService.js')).default;
                await OptimizedTelegramService.sendAlert('RL_TRAINING_ERROR', {
                    error: error.message,
                    context: 'RL Training',
                    timestamp: new Date().toISOString()
                });
            } catch (telegramError) {
                console.error('Failed to send Telegram alert:', telegramError);
            }
            throw error;
        } finally {
            this.isTraining = false;
            try { this.trainingFigiLocks.delete(figi); } catch {}
        }
    }

    /**
     * Запуск одного эпизода обучения
     */
    async runEpisode(candles, initialPortfolio, episode) {
        let portfolio = { ...initialPortfolio };
        let totalReward = 0;
        let stepCount = 0;
        const maxSteps = Math.min(candles.length - 1, 100);

        for (let i = 1; i < maxSteps; i++) {
            const currentCandle = candles[i];
            const previousCandle = candles[i - 1];

            // Получаем состояние
            const state = this.getState(currentCandle, previousCandle, portfolio, candles, i);

            // Выбираем действие
            const action = await this.chooseAction(state, true);

            // Выполняем действие
            const newPortfolio = this.executeAction(action, portfolio, currentCandle);

            // Рассчитываем награду
            const reward = this.calculateReward(action, currentCandle, newPortfolio, portfolio);

            // Получаем следующее состояние
            const nextState = i < maxSteps - 1 ? 
                this.getState(candles[i + 1], currentCandle, newPortfolio, candles, i + 1) : 
                state;

            // Сохраняем опыт
            this.storeExperience(state, action, reward, nextState, i === maxSteps - 1);

            // Обучение
            if (this.memory.length >= this.config.batchSize) {
                await this.trainBatchStep();
            }

            portfolio = newPortfolio;
            totalReward += reward;
            stepCount++;
        }

        return {
            episode,
            totalReward,
            stepCount,
            finalPortfolio: portfolio,
            winRate: portfolio.total_value > initialPortfolio.total_value ? 1 : 0
        };
    }

    /**
     * Получение состояния для агента
     */
    getState(currentCandle, previousCandle, portfolio, candles, index) {
        const state = [];

        // Технические индикаторы
        const prices = candles.slice(Math.max(0, index - 20), index + 1).map(c => c.close);
        const indicators = OptimizedAnalysisService.getAllIndicators(prices);
        
        state.push(indicators.rsi || 0.5);
        state.push(indicators.macd || 0);
        state.push(indicators.bb_position || 0.5);
        state.push(indicators.sma_20 || 0);
        state.push(indicators.ema_12 || 0);
        state.push(indicators.stoch || 0.5);
        state.push(indicators.williams_r || -0.5);
        state.push(indicators.atr || 0);
        state.push(indicators.volatility || 0);

        // Рыночные условия
        const priceChange = (currentCandle.close - previousCandle.close) / previousCandle.close;
        const volumeRatio = currentCandle.volume / (previousCandle.volume || 1);
        const volatility = Math.abs(priceChange);
        
        state.push(priceChange);
        state.push(volumeRatio);
        state.push(volatility);
        state.push(currentCandle.high / currentCandle.close - 1); // High/Close ratio
        state.push(currentCandle.low / currentCandle.close - 1);  // Low/Close ratio

        // Портфель
        state.push(portfolio.cash / portfolio.total_value);
        state.push(portfolio.position / portfolio.total_value);
        state.push((portfolio.total_value - 10000) / 10000); // PnL ratio

        // Временные факторы
        const date = new Date(currentCandle.time);
        state.push(date.getHours() / 23);
        state.push(date.getDay() / 6);

        // Дополняем до нужного размера
        while (state.length < this.config.stateSize) {
            state.push(0);
        }

        return state.slice(0, this.config.stateSize);
    }

    /**
     * Выбор действия (ε-greedy стратегия)
     */
    async chooseAction(state, training = false) {
        if (training && Math.random() < this.config.epsilon) {
            // Случайное действие
            return Math.floor(Math.random() * this.config.actionSize);
        }

        // Жадное действие
        const stateTensor = tf.tensor2d([state]);
        const qValues = this.agent.predict(stateTensor);
        const action = tf.argMax(qValues, 1);
        const actionValue = await action.data();

        stateTensor.dispose();
        qValues.dispose();
        action.dispose();

        return actionValue[0];
    }

    /**
     * Выполнение действия
     */
    executeAction(action, portfolio, candle) {
        const newPortfolio = { ...portfolio };
        const price = candle.close;

        switch (action) {
            case 0: // HOLD
                // Ничего не делаем
                break;
            case 1: // BUY
                if (newPortfolio.cash > price) {
                    const maxShares = Math.floor(newPortfolio.cash / price);
                    const shares = Math.min(maxShares, 10); // Ограничиваем размер позиции
                    newPortfolio.cash -= shares * price;
                    newPortfolio.position += shares;
                }
                break;
            case 2: // SELL
                if (newPortfolio.position > 0) {
                    const shares = Math.min(newPortfolio.position, 10);
                    newPortfolio.cash += shares * price;
                    newPortfolio.position -= shares;
                }
                break;
        }

        // Обновляем общую стоимость
        newPortfolio.total_value = newPortfolio.cash + newPortfolio.position * price;

        return newPortfolio;
    }

    /**
     * Расчет награды
     */
    calculateReward(action, candle, newPortfolio, oldPortfolio) {
        let reward = 0;

        // Базовая награда за изменение стоимости портфеля
        const pnl = (newPortfolio.total_value - oldPortfolio.total_value) / oldPortfolio.total_value;
        reward += pnl * 100; // Масштабируем награду

        // Бонус за правильные решения
        const priceChange = (candle.close - candle.open) / candle.open;
        if ((action === 1 && priceChange > 0) || (action === 2 && priceChange < 0)) {
            reward += 0.1;
        }

        // Штраф за неправильные решения
        if ((action === 1 && priceChange < 0) || (action === 2 && priceChange > 0)) {
            reward -= 0.1;
        }

        // Штраф за большие просадки
        if (newPortfolio.total_value < oldPortfolio.total_value * 0.9) {
            reward -= 0.2;
        }

        // Бонус за управление рисками
        if (newPortfolio.position > 0 && newPortfolio.position < 50) {
            reward += 0.05;
        }

        return reward;
    }

    /**
     * Сохранение опыта
     */
    storeExperience(state, action, reward, nextState, done) {
        const experience = {
            state,
            action,
            reward,
            nextState,
            done
        };
        this.memory.push(experience);
        // Начальный приоритет — высокий (макс из имеющихся), чтобы новые опыты попадали в обучение
        const maxPrio = this.priorities.length ? Math.max(...this.priorities) : 1.0;
        this.priorities.push(maxPrio);

        // Ограничиваем размер памяти
        if (this.memory.length > this.config.maxMemorySize) {
            this.memory.shift();
            this.priorities.shift();
        }
    }

    /**
     * Обучение агента
     */
    async trainBatchStep() {
        if (this.memory.length < this.config.batchSize) return;

        // Выборка батча с приоритезированным сэмплингом
        const batch = this.sampleBatch();
        const states = batch.map(exp => exp.state);
        const actions = batch.map(exp => exp.action);
        const rewards = batch.map(exp => exp.reward);
        const nextStates = batch.map(exp => exp.nextState);
        const dones = batch.map(exp => exp.done);

        // Целевые значения
        const targets = await this.computeTargets(states, actions, rewards, nextStates, dones);

        // Предсказанные Q для оценки TD-ошибки (простая оценка по argmax действию)
        const statesTensor = tf.tensor2d(states);
        const qValues = this.agent.predict(statesTensor);
        const qValuesArray = await qValues.data();
        const predictedQ = Array.from(qValuesArray).map(v => v); // плоский вид для простоты

        // Обучение
        const targetsTensor = tf.tensor2d(targets);
        await this.agent.fit(statesTensor, targetsTensor, { epochs: 1, verbose: 0 });

        // Обновляем приоритеты на основе TD-ошибки
        await this.updatePriorities(batch, predictedQ, targets);

        // Очистка
        statesTensor.dispose();
        targetsTensor.dispose();
        qValues.dispose();

        // Epsilon decay
        if (this.config.epsilon > this.config.epsilonMin) {
            this.config.epsilon *= this.config.epsilonDecay;
        }
    }

    /**
     * Выборка случайного батча
     */
    sampleBatch() {
        const n = this.memory.length;
        if (n === 0) return [];
        const alpha = this.config.prioritizedReplayAlpha;
        const eps = this.config.prioritizedReplayEps;
        const priorities = this.priorities.map(p => Math.pow(p + eps, alpha));
        const sumP = priorities.reduce((a, b) => a + b, 0);
        const probs = priorities.map(p => p / (sumP || 1));

        const batch = [];
        const indices = [];
        for (let i = 0; i < this.config.batchSize; i++) {
            let r = Math.random();
            let cum = 0;
            for (let j = 0; j < n; j++) {
                cum += probs[j];
                if (r <= cum) {
                    batch.push(this.memory[j]);
                    indices.push(j);
                    break;
                }
            }
        }
        batch.indices = indices;
        return batch;
    }

    /**
     * Вычисление целевых Q-значений
     */
    async computeTargets(states, actions, rewards, nextStates, dones) {
        const nextStatesTensor = tf.tensor2d(nextStates);
        const nextQValues = this.targetAgent.predict(nextStatesTensor);
        const maxNextQValues = tf.max(nextQValues, 1);
        const maxNextQValuesArray = await maxNextQValues.data();

        const targets = states.map((state, index) => {
            const target = rewards[index] + (dones[index] ? 0 : this.config.gamma * maxNextQValuesArray[index]);
            return target;
        });

        nextStatesTensor.dispose();
        nextQValues.dispose();
        maxNextQValues.dispose();

        return targets;
    }

    /**
     * Обновление приоритетов по TD-ошибке
     */
    async updatePriorities(batch, predictedQ, targets) {
        try {
            const indices = batch.indices || [];
            const errors = targets.map((t, i) => Math.abs(t - predictedQ[i]));
            for (let k = 0; k < indices.length; k++) {
                const idx = indices[k];
                if (typeof idx === 'number' && idx >= 0 && idx < this.priorities.length) {
                    this.priorities[idx] = errors[k];
                }
            }
        } catch (e) {
            // best-effort
        }
    }

    /**
     * Получение торговой рекомендации
     */
    async getTradingRecommendation(figi, portfolio, marketData = null) {
        try {
            if (!this.isInitialized) {
                throw new Error('RL agent not initialized');
            }

            // Получаем последние данные
            const candles = await CacheService.getCandles(figi, 'DAY', 30);
            if (candles.length < 2) {
                return { action: 0, confidence: 0, reason: 'Insufficient data' };
            }

            const currentCandle = candles[candles.length - 1];
            const previousCandle = candles[candles.length - 2];

            // Получаем состояние
            const state = this.getState(currentCandle, previousCandle, portfolio, candles, candles.length - 1);

            // Выбираем действие
            const action = await this.chooseAction(state, false);

            // Получаем Q-значения для уверенности
            const stateTensor = tf.tensor2d([state]);
            const qValues = this.agent.predict(stateTensor);
            const qValuesArray = await qValues.data();
            const confidence = Math.max(...qValuesArray) / Math.abs(Math.min(...qValuesArray) || 1);

            stateTensor.dispose();
            qValues.dispose();

            const actionNames = ['HOLD', 'BUY', 'SELL'];
            const actionName = actionNames[action];

            return {
                action,
                actionName,
                confidence: Math.min(confidence, 1),
                qValues: qValuesArray,
                recommendation: actionName,
                reason: `RL agent recommendation based on ${candles.length} days of data`
            };

        } catch (error) {
            console.error('❌ RL recommendation failed:', error);
            // Временный алерт в Telegram
            try {
                const OptimizedTelegramService = (await import('./OptimizedTelegramService.js')).default;
                await OptimizedTelegramService.sendAlert('RL_RECOMMENDATION_ERROR', {
                    error: error.message,
                    context: 'RL Recommendation',
                    timestamp: new Date().toISOString()
                });
            } catch (telegramError) {
                console.error('Failed to send Telegram alert:', telegramError);
            }
            return { action: 0, confidence: 0, error: error.message };
        }
    }

    /**
     * Уведомление о прогрессе обучения
     */
    broadcastTrainingProgress(episode, totalEpisodes, result) {
        WebSocketService.broadcast({
            type: 'rl_training_progress',
            data: {
                episode: episode + 1,
                totalEpisodes,
                totalReward: result.totalReward,
                stepCount: result.stepCount,
                epsilon: this.config.epsilon,
                memorySize: this.memory.length,
                averageReward: this.stats.averageReward,
                bestReward: this.stats.bestReward
            },
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Получение статистики
     */
    getStats() {
        return {
            ...this.stats,
            isInitialized: this.isInitialized,
            isTraining: this.isTraining,
            config: this.config
        };
    }

    /**
     * Обновление конфигурации
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        if (this.agent) {
            this.agent.compile({
                optimizer: tf.train.adam(this.config.learningRate),
                loss: 'meanSquaredError',
                metrics: ['mae']
            });
        }
        
        console.log('⚙️ RL config updated');
    }

    /**
     * Сохранение модели
     */
    async saveModel() {
        try {
            if (!this.agent) {
                console.warn('⚠️ RL agent is null, skipping save');
                return;
            }
            
            // Сохраняем через ModelManager в стандартном формате
            const success = await ModelManager.saveModel(this.agent, 'rl_agent/rl_model');
            if (success) {
                console.log('✅ RL model saved');
            } else {
                console.warn('⚠️ RL model save reported failure');
            }
        } catch (error) {
            console.error('❌ Failed to save RL model:', error);
        }
    }

    /**
     * Сохранение лучшего чекпоинта по награде
     */
    async saveBestCheckpoint(bestReward) {
        try {
            if (!this.agent) return;
            const success = await ModelManager.saveModel(this.agent, 'rl_agent/rl_model_best');
            if (success) {
                const fs = (await import('fs/promises')).default;
                await fs.writeFile('./models/rl_agent/best_meta.json', JSON.stringify({
                    bestReward,
                    savedAt: new Date().toISOString()
                }, null, 2));
                console.log(`🏅 RL best checkpoint saved (reward=${bestReward.toFixed(2)})`);
            }
        } catch (error) {
            console.warn('⚠️ Failed to save RL best checkpoint:', error.message);
        }
    }

    /**
     * Загрузка модели
     */
    async loadModel() {
        try {
            console.log('📥 Loading RL model with ModelManager...');
            
            // Пытаемся загрузить модель через ModelManager
            const model = await ModelManager.loadModel('rl_agent/rl_model');
            
            if (model) {
                this.agent = model;
                
                // Копируем веса в целевую сеть
                if (this.targetAgent) {
                    this.targetAgent.setWeights(this.agent.getWeights());
                }
                
                console.log('✅ RL model loaded successfully');
            } else {
                console.warn('⚠️ Failed to load RL model, will create new one when needed');
            }
        } catch (error) {
            console.warn('⚠️ Failed to load RL model:', error.message);
        }
    }

    /**
     * Остановить обучение RL
     */
    async stopTraining() {
        try {
            console.log('🛑 Stopping RL training');
            
            this.isTraining = false;
            this.status = 'idle';
            
            // Уведомить через WebSocket
            if (typeof WebSocketService !== 'undefined' && WebSocketService.broadcast) {
                WebSocketService.broadcast({
                    type: 'rl_training_stopped',
                    timestamp: new Date().toISOString()
                });
            }
            
            return {
                success: true,
                message: 'RL training stopped successfully',
                status: this.status
            };
        } catch (error) {
            console.error('❌ Error stopping RL training:', error);
            throw error;
        }
    }

    /**
     * Сбросить агента RL
     */
    async resetAgent() {
        try {
            console.log('🔄 Resetting RL agent');
            
            // Остановить обучение если оно идет
            this.isTraining = false;
            this.status = 'idle';
            
            // Очистить модель и создать новую
            if (this.model) {
                this.model.dispose();
                this.model = null;
            }
            
            // Очистить буфер опыта
            this.replayBuffer = [];
            this.epsilon = 1.0; // Сбросить exploration rate
            
            // Создать новую модель
            await this.initialize();
            
            // Уведомить через WebSocket
            if (typeof WebSocketService !== 'undefined' && WebSocketService.broadcast) {
                WebSocketService.broadcast({
                    type: 'rl_agent_reset',
                    timestamp: new Date().toISOString()
                });
            }
            
            return {
                success: true,
                message: 'RL agent reset successfully',
                status: this.status,
                epsilon: this.epsilon
            };
        } catch (error) {
            console.error('❌ Error resetting RL agent:', error);
            throw error;
        }
    }
}

export default new ReinforcementLearningService();
