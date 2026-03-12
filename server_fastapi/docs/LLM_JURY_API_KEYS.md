# API-ключи для LLM-жюри

В контуре LLM-жюри используются четыре провайдера. Ниже — где зарегистрироваться, как получить ключи и какие переменные окружения прописать в `.env` (в корне `server_fastapi/` или в окружении процесса).

---

## DeepSeek

| Поле | Значение |
|------|----------|
| **Регистрация** | [platform.deepseek.com](https://platform.deepseek.com) |
| **Как получить ключ** | Войти в аккаунт → раздел **API Keys** → Create API Key. Скопировать ключ (показывается один раз). |
| **Переменная окружения** | `DEEPSEEK_API_KEY` |
| **Документация** | [api-docs.deepseek.com](https://api-docs.deepseek.com) |
| **Заметки** | Модель по умолчанию: `deepseek-chat`. Тарификация по токенам. |

**В `.env`:**
```env
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
```

---

## Perplexity

| Поле | Значение |
|------|----------|
| **Регистрация** | [perplexity.ai](https://www.perplexity.ai) |
| **Как получить ключ** | Для разработчиков: [docs.perplexity.ai](https://docs.perplexity.ai) → раздел **API** / **Get API key** → регистрация и создание ключа. |
| **Переменная окружения** | `PERPLEXITY_API_KEY` |
| **Документация** | [docs.perplexity.ai](https://docs.perplexity.ai) |
| **Заметки** | Модель по умолчанию: `sonar`. Тарификация по запросам. |

**В `.env`:**
```env
PERPLEXITY_API_KEY=pplx-xxxxxxxxxxxxxxxx
```

---

## Giga Chat (Сбер)

| Поле | Значение |
|------|----------|
| **Регистрация** | [developers.sber.ru/studio](https://developers.sber.ru/studio) |
| **Как получить ключи** | Войти (или зарегистрироваться) → **Создать приложение** → в карточке приложения скопировать **Client ID** и **Client Secret**. |
| **Переменные окружения** | `GIGACHAT_CLIENT_ID`, `GIGACHAT_CLIENT_SECRET`; опционально `GIGACHAT_SCOPE` |
| **Документация** | [developers.sber.ru](https://developers.sber.ru) — раздел GigaChat API |
| **Заметки** | OAuth2; по умолчанию используется scope `GIGACHAT_API_PERS` (персональный). Для корпоративного — `GIGACHAT_API_CORP`. В провайдере по умолчанию `ssl_verify=False` (официальная рекомендация Giga Chat). |

**В `.env`:**
```env
GIGACHAT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
GIGACHAT_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# опционально:
# GIGACHAT_SCOPE=GIGACHAT_API_PERS
```

---

## Алиса GPT (YandexGPT)

| Поле | Значение |
|------|----------|
| **Регистрация** | [console.cloud.yandex.ru](https://console.cloud.yandex.ru) |
| **Как получить ключ и folder_id** | 1) Создать или выбрать **каталог** (Folder) → скопировать **ID каталога** в `YANDEX_FOLDER_ID`. 2) Включить сервис **Yandex GPT** в каталоге. 3) Создать **API-ключ** (Сервисные аккаунты → создать ключ) или использовать **IAM-токен** (в CLI: `yc iam create-token`). |
| **Переменные окружения** | `YANDEX_API_KEY` **или** `YANDEX_IAM_TOKEN`; обязательно `YANDEX_FOLDER_ID` |
| **Документация** | [cloud.yandex.ru/docs/yandexgpt](https://cloud.yandex.ru/docs/yandexgpt) |
| **Заметки** | Модель по умолчанию: `yandexgpt-lite`. API-ключ не истекает; IAM-токен — ограниченное время жизни. |

**В `.env`:**
```env
YANDEX_FOLDER_ID=b1gxxxxxxxxxxxxxxxx
YANDEX_API_KEY=AQVNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# либо вместо API_KEY (временно):
# YANDEX_IAM_TOKEN=t1.9eu...
```

---

## Проверка

- Если переменная для провайдера не задана или пустая, провайдер при вызове жюри возвращает нейтральное мнение (HOLD, confidence 0.5) без запроса к API.
- Для тестов без ключей используется **Mock**-провайдер (`training.llm_jury.providers.mock.MockLLMProvider`).

Подробнее о модулях жюри и переменных: [training/README.md](../training/README.md) (раздел LLM-жюри).
