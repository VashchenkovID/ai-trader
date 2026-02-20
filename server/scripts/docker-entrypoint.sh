#!/bin/sh

# Entrypoint скрипт для Docker контейнера
# Проверяет, нужно ли инициализировать БД, и запускает инициализацию с --force при первом запуске

set -e

echo "🚀 Запуск сервера..."

# Ждем, пока база данных будет готова
echo "⏳ Ожидание готовности базы данных..."
until node -e "
  const { Sequelize } = require('sequelize');
  const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      dialect: 'postgres',
      logging: false
    }
  );
  sequelize.authenticate().then(() => {
    console.log('✅ База данных готова');
    process.exit(0);
  }).catch(() => {
    process.exit(1);
  });
" 2>/dev/null; do
  echo "   База данных еще не готова, ждем..."
  sleep 2
done

# Проверяем, нужно ли инициализировать БД
echo "🔍 Проверка необходимости инициализации базы данных..."
NEEDS_INIT=false

# Проверяем наличие таблицы settings (первая таблица, которая создается)
if node -e "
  const { Sequelize } = require('sequelize');
  const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      dialect: 'postgres',
      logging: false
    }
  );
  sequelize.query(\"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'settings') as exists;\")
    .then(([results]) => {
      const exists = results[0]?.exists === true || results[0]?.exists === 't';
      process.exit(exists ? 0 : 1);
    })
    .catch(() => process.exit(1));
" 2>/dev/null; then
  echo "✅ База данных уже инициализирована"
  NEEDS_INIT=false
else
  echo "📦 База данных не инициализирована, требуется инициализация"
  NEEDS_INIT=true
fi

# Если нужно инициализировать, запускаем с --force
if [ "$NEEDS_INIT" = "true" ]; then
  echo "🔄 Запуск инициализации базы данных с флагом --force..."
  npm run init-db:force || {
    echo "❌ Ошибка при инициализации базы данных"
    exit 1
  }
  echo "✅ Инициализация базы данных завершена"
fi

# Запускаем основной сервер
echo "🚀 Запуск основного сервера..."
exec "$@"

