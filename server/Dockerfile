# Multi-stage build для оптимизации размера образа
FROM node:22.15.0-alpine AS builder

# Установка зависимостей для сборки
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Копируем package files
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production && npm cache clean --force

# Production образ
FROM node:22.15.0-alpine

# Установка необходимых системных зависимостей
# Добавляем glibc для onnxruntime-node (требует glibc вместо musl)
# Добавляем su-exec для переключения пользователя
RUN apk add --no-cache \
    postgresql-client \
    gcompat \
    su-exec \
    && rm -rf /var/cache/apk/*

# Альтернативный способ: установка glibc через wget (если gcompat недостаточно)
# RUN apk add --no-cache wget && \
#     wget -q -O /etc/apk/keys/sgerrand.rsa.pub https://alpine-pkgs.sgerrand.com/sgerrand.rsa.pub && \
#     wget https://github.com/sgerrand/alpine-pkg-glibc/releases/download/2.35-r1/glibc-2.35-r1.apk && \
#     apk add --no-cache glibc-2.35-r1.apk && \
#     rm glibc-2.35-r1.apk && \
#     apk del wget

WORKDIR /app

# Копируем зависимости из builder
COPY --from=builder /app/node_modules ./node_modules

# Копируем исходный код
COPY . .

# Создаем непривилегированного пользователя
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

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

