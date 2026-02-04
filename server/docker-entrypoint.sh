#!/bin/sh
set -e

# Устанавливаем права доступа на папки при старте контейнера
# Это необходимо, так как volumes монтируются с хоста и могут иметь неправильные права
# Этот скрипт должен выполняться от root

echo "🔧 Установка прав доступа на папки..."

# Создаем папки, если их нет
mkdir -p /app/models /app/logs /app/backups/database /app/backups/settings /app/backups/models /app/backups/full /app/backups/exports /app/backups/uploads

# Устанавливаем полные права на папку models и все её содержимое (рекурсивно)
chmod -R 777 /app/models

# Устанавливаем права на другие папки
chmod -R 755 /app/logs
chmod -R 777 /app/backups

# Устанавливаем владельца
chown -R nodejs:nodejs /app/models /app/logs /app/backups

echo "✅ Права доступа установлены"

# Переключаемся на пользователя nodejs и запускаем основную команду
exec su-exec nodejs "$@"

