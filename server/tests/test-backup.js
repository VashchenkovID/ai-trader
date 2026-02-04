/**
 * Тестовый скрипт для проверки функциональности скачивания и загрузки бэкапов
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: path.join(__dirname, '.env') });

async function testBackupFunctionality() {
    console.log('🧪 Начинаем тестирование функциональности бэкапов...\n');
    
    let errors = [];
    let warnings = [];
    
    // 1. Проверка наличия необходимых библиотек
    console.log('1️⃣ Проверка зависимостей...');
    try {
        await import('archiver');
        console.log('   ✅ archiver установлен');
    } catch (error) {
        errors.push('❌ archiver не установлен. Установите: npm install archiver');
        console.log('   ❌ archiver не установлен');
    }
    
    try {
        await import('yauzl');
        console.log('   ✅ yauzl установлен');
    } catch (error) {
        errors.push('❌ yauzl не установлен. Установите: npm install yauzl');
        console.log('   ❌ yauzl не установлен');
    }
    
    if (errors.length > 0) {
        console.log('\n⚠️ Необходимо установить зависимости перед тестированием:');
        errors.forEach(err => console.log(`   ${err}`));
        console.log('\n   Выполните: cd server && npm install archiver yauzl\n');
        return {
            success: false,
            errors,
            warnings: []
        };
    }
    
    // 2. Проверка инициализации BackupService
    console.log('\n2️⃣ Проверка BackupService...');
    try {
        const BackupService = (await import('../src/services/BackupService.js')).default;
        
        if (!BackupService.isInitialized) {
            console.log('   ⚠️ BackupService не инициализирован, инициализируем...');
            try {
                await BackupService.initialize();
                console.log('   ✅ BackupService инициализирован');
            } catch (initError) {
                warnings.push(`BackupService не удалось инициализировать: ${initError.message}`);
                console.log(`   ⚠️ BackupService не удалось инициализировать: ${initError.message}`);
            }
        } else {
            console.log('   ✅ BackupService уже инициализирован');
        }
        
        // 3. Проверка директорий
        console.log('\n3️⃣ Проверка директорий...');
        const dirs = [
            BackupService.backupDir,
            BackupService.dbBackupDir,
            BackupService.settingsBackupDir,
            BackupService.modelsBackupDir,
            BackupService.fullBackupDir,
            BackupService.exportDir
        ];
        
        for (const dir of dirs) {
            try {
                await fs.access(dir);
                console.log(`   ✅ ${path.basename(dir)} существует`);
            } catch {
                console.log(`   ⚠️ ${path.basename(dir)} не существует (будет создана при использовании)`);
            }
        }
        
        // 4. Тест создания бэкапа
        console.log('\n4️⃣ Тест создания бэкапа...');
        try {
            const backup = await BackupService.createFullBackup({
                type: 'manual',
                description: 'Тестовый бэкап для проверки функциональности'
            });
            console.log(`   ✅ Бэкап создан: ${backup.id}`);
            console.log(`   📁 Путь: ${backup.path}`);
            console.log(`   📊 Компоненты: ${Object.keys(backup.components).join(', ')}`);
            
            // 5. Тест скачивания бэкапа
            console.log('\n5️⃣ Тест скачивания бэкапа (создание ZIP)...');
            try {
                const download = await BackupService.downloadBackup(backup.id);
                console.log(`   ✅ ZIP архив создан: ${download.file}`);
                console.log(`   📦 Размер: ${(download.size / 1024 / 1024).toFixed(2)} MB`);
                console.log(`   📊 Оригинальный размер: ${(download.originalSize / 1024 / 1024).toFixed(2)} MB`);
                console.log(`   🗜️ Сжатие: ${download.compressionRatio}`);
                
                // Проверяем, что файл существует
                try {
                    await fs.access(download.path);
                    console.log(`   ✅ Файл существует: ${download.path}`);
                    
                    // 6. Тест загрузки бэкапа (распаковка)
                    console.log('\n6️⃣ Тест загрузки бэкапа (распаковка ZIP)...');
                    try {
                        const upload = await BackupService.uploadBackup(download.path, {
                            restore: false, // Не восстанавливаем, только распаковываем
                            components: []
                        });
                        console.log(`   ✅ ZIP распакован`);
                        console.log(`   📁 Директория: ${upload.extractedDir}`);
                        console.log(`   📄 Файлов распаковано: ${upload.extractedFiles}`);
                        
                        if (upload.backupInfo) {
                            console.log(`   📋 Информация о бэкапе найдена: ${upload.backupInfo.id}`);
                        }
                        
                        // Очистка тестовых файлов
                        console.log('\n7️⃣ Очистка тестовых файлов...');
                        try {
                            await fs.unlink(download.path);
                            console.log(`   ✅ Удален: ${download.path}`);
                            
                            // Удаляем распакованную директорию
                            await fs.rm(upload.extractedDir, { recursive: true, force: true });
                            console.log(`   ✅ Удалена директория: ${upload.extractedDir}`);
                        } catch (cleanupError) {
                            warnings.push(`Не удалось удалить тестовые файлы: ${cleanupError.message}`);
                            console.log(`   ⚠️ Не удалось удалить тестовые файлы: ${cleanupError.message}`);
                        }
                        
                    } catch (uploadError) {
                        errors.push(`Ошибка загрузки бэкапа: ${uploadError.message}`);
                        console.log(`   ❌ Ошибка загрузки бэкапа: ${uploadError.message}`);
                        console.log(`   📋 Stack: ${uploadError.stack}`);
                    }
                    
                } catch (fileError) {
                    errors.push(`ZIP файл не найден: ${fileError.message}`);
                    console.log(`   ❌ ZIP файл не найден: ${fileError.message}`);
                }
                
            } catch (downloadError) {
                errors.push(`Ошибка скачивания бэкапа: ${downloadError.message}`);
                console.log(`   ❌ Ошибка скачивания бэкапа: ${downloadError.message}`);
                console.log(`   📋 Stack: ${downloadError.stack}`);
            }
            
            // Удаляем тестовый бэкап
            try {
                await BackupService.deleteBackup(backup.id);
                console.log(`\n   ✅ Тестовый бэкап удален: ${backup.id}`);
            } catch (deleteError) {
                warnings.push(`Не удалось удалить тестовый бэкап: ${deleteError.message}`);
                console.log(`   ⚠️ Не удалось удалить тестовый бэкап: ${deleteError.message}`);
            }
            
        } catch (backupError) {
            errors.push(`Ошибка создания бэкапа: ${backupError.message}`);
            console.log(`   ❌ Ошибка создания бэкапа: ${backupError.message}`);
            console.log(`   📋 Stack: ${backupError.stack}`);
        }
        
    } catch (serviceError) {
        errors.push(`Ошибка загрузки BackupService: ${serviceError.message}`);
        console.log(`   ❌ Ошибка загрузки BackupService: ${serviceError.message}`);
        console.log(`   📋 Stack: ${serviceError.stack}`);
    }
    
    // Итоги
    console.log('\n' + '='.repeat(60));
    console.log('📊 ИТОГИ ТЕСТИРОВАНИЯ');
    console.log('='.repeat(60));
    
    if (errors.length === 0 && warnings.length === 0) {
        console.log('✅ Все тесты пройдены успешно!');
    } else {
        if (errors.length > 0) {
            console.log(`\n❌ Ошибки (${errors.length}):`);
            errors.forEach((err, index) => {
                console.log(`   ${index + 1}. ${err}`);
            });
        }
        
        if (warnings.length > 0) {
            console.log(`\n⚠️ Предупреждения (${warnings.length}):`);
            warnings.forEach((warn, index) => {
                console.log(`   ${index + 1}. ${warn}`);
            });
        }
    }
    
    console.log('\n');
    
    return {
        success: errors.length === 0,
        errors,
        warnings
    };
}

// Запускаем тесты
testBackupFunctionality()
    .then(result => {
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error('❌ Критическая ошибка при тестировании:', error);
        process.exit(1);
    });

