import ServiceManager from './ServiceManager.js';

/**
 * Сервис для хранения и управления статусом обучения
 * Обеспечивает персистентность данных о стадиях обучения
 */
class TrainingStatusService {
    constructor() {
        this.trainingStatus = {
            neuralNetwork: {
                isTraining: false,
                stage: 'idle',
                progress: 0,
                currentInstrument: null,
                totalInstruments: 0,
                startTime: null,
                endTime: null
            },
            ensemble: {
                isTraining: false,
                stage: 'idle',
                progress: 0,
                currentInstrument: null,
                totalInstruments: 0,
                startTime: null,
                endTime: null
            },
            metaLearning: {
                isTraining: false,
                stage: 'idle',
                progress: 0,
                currentInstrument: null,
                totalInstruments: 0,
                startTime: null,
                endTime: null
            },
            reinforcementLearning: {
                isTraining: false,
                stage: 'idle',
                progress: 0,
                currentInstrument: null,
                totalInstruments: 0,
                startTime: null,
                endTime: null
            },
            lastUpdate: null
        };
    }

    /**
     * Отправить обновление статуса через WebSocket
     */
    broadcastStatus() {
        try {
            const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
            if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                WebSocketService.broadcast({
                    type: 'training_status_update',
                    data: this.getStatus(),
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            // Игнорируем ошибки WebSocket, чтобы не прерывать обучение
            // console.warn('Failed to broadcast training status:', error.message);
        }
    }

    /**
     * Обновить статус обучения для конкретной стадии
     */
    updateStatus(stage, data) {
        if (this.trainingStatus[stage]) {
            this.trainingStatus[stage] = {
                ...this.trainingStatus[stage],
                ...data
            };
            this.trainingStatus.lastUpdate = new Date().toISOString();
            
            // Автоматически отправляем обновление через WebSocket
            this.broadcastStatus();
        }
    }

    /**
     * Начать обучение для стадии
     */
    startTraining(stage, totalInstruments = 0) {
        this.updateStatus(stage, {
            isTraining: true,
            stage: 'training',
            progress: 0,
            currentInstrument: null,
            totalInstruments,
            startTime: new Date().toISOString(),
            endTime: null
        });
    }

    /**
     * Завершить обучение для стадии
     */
    completeTraining(stage, success = true) {
        this.updateStatus(stage, {
            isTraining: false,
            stage: success ? 'completed' : 'failed',
            progress: 100,
            endTime: new Date().toISOString()
        });
    }

    /**
     * Обновить прогресс обучения
     */
    updateProgress(stage, progress, currentInstrument = null) {
        this.updateStatus(stage, {
            progress,
            currentInstrument
        });
    }

    /**
     * Получить текущий статус всех стадий обучения
     */
    getStatus() {
        return {
            ...this.trainingStatus,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Сбросить статус всех стадий
     */
    reset() {
        Object.keys(this.trainingStatus).forEach(key => {
            if (key !== 'lastUpdate' && this.trainingStatus[key]) {
                this.trainingStatus[key] = {
                    isTraining: false,
                    stage: 'idle',
                    progress: 0,
                    currentInstrument: null,
                    totalInstruments: 0,
                    startTime: null,
                    endTime: null
                };
            }
        });
        this.trainingStatus.lastUpdate = new Date().toISOString();
    }

    /**
     * Проверить, идет ли обучение
     */
    isAnyTrainingInProgress() {
        return Object.keys(this.trainingStatus).some(key => {
            return key !== 'lastUpdate' && 
                   this.trainingStatus[key]?.isTraining === true;
        });
    }
}

export default new TrainingStatusService();

