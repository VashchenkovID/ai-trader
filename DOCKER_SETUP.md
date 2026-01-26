# Docker Setup Guide

Руководство по развертыванию приложения с использованием Docker и Docker Compose.

## 📋 Требования

- Docker 20.10+
- Docker Compose 2.0+
- Node.js 22.15.0+ (для локальной разработки)
- Минимум 4GB RAM
- Минимум 10GB свободного места на диске

## 🚀 Быстрый старт

### 1. Подготовка переменных окружения

Создайте файл `.env` в корне проекта на основе `server/env.example`:

```bash
cp server/env.example .env
```

**Обязательно установите следующие переменные:**

```env
# База данных
DB_PASSWORD=your_secure_password_here
DB_NAME=smart_exchange
DB_USER=postgres

# Безопасность (ОБЯЗАТЕЛЬНО!)
JWT_SECRET=your_jwt_secret_minimum_32_characters_long
# Для генерации: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Фронтенд URL (для CORS)
# Для продакшена используйте:
FRONTEND_URL=https://vashchenkovaitrader.ru,https://www.vashchenkovaitrader.ru,http://vashchenkovaitrader.ru,http://www.vashchenkovaitrader.ru
# Для разработки:
# FRONTEND_URL=http://localhost:3000

# Тинькофф API (опционально, но рекомендуется)
TINKOFF_TOKEN=your_tinkoff_token
TINKOFF_ACCOUNT_ID=your_account_id
```

### 2. Запуск приложения

```bash
# Сборка и запуск всех сервисов
docker-compose up -d

# Просмотр логов
docker-compose logs -f

# Остановка
docker-compose down
```

### 3. Инициализация базы данных

После первого запуска нужно инициализировать БД:

```bash
# Выполнение миграций и создание пользователя
docker-compose exec server npm run init-db
```

## 📦 Структура сервисов

### PostgreSQL (postgres)
- **Порт:** 5432
- **База данных:** `smart_exchange` (или из переменной `DB_NAME`)
- **Данные:** Сохраняются в volume `postgres_data`

### Backend Server (server)
- **Порт:** 3001
- **Health Check:** `http://localhost:3001/health`
- **Логи:** `./server/logs`
- **Бэкапы:** `./server/backups`

### Frontend Client (client)
- **Порт:** 80 (или из переменной `CLIENT_PORT`)
- **Nginx:** Статические файлы + проксирование API
- **Health Check:** `http://localhost/health`

## 🔧 Команды управления

### Основные команды

```bash
# Запуск в фоновом режиме
docker-compose up -d

# Запуск с пересборкой
docker-compose up -d --build

# Остановка
docker-compose down

# Остановка с удалением volumes (ОСТОРОЖНО: удалит данные БД!)
docker-compose down -v

# Просмотр логов
docker-compose logs -f

# Просмотр логов конкретного сервиса
docker-compose logs -f server
docker-compose logs -f client
docker-compose logs -f postgres

# Перезапуск сервиса
docker-compose restart server

# Выполнение команды в контейнере
docker-compose exec server npm run init-db
docker-compose exec server npm run test
```

### Управление базой данных

```bash
# Подключение к PostgreSQL
docker-compose exec postgres psql -U postgres -d smart_exchange

# Создание бэкапа БД
docker-compose exec server npm run test:backup

# Восстановление БД (через API или напрямую)
docker-compose exec postgres pg_restore -U postgres -d smart_exchange < backup.sql
```

## 🔒 Безопасность

### Production настройки

1. **Обязательно измените все секреты:**
   - `JWT_SECRET` - минимум 32 символа
   - `DB_PASSWORD` - надежный пароль
   - Все API токены

2. **Настройте CORS:**
   ```env
   FRONTEND_URL=https://yourdomain.com
   ```

3. **Используйте HTTPS:**
   - Настройте reverse proxy (nginx/traefik) перед Docker
   - Или используйте Let's Encrypt с certbot

4. **Ограничьте доступ к портам:**
   - В продакшене не открывайте порты напрямую
   - Используйте только nginx на порту 80/443

## 🌐 Настройка Nginx (опционально)

Если вы хотите использовать внешний nginx вместо встроенного в клиенте:

### Пример конфигурации nginx.conf

```nginx
upstream backend {
    server server:3001;
}

server {
    listen 80;
    server_name yourdomain.com;

    # Frontend
    location / {
        proxy_pass http://client:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Backend API
    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /ws {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

## 📊 Мониторинг

### Health Checks

Все сервисы имеют встроенные health checks:

```bash
# Проверка статуса
docker-compose ps

# Детальная информация
docker inspect ai-trader-server | grep -A 10 Health
```

### Логи

```bash
# Все логи
docker-compose logs

# Последние 100 строк
docker-compose logs --tail=100

# Логи с временными метками
docker-compose logs -t
```

## 🔄 Обновление приложения

```bash
# 1. Остановить контейнеры
docker-compose down

# 2. Обновить код (git pull)

# 3. Пересобрать и запустить
docker-compose up -d --build

# 4. Выполнить миграции (если есть)
docker-compose exec server npm run init-db
```

## 🐛 Troubleshooting

### Проблема: Контейнер не запускается

```bash
# Проверьте логи
docker-compose logs server

# Проверьте переменные окружения
docker-compose config

# Проверьте статус контейнеров
docker-compose ps
```

### Проблема: База данных не подключается

```bash
# Проверьте, что postgres запущен
docker-compose ps postgres

# Проверьте логи postgres
docker-compose logs postgres

# Проверьте переменные окружения БД
docker-compose exec server env | grep DB_
```

### Проблема: Frontend не загружается

```bash
# Проверьте логи nginx
docker-compose logs client

# Проверьте, что клиент собран
docker-compose exec client ls -la /usr/share/nginx/html

# Пересоберите клиент
docker-compose up -d --build client
```

### Проблема: Порт уже занят

Измените порты в `docker-compose.yml`:

```yaml
ports:
  - "3002:3001"  # Вместо 3001:3001
```

## 📝 Дополнительные настройки

### Увеличение лимитов памяти

В `docker-compose.yml` добавьте:

```yaml
services:
  server:
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G
```

### Автоматический перезапуск

Все сервисы настроены на `restart: unless-stopped`. Для других политик:

```yaml
restart: always  # Всегда перезапускать
restart: on-failure  # Только при ошибках
restart: no  # Не перезапускать
```

## 🔐 Production Checklist

- [ ] Все секреты изменены (JWT_SECRET, DB_PASSWORD)
- [ ] FRONTEND_URL настроен на реальный домен
- [ ] NODE_ENV=production установлен
- [ ] HTTPS настроен (через reverse proxy или certbot)
- [ ] Firewall настроен (открыты только необходимые порты)
- [ ] Регулярные бэкапы БД настроены
- [ ] Мониторинг настроен
- [ ] Логи ротируются
- [ ] Health checks работают

## 📚 Полезные ссылки

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Nginx Documentation](https://nginx.org/en/docs/)

