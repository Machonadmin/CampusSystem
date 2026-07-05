# Онбординг разработчика

Гайд для быстрого старта в проекте CampusSystem.

## Запуск локально

```bash
npm install          # установка зависимостей
npm run dev          # дев-сервер Next.js (по умолчанию http://localhost:3000)
```

Полезные скрипты (`package.json`):

| Команда | Что делает |
|---------|-----------|
| `npm run dev` | дев-сервер |
| `npm run build` | production-сборка |
| `npm run start` | запуск собранного приложения |
| `npm run lint` | ESLint |
| `npm run type-check` | `tsc --noEmit` |
| `npm run seed:workflow-recruitment` | сидинг шаблона «Набор» |

## Переменные окружения

Минимальный набор (используется в `lib/supabase/server.ts`,
`lib/auth/config.ts`, `middleware.ts`):

| Переменная | Назначение |
|-----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL проекта Supabase |
| `SUPABASE_SECRET_KEY` | service-role ключ (fallback — `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
| `JWT_SECRET` | секрет для подписи JWT (мин. 32 символа) |

> Без `JWT_SECRET` используется небезопасный дефолт из `config.ts` —
> только для локальной разработки.

## Где что искать

```
app/        — страницы (dashboard/*) и API (api/*)
lib/auth/   — аутентификация и сессии
lib/workflow/ — тип StartProcessResult + read-only UI-helper (сам движок — RPC в supabase/migrations/)
lib/education/ — права education-модуля
types/database.ts — типы всех таблиц
supabase/migrations/ — SQL-миграции (включая RPC движка процессов)
scripts/    — seed-скрипты
middleware.ts — авторизация и доступ к модулям
```

## Ключевые файлы для понимания

Прочитать в таком порядке:

1. **`lib/auth/jwt.ts`, `lib/auth/session.ts`** — как устроена сессия
   (`SessionPayload`, cookie `campus_session`).
2. **`middleware.ts`** — как защищены маршруты и модули.
3. **`lib/education/permissions.ts`** — модель прав со scope.
4. **[workflow-engine.md](./workflow-engine.md)** + RPC-функции в
   `supabase/migrations/` (`start_process`, `complete_stage`,
   `close_process_early`, `handle_task_completion`, `reactivate_stage`) —
   движок процессов.
5. **`types/database.ts`** — структура БД.
6. **`components/workflow/ProcessInfoBlock.tsx`** — как процессы
   показываются в UI.

Связанная документация: [architecture.md](./architecture.md),
[permissions.md](./permissions.md),
[workflow-engine.md](./workflow-engine.md), [db-schema.md](./db-schema.md),
[conventions.md](./conventions.md).

## Доступы и тестовые данные

- **Суперадмин:** `oficepresident@gmail.com` — обходит проверки модулей в
  middleware. Создание суперадмина — миграция
  `005_create_superadmin.sql`.
- Роль `superadmin` даёт полный доступ ко всем модулям без записей в
  `role_privileges`.

> **TODO: уточнить у разработчика** актуальные пароли тестовых аккаунтов и
> наличие/состав тестовых лидов в БД — в репозитории эти данные не
> зафиксированы (живут только в самой базе Supabase).

## Рабочий процесс

- Разработка ведётся в ветке **`claude/bold-brown-TXaZl`**; пуш →
  автодеплой на Vercel.
- Перед коммитом: `npx tsc --noEmit` (Vercel-сборка строже локального
  `tsc`).
- Соблюдай правила из [conventions.md](./conventions.md) и
  корневого [`/CLAUDE.md`](../CLAUDE.md) (особенно по Supabase-клиенту).
