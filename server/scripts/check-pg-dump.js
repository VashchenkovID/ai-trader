/**
 * Скрипт для проверки наличия pg_dump и pg_restore
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function checkPgDump() {
    console.log('🔍 Проверка наличия PostgreSQL утилит...\n');
    
    try {
        // Проверяем pg_dump
        try {
            const { stdout } = await execAsync('pg_dump --version');
            console.log('✅ pg_dump установлен');
            console.log(`   Версия: ${stdout.trim()}`);
        } catch (error) {
            console.log('❌ pg_dump НЕ установлен');
            console.log('   Ошибка:', error.message);
        }
        
        // Проверяем pg_restore
        try {
            const { stdout } = await execAsync('pg_restore --version');
            console.log('✅ pg_restore установлен');
            console.log(`   Версия: ${stdout.trim()}`);
        } catch (error) {
            console.log('❌ pg_restore НЕ установлен');
            console.log('   Ошибка:', error.message);
        }
        
        console.log('\n📝 Инструкции по установке:');
        console.log('\nДля Windows:');
        console.log('1. Скачайте PostgreSQL с официального сайта: https://www.postgresql.org/download/windows/');
        console.log('2. Установите PostgreSQL (включите опцию "Command Line Tools")');
        console.log('3. Добавьте путь к bin в PATH (обычно: C:\\Program Files\\PostgreSQL\\<version>\\bin)');
        console.log('4. Перезапустите терминал и проверьте снова');
        
        console.log('\nАльтернатива - использовать только через Node.js:');
        console.log('Можно использовать pg_dump через npm пакет, но это менее надежно');
        
    } catch (error) {
        console.error('❌ Ошибка проверки:', error);
    }
}

checkPgDump();

