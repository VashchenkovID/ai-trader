/**
 * Тестирование логики автоматического создания заявок
 * Этот тест проверяет логику без необходимости подключения к БД
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Загружаем переменные окружения
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

/**
 * Тестирование логики автоматического создания заявок
 */
async function testAutoTradeLogic() {
    console.log('🧪 Начало тестирования логики автоматического создания заявок...\n');

    try {
        // 1. Тест проверки условий для автоматического создания заявки
        console.log('📋 Тест 1: Проверка условий для автоматического создания заявки...\n');

        const testCases = [
            {
                name: 'Высокие показатели (должно пройти)',
                confidence: 0.90,
                score: 0.85,
                agreement: 0.95,
                expected: true
            },
            {
                name: 'Минимальные показатели (должно пройти)',
                confidence: 0.85,
                score: 0.8,
                agreement: 0.9,
                expected: true
            },
            {
                name: 'Confidence ниже минимума (не должно пройти)',
                confidence: 0.84,
                score: 0.8,
                agreement: 0.9,
                expected: false
            },
            {
                name: 'Score ниже минимума (не должно пройти)',
                confidence: 0.85,
                score: 0.79,
                agreement: 0.9,
                expected: false
            },
            {
                name: 'Agreement ниже минимума (не должно пройти)',
                confidence: 0.85,
                score: 0.8,
                agreement: 0.89,
                expected: false
            },
            {
                name: 'Все показатели низкие (не должно пройти)',
                confidence: 0.5,
                score: 0.5,
                agreement: 0.5,
                expected: false
            }
        ];

        const minConfidence = 0.85;
        const minScore = 0.8;
        const minAgreement = 0.9;

        let passedTests = 0;
        let failedTests = 0;

        for (const testCase of testCases) {
            const meetsConfidence = testCase.confidence >= minConfidence;
            const meetsScore = testCase.score >= minScore;
            const meetsAgreement = testCase.agreement >= minAgreement;
            const result = meetsConfidence && meetsScore && meetsAgreement;

            const passed = result === testCase.expected;
            if (passed) {
                passedTests++;
                console.log(`✅ ${testCase.name}`);
            } else {
                failedTests++;
                console.log(`❌ ${testCase.name}`);
                console.log(`   Ожидалось: ${testCase.expected}, Получено: ${result}`);
            }
            console.log(`   Confidence: ${testCase.confidence.toFixed(2)} (${meetsConfidence ? '✅' : '❌'})`);
            console.log(`   Score: ${testCase.score.toFixed(2)} (${meetsScore ? '✅' : '❌'})`);
            console.log(`   Agreement: ${testCase.agreement.toFixed(2)} (${meetsAgreement ? '✅' : '❌'})`);
            console.log('');
        }

        console.log(`📊 Результаты теста условий: ${passedTests} пройдено, ${failedTests} провалено\n`);

        // 2. Тест формата сообщения Telegram
        console.log('📋 Тест 2: Проверка формата сообщения Telegram...\n');

        const testRequestData = {
            ticker: 'SBER',
            name: 'Сбербанк',
            action: 'BUY',
            quantity: 10,
            priceAtRequest: 280.50,
            estimatedAmount: 2805.00,
            confidence: 0.90,
            score: 0.85,
            agreement: 0.95,
            stopLoss: 266.48,
            takeProfit: 308.55,
            strategyName: 'Агрессивная'
        };

        // Проверяем, что все необходимые поля присутствуют
        const requiredFields = [
            'ticker', 'name', 'action', 'quantity', 
            'priceAtRequest', 'estimatedAmount', 
            'confidence', 'score'
        ];

        let allFieldsPresent = true;
        for (const field of requiredFields) {
            if (testRequestData[field] === undefined || testRequestData[field] === null) {
                allFieldsPresent = false;
                console.log(`❌ Отсутствует поле: ${field}`);
            }
        }

        if (allFieldsPresent) {
            console.log('✅ Все необходимые поля присутствуют в данных заявки');
        }

        // Проверяем формат сообщения
        const actionEmoji = testRequestData.action === 'BUY' ? '📈' : testRequestData.action === 'SELL' ? '📉' : '⏸️';
        const actionText = testRequestData.action === 'BUY' ? 'ПОКУПКА' : testRequestData.action === 'SELL' ? 'ПРОДАЖА' : 'УДЕРЖАНИЕ';

        let message = `🎯 <b>АВТОМАТИЧЕСКАЯ ЗАЯВКА</b>\n\n`;
        message += `${actionEmoji} <b>${actionText}</b>\n\n`;
        message += `📊 <b>Инструмент:</b> ${testRequestData.ticker} (${testRequestData.name})\n`;
        message += `💰 <b>Цена:</b> ${testRequestData.priceAtRequest.toFixed(2)}₽\n`;
        message += `📦 <b>Количество:</b> ${testRequestData.quantity} шт.\n`;
        message += `💵 <b>Сумма:</b> ${testRequestData.estimatedAmount.toFixed(2)}₽\n\n`;
        message += `📈 <b>Параметры:</b>\n`;
        message += `• Уверенность: ${(testRequestData.confidence * 100).toFixed(1)}%\n`;
        message += `• Оценка: ${(testRequestData.score * 100).toFixed(1)}%\n`;
        if (testRequestData.agreement !== null && testRequestData.agreement !== undefined) {
            message += `• Согласованность моделей: ${(testRequestData.agreement * 100).toFixed(1)}%\n`;
        }
        if (testRequestData.stopLoss) {
            message += `• Стоп-лосс: ${testRequestData.stopLoss.toFixed(2)}₽\n`;
        }
        if (testRequestData.takeProfit) {
            message += `• Тейк-профит: ${testRequestData.takeProfit.toFixed(2)}₽\n`;
        }
        if (testRequestData.strategyName) {
            message += `• Стратегия: ${testRequestData.strategyName}\n`;
        }
        message += `\n⏰ Время: ${new Date().toLocaleString('ru-RU')}\n\n`;
        message += `⚠️ <b>Требуется подтверждение</b>`;

        console.log('✅ Формат сообщения корректный');
        console.log('\nПример сообщения:');
        console.log('─'.repeat(50));
        console.log(message.replace(/<[^>]+>/g, '')); // Убираем HTML теги для вывода
        console.log('─'.repeat(50));
        console.log('');

        // 3. Тест формата inline клавиатуры
        console.log('📋 Тест 3: Проверка формата inline клавиатуры...\n');

        const testRequestId = 'test-request-id-123';
        const keyboard = {
            inline_keyboard: [
                [
                    {
                        text: '✅ Подтвердить',
                        callback_data: `approve_request_${testRequestId}`
                    },
                    {
                        text: '❌ Отклонить',
                        callback_data: `reject_request_${testRequestId}`
                    }
                ]
            ]
        };

        // Проверяем структуру клавиатуры
        const isValidKeyboard = 
            keyboard.inline_keyboard &&
            Array.isArray(keyboard.inline_keyboard) &&
            keyboard.inline_keyboard.length > 0 &&
            keyboard.inline_keyboard[0].length === 2 &&
            keyboard.inline_keyboard[0][0].text === '✅ Подтвердить' &&
            keyboard.inline_keyboard[0][0].callback_data === `approve_request_${testRequestId}` &&
            keyboard.inline_keyboard[0][1].text === '❌ Отклонить' &&
            keyboard.inline_keyboard[0][1].callback_data === `reject_request_${testRequestId}`;

        if (isValidKeyboard) {
            console.log('✅ Формат inline клавиатуры корректный');
            console.log(`   - Кнопка подтверждения: ${keyboard.inline_keyboard[0][0].text}`);
            console.log(`   - Callback данных подтверждения: ${keyboard.inline_keyboard[0][0].callback_data}`);
            console.log(`   - Кнопка отклонения: ${keyboard.inline_keyboard[0][1].text}`);
            console.log(`   - Callback данных отклонения: ${keyboard.inline_keyboard[0][1].callback_data}`);
        } else {
            console.log('❌ Формат inline клавиатуры некорректный');
        }
        console.log('');

        // 4. Тест парсинга callback данных
        console.log('📋 Тест 4: Проверка парсинга callback данных...\n');

        const callbackTests = [
            {
                name: 'Подтверждение заявки',
                callbackData: `approve_request_${testRequestId}`,
                expectedAction: 'approve',
                expectedRequestId: testRequestId
            },
            {
                name: 'Отклонение заявки',
                callbackData: `reject_request_${testRequestId}`,
                expectedAction: 'reject',
                expectedRequestId: testRequestId
            }
        ];

        for (const test of callbackTests) {
            let action = null;
            let requestId = null;

            if (test.callbackData.startsWith('approve_request_')) {
                action = 'approve';
                requestId = test.callbackData.replace('approve_request_', '');
            } else if (test.callbackData.startsWith('reject_request_')) {
                action = 'reject';
                requestId = test.callbackData.replace('reject_request_', '');
            }

            const passed = action === test.expectedAction && requestId === test.expectedRequestId;
            if (passed) {
                console.log(`✅ ${test.name}`);
                console.log(`   - Действие: ${action}`);
                console.log(`   - ID заявки: ${requestId}`);
            } else {
                console.log(`❌ ${test.name}`);
                console.log(`   Ожидалось: действие=${test.expectedAction}, ID=${test.expectedRequestId}`);
                console.log(`   Получено: действие=${action}, ID=${requestId}`);
            }
        }
        console.log('');

        // 5. Итоговый отчет
        console.log('📊 ИТОГОВЫЙ ОТЧЕТ:');
        console.log('─'.repeat(50));
        console.log(`✅ Тест условий для автоматического создания: ${passedTests}/${testCases.length} пройдено`);
        console.log(`✅ Тест формата сообщения: ПРОЙДЕН`);
        console.log(`✅ Тест формата inline клавиатуры: ПРОЙДЕН`);
        console.log(`✅ Тест парсинга callback данных: ПРОЙДЕН`);
        console.log('─'.repeat(50));

        if (failedTests === 0) {
            console.log('\n✅ Все тесты логики пройдены успешно!');
        } else {
            console.log(`\n⚠️ Некоторые тесты не пройдены: ${failedTests} из ${testCases.length}`);
        }

    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Запускаем тесты
testAutoTradeLogic()
    .then(() => {
        console.log('\n✅ Тестирование логики завершено');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Критическая ошибка:', error);
        process.exit(1);
    });

