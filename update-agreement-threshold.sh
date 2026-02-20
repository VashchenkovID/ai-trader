#!/bin/bash

# Скрипт для обновления порога согласованности в БД на VPS сервере
# Использование: ./update-agreement-threshold.sh [новое_значение]
# По умолчанию: 0.6
# 
# Примеры:
#   ./update-agreement-threshold.sh          # Установит 0.6
#   ./update-agreement-threshold.sh 0.65     # Установит 0.65
#   ./update-agreement-threshold.sh 0.7      # Установит 0.7

NEW_VALUE=${1:-0.6}

# Валидация значения (должно быть между 0 и 1)
if ! echo "$NEW_VALUE" | grep -qE '^0\.[0-9]+$|^1\.0$'; then
    echo "❌ Ошибка: значение должно быть между 0.0 и 1.0 (например: 0.6, 0.65, 0.7)"
    exit 1
fi

echo "🔄 Обновление порога согласованности в БД..."
echo "   Новое значение: $NEW_VALUE ($(echo "$NEW_VALUE * 100" | bc | cut -d. -f1)%)"

# Получаем имя контейнера БД
DB_CONTAINER="ai-trader-db"

# Проверяем, запущен ли контейнер
if ! docker ps --format "{{.Names}}" | grep -q "^${DB_CONTAINER}$"; then
    echo "❌ Контейнер $DB_CONTAINER не запущен!"
    echo "   Попробуйте: docker ps | grep $DB_CONTAINER"
    exit 1
fi

echo "✅ Контейнер $DB_CONTAINER найден"

# Получаем переменные окружения из контейнера
DB_NAME=$(docker exec $DB_CONTAINER printenv POSTGRES_DB 2>/dev/null || echo "smart_exchange")
DB_USER=$(docker exec $DB_CONTAINER printenv POSTGRES_USER 2>/dev/null || echo "postgres")

echo "   База данных: $DB_NAME"
echo "   Пользователь: $DB_USER"

# Проверяем, существует ли настройка
echo ""
echo "📋 Проверка текущего значения..."
CURRENT_VALUE=$(docker exec $DB_CONTAINER psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT value FROM settings WHERE key = 'auto_trade_min_agreement';" 2>/dev/null | xargs)

if [ -z "$CURRENT_VALUE" ]; then
    echo "⚠️  Настройка 'auto_trade_min_agreement' не найдена в БД"
    echo "   Создаем новую настройку..."
    
    # Создаем настройку, если её нет
    docker exec -i $DB_CONTAINER psql -U "$DB_USER" -d "$DB_NAME" <<EOF
INSERT INTO settings (key, value, description, category, "dataType")
VALUES (
    'auto_trade_min_agreement',
    '$NEW_VALUE',
    'Минимальная согласованность моделей для автоматического создания заявок (0.0-1.0)',
    'trading',
    'number'
)
ON CONFLICT (key) DO UPDATE SET value = '$NEW_VALUE';
EOF
else
    echo "   Текущее значение: $CURRENT_VALUE"
    echo ""
    echo "🔄 Обновление значения..."
    
    # Обновляем существующую настройку
    docker exec -i $DB_CONTAINER psql -U "$DB_USER" -d "$DB_NAME" <<EOF
UPDATE settings 
SET value = '$NEW_VALUE',
    updated_at = NOW()
WHERE key = 'auto_trade_min_agreement';
EOF
fi

# Проверяем результат
echo ""
echo "📊 Проверка результата..."
RESULT=$(docker exec $DB_CONTAINER psql -U "$DB_USER" -d "$DB_NAME" -t -A -F " | " -c "SELECT key, value, description FROM settings WHERE key = 'auto_trade_min_agreement';" 2>/dev/null)

if [ $? -eq 0 ] && [ -n "$RESULT" ]; then
    echo "✅ Порог согласованности успешно обновлен!"
    echo ""
    echo "Результат:"
    echo "$RESULT" | while IFS='|' read -r key value description; do
        echo "   Ключ: $key"
        echo "   Значение: $value ($(echo "$value * 100" | bc | cut -d. -f1)%)"
        echo "   Описание: $description"
    done
    echo ""
    echo "💡 Изменения вступят в силу при следующей проверке автоторговли"
    echo "   Перезапуск сервера не требуется"
else
    echo "❌ Ошибка при обновлении порога согласованности"
    echo "   Проверьте логи: docker logs $DB_CONTAINER"
    exit 1
fi

