# Настройка системы авторизации

## Бэкенд

### 1. Установка зависимостей
```bash
cd server
npm install
```

### 2. Настройка переменных окружения
Добавьте в `server/.env`:
```env
USER_PASSWORD=ваш_пароль_здесь
JWT_SECRET=ваш_секретный_ключ_для_jwt_минимум_32_символа
JWT_EXPIRES_IN=7d
```

### 3. Инициализация базы данных
```bash
npm run init-db
```
Это создаст пользователя:
- **Username:** `admin`
- **Full Name:** `Иван Дмитриевич`
- **Password:** из переменной `USER_PASSWORD`

### 4. Тестирование авторизации
```bash
npm run test:auth
```

## Фронтенд

### 1. Установка зависимостей
```bash
cd client
npm install
```

### 2. Запуск приложения
```bash
npm run dev
```

## Использование

### Авторизация
1. Откройте приложение в браузере
2. Вы будете перенаправлены на страницу `/login`
3. Введите:
   - **Имя пользователя:** `admin`
   - **Пароль:** пароль из `USER_PASSWORD`

### API Endpoints

**Авторизация:**
```bash
POST /api/auth/login
Body: { "username": "admin", "password": "ваш_пароль" }
```

**Получение информации о пользователе:**
```bash
GET /api/auth/me
Headers: Authorization: Bearer <token>
```

**Проверка токена:**
```bash
POST /api/auth/verify
Headers: Authorization: Bearer <token>
```

**Выход:**
```bash
POST /api/auth/logout
Headers: Authorization: Bearer <token>
```

## Безопасность

- Токен хранится в куках с флагом `secure` в production
- Токен автоматически добавляется в заголовки всех API запросов
- При ошибке 401 пользователь автоматически перенаправляется на `/login`
- Все защищенные роуты требуют валидный JWT токен

## Защита роутов

Все роуты приложения защищены компонентом `ProtectedRoute`, который:
- Проверяет наличие токена в куках
- Валидирует токен на сервере
- Перенаправляет на `/login` при отсутствии авторизации

