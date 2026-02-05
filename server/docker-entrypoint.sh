#!/bin/sh
set -e

# Устанавливаем права доступа на папки при старте контейнера
# Это необходимо, так как volumes монтируются с хоста и могут иметь неправильные права
# Этот скрипт должен выполняться от root

echo "🔧 Установка прав доступа на папки..."

# Создаем папки, если их нет
mkdir -p /app/models /app/logs /app/backups/database /app/backups/settings /app/backups/models /app/backups/full /app/backups/exports /app/backups/uploads

# Устанавливаем владельца на весь /app (включая исходный код)
chown -R nodejs:nodejs /app

# Устанавливаем полные права на папку models и все её содержимое (рекурсивно)
chmod -R 777 /app/models

# Устанавливаем права на другие папки
chmod -R 755 /app/logs
chmod -R 777 /app/backups

# Устанавливаем права на исходный код (чтение и выполнение)
chmod -R 755 /app/src
find /app/src -type f -name "*.js" -exec chmod 644 {} \;

echo "✅ Права доступа установлены"

# Переключаемся на пользователя nodejs и запускаем основную команду
# Используем gosu (установлен в Debian) или su-exec (Alpine) или su (fallback)
if command -v gosu >/dev/null 2>&1; then
    # gosu - стандартный инструмент для переключения пользователей в Docker
    exec gosu nodejs "$@"
elif command -v su-exec >/dev/null 2>&1; then
    # su-exec для Alpine
    exec su-exec nodejs "$@"
else
    # fallback на su для Debian (если gosu не установлен)
    exec su -s /bin/sh -c "exec \"\$@\"" nodejs -- "$@"
fi

