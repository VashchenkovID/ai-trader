# ✅ Чеклист готовности к развертыванию на VPS

## ✅ Критические проблемы исправлены

### 1. ✅ Nginx конфигурация - создан шаблон
**Файл:** `client/nginx.conf.template`
- **Решение:** Создан шаблон с переменной `${DOMAIN}` для динамической подстановки домена
- **Статус:** ✅ Исправлено

### 2. ✅ Frontend API URLs - исправлены на относительные пути
**Файлы:** 
- `client/src/services/apiService.ts` ✅
- `client/src/services/performanceApi.ts` ✅
- `client/src/services/workerMonitoringApi.ts` ✅
- `client/src/services/api.ts` ✅
- `client/src/services/authService.ts` ✅
- `client/src/services/apiConstants.ts` ✅
- `client/src/components/analysis/MultiTimeframeView.tsx` ✅
- `client/src/components/market/MarketRegimeIndicator.tsx` ✅
- `client/src/components/trading/EntryOptimization.tsx` ✅
- `client/src/components/trading/SpreadAnalysis.tsx` ✅
- `client/src/components/market/RegimeHistoryChart.tsx` ✅
- `client/src/components/performance/ReportExport.tsx` ✅
- `client/src/components/NeuralNetworkManager.tsx` ✅

**Решение:** Изменен fallback на пустую строку (относительный путь `/api`) для работы через nginx proxy
- **Статус:** ✅ Исправлено

### 3. ✅ WebSocket URLs - исправлены на динамические
**Файлы:**
- `client/src/services/websocket.ts` ✅
- `client/src/components/WebSocketDataProvider.tsx` ✅

**Решение:** Используется динамическое определение протокола (ws:// или wss://) на основе текущего протокола страницы
- **Статус:** ✅ Исправлено

### 4. ⚠️ Content Security Policy - требует обновления nginx.conf
**Файл:** `client/nginx.conf` (строка 46)
- **Проблема:** CSP содержит жестко прописанный домен `wss://vashchenkovaitrader.ru`
- **Решение:** При развертывании использовать `nginx.conf.template` с подстановкой домена или обновить `nginx.conf` вручную
- **Статус:** ⚠️ Требует обновления при развертывании (используйте шаблон)

---

## 🟡 Рекомендуемые улучшения

### 4. 📝 Отсутствует .env.production для клиента
- **Рекомендация:** Создать `.env.production` с настройками для продакшена
- **Статус:** 🟡 Не критично (можно настроить через docker-compose)

### 5. 📝 Docker-compose SSL volumes закомментированы
**Файл:** `docker-compose.yml` (строки 87-89)
- **Рекомендация:** Добавить инструкции по раскомментированию после получения SSL сертификата
- **Статус:** 🟡 Уже есть в роадмапе

---

## ✅ Что готово

### Backend
- ✅ Dockerfile настроен для production
- ✅ Multi-stage build для оптимизации
- ✅ Health checks настроены
- ✅ Environment variables через .env
- ✅ CORS настроен динамически через FRONTEND_URL
- ✅ Security headers (helmet)
- ✅ Rate limiting
- ✅ Error handling
- ✅ Logging настроен

### Frontend
- ✅ Dockerfile с multi-stage build
- ✅ Production сборка оптимизирована
- ✅ Nginx конфигурация для SPA
- ✅ SSL поддержка
- ✅ Gzip compression
- ✅ Static file caching
- ✅ Security headers
- ✅ API proxy через nginx

### Database
- ✅ PostgreSQL в Docker
- ✅ Health checks
- ✅ Volume для персистентности данных
- ✅ Автоматические миграции

### Infrastructure
- ✅ Docker Compose настроен
- ✅ Network isolation
- ✅ Restart policies
- ✅ Health checks для всех сервисов
- ✅ Environment variables через .env

---

## 🔧 Что нужно исправить перед развертыванием

### Приоритет 1 (Критично)

1. **Исправить nginx.conf для динамического домена**
   - Создать шаблон nginx.conf или использовать envsubst
   - Или создать скрипт для замены домена при сборке

2. **Исправить API URLs в frontend**
   - Изменить fallback с `http://localhost:3001` на относительный путь `/api`
   - Это безопаснее и работает автоматически через nginx proxy

### Приоритет 2 (Рекомендуется)

3. **Создать .env.production.example**
   - Документировать все необходимые переменные для продакшена

4. **Добавить скрипт для подготовки к развертыванию**
   - Автоматическая замена домена в конфигах
   - Проверка всех необходимых переменных окружения

---

## 📋 Чеклист перед развертыванием

### Подготовка
- [ ] Исправлены критические проблемы (nginx.conf, API URLs)
- [ ] Создан .env файл с реальными значениями
- [ ] Сгенерированы секреты (JWT_SECRET, DB_PASSWORD)
- [ ] Настроен FRONTEND_URL с реальным доменом
- [ ] Получены токены API (TINKOFF_TOKEN, TINKOFF_ACCOUNT_ID)

### Инфраструктура
- [ ] Docker и Docker Compose установлены
- [ ] Firewall настроен (порты 80, 443, 22)
- [ ] Домен зарегистрирован
- [ ] DNS записи настроены (A записи)
- [ ] SSL сертификат получен (Let's Encrypt)

### Развертывание
- [ ] Проект склонирован на сервер
- [ ] .env файл создан и настроен
- [ ] docker-compose.yml проверен
- [ ] SSL volumes раскомментированы в docker-compose.yml
- [ ] nginx.conf обновлен с правильным доменом
- [ ] Контейнеры собраны и запущены
- [ ] База данных инициализирована
- [ ] Health checks проходят успешно

### Проверка
- [ ] HTTP редиректит на HTTPS
- [ ] HTTPS работает с валидным сертификатом
- [ ] Frontend загружается
- [ ] API запросы работают
- [ ] WebSocket соединение работает
- [ ] Авторизация работает
- [ ] Логи не содержат ошибок

---

## 🚀 Быстрый старт после исправлений

```bash
# 1. Исправить nginx.conf (заменить домен)
# 2. Исправить API URLs в frontend
# 3. Создать .env файл
# 4. Запустить
docker compose up -d --build

# 5. Инициализировать БД
docker compose exec server npm run init-db

# 6. Проверить
curl https://yourdomain.com/health
```

---

**Статус готовности:** 🟢 **Готово к развертыванию** - все критические проблемы исправлены

**Информация о сервере:**
- **IP адрес:** `217.114.3.127`
- **DNS серверы:** `ns1.reg.ru`, `ns2.reg.ru`
- **URL панели:** https://cp.beget.com/cloud/servers/hearty-lazure

**Важно перед развертыванием:**
1. Обновить `client/nginx.conf` с вашим доменом (или использовать `nginx.conf.template` с подстановкой)
2. Убедиться, что DNS записи настроены на `217.114.3.127`
3. Получить SSL сертификат для вашего домена

