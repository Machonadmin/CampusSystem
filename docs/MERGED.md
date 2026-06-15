# CampusSystem — Полная документация

> Сводный файл. Актуален на момент последнего обновления docs/.
> Источник правды — отдельные файлы в `docs/`.

---

## README

# Документация CampusSystem

CRM-система образовательного кампуса: работа с лидами, абитуриентами,
студентами, выпускниками, персоналом, а также движок бизнес-процессов и
система задач.

### Карта документации

| Файл | О чём |
|------|-------|
| architecture.md | Стек, структура проекта, деплой, аутентификация |
| permissions.md | Система прав (RBAC): роли, привилегии, scope, middleware |
| workflow-engine.md | Движок процессов: шаблоны, инстансы, переходы, helpers |
| recruitment-template.md | Шаблон процесса «Набор»: подэтапы, финалы, переходы |
| education-module.md | Модуль «Образование»: journey лид → абитуриент → студент |
| db-schema.md | Ключевые таблицы БД и триггеры `updated_at` |
| conventions.md | Соглашения проекта и типичные подводные камни |
| onboarding.md | Запуск проекта и навигация для нового разработчика |

### Кратко о стеке

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **Supabase** (PostgreSQL) как БД, доступ через `@supabase/supabase-js`
- **Vercel** — хостинг и автодеплой
- Аутентификация — JWT в httpOnly-cookie (`jose`)

### Правила проекта

Корневой файл `/CLAUDE.md` содержит обязательные правила работы с кодом
(особенно по Supabase-клиенту и точности отчётов).

> Документация описывает **фактическое** состояние репозитория. Если
> заметишь расхождение между докой и кодом — код является источником правды.

---

## Архитектура

### Технологический стек

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

### Структура проекта

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
  workflow/          # движок процессов
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

### Деплой

- Рабочая ветка: **`claude/bold-brown-TXaZl`**. Пуш → Vercel автодеплой.
- Vercel-сборка строже локального `tsc` — перед пушем всегда `npx tsc --noEmit`.

### Аутентификация

JWT в httpOnly-cookie `campus_session` (HS256, срок жизни 7d).

```ts
interface SessionPayload extends JWTPayload {
  person_id: string
  login_email: string
  full_name: string | null
  roles: string[]
}
```

| Функция | Файл | Назначение |
|---------|------|-----------|
| `signToken` / `verifyToken` | `lib/auth/jwt.ts` | подпись/проверка JWT |
| `getSession()` | `lib/auth/session.ts` | читает cookie → `SessionPayload \| null` |
| `createSession()` / `clearSession()` | `lib/auth/session.ts` | установка/сброс cookie |
| `requireSession()` | `lib/auth/permissions.ts` | бросает `UNAUTHORIZED` |

Поток запроса: middleware перехватывает `/dashboard/:path*` и `/api/:path*`,
проверяет cookie, добавляет `x-person-id`. Публичные пути: `/api/auth/*`, `/login`.

### Доступ к БД

