#!/usr/bin/env node

/**
 * Скрипт для обновления расписания полного обучения на понедельник в 3:00
 * Использование: node scripts/update-training-schedule.js
 */

import Settings from '../src/models/Settings.js';
import DatabaseConnectionManager from '../src/utils/DatabaseConnectionManager.js';

async function updateTrainingSchedule() {
    try {
        console.log('🔄 Обновление расписания полного обучения...');
        
        // Инициализируем подключение к БД
        const requesterId = 'update-training-schedule-script';
        const connection = await DatabaseConnectionManager.acquireConnection(requesterId, 30000);
        
        try {
            // Обновляем настройку
            await Settings.setSetting('nn_training_schedule', '0 3 * * 1', {
                description: 'Расписание полного обучения нейросети (cron, запускается понедельник в 3:00 после обновления кеша в 02:00)',
                category: 'scheduler',
                dataType: 'string'
            });
            
            console.log('✅ Расписание полного обучения обновлено на: понедельник в 3:00 (0 3 * * 1)');
            console.log('ℹ️  Изменения вступят в силу после перезапуска SchedulerService');
            console.log('ℹ️  Или перезапустите сервер для применения изменений');
            
        } finally {
            connection.release();
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка обновления расписания:', error);
        process.exit(1);
    }
}

updateTrainingSchedule();

