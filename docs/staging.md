# Staging + E2E — решётка безопасности, слои 2 и 3

Этот документ описывает, как поднять **staging** (отдельная копия БД и
деплоя для проверок, не трогающая продакшн) и включить **E2E-тесты**
Playwright против него.

Код уже готов:
- Layer 3 — Playwright настроен (`playwright.config.ts`, тесты в `e2e/`,
  workflow `.github/workflows/e2e.yml`). Тесты запускаются против живого URL
  из секрета `STAGING_URL` и **молча пропускаются, пока его нет** — CI не
  краснеет до создания staging.
- Layer 2 — здесь только шаги в аккаунтах Supabase и Vercel. Их может
  выполнить **только владелец аккаунтов** (у ассистента нет к ним доступа).

---

## Деньги

Всё ниже — **бесплатно** на free-тарифах:

| Сервис | Тариф | Стоимость | Нюанс |
|--------|-------|-----------|-------|
| Supabase (staging-проект) | Free | 0 ₽ | Засыпает после ~7 дней простоя, будится при заходе |
| Vercel (staging-деплой) | Hobby | 0 ₽ | Preview-деплои по ветке — бесплатно |
| Playwright | — | 0 ₽ | Браузер ставится в CI бесплатно |

Ничего платить не нужно. Если Supabase не даст создать второй бесплатный
проект (лимит free-тарифа), тогда staging потребует платный план — **в этом
случае остановитесь и спросите**, прежде чем платить.

---

## Шаг 1. Создать staging-проект Supabase

1. https://supabase.com/dashboard → **New project** (то же, что делали для прода).
2. Имя, например `campussystem-staging`. Тариф — **Free**.
3. Дождаться готовности проекта.

## Шаг 2. Залить схему

Вся схема собрана в один файл: **`supabase/staging-bootstrap.sql`**
(63 миграции в правильном порядке; пересобрать — `bash scripts/build-staging-bootstrap.sh`).

1. В новом проекте: **SQL Editor** → New query.
2. Вставить содержимое `supabase/staging-bootstrap.sql` → **Run**.
3. Ожидается «Success». Схема, роли и привилегии создадутся с нуля —
   без дрейфа, который был в проде.

> Файл большой (~360 КБ). Если редактор не примет его целиком — альтернатива:
> Supabase CLI, `supabase link` + `supabase db push` (применит миграции из
> `supabase/migrations`).

## Шаг 3. Взять ключи

Supabase → **Project Settings → API**. Понадобятся (см. `.env.staging.example`):
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon` / `publishable` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` / `secret` key → `SUPABASE_SECRET_KEY`
- Придумать `JWT_SECRET` (случайная строка ≥ 32 символов, `openssl rand -base64 48`)

## Шаг 4. Staging-деплой на Vercel

Проще всего — **отдельный Vercel-проект** на том же репозитории:
1. Vercel → **Add New… → Project** → тот же репозиторий.
2. Production Branch — например `staging` (или ваша ветка проверок).
3. **Environment Variables** — вставить 4 переменные из шага 3.
4. Deploy. URL вида `https://campussystem-staging.vercel.app`.

(Альтернатива без второго проекта — Preview-деплои существующего проекта по
ветке; тогда `STAGING_URL` = URL превью.)

## Шаг 5. Включить E2E в CI

GitHub → репозиторий → **Settings → Secrets and variables → Actions →
New repository secret**:

| Секрет | Значение | Обязателен |
|--------|----------|------------|
| `STAGING_URL` | URL staging-деплоя из шага 4 | да — включает E2E |
| `STAGING_E2E_USER` | email тестового пользователя staging | нет |
| `STAGING_E2E_PASS` | его пароль | нет |

Как только появится `STAGING_URL`, workflow **E2E** начнёт гонять тесты при
каждом push. Без `STAGING_URL` он остаётся зелёным и пропускает тесты.

### Про тестового пользователя

- Тест «неверные данные → ошибка входа» работает **без** пользователя —
  проверяет, что API аутентификации живой.
- Тест «верные данные → вход в кабинет» **пропускается**, пока не заданы
  `STAGING_E2E_USER` / `STAGING_E2E_PASS`. Чтобы включить его, заведите в
  staging пользователя (как в проде, через раздел «Настройки → Пользователи»)
  и пропишите его логин/пароль в эти два секрета.

---

## Как гонять E2E локально

```bash
# против локального dev-сервера
npm run build && npm start          # поднять приложение на :3000
E2E_BASE_URL=http://localhost:3000 npm run test:e2e

# против staging
E2E_BASE_URL=https://campussystem-staging.vercel.app npm run test:e2e
```

В управляемой среде Claude Code браузер предустановлен — путь к нему
передаётся через `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, чтобы Playwright не
скачивал его заново.

---

## Что проверяют E2E (`e2e/`)

| Файл | Проверка | Нужна БД |
|------|----------|----------|
| `login.spec.ts` | форма логина рисуется; кнопка блокируется/разблокируется; защищённый раздел редиректит на `/login` | нет |
| `auth.spec.ts` | неверные данные → ошибка входа; (опц.) верные данные → вход в кабинет | да |
