# Multi-stage build для оптимизации размера образа
# Используем Debian-based образ для поддержки ONNX Runtime и @xenova/transformers
FROM node:22.15.0-slim AS builder

# Установка зависимостей для сборки
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Копируем package files
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production && npm cache clean --force

# Production образ
FROM node:22.15.0-slim

# Установка необходимых системных зависимостей
# Debian-based образ уже имеет glibc, что необходимо для ONNX Runtime
RUN apt-get update && apt-get install -y \
    postgresql-client \
    tzdata \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && cp /usr/share/zoneinfo/Europe/Moscow /etc/localtime \
    && echo "Europe/Moscow" > /etc/timezone

WORKDIR /app

# Копируем зависимости из builder
COPY --from=builder /app/node_modules ./node_modules

# Копируем исходный код
COPY . .

# Создаем непривилегированного пользователя
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs nodejs

# Создаем директории для логов, бэкапов и моделей с правильными правами
RUN mkdir -p logs models backups/database backups/settings backups/models backups/full backups/exports backups/uploads && \
    chown -R nodejs:nodejs /app && \
    chmod -R 755 /app/logs /app/backups && \
    chmod -R 777 /app/models /app/backups/full /app/backups/database /app/backups/settings /app/backups/models /app/backups/exports /app/backups/uploads

# Копируем entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Устанавливаем entrypoint (выполняется от root, затем переключается на nodejs)
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Переключаемся на root для выполнения entrypoint (он переключится на nodejs)
USER root

# Открываем порт
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Запускаем приложение
CMD ["node", "src/app.js"]

