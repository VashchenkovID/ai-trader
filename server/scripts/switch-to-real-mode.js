/**
 * Скрипт для переключения режима торговли на реальный (real)
 * Использование: node switch-to-real-mode.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import TradingModeManager from '../src/services/TradingModeManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: path.join(__dirname, '.env') });

async function switchToRealMode() {
    try {
        console.log('🔄 Начинаем переключение режима торговли на REAL...\n');
        
        // Инициализируем TradingModeManager
        if (!TradingModeManager.isInitialized) {
            await TradingModeManager.initialize();
        }
        
        // Проверяем текущий режим
        const currentMode = TradingModeManager.getCurrentMode();
        console.log(`📊 Текущий режим: ${currentMode.mode}`);
        
        if (currentMode.mode === 'real') {
            console.log('✅ Режим уже установлен на REAL');
            return;
        }
        
        // Проверяем возможность переключения
        console.log('\n🔍 Проверяем возможность переключения на REAL режим...');
        const canSwitch = await TradingModeManager.canSwitchTo('real');
        
        if (!canSwitch.canSwitch) {
            console.error('❌ Невозможно переключиться на REAL режим:');
            console.error(`   Причина: ${canSwitch.reason || 'Неизвестная причина'}`);
            
            if (canSwitch.checks) {
                console.error('\n📋 Детали проверки:');
                Object.entries(canSwitch.checks).forEach(([key, value]) => {
                    const status = value.passed ? '✅' : '❌';
                    console.error(`   ${status} ${key}: ${value.message || ''}`);
                });
            }
            
            process.exit(1);
        }
        
        console.log('✅ Проверка пройдена, можно переключаться\n');
        
        // Переключаем режим
        console.log('🔄 Переключаем режим на REAL...');
        const result = await TradingModeManager.switchMode('real');
        
        console.log('\n✅ Режим успешно переключен!');
        console.log(`   Предыдущий режим: ${result.previousMode}`);
        console.log(`   Текущий режим: ${result.currentMode}`);
        console.log(`   Время: ${result.timestamp}`);
        
        console.log('\n⚠️ ВАЖНО:');
        console.log('   - Режим REAL активирован');
        console.log('   - Торговый движок требует явной активации');
        console.log('   - Все сделки будут выполняться с реальными деньгами');
        console.log('   - Убедитесь, что все настройки корректны\n');
        
    } catch (error) {
        console.error('\n❌ Ошибка при переключении режима:');
        console.error(`   ${error.message}`);
        if (error.stack) {
            console.error('\n📋 Stack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Запускаем переключение
switchToRealMode()
    .then(() => {
        console.log('✅ Скрипт завершен успешно');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Критическая ошибка:', error);
        process.exit(1);
    });

