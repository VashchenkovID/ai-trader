/**
 * Тест для проверки сохранения и загрузки моделей
 * Проверяет StackingService и EntryOptimizationService
 */

import StackingService from '../../services/StackingService.js';
import EntryOptimizationService from '../../services/EntryOptimizationService.js';
import ModelManager from '../../utils/ModelManager.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testModelSaveLoad() {
    console.log('🧪 Начало тестирования сохранения и загрузки моделей...\n');

    const results = {
        stacking: { save: false, load: false, create: false },
        entryOptimization: { save: false, load: false, create: false }
    };

    try {
        // Тест 1: StackingService
        console.log('📦 Тест 1: StackingService');
        console.log('   Инициализация сервиса...');
        
        await StackingService.initialize();
        
        // Проверяем, что модель создана
        if (StackingService.metaModel) {
            results.stacking.create = true;
            console.log('   ✅ Модель создана при инициализации');
        } else {
            console.log('   ⚠️ Модель не создана');
        }

        // Тестируем сохранение
        console.log('   Тестирование сохранения модели...');
        try {
            await StackingService.saveModel();
            results.stacking.save = true;
            console.log('   ✅ Модель успешно сохранена');
        } catch (error) {
            console.log(`   ❌ Ошибка сохранения: ${error.message}`);
        }

        // Тестируем загрузку (сбрасываем модель и загружаем заново)
        console.log('   Тестирование загрузки модели...');
        const originalModel = StackingService.metaModel;
        StackingService.metaModel = null;
        
        try {
            await StackingService.loadModel();
            if (StackingService.metaModel) {
                results.stacking.load = true;
                console.log('   ✅ Модель успешно загружена');
            } else {
                console.log('   ⚠️ Модель не загружена (возможно, файлы не найдены)');
            }
        } catch (error) {
            console.log(`   ❌ Ошибка загрузки: ${error.message}`);
        }

        // Восстанавливаем модель
        if (!StackingService.metaModel && originalModel) {
            StackingService.metaModel = originalModel;
        }

        console.log('');

        // Тест 2: EntryOptimizationService
        console.log('📦 Тест 2: EntryOptimizationService');
        console.log('   Инициализация сервиса...');
        
        await EntryOptimizationService.initialize();
        console.log('   ✅ Сервис инициализирован');

        // Проверяем загрузку модели
        console.log('   Проверка загрузки модели...');
        if (EntryOptimizationService.model) {
            results.entryOptimization.load = true;
            console.log('   ✅ Модель загружена');
        } else {
            console.log('   ℹ️ Модель не найдена (будет создана при первом обучении)');
        }

        // Создаем тестовую модель для проверки сохранения
        console.log('   Создание тестовой модели...');
        try {
            const testInputShape = [30, 4]; // [timesteps, features]
            EntryOptimizationService.model = EntryOptimizationService.createModel(testInputShape);
            results.entryOptimization.create = true;
            console.log('   ✅ Тестовая модель создана');
        } catch (error) {
            console.log(`   ❌ Ошибка создания модели: ${error.message}`);
        }

        // Тестируем сохранение
        if (EntryOptimizationService.model) {
            console.log('   Тестирование сохранения модели...');
            try {
                await EntryOptimizationService.saveModel();
                results.entryOptimization.save = true;
                console.log('   ✅ Модель успешно сохранена');
            } catch (error) {
                console.log(`   ❌ Ошибка сохранения: ${error.message}`);
            }
        }

        // Тестируем загрузку (сбрасываем модель и загружаем заново)
        console.log('   Тестирование загрузки модели...');
        const originalEntryModel = EntryOptimizationService.model;
        EntryOptimizationService.model = null;
        
        try {
            await EntryOptimizationService.loadModel();
            if (EntryOptimizationService.model) {
                results.entryOptimization.load = true;
                console.log('   ✅ Модель успешно загружена');
            } else {
                console.log('   ℹ️ Модель не загружена (возможно, файлы не найдены или модель еще не была сохранена)');
            }
        } catch (error) {
            console.log(`   ❌ Ошибка загрузки: ${error.message}`);
        }

        // Восстанавливаем модель
        if (!EntryOptimizationService.model && originalEntryModel) {
            EntryOptimizationService.model = originalEntryModel;
        }

        console.log('');

        // Итоговый отчет
        console.log('📊 Итоговый отчет:');
        console.log('');
        
        console.log('StackingService:');
        console.log(`   Создание модели: ${results.stacking.create ? '✅' : '❌'}`);
        console.log(`   Сохранение модели: ${results.stacking.save ? '✅' : '❌'}`);
        console.log(`   Загрузка модели: ${results.stacking.load ? '✅' : '❌'}`);
        console.log('');
        
        console.log('EntryOptimizationService:');
        console.log(`   Создание модели: ${results.entryOptimization.create ? '✅' : '❌'}`);
        console.log(`   Сохранение модели: ${results.entryOptimization.save ? '✅' : '❌'}`);
        console.log(`   Загрузка модели: ${results.entryOptimization.load ? '✅' : '⚠️ (модель может не существовать)'}`);
        console.log('');

        const allPassed = 
            results.stacking.create && 
            results.stacking.save && 
            results.stacking.load &&
            results.entryOptimization.create &&
            results.entryOptimization.save;

        if (allPassed) {
            console.log('✅ Все основные тесты пройдены успешно!');
            process.exit(0);
        } else {
            console.log('⚠️ Некоторые тесты не прошли. Проверьте логи выше.');
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Критическая ошибка при тестировании:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

// Запускаем тест
testModelSaveLoad().catch(error => {
    console.error('❌ Необработанная ошибка:', error);
    process.exit(1);
});





































