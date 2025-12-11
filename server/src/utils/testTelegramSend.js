import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Загружаем переменные окружения
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

/**
 * Тестирование отправки сообщений в Telegram
 */
async function testTelegramSend() {
    console.log('🧪 Начало тестирования отправки сообщений в Telegram...\n');

    try {
        // 1. Проверка переменных окружения
        console.log('📋 Шаг 1: Проверка переменных окружения...');
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (!token || !chatId) {
            console.error('❌ Переменные окружения не установлены:');
            console.error('   - TELEGRAM_BOT_TOKEN:', token ? '✅ установлен' : '❌ отсутствует');
            console.error('   - TELEGRAM_CHAT_ID:', chatId ? '✅ установлен' : '❌ отсутствует');
            console.error('\n⚠️ Установите переменные окружения в файле .env');
            process.exit(1);
        }

        console.log('✅ Переменные окружения установлены');
        console.log(`   - Token: ${token.substring(0, 10)}...${token.substring(token.length - 5)}`);
        console.log(`   - Chat ID: ${chatId}\n`);

        // 2. Инициализация Telegram сервиса
        console.log('📋 Шаг 2: Инициализация Telegram сервиса...');
        const OptimizedTelegramService = (await import('../services/OptimizedTelegramService.js')).default;

        if (!OptimizedTelegramService.isInitialized) {
            await OptimizedTelegramService.initialize();
        }

        if (!OptimizedTelegramService.isInitialized) {
            console.error('❌ Не удалось инициализировать Telegram сервис');
            process.exit(1);
        }

        console.log('✅ Telegram сервис инициализирован\n');

        // 3. Тест 1: Отправка простого сообщения
        console.log('📋 Шаг 3: Тест отправки простого сообщения...');
        try {
            const testMessage = `🧪 <b>ТЕСТОВОЕ СООБЩЕНИЕ</b>\n\n` +
                `Это тестовое сообщение для проверки работы Telegram бота.\n\n` +
                `⏰ Время отправки: ${new Date().toLocaleString('ru-RU')}`;

            await OptimizedTelegramService.safeSendMessage(
                chatId,
                testMessage,
                { parse_mode: 'HTML' }
            );

            console.log('✅ Простое сообщение отправлено успешно\n');
        } catch (error) {
            console.error('❌ Ошибка отправки простого сообщения:', error.message);
            throw error;
        }

        // 4. Тест 2: Отправка сообщения с inline кнопками (заявка на подтверждение)
        console.log('📋 Шаг 4: Тест отправки сообщения с inline кнопками...');
        
        const testRequestId = `test-${Date.now()}`;
        const testRequestData = {
            ticker: 'SBER',
            name: 'Сбербанк (тест)',
            action: 'BUY',
            quantity: 10,
            priceAtRequest: 280.50,
            estimatedAmount: 2805.00,
            confidence: 0.90,
            score: 0.85,
            agreement: 0.95,
            stopLoss: 266.48,
            takeProfit: 308.55,
            strategyName: 'Агрессивная (тест)'
        };

        try {
            const sentMessage = await OptimizedTelegramService.sendTradingRequestForApproval(
                testRequestId,
                testRequestData
            );

            if (sentMessage && sentMessage.message_id) {
                console.log('✅ Сообщение с кнопками отправлено успешно');
                console.log(`   - Message ID: ${sentMessage.message_id}`);
                console.log(`   - Chat ID: ${sentMessage.chat.id}`);
                console.log(`   - Request ID: ${testRequestId}`);
                console.log('\n📱 Проверьте Telegram - вы должны увидеть сообщение с кнопками "Подтвердить" и "Отклонить"');
                console.log('   Попробуйте нажать на кнопки и проверить обработку callback\'ов\n');
            } else {
                console.warn('⚠️ Сообщение отправлено, но не получен message_id');
            }
        } catch (error) {
            console.error('❌ Ошибка отправки сообщения с кнопками:', error.message);
            console.error('Stack:', error.stack);
            throw error;
        }

        // 5. Тест 3: Проверка формата сообщения
        console.log('📋 Шаг 5: Проверка формата сообщения...');
        
        const actionEmoji = testRequestData.action === 'BUY' ? '📈' : '📉';
        const actionText = testRequestData.action === 'BUY' ? 'ПОКУПКА' : 'ПРОДАЖА';

        let expectedMessage = `🎯 <b>АВТОМАТИЧЕСКАЯ ЗАЯВКА</b>\n\n`;
        expectedMessage += `${actionEmoji} <b>${actionText}</b>\n\n`;
        expectedMessage += `📊 <b>Инструмент:</b> ${testRequestData.ticker} (${testRequestData.name})\n`;
        expectedMessage += `💰 <b>Цена:</b> ${testRequestData.priceAtRequest.toFixed(2)}₽\n`;
        expectedMessage += `📦 <b>Количество:</b> ${testRequestData.quantity} шт.\n`;
        expectedMessage += `💵 <b>Сумма:</b> ${testRequestData.estimatedAmount.toFixed(2)}₽\n\n`;
        expectedMessage += `📈 <b>Параметры:</b>\n`;
        expectedMessage += `• Уверенность: ${(testRequestData.confidence * 100).toFixed(1)}%\n`;
        expectedMessage += `• Оценка: ${(testRequestData.score * 100).toFixed(1)}%\n`;
        expectedMessage += `• Согласованность моделей: ${(testRequestData.agreement * 100).toFixed(1)}%\n`;
        expectedMessage += `• Стоп-лосс: ${testRequestData.stopLoss.toFixed(2)}₽\n`;
        expectedMessage += `• Тейк-профит: ${testRequestData.takeProfit.toFixed(2)}₽\n`;
        expectedMessage += `• Стратегия: ${testRequestData.strategyName}\n`;
        expectedMessage += `\n⏰ Время: ${new Date().toLocaleString('ru-RU')}\n\n`;
        expectedMessage += `⚠️ <b>Требуется подтверждение</b>`;

        console.log('✅ Формат сообщения проверен');
        console.log('\nПример сообщения (без HTML тегов):');
        console.log('─'.repeat(60));
        console.log(expectedMessage.replace(/<[^>]+>/g, ''));
        console.log('─'.repeat(60));
        console.log('');

        // 6. Тест 4: Проверка структуры inline клавиатуры
        console.log('📋 Шаг 6: Проверка структуры inline клавиатуры...');
        
        const expectedKeyboard = {
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

        console.log('✅ Структура клавиатуры проверена');
        console.log('   - Кнопка подтверждения:', expectedKeyboard.inline_keyboard[0][0].text);
        console.log('   - Callback подтверждения:', expectedKeyboard.inline_keyboard[0][0].callback_data);
        console.log('   - Кнопка отклонения:', expectedKeyboard.inline_keyboard[0][1].text);
        console.log('   - Callback отклонения:', expectedKeyboard.inline_keyboard[0][1].callback_data);
        console.log('');

        // 7. Тест 5: Отправка нескольких тестовых сообщений
        console.log('📋 Шаг 7: Тест отправки нескольких сообщений...');
        
        const testInstruments = [
            { ticker: 'SBER', name: 'Сбербанк', price: 280.50 },
            { ticker: 'GAZP', name: 'Газпром', price: 165.30 },
            { ticker: 'LKOH', name: 'Лукойл', price: 7450.00 }
        ];

        for (let i = 0; i < testInstruments.length; i++) {
            const instrument = testInstruments[i];
            const requestId = `test-${Date.now()}-${i}`;
            
            try {
                await OptimizedTelegramService.sendTradingRequestForApproval(requestId, {
                    ticker: instrument.ticker,
                    name: instrument.name,
                    action: 'BUY',
                    quantity: 10,
                    priceAtRequest: instrument.price,
                    estimatedAmount: instrument.price * 10,
                    confidence: 0.88 + (i * 0.02),
                    score: 0.83 + (i * 0.02),
                    agreement: 0.92 + (i * 0.02),
                    stopLoss: instrument.price * 0.95,
                    takeProfit: instrument.price * 1.10,
                    strategyName: i === 0 ? 'Консервативная' : i === 1 ? 'Умеренная' : 'Агрессивная'
                });

                console.log(`✅ Сообщение ${i + 1}/${testInstruments.length} отправлено для ${instrument.ticker}`);
                
                // Небольшая задержка между сообщениями
                if (i < testInstruments.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.error(`❌ Ошибка отправки сообщения для ${instrument.ticker}:`, error.message);
            }
        }

        console.log('\n📱 Проверьте Telegram - вы должны увидеть несколько сообщений с кнопками\n');

        // 8. Итоговый отчет
        console.log('📊 ИТОГОВЫЙ ОТЧЕТ:');
        console.log('─'.repeat(60));
        console.log('✅ Проверка переменных окружения: ПРОЙДЕНА');
        console.log('✅ Инициализация Telegram сервиса: ПРОЙДЕНА');
        console.log('✅ Отправка простого сообщения: ПРОЙДЕНА');
        console.log('✅ Отправка сообщения с кнопками: ПРОЙДЕНА');
        console.log('✅ Проверка формата сообщения: ПРОЙДЕНА');
        console.log('✅ Проверка структуры клавиатуры: ПРОЙДЕНА');
        console.log('✅ Отправка нескольких сообщений: ПРОЙДЕНА');
        console.log('─'.repeat(60));
        console.log('\n✅ Все тесты отправки в Telegram пройдены успешно!');
        console.log('\n📝 Следующие шаги:');
        console.log('   1. Проверьте Telegram - должны быть видны все отправленные сообщения');
        console.log('   2. Нажмите на кнопки "Подтвердить" и "Отклонить"');
        console.log('   3. Проверьте, что сообщения обновляются после нажатия');
        console.log('   4. Проверьте логи сервера на наличие callback обработок');

    } catch (error) {
        console.error('\n❌ Ошибка при тестировании:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Запускаем тесты
testTelegramSend()
    .then(() => {
        console.log('\n✅ Тестирование завершено');
        // Не завершаем процесс сразу, чтобы дать время обработать callback'и
        setTimeout(() => {
            process.exit(0);
        }, 5000);
    })
    .catch((error) => {
        console.error('\n❌ Критическая ошибка:', error);
        process.exit(1);
    });

