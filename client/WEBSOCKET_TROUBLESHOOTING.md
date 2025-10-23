# 🔧 Диагностика WebSocket соединения

## 🚨 Проблема: "WebSocket connection failed: Insufficient resources"

### ✅ Быстрое решение:

1. **Убедитесь, что сервер запущен:**
   ```bash
   cd server
   npm start
   ```

2. **Проверьте, что сервер работает на порту 3001:**
   ```bash
   curl http://localhost:3001/health
   ```

3. **Перезапустите клиент:**
   ```bash
   cd client
   npm run dev
   ```

## 🔍 Диагностика

### 1. Проверка сервера

```bash
# Проверка статуса сервера
curl http://localhost:3001/health

# Ожидаемый ответ:
# {"status":"OK","timestamp":"...","uptime":...}
```

### 2. Проверка WebSocket в браузере

Откройте консоль разработчика (F12) и выполните:

```javascript
// Тест WebSocket соединения
const ws = new WebSocket('ws://localhost:3001/');
ws.onopen = () => console.log('✅ WebSocket подключен');
ws.onerror = (error) => console.error('❌ Ошибка WebSocket:', error);
ws.onclose = (event) => console.log('🔌 WebSocket закрыт:', event.code, event.reason);
```

### 3. Проверка портов

```bash
# Windows
netstat -an | findstr :3001

# Linux/Mac
netstat -an | grep :3001
```

## 🛠️ Возможные причины и решения

### 1. Сервер не запущен
**Симптомы:** Ошибка "Connection refused"
**Решение:** Запустите сервер командой `npm start` в папке server

### 2. Неправильный порт
**Симптомы:** Ошибка "Insufficient resources"
**Решение:** Убедитесь, что сервер работает на порту 3001, а не 3000

### 3. Блокировка файрволом
**Симптомы:** Таймаут соединения
**Решение:** Проверьте настройки файрвола Windows/антивируса

### 4. CORS проблемы
**Симптомы:** Ошибки в консоли браузера
**Решение:** Убедитесь, что CORS настроен правильно в server/src/app.js

### 5. Множественные соединения
**Симптомы:** Ошибка "Insufficient resources"
**Решение:** Закройте все вкладки браузера и перезапустите клиент

## 🔧 Настройка для разработки

### 1. Переменные окружения

Создайте файл `client/.env.local`:
```bash
REACT_APP_WS_URL=ws://localhost:3001/
REACT_APP_API_URL=http://localhost:3001
```

### 2. Настройка Vite

В `client/vite.config.ts` добавьте:
```typescript
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true
      }
    }
  }
})
```

## 📊 Мониторинг соединения

### 1. Логи сервера
```bash
# В терминале сервера должны быть сообщения:
# ✅ WebSocket service initialized
# New WebSocket client connected
```

### 2. Логи клиента
```javascript
// В консоли браузера должны быть сообщения:
// ✅ Server is available, connecting WebSocket...
// 🔌 WebSocket connected to: ws://localhost:3001/
```

## 🚀 Автоматическое восстановление

Система автоматически:
- Проверяет доступность сервера перед подключением
- Переподключается при разрыве соединения
- Показывает понятные сообщения об ошибках

## 📞 Если ничего не помогает

1. **Полный перезапуск:**
   ```bash
   # Остановите все процессы
   # Запустите сервер
   cd server && npm start
   
   # В новом терминале запустите клиент
   cd client && npm run dev
   ```

2. **Очистка кеша:**
   ```bash
   # Очистите кеш браузера (Ctrl+Shift+R)
   # Или откройте в режиме инкогнито
   ```

3. **Проверка версий:**
   ```bash
   node --version
   npm --version
   ```

## 🎯 Ожидаемое поведение

При правильной настройке вы должны увидеть:

1. **В терминале сервера:**
   ```
   🚀 Server running on port 3001
   ✅ WebSocket service initialized
   New WebSocket client connected
   ```

2. **В консоли браузера:**
   ```
   ✅ Server is available, connecting WebSocket...
   🔌 WebSocket connected to: ws://localhost:3001/
   ```

3. **В интерфейсе:**
   - Статус "Подключено" в правом верхнем углу
   - Данные обновляются в реальном времени
   - Нет ошибок в консоли
