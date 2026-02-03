#!/bin/bash
# Скрипт для исправления прав доступа к директориям backups на хосте

echo "🔧 Исправление прав доступа к директориям backups..."

# Создаем директории, если их нет
mkdir -p server/backups/database
mkdir -p server/backups/settings
mkdir -p server/backups/models
mkdir -p server/backups/full
mkdir -p server/backups/exports
mkdir -p server/backups/uploads

# Устанавливаем права доступа (755 - владелец может читать/писать/выполнять, остальные - читать/выполнять)
chmod -R 755 server/backups

# Устанавливаем владельца (если нужно, замените на вашего пользователя)
# chown -R $USER:$USER server/backups

echo "✅ Права доступа установлены"
echo "📁 Директории созданы:"
ls -la server/backups/

