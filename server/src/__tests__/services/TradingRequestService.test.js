/**
 * Тесты для TradingRequestService
 * Фаза 1, задача 1.1: Смягчение валидации
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import TradingRequestService from '../../services/TradingRequestService.js';
import TradingModeManager from '../../services/TradingModeManager.js';

describe('TradingRequestService - Фаза 1, задача 1.1: Смягчение валидации', () => {
    
    beforeEach(async () => {
        // Инициализация сервисов перед каждым тестом
        if (!TradingModeManager.isInitialized) {
            await TradingModeManager.initialize();
        }
    });

    afterEach(() => {
        // Очистка после тестов
        jest.clearAllMocks();
    });

    describe('1.1.1. Снижение лимитов confidence', () => {
        
        it('должен проходить валидацию с confidence 60% в Micro режиме', async () => {
            const recommendation = {
                figi: 'test-figi',
                recommendation: 'BUY',
                confidence: 0.60, // 60%
                score: 0.7
            };

            const result = await TradingRequestService.validateTradingMode('micro', recommendation);
            
            expect(result.isValid).toBe(true);
            expect(result.warnings).toHaveLength(0);
        });

        it('должен проходить валидацию с confidence 70% в Real режиме', async () => {
            const recommendation = {
                figi: 'test-figi',
                recommendation: 'BUY',
                confidence: 0.70, // 70%
                score: 0.5 // Низкий score, но не требуется для Real режима
            };

            const result = await TradingRequestService.validateTradingMode('real', recommendation);
            
            expect(result.isValid).toBe(true);
            expect(result.warnings).toHaveLength(0);
        });

        it('должен проходить валидацию в Real режиме без требования score', async () => {
            const recommendation = {
                figi: 'test-figi',
                recommendation: 'BUY',
                confidence: 0.75,
                score: 0.3 // Низкий score, но не должен блокировать
            };

            const result = await TradingRequestService.validateTradingMode('real', recommendation);
            
            expect(result.isValid).toBe(true);
            // Не должно быть ошибок из-за низкого score
        });

        it('должен блокировать при confidence < 40% в Micro режиме', async () => {
            const recommendation = {
                figi: 'test-figi',
                recommendation: 'BUY',
                confidence: 0.35, // 35% < 40%
                score: 0.7
            };

            await expect(
                TradingRequestService.validateTradingMode('micro', recommendation)
            ).rejects.toThrow('слишком низкая');
        });

        it('должен блокировать при confidence < 40% в Real режиме', async () => {
            const recommendation = {
                figi: 'test-figi',
                recommendation: 'BUY',
                confidence: 0.35, // 35% < 40%
                score: 0.8
            };

            await expect(
                TradingRequestService.validateTradingMode('real', recommendation)
            ).rejects.toThrow('слишком низкая');
        });
    });

    describe('1.1.2. Превращение блокировок в предупреждения', () => {
        
        it('должен возвращать warning при confidence 50% в Micro режиме (между 40% и 60%)', async () => {
            const recommendation = {
                figi: 'test-figi',
                recommendation: 'BUY',
                confidence: 0.50, // 50% < 60% (минимум), но >= 40% (блокировка)
                score: 0.7
            };

            const result = await TradingRequestService.validateTradingMode('micro', recommendation);
            
            expect(result.isValid).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toContain('ниже рекомендуемого минимума');
        });

        it('должен возвращать warning при confidence 65% в Real режиме (между 40% и 70%)', async () => {
            // Устанавливаем режим на 'real' перед тестом
            TradingModeManager.currentMode = 'real';
            
            const recommendation = {
                figi: 'test-figi',
                recommendation: 'BUY',
                confidence: 0.65, // 65% < 70% (минимум), но >= 40% (блокировка)
                score: 0.7
            };

            const result = await TradingRequestService.validateTradingMode('real', recommendation);
            
            expect(result.isValid).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toContain('ниже рекомендуемого минимума');
        });

        it('должен пропускать валидацию для SELL операций', async () => {
            const recommendation = {
                figi: 'test-figi',
                recommendation: 'SELL',
                confidence: 0.20, // Очень низкая уверенность
                score: 0.3
            };

            const result = await TradingRequestService.validateTradingMode('real', recommendation);
            
            expect(result.isValid).toBe(true);
            expect(result.warnings).toHaveLength(0);
        });
    });

    describe('Граничные значения', () => {
        
        it('должен проходить валидацию с confidence ровно 60% в Micro режиме', async () => {
            // Устанавливаем режим на 'micro' перед тестом, чтобы getModeSettings вернул правильные настройки
            const originalMode = TradingModeManager.currentMode;
            TradingModeManager.currentMode = 'micro';
            
            const recommendation = {
                figi: 'test-figi',
                recommendation: 'BUY',
                confidence: 0.60, // Ровно 60%, что равно minConfidence для micro
                score: 0.7
            };

            const result = await TradingRequestService.validateTradingMode('micro', recommendation);
            
            // Восстанавливаем оригинальный режим
            TradingModeManager.currentMode = originalMode;
            
            expect(result.isValid).toBe(true);
            // При confidence = minConfidence (0.6) warning не должно быть, так как проверка строгая <
            expect(result.warnings).toHaveLength(0);
        });

        it('должен проходить валидацию с confidence ровно 70% в Real режиме', async () => {
            const recommendation = {
                figi: 'test-figi',
                recommendation: 'BUY',
                confidence: 0.70,
                score: 0.5
            };

            const result = await TradingRequestService.validateTradingMode('real', recommendation);
            
            expect(result.isValid).toBe(true);
            expect(result.warnings).toHaveLength(0);
        });

        it('должен блокировать при confidence ровно 39.9% в Micro режиме', async () => {
            const recommendation = {
                figi: 'test-figi',
                recommendation: 'BUY',
                confidence: 0.399,
                score: 0.7
            };

            await expect(
                TradingRequestService.validateTradingMode('micro', recommendation)
            ).rejects.toThrow();
        });

        it('должен возвращать warning при confidence 59.9% в Micro режиме', async () => {
            const recommendation = {
                figi: 'test-figi',
                recommendation: 'BUY',
                confidence: 0.599,
                score: 0.7
            };

            const result = await TradingRequestService.validateTradingMode('micro', recommendation);
            
            expect(result.isValid).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
        });
    });
});

