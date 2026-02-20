#!/bin/bash

# Скрипт для инициализации базы данных в Docker контейнере
# Использование:
#   ./docker-init-db.sh          - обычная инициализация
#   ./docker-init-db.sh --force   - принудительная инициализация (удаляет все таблицы)

set -e

FORCE_FLAG=""
if [ "$1" == "--force" ] || [ "$1" == "-f" ]; then
    FORCE_FLAG="--force"
    echo "⚠️  ВНИМАНИЕ: Будет выполнена принудительная инициализация (все таблицы будут удалены)"
fi

echo "🐳 Инициализация базы данных в Docker контейнере..."
echo ""

# Проверяем, запущены ли контейнеры
if ! docker-compose ps | grep -q "ai-trader-server.*Up"; then
    echo "📦 Запускаем контейнеры..."
    docker-compose up -d
    
    echo "⏳ Ожидаем готовности сервера..."
    sleep 10
fi

# Проверяем, что контейнер запущен
if ! docker-compose ps | grep -q "ai-trader-server.*Up"; then
    echo "❌ Ошибка: контейнер ai-trader-server не запущен"
    exit 1
fi

echo "✅ Контейнер запущен"
echo "🔄 Выполняем инициализацию базы данных..."
echo ""

# Запускаем инициализацию
if [ -n "$FORCE_FLAG" ]; then
    docker-compose exec -T server npm run init-db:force
else
    docker-compose exec -T server npm run init-db
fi

echo ""
echo "✅ Инициализация завершена!"