`createServerClient()` (`lib/supabase/server.ts`) — service-role ключ, обходит RLS.
Переменные: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`.

---

## Система прав (RBAC)

### Таблицы

| Таблица | Назначение |
|---------|-----------|
| `roles` | Каталог ролей (`code`, `name`, `category`, `is_system`) |
| `module_privileges` | Каталог привилегий по модулям |
| `role_privileges` | Привилегии роли: `role_id`, `module`, `privilege_code`, `scope` |
| `person_roles` | Назначение ролей человеку |
| `person_privileges` | Точечные оверрайды на человека |

Ролей — **32** (union-тип `RoleCode` в `types/database.ts`; источник правды — таблица `roles`).

### Scope

`role_privileges.scope` ∈ `'all' | 'department' | 'own'`. При нескольких ролях —
максимальный scope (приоритет: `all` > `department` > `own`).

### Middleware: доступ к модулю

Для `/dashboard/<moduleCode>` проверяет `privilege_code = 'access'` в `role_privileges`.
`superadmin` обходит проверку.

### Helpers

**`lib/auth/permissions.ts`:**
```ts
hasRole(code) / hasAnyRole(codes) / isSuperAdmin() / requireSession()
```

**`lib/education/permissions.ts`:**
```ts
hasEducationPrivilege(session, privilege, target?)
canDoEducationInAny(session, privilege)
getEducationPrivilegeScope(session, privilege)
requireEducationPrivilege(privilege, target?)   // throw-версия для API
```

Привилегии кэшируются 30 секунд. `clearPermissionsCache(personId?)` сбрасывает кэш.

### Паттерн `pickPrivilege`

```ts
function pickPrivilege(status: string | null, scope: 'view' | 'manage'): EducationPrivilege {
  if (status === 'lead')      return scope === 'manage' ? 'manage_leads' : 'view_leads'
  if (status === 'applicant') return scope === 'manage' ? 'manage_applicants' : 'view_applicants'
  return scope === 'manage' ? 'manage_students' : 'view_students'
}
```

Использование: `await requireEducationPrivilege(pickPrivilege(eduStatus, 'manage'), target)`.

**Принцип:** каждый API-endpoint обязан проверять права — middleware закрывает только
доступ к модулю целиком, не к конкретным операциям.

---

## Движок процессов (Workflow Engine)

### Таблицы

**Шаблоны:**

| Таблица | Назначение |
|---------|-----------|
| `process_templates` | Шаблон процесса (`code`, `name_ru`, `is_active`) |
| `stage_templates` | Подэтапы шаблона (`code`, `sort_order`, `has_tasks`, `has_action_log`, `is_optional`, `is_addable`) |
| `stage_task_templates` | Шаблоны задач подэтапа (`code`, `title`, `default_assignee_type`, `default_priority`, `default_due_days`) |
| `stage_finals` | Возможные финалы подэтапа (`code`, `name_ru`, `is_positive`, `closes_process`, `process_finish_reason`) |
| `stage_transitions` | Переходы между подэтапами |
| `task_transitions` | Переходы между задачами внутри подэтапа |

**Инстансы:**

| Таблица | Назначение |
|---------|-----------|
| `process_instances` | Запущенный процесс (`journey_id`, `status`, `finish_reason`) |
| `stage_instances` | Состояние подэтапа (`status`, `final_code`, `activated_at`, `completed_at`) |
| `tasks` | Задачи (ссылаются на `stage_instance_id` и `stage_task_template_id`) |
| `stage_actions` | Журнал действий подэтапа |

Статусы `process_instances.status`: `active | completed | cancelled`.
Статусы `stage_instances.status`: `waiting | active | completed | skipped | cancelled`.

### Переходы между подэтапами — `stage_transitions`

- `from_stage_template_id` (NULL = стартовый), `to_stage_template_id`, `trigger_final_code`, `activation_mode`.
- `after_one` — активировать сразу; `after_all` — только когда все предшественники завершены.

### Переходы между задачами — `task_transitions`

Аналогично, но внутри подэтапа. `from_task_code IS NULL` = стартовая задача.
Связь задачи с шаблоном — `tasks.stage_task_template_id`.

### Helpers (`lib/workflow/`)

| Функция | Файл | Что делает |
|---------|------|-----------|
| `startProcess(sb, code, journeyId, actorId)` | `start-process.ts` | Создаёт `process_instance`, все `stage_instances`, стартовые задачи. Идемпотентно. |
| `completeStage(sb, stageInstanceId, finalCode, actorId, resultData?)` | `complete-stage.ts` | Завершает подэтап, проверяет `closes_process`, активирует следующие подэтапы или закрывает процесс. |
| `closeProcessEarly(sb, processInstanceId, finalCode, actorId)` | `close-process-early.ts` | Принудительно закрывает процесс: подэтапы → `skipped`, задачи → `cancelled`. `finalCode` — из финалов последнего подэтапа. |
| `handleTaskCompletion(sb, taskId, actorId)` | `handle-task-completion.ts` | По завершении задачи создаёт следующие задачи по `task_transitions`. |
| `reactivateStage(sb, stageInstanceId, actorId)` | `reactivate-stage.ts` | Возвращает `skipped`-подэтап в `active`, создаёт стартовые задачи. |

Вспомогательные (в `start-process.ts`):
- `mapTaskTemplate(tt, stageInstanceId, actorId, personFullName?)` — шаблон → `TaskInsert`.
  Title: `"<tt.title>: <personFullName>"`, если ФИО известно.
- `createStartingTasks(...)` — создаёт стартовые задачи подэтапа.

> Транзакций нет — при ошибке возможно частичное состояние.

### Закрытие процесса финалом (`closes_process`)

`stage_finals.closes_process = true` + `process_finish_reason` — при таком финале
`completeStage` (шаг 3b) закрывает процесс не через transitions:

1. Оставшиеся `active/waiting` подэтапы → `cancelled`.
2. Незавершённые задачи → `cancelled`.
3. `process_instance.status = 'cancelled'`, `finish_reason = process_finish_reason`.
4. Если `process_finish_reason = 'converted'` → `education_journeys.education_status = 'applicant'`.

> `closeProcessEarly` не подходит для промежуточных подэтапов — он валидирует
> `finalCode` по финалам последнего подэтапа и упадёт ошибкой 400.

### Автоматический перевод `waiting → skipped`

После каждого `completeStage` движок проверяет оставшиеся `waiting`-подэтапы:
если все их предшественники в `completed | skipped` → подэтап помечается `skipped`.
Вернуть в работу: `reactivateStage`.

### Конверсия лида

Финал с `process_finish_reason = 'converted'` (через `closes_process`) или финал
`convert_to_applicant` в обычном потоке переводят:
`education_journeys.education_status = 'applicant'`.

### Флаг `has_tasks`

`stage_templates.has_tasks` должен быть синхронизирован с `stage_task_templates`.
При добавлении первого шаблона задачи: `UPDATE stage_templates SET has_tasks = true`.

### Визуализация

Mermaid-схема через `components/workflow/` (`ProcessGraphModal`, `ProcessInfoBlock`).
Данные: `GET /api/workflow/processes/[processInstanceId]/graph`.

---

## Шаблон процесса «Набор» (recruitment)

- **code:** `recruitment` | **name_ru:** Набор
- Автозапуск при создании лида (`POST /api/education/leads`).

### Подэтапы

| sort | code | Название | has_tasks | is_optional |
|-----:|------|----------|:---------:|:-----------:|
| 10 | `contact` | Контакт | да | нет |
| 20 | `documents` | Документы | да | нет |
| 30 | `event` | Мероприятие | да | да |
| 40 | `decision` | Решение | да | нет |

### Финалы

**Контакт (`contact`):**

| code | Название | is_positive | closes_process | process_finish_reason |
|------|----------|:-----------:|:--------------:|:---------------------:|
| `done_event_yes` | Записан на мероприятие | ✓ | false | — |
| `done_event_skip` | Без мероприятия | ✓ | false | — |
| `rejected` | Отказ | ✗ | **true** | `rejected` |
| `postponed` | Поступление отложено | ✗ | **true** | `postponed` |

**Документы (`documents`):** `all_collected` ✓, `partial` ✓, `not_provided` ✗ — все `closes_process=false`.

**Мероприятие (`event`):** `feedback_received` ✓, `no_show` ✗, `refused` ✗ — все `closes_process=false`.

**Решение (`decision`):**

| code | Название | is_positive | closes_process | process_finish_reason |
|------|----------|:-----------:|:--------------:|:---------------------:|
| `convert_to_applicant` | Перевести в абитуриенты | ✓ | **true** | `converted` |
| `rejected` | Отказ | ✗ | **true** | `rejected` |
| `postponed` | Отложено | ✗ | **true** | `postponed` |

### Переходы между подэтапами

```
(start) ──► contact
contact ──(done_event_yes)──►  documents  [after_one]
contact ──(done_event_skip)──► documents  [after_one]
contact ──(done_event_yes)──►  event      [after_one]
documents ──(all|partial|not_provided)──► decision  [after_all]
event     ──(feedback|no_show|refused)──► decision  [after_all]
```

`rejected`/`postponed` не ведут к следующим подэтапам — закрывают процесс.
`done_event_skip`: Мероприятие остаётся `waiting` → при завершении Документов
становится `skipped` → Решение активируется.

### Задачи

| Подэтап | Задачи | Тип |
|---------|--------|-----|
| `contact` | `first_contact` — Связаться с новым лидом | одна стартовая |
| `documents` | `collect_docs` — Собрать документы; `verify_docs` — Проверить документы | две параллельные (обе от NULL) |
| `event` | `invite_event` → `arrange_trip` → `get_feedback` | три последовательные |
| `decision` | `make_decision` — Принять решение по лиду | одна стартовая |

Title: `"<tt.title>: <person.full_name>"`.

---

## Модуль «Образование»

### Journey: лид → абитуриент → студент

```
lead  ──►  applicant  ──►  student   (→ graduated / expelled / lost / on_leave)
```

Хранится в `education_journeys.education_status`. Переход `lead → applicant` —
финал `convert_to_applicant` (или `closes_process` с `converted`).

### Каскадный селектор направлений

**Учреждение → Направление → Уровень/Курс**:

| Таблица | Поля |
|---------|------|
| `reference_directions` | `department_id`, `name_ru`, `code`, `has_levels`, `sort_order`, `is_active` |
| `reference_levels` | `direction_id`, `name_ru`, `sort_order`, `is_active` |

Учреждения: `departments.is_educational_institution = true`.
Компонент: `components/education/CascadeDirectionSelector.tsx`.

### Интересы лида — `lead_interests`

`person_id`, `direction_id` (каскад), `level_id`, `free_text` (fallback).

### Карточка лида / абитуриента

`app/dashboard/education/leads/[id]/page.tsx` + `components/workflow/ProcessInfoBlock.tsx`:
- подэтапы, финалы, задачи (ссылки на `/dashboard/tasks/[id]`);
- кнопка «▶ Активировать» у `skipped`-подэтапа;
- кнопка «Завершить процесс досрочно»;
- Mermaid-схема.

### Список лидов (вкладка «Набор»)

Колонки: **ФИО** / **Учреждение** / **Направление** / **Телефон** / **Email** /
**Дата подачи** / **Текущий этап и задачи**.

Источник: `GET /api/education/leads?process_status=active|closed|all` (default: `active`).

| process_status | Показывает |
|---------------|-----------|
| `active` | Нет процесса ИЛИ есть активный |
| `closed` | Есть завершённый/отменённый и нет активного |
| `all` | Всех |

Ответ API включает `active_stages_with_tasks: [{ stage_name, tasks[] }]`.

---

## Ключевые таблицы БД

Полные типы — `types/database.ts`. Миграции — `supabase/migrations/`, применяются вручную.

### `persons`

| Поле | Примечание |
|------|-----------|
| `full_name` | **GENERATED ALWAYS** — read-only |
| `phones`, `address` | JSON |
| `education_status` | дублирующая отметка стадии |

### `education_journeys`

`person_id`, `education_status`, `opened_at`, `closed_at`, `application_date`,
`referral_source`, `desired_department_id`, `primary_department_id`, `specialty_id`.

### `lead_interests`

`person_id`, `direction_id`, `level_id`, `free_text`.

### `tasks`

`title`, `description`, `module`, `priority`, `status`, `assignee_type`,
`assignee_id/department_id/position_id`, `creator_id` (NOT NULL), `due_date/due_time/due_all_day`,
`stage_instance_id`, `stage_task_template_id` (для `task_transitions`; NULL — legacy).

### Движок процессов — шаблоны

- `stage_finals` — `stage_template_id`, `code`, `name_ru`, `is_positive`,
  **`closes_process`** (bool, default false), **`process_finish_reason`** (text), `sort_order`.
- `stage_transitions` — `from_stage_template_id` (NULL=старт), `to_stage_template_id`,
  `trigger_final_code`, `activation_mode`.
- `task_transitions` — `stage_template_id`, `from_task_code` (NULL=старт),
  `to_task_code`, `activation_mode`, `sort_order`.

### Справочники направлений

- `reference_directions` — `department_id`, `name_ru`, `code`, `has_levels`, `sort_order`, `is_active`.
- `reference_levels` — `direction_id`, `name_ru`, `sort_order`, `is_active`.
- `departments.is_educational_institution = true` — учебные заведения.

### Триггеры `updated_at`

Одна функция-триггер: **`update_updated_at_column()`**. Итого **31 триггер на 31 таблице**.

Примеры таблиц: `persons`, `tasks`, `communities`, `education_journeys`, `stage_finals`,
`stage_transitions`, `lead_interests`, `stage_templates`, `stage_task_templates`,
`task_transitions`, `process_templates`, `process_instances`, `stage_instances`,
`reference_directions`, `reference_levels`, `departments`, `roles`, `person_accounts`,
`alumni_profiles`, `module_privileges`, `staff_positions`, `staff_profiles`,
`stage_actions`, `task_comments` и др.

Junction- и history-таблицы (`person_roles`, `role_privileges`, `task_watchers`,
`journey_communities`, `person_status_history` и др.) — только `created_at`, без триггера.

---

## Соглашения проекта

### Supabase-клиент

`PostgrestBuilder` не является обычным Promise — нет `.catch()` и `.finally()`.

```ts
// ❌ Ломает Vercel-сборку
await sb.from('tasks').insert(row).catch(() => {})

