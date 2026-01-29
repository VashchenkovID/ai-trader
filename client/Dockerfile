# Multi-stage build для оптимизации
FROM node:22.15.0-alpine AS builder

WORKDIR /app

# Копируем package files
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci && npm cache clean --force

# Копируем исходный код
COPY . .

# Собираем приложение для production
# Используем NODE_ENV=production для оптимизаций
ENV NODE_ENV=production

# Собираем приложение
RUN npm run build

# Production образ с nginx
FROM nginx:alpine

# Копируем собранное приложение
COPY --from=builder /app/dist /usr/share/nginx/html

# Копируем конфигурацию nginx из контекста сборки
COPY --from=builder /app/nginx.conf /etc/nginx/conf.d/default.conf

# Открываем порты
EXPOSE 80 443

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Запускаем nginx
CMD ["nginx", "-g", "daemon off;"]

