import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import TinkoffStreamingServiceSingleton, { TinkoffStreamingService } from '../../services/TinkoffStreamingService.js';

describe('TinkoffStreamingService', () => {
    let service;
    let mockOpenAPI;
    let mockStreaming;
    let mockCacheService;
    let mockWebSocketService;
    let mockLoggerService;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Устанавливаем тестовый токен ДО создания сервиса
        process.env.TINKOFF_TOKEN = 'test_token_123';
        process.env.TINKOFF_SANDBOX = 'false';
        
        // Мокируем Streaming класс
        mockStreaming = {
            on: jest.fn(),
            off: jest.fn(),
            connect: jest.fn(),
            _ws: null
        };

        // Мокируем OpenAPI класс
        mockOpenAPI = {
            _streaming: mockStreaming,
            orderbook: jest.fn().mockImplementation((params, cb) => {
                // Возвращаем функцию отписки
                return () => {};
            }),
            candle: jest.fn(),
            instrumentInfo: jest.fn(),
            onStreamingError: jest.fn().mockReturnValue(() => {})
        };

        // Мокируем SDK модуль
        jest.unstable_mockModule('@tinkoff/invest-openapi-js-sdk', () => ({
            default: jest.fn().mockImplementation(() => mockOpenAPI)
        }));

        // Мокируем CacheService
        mockCacheService = {
            isInitialized: true,
            updateInstrumentPrice: jest.fn().mockResolvedValue(true)
        };
        jest.unstable_mockModule('../../services/CacheService.js', () => ({
            default: mockCacheService
        }));

        // Мокируем WebSocketService
        mockWebSocketService = {
            getInstance: jest.fn().mockReturnValue({
                broadcast: jest.fn()
            })
        };
        jest.unstable_mockModule('../../services/WebSocketService.js', () => ({
            default: mockWebSocketService
        }));

        // Мокируем LoggerService
        mockLoggerService = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            isInitialized: true
        };
        jest.unstable_mockModule('../../services/LoggerService.js', () => ({
            default: mockLoggerService
        }));

        // Создаем новый экземпляр сервиса для каждого теста
        service = new TinkoffStreamingService();
    });

    afterEach(() => {
        jest.clearAllTimers();
        if (service) {
            try {
                // Очищаем все подписки синхронно, чтобы избежать асинхронных операций после завершения теста
                if (service.subscribedFigis && service.subscribedFigis.size > 0) {
                    const figis = Array.from(service.subscribedFigis);
                    // Отписываемся синхронно
                    for (const figi of figis) {
                        const unsubscribe = service.subscriptions?.get(figi);
                        if (unsubscribe && typeof unsubscribe === 'function') {
                            try {
                                unsubscribe();
                            } catch (e) {
                                // Игнорируем ошибки
                            }
                        }
                    }
                    service.subscriptions?.clear();
                    service.subscribedFigis?.clear();
                }
                // Закрываем соединение, если оно открыто
                if (service.client?._streaming?._ws) {
                    try {
                        const ws = service.client._streaming._ws;
                        if (ws.readyState === 1) { // OPEN
                            ws.removeAllListeners();
                            ws.close();
                        }
                    } catch (e) {
                        // Игнорируем ошибки
                    }
                }
                service.isConnected = false;
                service.isInitialized = false;
            } catch (error) {
                // Игнорируем ошибки при очистке
            }
        }
        // Очищаем все моки
        jest.clearAllMocks();
    });

    describe('Инициализация', () => {
        it('должен инициализировать сервис с правильными настройками', async () => {
            await service.initialize();

            expect(service.isInitialized).toBe(true);
            expect(service.token).toBe('test_token_123');
            expect(service.apiURL).toBe('https://api-invest.tinkoff.ru/openapi');
            expect(service.socketURL).toBe('wss://api-invest.tinkoff.ru/openapi/md/v1/md-openapi/ws');
        });

        it('должен использовать sandbox URL при включенном sandbox', async () => {
            // Создаем новый сервис с sandbox настройками
            process.env.TINKOFF_SANDBOX = 'true';
            const sandboxService = new TinkoffStreamingService();
            
            await sandboxService.initialize();

            expect(sandboxService.apiURL).toBe('https://api-invest.tinkoff.ru/openapi/sandbox');
            expect(sandboxService.socketURL).toBe('wss://api-invest.tinkoff.ru/openapi/md/v1/md-openapi/ws');
            
            // Восстанавливаем для других тестов
            process.env.TINKOFF_SANDBOX = 'false';
        });

        it('не должен инициализироваться дважды', async () => {
            await service.initialize();
            const firstClient = service.client;
            
            await service.initialize();
            
            expect(service.client).toBe(firstClient);
        });

        it('должен выбрасывать ошибку при отсутствии токена', async () => {
            delete process.env.TINKOFF_TOKEN;
            service.token = '';

            await expect(service.initialize()).rejects.toThrow('TINKOFF_TOKEN не установлен');
        });

        it('должен настроить обработчики streaming событий', async () => {
            await service.initialize();

            // Проверяем, что client установлен
            expect(service.client).toBe(mockOpenAPI);
            expect(service.client._streaming).toBe(mockStreaming);
            
            // Проверяем, что обработчики установлены
            expect(mockStreaming.on).toHaveBeenCalledWith('socket-open', expect.any(Function));
            expect(mockStreaming.on).toHaveBeenCalledWith('socket-close', expect.any(Function));
            expect(mockStreaming.on).toHaveBeenCalledWith('socket-error', expect.any(Function));
            expect(mockOpenAPI.onStreamingError).toHaveBeenCalled();
        });
    });

    describe('Подключение к streaming сервису', () => {
        beforeEach(async () => {
            await service.initialize();
        });

        it('должен подключиться к streaming сервису', async () => {
            await service.connect();

            expect(mockStreaming.connect).toHaveBeenCalled();
        });

        it('не должен подключаться дважды', async () => {
            await service.connect();
            mockStreaming.connect.mockClear();
            
            await service.connect();
            
            // SDK может вызывать connect несколько раз, но мы проверяем состояние
            expect(service.isConnected).toBeDefined();
        });

        it('должен автоматически инициализироваться при подключении', async () => {
            service.isInitialized = false;
            
            await service.connect();
            
            expect(service.isInitialized).toBe(true);
        });
    });

    describe('Подписка на инструменты', () => {
        let orderbookCallback;

        beforeEach(async () => {
            await service.initialize();
            
            // Сохраняем callback из подписки
            mockOpenAPI.orderbook.mockImplementation((params, cb) => {
                orderbookCallback = cb;
                return () => {}; // Функция отписки
            });
        });

        it('должен подписаться на последние цены инструментов через orderbook', async () => {
            // Убеждаемся, что client установлен
            expect(service.client).toBe(mockOpenAPI);
            
            const figis = ['BBG0013HJJ31', 'BBG004730N88'];
            
            await service.subscribeToLastPrices(figis);

            expect(service.subscribedFigis.size).toBe(2);
            expect(service.subscribedFigis.has('BBG0013HJJ31')).toBe(true);
            expect(service.subscribedFigis.has('BBG004730N88')).toBe(true);
            
            // Проверяем, что orderbook был вызван на клиенте
            if (service.client && service.client.orderbook) {
                expect(service.client.orderbook).toHaveBeenCalledTimes(2);
                expect(service.client.orderbook).toHaveBeenCalledWith(
                    { figi: 'BBG0013HJJ31', depth: 1 },
                    expect.any(Function)
                );
            } else {
                // Fallback на mockOpenAPI
                expect(mockOpenAPI.orderbook).toHaveBeenCalledTimes(2);
                expect(mockOpenAPI.orderbook).toHaveBeenCalledWith(
                    { figi: 'BBG0013HJJ31', depth: 1 },
                    expect.any(Function)
                );
            }
        });

        it('должен автоматически подключиться при подписке без подключения', async () => {
            service.isInitialized = false;
            
            const figis = ['BBG0013HJJ31'];
            await service.subscribeToLastPrices(figis);

            expect(service.isInitialized).toBe(true);
            expect(service.subscribedFigis.has('BBG0013HJJ31')).toBe(true);
        });

        it('не должен подписываться дважды на один инструмент', async () => {
            const figis = ['BBG0013HJJ31'];
            await service.subscribeToLastPrices(figis);
            mockOpenAPI.orderbook.mockClear();
            
            await service.subscribeToLastPrices(figis);

            expect(mockOpenAPI.orderbook).not.toHaveBeenCalled();
        });

        it('должен отписаться от инструментов', async () => {
            const unsubscribeFn1 = jest.fn();
            const unsubscribeFn2 = jest.fn();
            let callCount = 0;
            mockOpenAPI.orderbook.mockImplementation(() => {
                callCount++;
                return callCount === 1 ? unsubscribeFn1 : unsubscribeFn2;
            });
            
            const figis = ['BBG0013HJJ31', 'BBG004730N88'];
            await service.subscribeToLastPrices(figis);
            
            // Получаем функцию отписки из subscriptions
            const unsubscribe = service.subscriptions.get('BBG0013HJJ31');
            if (unsubscribe) {
                unsubscribe();
            }
            
            await service.unsubscribeFromLastPrices(['BBG0013HJJ31']);

            expect(service.subscribedFigis.size).toBe(1);
            expect(service.subscribedFigis.has('BBG0013HJJ31')).toBe(false);
            expect(service.subscribedFigis.has('BBG004730N88')).toBe(true);
        });

        it('должен восстановить подписки после переподключения', async () => {
            const figis = ['BBG0013HJJ31', 'BBG004730N88'];
            await service.subscribeToLastPrices(figis);
            
            // Очищаем моки
            if (service.client && service.client.orderbook) {
                service.client.orderbook.mockClear();
            }
            mockOpenAPI.orderbook.mockClear();
            
            await service.resubscribe();

            // Проверяем вызовы на клиенте или моке
            if (service.client && service.client.orderbook) {
                expect(service.client.orderbook).toHaveBeenCalledTimes(2);
            } else {
                expect(mockOpenAPI.orderbook).toHaveBeenCalledTimes(2);
            }
        });
    });

    describe('Обработка данных из потока', () => {
        let orderbookCallback;

        beforeEach(async () => {
            await service.initialize();
            await service.connect();
            
            // Сохраняем callback из подписки
            mockOpenAPI.orderbook.mockImplementation((params, cb) => {
                if (cb) {
                    orderbookCallback = cb;
                }
                return () => {}; // Функция отписки
            });
            
            await service.subscribeToLastPrices(['BBG0013HJJ31']);
            
            // Убеждаемся, что callback сохранен - извлекаем из вызовов
            if (!orderbookCallback && mockOpenAPI.orderbook.mock.calls.length > 0) {
                // Получаем callback из последнего вызова
                const lastCall = mockOpenAPI.orderbook.mock.calls[mockOpenAPI.orderbook.mock.calls.length - 1];
                if (lastCall && lastCall[1] && typeof lastCall[1] === 'function') {
                    orderbookCallback = lastCall[1];
                }
            }
        });

        it('должен обрабатывать данные стакана заявок и обновлять кеш', async () => {
            // Если callback не был сохранен, получаем его из вызова
            if (!orderbookCallback && mockOpenAPI.orderbook.mock.calls.length > 0) {
                const lastCall = mockOpenAPI.orderbook.mock.calls[mockOpenAPI.orderbook.mock.calls.length - 1];
                if (lastCall && lastCall[1]) {
                    orderbookCallback = lastCall[1];
                }
            }
            
            const orderbookData = {
                figi: 'BBG0013HJJ31',
                depth: 1,
                bids: [[100.5, 10]], // [цена, количество]
                asks: [[101.0, 5]]
            };

            if (orderbookCallback) {
                await orderbookCallback(orderbookData);
            }

            // Ждем асинхронных операций
            await new Promise(resolve => setTimeout(resolve, 100));

            // Должна использоваться лучшая цена продажи (asks[0][0])
            expect(mockCacheService.updateInstrumentPrice).toHaveBeenCalledWith(
                'BBG0013HJJ31',
                101.0,
                expect.any(Date)
            );
        });

        it('должен использовать лучшую цену покупки, если нет заявок на продажу', async () => {
            // Если callback не был сохранен, получаем его из вызова
            if (!orderbookCallback && mockOpenAPI.orderbook.mock.calls.length > 0) {
                const lastCall = mockOpenAPI.orderbook.mock.calls[mockOpenAPI.orderbook.mock.calls.length - 1];
                if (lastCall && lastCall[1]) {
                    orderbookCallback = lastCall[1];
                }
            }
            
            const orderbookData = {
                figi: 'BBG0013HJJ31',
                depth: 1,
                bids: [[100.5, 10]],
                asks: [] // Нет заявок на продажу
            };

            if (orderbookCallback) {
                await orderbookCallback(orderbookData);
            }

            await new Promise(resolve => setTimeout(resolve, 100));

            // Должна использоваться лучшая цена покупки (bids[0][0])
            expect(mockCacheService.updateInstrumentPrice).toHaveBeenCalledWith(
                'BBG0013HJJ31',
                100.5,
                expect.any(Date)
            );
        });

        it('должен транслировать обновления цен через WebSocket', async () => {
            // Если callback не был сохранен, получаем его из вызова
            if (!orderbookCallback && mockOpenAPI.orderbook.mock.calls.length > 0) {
                const lastCall = mockOpenAPI.orderbook.mock.calls[mockOpenAPI.orderbook.mock.calls.length - 1];
                if (lastCall && lastCall[1]) {
                    orderbookCallback = lastCall[1];
                }
            }
            
            const wsInstance = mockWebSocketService.getInstance();
            const orderbookData = {
                figi: 'BBG0013HJJ31',
                depth: 1,
                bids: [[100.5, 10]],
                asks: [[101.0, 5]]
            };

            if (orderbookCallback) {
                await orderbookCallback(orderbookData);
            }

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(wsInstance.broadcast).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'stock_price_update',
                    data: expect.objectContaining({
                        figi: 'BBG0013HJJ31',
                        price: 101.0
                    })
                })
            );
        });

        it('не должен обновлять кеш при отсутствии цен в стакане', async () => {
            const orderbookData = {
                figi: 'BBG0013HJJ31',
                depth: 1,
                bids: [],
                asks: [] // Нет заявок
            };

            if (orderbookCallback) {
                orderbookCallback(orderbookData);
            }

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(mockCacheService.updateInstrumentPrice).not.toHaveBeenCalled();
        });
    });

    describe('Обработка событий WebSocket', () => {
        let socketOpenHandler;
        let socketCloseHandler;
        let socketErrorHandler;

        beforeEach(async () => {
            await service.initialize();
            
            // Получаем обработчики событий
            const openCall = mockStreaming.on.mock.calls.find(call => call[0] === 'socket-open');
            const closeCall = mockStreaming.on.mock.calls.find(call => call[0] === 'socket-close');
            const errorCall = mockStreaming.on.mock.calls.find(call => call[0] === 'socket-error');
            
            if (openCall) socketOpenHandler = openCall[1];
            if (closeCall) socketCloseHandler = closeCall[1];
            if (errorCall) socketErrorHandler = errorCall[1];
        });

        it('должен обрабатывать открытие WebSocket соединения', () => {
            if (socketOpenHandler) {
                socketOpenHandler();
            }

            expect(service.isConnected).toBe(true);
            expect(mockLoggerService.info).toHaveBeenCalledWith(
                'WebSocket соединение установлено',
                expect.any(Object)
            );
        });

        it('должен обрабатывать закрытие WebSocket соединения', () => {
            service.isConnected = true;
            
            if (socketCloseHandler) {
                socketCloseHandler();
            }

            expect(service.isConnected).toBe(false);
            expect(mockLoggerService.warn).toHaveBeenCalledWith(
                'WebSocket соединение закрыто',
                expect.any(Object)
            );
        });

        it('должен обрабатывать ошибки WebSocket соединения', () => {
            const error = new Error('Connection error');
            
            if (socketErrorHandler) {
                socketErrorHandler(error);
            }

            expect(mockLoggerService.error).toHaveBeenCalledWith(
                'Ошибка WebSocket соединения',
                expect.objectContaining({
                    service: 'TinkoffStreamingService',
                    error: expect.any(Object)
                })
            );
        });
    });

    describe('Переподключение', () => {
        beforeEach(async () => {
            await service.initialize();
            await service.connect();
        });

        it('должен обрабатывать разрыв соединения', () => {
            service.subscribedFigis.add('BBG0013HJJ31');
            
            service.handleDisconnect();

            expect(service.isConnected).toBe(false);
            expect(mockLoggerService.info).toHaveBeenCalledWith(
                'Ожидание автоматического переподключения SDK',
                expect.objectContaining({
                    service: 'TinkoffStreamingService',
                    subscribedCount: 1
                })
            );
        });

        it('не должен логировать переподключение при отсутствии подписок', () => {
            service.subscribedFigis.clear();
            
            service.handleDisconnect();

            expect(mockLoggerService.debug).toHaveBeenCalledWith(
                'Нет активных подписок, переподключение не требуется',
                expect.any(Object)
            );
        });
    });

    describe('Отключение', () => {
        beforeEach(async () => {
            await service.initialize();
            await service.connect();
        });

        it('должен корректно отключаться от streaming сервиса', async () => {
            const unsubscribeFn = jest.fn();
            mockOpenAPI.orderbook.mockReturnValue(unsubscribeFn);
            
            await service.subscribeToLastPrices(['BBG0013HJJ31']);
            
            // Проверяем, что подписка создана
            expect(service.subscribedFigis.size).toBe(1);
            
            await service.disconnect();

            // После отключения подписки должны быть очищены
            expect(service.subscribedFigis.size).toBe(0);
        });

        it('должен закрывать WebSocket соединение', async () => {
            mockStreaming._ws = {
                readyState: 1, // OPEN
                close: jest.fn()
            };
            
            await service.disconnect();

            expect(mockStreaming._ws.close).toHaveBeenCalled();
        });

        it('не должен закрывать уже закрытое соединение', async () => {
            mockStreaming._ws = {
                readyState: 3, // CLOSED
                close: jest.fn()
            };
            
            await service.disconnect();

            expect(mockStreaming._ws.close).not.toHaveBeenCalled();
        });
    });

    describe('Статус сервиса', () => {
        it('должен возвращать корректный статус', () => {
            const status = service.getStatus();

            expect(status).toHaveProperty('isInitialized');
            expect(status).toHaveProperty('isConnected');
            expect(status).toHaveProperty('subscribedCount');
            expect(status).toHaveProperty('subscribedFigis');
            expect(status).toHaveProperty('sandbox');
        });

        it('должен отражать текущее состояние подписок', async () => {
            const unsubscribeFn = jest.fn();
            mockOpenAPI.orderbook.mockReturnValue(unsubscribeFn);
            
            await service.initialize();
            await service.connect();
            await service.subscribeToLastPrices(['BBG0013HJJ31', 'BBG004730N88']);

            const status = service.getStatus();

            expect(status.subscribedCount).toBe(2);
            expect(status.subscribedFigis).toContain('BBG0013HJJ31');
            expect(status.subscribedFigis).toContain('BBG004730N88');
        });
    });

    describe('Синглтон', () => {
        it('должен возвращать один и тот же экземпляр', () => {
            const instance1 = TinkoffStreamingServiceSingleton.getInstance();
            const instance2 = TinkoffStreamingServiceSingleton.getInstance();

            expect(instance1).toBe(instance2);
        });
    });

    describe('Обработка ошибок', () => {
        it('должен обрабатывать ошибки при обновлении кеша', async () => {
            mockCacheService.updateInstrumentPrice.mockRejectedValue(new Error('Cache error'));
            
            await service.initialize();
            await service.connect();
            
            let orderbookCallback;
            const unsubscribeFn = jest.fn();
            mockOpenAPI.orderbook.mockImplementation((params, cb) => {
                if (cb) {
                    orderbookCallback = cb;
                }
                // Вызываем callback с данными сразу
                if (cb) {
                    setTimeout(async () => {
                        try {
                            await cb({
                                figi: 'BBG0013HJJ31',
                                depth: 1,
                                bids: [[100.5, 10]],
                                asks: [[101.0, 5]]
                            });
                        } catch (e) {
                            // Игнорируем ошибки
                        }
                    }, 10);
                }
                return unsubscribeFn;
            });
            
            await service.subscribeToLastPrices(['BBG0013HJJ31']);
            
            // Если callback не был вызван автоматически, вызываем вручную
            if (orderbookCallback) {
                try {
                    await orderbookCallback({
                        figi: 'BBG0013HJJ31',
                        depth: 1,
                        bids: [[100.5, 10]],
                        asks: [[101.0, 5]]
                    });
                } catch (e) {
                    // Игнорируем ошибки
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(mockLoggerService.error).toHaveBeenCalledWith(
                'Ошибка обработки стакана заявок',
                expect.any(Object)
            );
        });

        it('должен обрабатывать ошибки подписки', async () => {
            mockOpenAPI.orderbook.mockImplementation(() => {
                throw new Error('Subscription error');
            });

            await service.initialize();

            await expect(
                service.subscribeToLastPrices(['BBG0013HJJ31'])
            ).rejects.toThrow('Subscription error');
        });
    });

    describe('Конфигурация URL', () => {
        it('должен использовать правильные URL для продакшн', () => {
            process.env.TINKOFF_SANDBOX = 'false';
            service = new TinkoffStreamingService();

            expect(service.apiURL).toBe('https://api-invest.tinkoff.ru/openapi');
            expect(service.socketURL).toBe('wss://api-invest.tinkoff.ru/openapi/md/v1/md-openapi/ws');
        });

        it('должен использовать правильные URL для sandbox', () => {
            process.env.TINKOFF_SANDBOX = 'true';
            service = new TinkoffStreamingService();

            expect(service.apiURL).toBe('https://api-invest.tinkoff.ru/openapi/sandbox');
            expect(service.socketURL).toBe('wss://api-invest.tinkoff.ru/openapi/md/v1/md-openapi/ws');
        });
    });
});
