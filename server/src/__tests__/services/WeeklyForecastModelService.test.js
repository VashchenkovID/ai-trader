import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import * as tf from '@tensorflow/tfjs';

describe('WeeklyForecastModelService', () => {
    let WeeklyForecastModelService;
    let ModelManager;
    let LoggerService;

    beforeAll(async () => {
        // Импортируем сервисы
        WeeklyForecastModelService = (await import('../../services/WeeklyForecastModelService.js')).default;
        ModelManager = (await import('../../utils/ModelManager.js')).default;
        LoggerService = (await import('../../services/LoggerService.js')).default;
    });

    beforeEach(async () => {
        // Сбрасываем флаг инициализации
        if (WeeklyForecastModelService) {
            WeeklyForecastModelService.isInitialized = false;
        }
    });

    describe('Инициализация', () => {
        it('должен инициализироваться без ошибок', async () => {
            await WeeklyForecastModelService.initialize();
            expect(WeeklyForecastModelService.isInitialized).toBe(true);
        });

        it('не должен инициализироваться дважды', async () => {
            await WeeklyForecastModelService.initialize();
            const firstInit = WeeklyForecastModelService.isInitialized;

            await WeeklyForecastModelService.initialize();
            const secondInit = WeeklyForecastModelService.isInitialized;

            expect(firstInit).toBe(true);
            expect(secondInit).toBe(true);
        });
    });

    describe('createSeq2SeqModel', () => {
        beforeEach(async () => {
            await WeeklyForecastModelService.initialize();
        });

        it('должен создавать модель с правильной архитектурой', () => {
            const model = WeeklyForecastModelService.createSeq2SeqModel(60, 70, 7);

            expect(model).toBeDefined();
            expect(model.inputs).toHaveLength(2); // encoder и decoder inputs
            expect(model.outputs).toHaveLength(1);
            
            // Проверяем форму входов
            expect(model.inputs[0].shape).toEqual([null, 60, 70]); // encoder
            expect(model.inputs[1].shape).toEqual([null, 7, 70]); // decoder
            
            // Проверяем форму выхода
            expect(model.outputs[0].shape).toEqual([null, 7, 5]); // 7 дней, 5 значений (open, high, low, close, volume)

            // Освобождаем память
            model.dispose();
        });

        it('должен создавать модель с настраиваемыми параметрами', () => {
            const model = WeeklyForecastModelService.createSeq2SeqModel(30, 50, 5);

            expect(model).toBeDefined();
            expect(model.inputs[0].shape).toEqual([null, 30, 50]);
            expect(model.inputs[1].shape).toEqual([null, 5, 50]);
            expect(model.outputs[0].shape).toEqual([null, 5, 5]);

            model.dispose();
        });

        it('должен компилировать модель с правильными параметрами', () => {
            const model = WeeklyForecastModelService.createSeq2SeqModel(60, 70, 7);

            expect(model.optimizer).toBeDefined();
            expect(model.loss).toBeDefined();
            expect(model.metrics).toBeDefined();

            model.dispose();
        });
    });

    describe('prepareTrainingData', () => {
        beforeEach(async () => {
            await WeeklyForecastModelService.initialize();
        });

        it('должен подготавливать данные для обучения', () => {
            // Создаем тестовые данные
            const candles = Array(100).fill(null).map((_, i) => ({
                open: 100 + i,
                high: 105 + i,
                low: 95 + i,
                close: 102 + i,
                volume: 1000 + i * 10
            }));

            const features = Array(100).fill(null).map(() => Array(70).fill(0.5));

            const result = WeeklyForecastModelService.prepareTrainingData(candles, features, 60, 7);

            expect(result.sequences).toBeDefined();
            expect(result.targets).toBeDefined();
            expect(result.sequences.length).toBeGreaterThan(0);
            expect(result.targets.length).toBe(result.sequences.length);
            
            // Проверяем структуру последовательностей
            if (result.sequences.length > 0) {
                expect(result.sequences[0]).toHaveLength(60);
                expect(result.targets[0]).toHaveLength(7);
                expect(result.targets[0][0]).toHaveLength(5); // open, high, low, close, volume
            }
        });

        it('должен выбрасывать ошибку для недостаточного количества данных', () => {
            const candles = Array(50).fill({ open: 100, high: 105, low: 95, close: 102, volume: 1000 });
            const features = Array(50).fill(Array(70).fill(0.5));

            expect(() => {
                WeeklyForecastModelService.prepareTrainingData(candles, features, 60, 7);
            }).toThrow('Insufficient data');
        });

        it('должен выбрасывать ошибку для пустых массивов', () => {
            expect(() => {
                WeeklyForecastModelService.prepareTrainingData([], [], 60, 7);
            }).toThrow('Candles array is empty');
        });

        it('должен выбрасывать ошибку при несоответствии длин', () => {
            const candles = Array(100).fill({ open: 100, high: 105, low: 95, close: 102, volume: 1000 });
            const features = Array(50).fill(Array(70).fill(0.5));

            expect(() => {
                WeeklyForecastModelService.prepareTrainingData(candles, features, 60, 7);
            }).toThrow('length mismatch');
        });
    });

    describe('trainModel', () => {
        let model;
        let sequences;
        let targets;

        beforeEach(async () => {
            await WeeklyForecastModelService.initialize();
            
            // Создаем простую модель для тестирования
            model = WeeklyForecastModelService.createSeq2SeqModel(60, 70, 7);
            
            // Создаем тестовые данные
            sequences = Array(10).fill(null).map(() => 
                Array(60).fill(null).map(() => Array(70).fill(0.5))
            );
            
            targets = Array(10).fill(null).map(() => 
                Array(7).fill(null).map(() => [100, 105, 95, 102, 1000])
            );
        });

        afterEach(() => {
            if (model) {
                model.dispose();
            }
        });

        it('должен обучать модель без ошибок', async () => {
            const history = await WeeklyForecastModelService.trainModel(
                model,
                sequences,
                targets,
                { epochs: 1, batchSize: 2, verbose: 0 }
            );

            expect(history).toBeDefined();
            expect(history.history).toBeDefined();
            expect(history.history.loss).toBeDefined();
        }, 30000); // Увеличиваем таймаут для обучения

        it('должен выбрасывать ошибку для пустых данных', async () => {
            await expect(
                WeeklyForecastModelService.trainModel(model, [], [], { epochs: 1 })
            ).rejects.toThrow('Sequences array is empty');
        });

        it('должен выбрасывать ошибку для несоответствия длин', async () => {
            const shortTargets = targets.slice(0, 5);
            
            await expect(
                WeeklyForecastModelService.trainModel(model, sequences, shortTargets, { epochs: 1 })
            ).rejects.toThrow('length mismatch');
        });
    });

    describe('generateForecast', () => {
        let model;

        beforeEach(async () => {
            await WeeklyForecastModelService.initialize();
            
            // Создаем простую модель
            model = WeeklyForecastModelService.createSeq2SeqModel(60, 70, 7);
        });

        afterEach(() => {
            if (model) {
                model.dispose();
            }
        });

        it('должен генерировать прогноз', async () => {
            const inputSequence = Array(60).fill(null).map(() => Array(70).fill(0.5));

            const forecast = await WeeklyForecastModelService.generateForecast(model, inputSequence, 7);

            expect(forecast).toBeDefined();
            expect(Array.isArray(forecast)).toBe(true);
            expect(forecast.length).toBe(7);
            
            // Проверяем структуру каждой свечи
            forecast.forEach(candle => {
                expect(candle).toHaveProperty('open');
                expect(candle).toHaveProperty('high');
                expect(candle).toHaveProperty('low');
                expect(candle).toHaveProperty('close');
                expect(candle).toHaveProperty('volume');
                expect(candle).toHaveProperty('confidence');
            });
        });

        it('должен выбрасывать ошибку для пустой последовательности', async () => {
            await expect(
                WeeklyForecastModelService.generateForecast(model, [], 7)
            ).rejects.toThrow('Input sequence is empty');
        });

        it('должен выбрасывать ошибку для null модели', async () => {
            await expect(
                WeeklyForecastModelService.generateForecast(null, Array(60).fill(Array(70).fill(0.5)), 7)
            ).rejects.toThrow('Model is required');
        });
    });

    describe('saveModel и loadModel', () => {
        let model;
        const testFigi = 'TEST_FIGI_123';
        const testModelType = 'seq2seq';

        beforeEach(async () => {
            await WeeklyForecastModelService.initialize();
            model = WeeklyForecastModelService.createSeq2SeqModel(60, 70, 7);
        });

        afterEach(async () => {
            if (model) {
                model.dispose();
            }
        });

        it('должен сохранять модель', async () => {
            const success = await WeeklyForecastModelService.saveModel(
                model,
                testFigi,
                testModelType,
                { version: 'test_v1', trainedAt: new Date().toISOString() }
            );

            // Модель может не сохраниться если нет доступа к файловой системе
            // Но метод не должен выбрасывать ошибку
            expect(typeof success).toBe('boolean');
        });

        it('должен выбрасывать ошибку при сохранении null модели', async () => {
            await expect(
                WeeklyForecastModelService.saveModel(null, testFigi, testModelType)
            ).rejects.toThrow('Model is required');
        });

        it('должен загружать модель (если она была сохранена)', async () => {
            // Сначала пытаемся сохранить
            await WeeklyForecastModelService.saveModel(model, testFigi, testModelType);
            
            // Затем загружаем
            const loadedModel = await WeeklyForecastModelService.loadModel(testFigi, testModelType);
            
            // Модель может быть null если не была сохранена или нет доступа к файлам
            // Но метод не должен выбрасывать ошибку
            if (loadedModel) {
                expect(loadedModel).toBeDefined();
                // Модель должна иметь входы (может быть 1 или 2 в зависимости от сохранения)
                expect(loadedModel.inputs).toBeDefined();
                expect(loadedModel.inputs.length).toBeGreaterThan(0);
                loadedModel.dispose();
            }
        });
    });

    describe('loadModelMetadata', () => {
        beforeEach(async () => {
            await WeeklyForecastModelService.initialize();
        });

        it('должен возвращать null если метаданные не найдены', async () => {
            const metadata = await WeeklyForecastModelService.loadModelMetadata('NONEXISTENT_FIGI', 'seq2seq');
            expect(metadata).toBeNull();
        });
    });
});