// ✅ Правильно
const { error } = await sb.from('tasks').insert(row)
```

### `persons.full_name`

**GENERATED ALWAYS** — нельзя указывать в INSERT/UPDATE.

### FK-имена не меняются при переименовании таблицы

`ALTER TABLE ... RENAME TO` не переименовывает FK constraints.
Пример: `applicant_profiles` → `education_journeys`, но FK называется
`applicant_profiles_person_id_fkey`. Embed с неверным именем **молча возвращает `null`**.

```ts
// ❌
.select('persons!education_journeys_person_id_fkey(full_name)')

// ✅ Два отдельных запроса
const { data: journeyRow } = await sb.from('education_journeys')
  .select('person_id').eq('id', journeyId).maybeSingle()
const { data: personRow } = await sb.from('persons')
  .select('full_name').eq('id', journeyRow.person_id).maybeSingle()
```

### `has_tasks` и шаблоны задач

При добавлении `stage_task_templates` нужно вручную выставить
`stage_templates.has_tasks = true` (нет триггера автосинхронизации).

### Embed и `is_positive`

```ts
.select('finals:stage_finals(code, name_ru, is_positive)')
```

### Миграции

Идемпотентны (`ADD COLUMN IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`).
Не переписывай применённые — создавай новые.

### Отчётность

Ошибки и отклонения от спецификации указывать **до слова «готово»**.

---

## Онбординг разработчика

### Запуск

```bash
npm install
npm run dev      # localhost:3000
```

| Команда | Что делает |
|---------|-----------|
| `npm run type-check` | `tsc --noEmit` |
| `npm run seed:workflow-recruitment` | сидинг шаблона «Набор» |

### Переменные окружения

| Переменная | Назначение |
|-----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase |
| `SUPABASE_SECRET_KEY` | service-role ключ |
| `JWT_SECRET` | секрет JWT (мин. 32 символа) |

### Ключевые файлы

1. `lib/auth/jwt.ts`, `lib/auth/session.ts` — сессия
2. `middleware.ts` — защита маршрутов
3. `lib/education/permissions.ts` — права со scope
4. `lib/workflow/` — движок процессов
5. `types/database.ts` — структура БД
6. `components/workflow/ProcessInfoBlock.tsx` — UI процессов

### Доступы

- **Суперадмин:** `oficepresident@gmail.com` — обходит module-guard в middleware.
- Роль `superadmin` — полный доступ без записей в `role_privileges`.

### Рабочий процесс

- Ветка: `claude/bold-brown-TXaZl` → автодеплой Vercel.
- Перед коммитом: `npx tsc --noEmit`.
