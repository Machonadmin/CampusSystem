# Архитектура

## Технологический стек

| Слой | Технология | Версия (package.json) |
|------|-----------|----------------------|
| Фреймворк | Next.js (App Router) | `^14.2.35` |
| Язык | TypeScript | `5.6.3` |
| UI | React | `^18.3.1` |
| Стили | Tailwind CSS | `^4.2.2` |
| БД-клиент | `@supabase/supabase-js` | `^2.103.3` |
| JWT | `jose` | `^6.2.2` |
| Хэши паролей | `bcryptjs` | `^3.0.3` |
| Схемы процессов | `mermaid` | `^11.15.0` |
| Даты | `date-fns`, `react-datepicker` | — |
| Скрипты | `tsx` (dev) | `^4.21.0` |

БД — **Supabase / PostgreSQL**. Хостинг и автодеплой — **Vercel**.

## Структура проекта

```
app/                 # Next.js App Router
  (auth)/            # маршруты логина
  api/               # route handlers (REST)
    auth/  education/  persons/  quality-control/
    references/  settings/  staff/  tasks/  workflow/
  dashboard/         # страницы под авторизацией
    education/  quality-control/  settings/  staff/  tasks/
  layout.tsx  page.tsx  globals.css
lib/
  auth/              # config, jwt, session, password, permissions
  education/         # permissions.ts (education-привилегии)
  workflow/          # движок процессов (см. workflow-engine.md)
  supabase/          # server-клиент
  tasks/  sidebar/  i18n/  geo.ts  module-colors.ts  utils.ts
components/          # React-компоненты (education, workflow, ui, settings…)
types/
  database.ts        # все Row/Insert/Update типы + Database-интерфейс
supabase/
  migrations/        # SQL-миграции (применяются вручную через Dashboard)
scripts/             # seed-скрипты (tsx)
middleware.ts        # авторизация и module-guard
```

## Деплой

- Рабочая ветка разработки: **`claude/bold-brown-TXaZl`**.
- Пуш в ветку → **Vercel** собирает и деплоит автоматически.
- Production-сборка Vercel строже локального `tsc` — перед пушем всегда
  прогоняй `npx tsc --noEmit` (см. [conventions.md](./conventions.md)).

## Аутентификация

Аутентификация построена на JWT в httpOnly-cookie.

- **Cookie:** `campus_session` (имя в `lib/auth/config.ts`).
- **Алгоритм:** HS256, срок жизни `7d`, секрет — `process.env.JWT_SECRET`.
- **Полезная нагрузка** — `SessionPayload` (`lib/auth/jwt.ts`):

```ts
interface SessionPayload extends JWTPayload {
  person_id: string
  login_email: string
  full_name: string | null
  roles: string[]
}
```

### Где что лежит

| Функция | Файл | Назначение |
|---------|------|-----------|
| `signToken` / `verifyToken` | `lib/auth/jwt.ts` | подпись/проверка JWT (`jose`) |
| `getSession()` | `lib/auth/session.ts` | читает cookie → `SessionPayload \| null` |
| `createSession()` / `clearSession()` | `lib/auth/session.ts` | установка/сброс cookie |
| `requireSession()` | `lib/auth/permissions.ts` | бросает `UNAUTHORIZED`, если нет сессии |

### Поток запроса

1. `middleware.ts` перехватывает `/`, `/dashboard/:path*`, `/api/:path*`.
2. Проверяет cookie-токен через `verifyToken`. Нет/невалиден →
   redirect на `/login` (страницы) или `401` (API).
3. Для страниц `/dashboard/<module>` дополнительно проверяет доступ к
   модулю (см. [permissions.md](./permissions.md)).
4. В прошедший запрос добавляется заголовок `x-person-id`.

Публичные пути: `/api/auth/*`, `/login`.

## Доступ к БД

Серверный клиент — `createServerClient()` (`lib/supabase/server.ts`),
использует service-role ключ и **обходит RLS**. Применять только в
доверенном серверном контексте (route handlers, server actions, скрипты),
никогда не отдавать в браузер.

Переменные окружения: `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SECRET_KEY` (fallback — `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
