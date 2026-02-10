import * as tf from '@tensorflow/tfjs';
import ModelManager from '../utils/ModelManager.js';
import CacheService from './CacheService.js';
import OptimizedAnalysisService from './OptimizedAnalysisService.js';
import { getService } from './GlobalServiceManager.js';
import ServiceManager from './ServiceManager.js';

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
        // Дополнительные поля для отслеживания текущего состояния
        this.lastEpisodeTime = null;
        this.currentAction = null;
        this.currentQValue = 0;
        this.lastTotalReward = 0;
    }

    /**
     * Инициализация RL агента
     */
    async initialize() {
        try {

            // Сначала пытаемся загрузить существующую модель
            await this.loadModel();
            
            // Если модель не загружена, создаем новую
            if (!this.agent) {
                this.agent = this.createDQN();
                // Сохраняем созданную модель
                try {
                    const ModelManager = (await import('../utils/ModelManager.js')).default;
                    const success = await ModelManager.saveModel(this.agent, 'rl_agent/rl_model');
                    if (success) {
                        console.log(`✅ Saved newly created RL agent model`);
                    } else {
                        console.warn(`⚠️ Failed to save newly created RL agent model`);
                    }
                } catch (saveError) {
                    console.warn(`⚠️ Error saving newly created RL agent model:`, saveError.message);
                }
            }

            // Гарантируем наличие целевой сети
            if (!this.targetAgent && this.agent) {
                this.targetAgent = this.createDQN();
                this.targetAgent.setWeights(this.agent.getWeights());
            }
            
            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Failed to initialize RL Service:', error);
            throw error;
        }
    }

    /**
     * Создание DQN сети
     */
    createDQN() {
        console.log(`🧠 Создание DQN модели (ReinforcementLearningService)...`);
        console.log(`   📊 Размер состояния: ${this.config.stateSize}, Размер действий: ${this.config.actionSize}`);
        
        // L2 регуляризация для предотвращения переобучения
        const l2Regularizer = tf.regularizers.l2({ l2: 0.001 });
        
        const model = tf.sequential({
            layers: [
                tf.layers.dense({
                    units: 128,
                    activation: 'relu',
                    inputShape: [this.config.stateSize],
                    kernelInitializer: 'heUniform',
                    kernelRegularizer: l2Regularizer // L2 регуляризация
                }),
                tf.layers.dropout({ rate: 0.25 }), // Актуализированный dropout
                tf.layers.dense({
                    units: 64,
                    activation: 'relu',
                    kernelInitializer: 'heUniform',
                    kernelRegularizer: l2Regularizer // L2 регуляризация
                }),
                tf.layers.dropout({ rate: 0.2 }), // Актуализированный dropout
                tf.layers.dense({
                    units: 32,
                    activation: 'relu',
                    kernelInitializer: 'heUniform',
                    kernelRegularizer: l2Regularizer // L2 регуляризация
                }),
                tf.layers.dense({
                    units: this.config.actionSize,
                    activation: 'linear',
                    kernelInitializer: 'glorotUniform'
                    // Выходной слой без L2 для сохранения предсказательной способности
                })
            ]
        });

        model.compile({
            optimizer: tf.train.adam(this.config.learningRate),
            loss: 'meanSquaredError',
            metrics: ['mae']
        });

        const totalParams = model.countParams();
        console.log(`   ✅ DQN модель успешно создана: ${model.layers.length} слоев, ${totalParams.toLocaleString()} параметров`);
        console.log(`   📐 Архитектура: Dense(128) -> Dense(64) -> Dense(32) -> Dense(${this.config.actionSize})`);
        console.log(`   ⚙️  Параметры: learningRate=${this.config.learningRate}, loss=meanSquaredError`);

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
                }
            }

            // На всякий случай гарантируем наличие целевой сети
            if (!this.targetAgent && this.agent) {
                this.targetAgent = this.createDQN();
                this.targetAgent.setWeights(this.agent.getWeights());
            }
            this.isTraining = true;
            this.trainingFigiLocks.add(figi);
            this.stats.totalEpisodes = 0;
            this.stats.averageReward = 0;
            this.stats.bestReward = -Infinity;

            // Получаем исторические данные
            const candles = await CacheService.getCandles(figi, 'DAY', days);
            
            // Адаптивная проверка данных (по аналогии с OptimizedTrainingService)
            // Минимальное требование: 20 свечей (для расчета тех. индикаторов и простого эпизода)
            // Рекомендуемое: 30+ свечей для более стабильного обучения
            const minRequired = 20;
            const recommended = 30;
            
            if (candles.length < minRequired) {
                const message = `Insufficient data for RL: ${candles.length} candles (minimum ${minRequired} required)`;
                console.warn(`⚠️ ${message}`);
                
                // Обновляем статус обучения как неуспешный, но без выброса исключения
                if (trainingStatusService) {
                    trainingStatusService.completeTraining('reinforcementLearning', false);
                }
                
                // Уведомляем через WebSocket, что обучение пропущено
                try {
                    const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
                    if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                        WebSocketService.broadcast({
                            type: 'reinforcement_learning_training_skipped',
                            data: {
                                success: false,
                                reason: 'INSUFFICIENT_DATA',
                                message,
                                figi,
                                candles: candles.length,
                                minRequired
                            }
                        });
                    }
                } catch (wsError) {
                    console.warn('⚠️ Failed to broadcast RL insufficient data event:', wsError.message);
                }
                
                // Возвращаем "мягкий" результат вместо ошибки
                return {
                    success: false,
                    error: message,
                    reason: 'INSUFFICIENT_DATA',
                    figi,
                    candles: candles.length,
                    minRequired
                };
            }
            
            // Адаптируем параметры обучения для малого количества данных
            let adaptedEpisodes = episodes;
            let adaptedMaxSteps = 100;
            
            if (candles.length < recommended) {
                console.warn(`⚠️ RL: Limited data (${candles.length} candles, recommended ${recommended}+). Adapting training parameters...`);
                // Уменьшаем количество эпизодов и шагов для малого количества данных
                adaptedEpisodes = Math.min(episodes, Math.floor(candles.length / 2));
                adaptedMaxSteps = Math.min(100, candles.length - 1);
            }

            const results = [];
            let bestReward = -Infinity;

            // Используем адаптированные параметры
            const finalEpisodes = adaptedEpisodes || episodes;
            const finalMaxSteps = adaptedMaxSteps || 100;

            for (let episode = 0; episode < finalEpisodes; episode++) {
                const result = await this.runEpisode(candles, initialPortfolio, episode, finalMaxSteps);
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
                
                // Обновляем последние данные эпизода
                this.lastEpisodeTime = new Date().toISOString();
                this.lastTotalReward = result.totalReward;

                // Обновляем целевую сеть
                if (episode % this.config.updateTargetFreq === 0) {
                    if (this.agent && this.targetAgent) {
                        this.targetAgent.setWeights(this.agent.getWeights());
                    } else {
                        console.warn('⚠️ RL: Cannot update target network, agent or targetAgent is null');
                    }
                }

                // Уведомляем о прогрессе
                this.broadcastTrainingProgress(episode, episodes, result);
            }

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
                if (OptimizedTelegramService.isInitialized) {
                    // Форматируем ошибку в читаемый вид
                    const errorMessage = error.message || 'Unknown error';
                    const errorStack = error.stack ? `\n\n📋 Stack:\n${error.stack.substring(0, 500)}` : '';
                    const figiInfo = figi ? `\n📈 FIGI: ${figi}` : '';
                    
                    await OptimizedTelegramService.sendAlert(
                        'RL_TRAINING_ERROR',
                        `❌ <b>ОШИБКА ОБУЧЕНИЯ RL АГЕНТА</b>\n\n🔍 Ошибка: ${errorMessage}${figiInfo}${errorStack}\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`,
                        'error'
                    );
                }
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
    async runEpisode(candles, initialPortfolio, episode, maxStepsOverride = null) {
        let portfolio = { ...initialPortfolio };
        let totalReward = 0;
        let stepCount = 0;
        const maxSteps = maxStepsOverride !== null ? maxStepsOverride : Math.min(candles.length - 1, 100);

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
        if (!this.agent) return;

        // Выборка батча с приоритезированным сэмплингом
        const batch = this.sampleBatch();
        
        // Проверяем, что батч не пустой
        if (!batch || batch.length === 0) {
            console.warn('⚠️ RL: Empty batch sampled, skipping training step');
            return;
        }
        
        const states = batch.map(exp => exp.state);
        const actions = batch.map(exp => exp.action);
        const rewards = batch.map(exp => exp.reward);
        const nextStates = batch.map(exp => exp.nextState);
        const dones = batch.map(exp => exp.done);

        // Проверяем, что все данные валидны
        if (states.length === 0 || nextStates.length === 0 || 
            states.some(s => !s || !Array.isArray(s)) || 
            nextStates.some(s => !s || !Array.isArray(s))) {
            console.warn('⚠️ RL: Invalid batch data, skipping training step');
            return;
        }

        // Целевые значения
        const targets = await this.computeTargets(states, actions, rewards, nextStates, dones);

        // Гарантируем, что модель скомпилирована (на случай загрузки без оптимизатора)
        if (!this.agent.optimizer) {
            this.agent.compile({
                optimizer: tf.train.adam(this.config.learningRate),
                loss: 'meanSquaredError',
                metrics: ['mae']
            });
        }

        // Предсказанные Q-значения для текущих состояний
        const batchSize = batch.length;
        const stateSize = this.config.stateSize;
        const actionSize = this.config.actionSize;
        
        // Явно задаем shape, чтобы избежать ошибок с плоскими массивами
        const statesTensor = tf.tensor2d(states, [batchSize, stateSize]);
        const qValues = this.agent.predict(statesTensor);
        const qValuesArray = await qValues.array(); // [batchSize, actionSize]

        // Формируем матрицу целевых Q-значений:
        // - исходно берём текущие Q(s,a) из модели
        // - заменяем Q(s, a_taken) на целевой target
        const targetsMatrix = qValuesArray.map((row, i) => {
            const newRow = row.slice();
            const action = actions[i];
            const target = targets[i];
            if (action >= 0 && action < actionSize) {
                newRow[action] = target;
            }
            return newRow;
        });

        // Обучение: целевой тензор имеет форму [batchSize, actionSize]
        const targetsTensor = tf.tensor2d(targetsMatrix, [batchSize, actionSize]);
        await this.agent.fit(statesTensor, targetsTensor, { epochs: 1, verbose: 0 });

        // Обновляем приоритеты на основе TD-ошибки для выбранных действий
        // predictedQ: Q(s, a_taken) до обновления, targets: целевые Q для a_taken
        const predictedQForActions = qValuesArray.map((row, i) => {
            const action = actions[i];
            return (action >= 0 && action < actionSize) ? row[action] : 0;
        });
        await this.updatePriorities(batch, predictedQForActions, targets);

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
        // Проверяем входные данные
        if (!states || !nextStates || states.length === 0 || nextStates.length === 0) {
            throw new Error('computeTargets: Empty states or nextStates arrays');
        }
        
        const batchSize = states.length;
        const stateSize = this.config.stateSize;
        
        // Проверяем, что все состояния имеют правильный размер
        if (nextStates.some(s => !Array.isArray(s) || s.length !== stateSize)) {
            throw new Error(`computeTargets: Invalid nextStates format. Expected arrays of length ${stateSize}`);
        }
        
        // Проверяем, что targetAgent инициализирован
        if (!this.targetAgent) {
            throw new Error('computeTargets: targetAgent is not initialized');
        }
        
        const nextStatesTensor = tf.tensor2d(nextStates, [batchSize, stateSize]);
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
            
            // Сохраняем текущее действие и Q-значение
            this.currentAction = actionName;
            this.currentQValue = Math.max(...qValuesArray);

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
        try {
            const WebSocketServiceInstance = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketServiceInstance && typeof WebSocketServiceInstance.broadcast === 'function') {
                WebSocketServiceInstance.broadcast({
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
        } catch (error) {
            console.warn('⚠️ Failed to broadcast RL training progress:', error.message);
        }
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
            await ModelManager.saveModel(this.agent, 'rl_agent/rl_model');
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
            // Проверяем, загружена ли уже модель
            if (this.agent) {
                return;
            }
            
            // Пытаемся загрузить модель через ModelManager
            const model = await ModelManager.loadModel('rl_agent/rl_model');
            
            if (model) {
                this.agent = model;
                
                // Гарантируем, что загруженная модель скомпилирована
                if (!this.agent.optimizer) {
                    this.agent.compile({
                        optimizer: tf.train.adam(this.config.learningRate),
                        loss: 'meanSquaredError',
                        metrics: ['mae']
                    });
                }
                
                // Гарантируем наличие целевой сети и копируем в неё веса
                if (!this.targetAgent) {
                    this.targetAgent = this.createDQN();
                }
                this.targetAgent.setWeights(this.agent.getWeights());
            } else {
                // Модель не найдена, создаем новую
                this.agent = this.createDQN();
                // Сохраняем созданную модель
                try {
                    const success = await ModelManager.saveModel(this.agent, 'rl_agent/rl_model');
                    if (success) {
                        console.log(`✅ Saved newly created RL agent model (from loadModel)`);
                    } else {
                        console.warn(`⚠️ Failed to save newly created RL agent model (from loadModel)`);
                    }
                } catch (saveError) {
                    console.warn(`⚠️ Error saving newly created RL agent model (from loadModel):`, saveError.message);
                }
            }
        } catch (error) {
            const LoggerService = (await import('./LoggerService.js')).default;
            LoggerService.error('Failed to load RL model', {
                service: 'ReinforcementLearningService',
                operation: 'loadModel',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            // Создаем новую модель при ошибке
            this.agent = this.createDQN();
            // Сохраняем созданную модель
            try {
                const success = await ModelManager.saveModel(this.agent, 'rl_agent/rl_model');
                if (success) {
                    console.log(`✅ Saved newly created RL agent model (after error)`);
                } else {
                    console.warn(`⚠️ Failed to save newly created RL agent model (after error)`);
                }
            } catch (saveError) {
                console.warn(`⚠️ Error saving newly created RL agent model (after error):`, saveError.message);
            }
        }
    }

    /**
     * Остановить обучение RL
     */
    async stopTraining() {
        try {

            this.isTraining = false;
            this.status = 'idle';
            
            // Уведомить через WebSocket
            try {
                const WebSocketServiceInstance = ServiceManager.getServiceSafe('WebSocketService');
                if (WebSocketServiceInstance && typeof WebSocketServiceInstance.broadcast === 'function') {
                    WebSocketServiceInstance.broadcast({
                        type: 'rl_training_stopped',
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (wsError) {
                console.warn('⚠️ Failed to broadcast RL stop event:', wsError.message);
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
            // Остановить обучение если оно идет
            this.isTraining = false;
            
            // Очистить текущие модели агента
            if (this.agent && typeof this.agent.dispose === 'function') {
                this.agent.dispose();
            }
            if (this.targetAgent && typeof this.targetAgent.dispose === 'function') {
                this.targetAgent.dispose();
            }
            this.agent = null;
            this.targetAgent = null;
            
            // Очистить буфер опыта и приоритеты
            this.memory = [];
            this.priorities = [];
            
            // Сбросить epsilon и статистику
            this.config.epsilon = 1.0;
            this.stats = {
                totalEpisodes: 0,
                averageReward: 0,
                bestReward: -Infinity,
                winRate: 0,
                epsilon: this.config.epsilon,
                memorySize: 0
            };
            
            // Переинициализировать агента и целевую сеть
            this.isInitialized = false;
            await this.initialize();
            
            // Уведомить через WebSocket
            try {
                const WebSocketServiceInstance = ServiceManager.getServiceSafe('WebSocketService');
                if (WebSocketServiceInstance && typeof WebSocketServiceInstance.broadcast === 'function') {
                    WebSocketServiceInstance.broadcast({
                        type: 'rl_agent_reset',
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (wsError) {
                console.warn('⚠️ Failed to broadcast RL reset event:', wsError.message);
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
