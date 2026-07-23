# Модуль «Выпускники» (Alumni)

Модуль ведёт базу выпускников кампуса. Профиль выпускника
(`alumni_profiles`) наполняется **автоматически** при выпуске студента и
далее дополняется вручную (текущее место, занятость, заметки).

## Модель данных

Таблица `alumni_profiles` (создана в `001_initial_schema.sql`, поля
`created_at`/`updated_at` + триггер добавлены в `20260608190000`):

| Поле                 | Тип       | Источник / правка                                   |
|----------------------|-----------|-----------------------------------------------------|
| `id`                 | uuid PK   | —                                                   |
| `person_id`          | uuid FK   | ключ выпускника (persons)                            |
| `graduation_year`    | integer   | **авто** при выпуске (год из даты перехода)          |
| `institution`        | text      | **авто** при выпуске (`departments.name` primary)    |
| `direction`          | text      | **авто** при выпуске (`specialties.name`)             |
| `current_location`   | text      | правится вручную (alumni.manage)                     |
| `current_occupation` | text      | правится вручную (alumni.manage)                     |
| `notes`              | text      | правится вручную (alumni.manage)                     |

Уникальный индекс `alumni_profiles_person_id_key` на `person_id` добавлен
миграцией `20260705130000_alumni_graduation.sql` — он необходим для
`ON CONFLICT (person_id)` в RPC (в исходной схеме уникальности не было).

## Наполнение при выпуске

Расширён RPC `transition_education_status` (базовый —
`20260705120100`, расширение — `20260705130000`). При переходе студента
в статус `graduated` в той же транзакции выполняется UPSERT в
`alumni_profiles` по `person_id`:

- `graduation_year` = `EXTRACT(YEAR FROM p_effective_date)` (дата выпуска
  обязательна для перехода `graduated`);
- `institution` = имя `primary_department_id` journey (NULL, если нет);
- `direction` = имя `specialty_id` journey (NULL, если нет).

**Идемпотентность.** Повторный выпуск не создаёт дубликата: при конфликте
по `person_id` обновляются **только** `graduation_year`/`institution`/
`direction`. Пользовательские поля `current_location`/`current_occupation`/
`notes` при повторном выпуске **не перезаписываются**.

## API

- `GET /api/alumni` — список выпускников (journeys со статусом
  `graduated`, join к `persons`, дополнение полями `alumni_profiles`).
  Право: `alumni.view`. Фильтр `?search=` (по ФИО/email/учреждению —
  app-side).
- `PATCH /api/alumni/[id]` — обновление профиля выпускника; `[id]` —
  `alumni_profiles.id`. Правятся только `current_location`,
  `current_occupation`, `notes`. Право: `alumni.manage`.

Права проверяются через `lib/alumni/permissions.ts` (тот же паттерн, что
`lib/education/permissions.ts`, но `module='alumni'`, привилегии
`view`/`manage`, кэш 30 c).

## UI

- `/dashboard/alumni` — список выпускников (таблица: ФИО, год выпуска,
  учреждение, направление, занятость, местоположение; поиск; клик по
  строке → карточка).
- `/dashboard/alumni/[id]` (`[id]` = journey id) — карточка выпускника.
  Переиспользует `LeadViewClient` (данные персоны и история статусов —
  **только просмотр**) и добавляет редактируемую панель профиля
  `AlumniProfilePanel` (правка — под `alumni.manage`). Клиентская обёртка
  `AlumniCardClient` резолвит подписи модуля и прокидывает панель через
  новый необязательный проп `extraPanel` / `navContext` компонента
  `LeadViewClient` (поведение карточек «Образования» не изменилось).

## Права и доступ

- В `002_roles_and_privileges.sql` засеян **каталог** `module_privileges`
  для `('alumni','view')` и `('alumni','manage')` — это только список
  привилегий, не выдача ролям.
- **Честное замечание.** При E2E-проверке выяснилось, что на целевой БД
  сид `002` был применён не полностью — каталог `module_privileges` для
  `alumni` там отсутствовал, из-за чего блок выдачи прав ниже находил 0
  строк и не выдавал ничего (403 для всех, включая superadmin). Поэтому
  миграция `20260705130000` теперь **досеивает каталог сама** (блок 3a,
  `INSERT ... ON CONFLICT (module, privilege_code) DO NOTHING`) — так она
  не зависит от того, был ли `002` применён к БД полностью. Тот же дрейф
  сида `002` затрагивает и другие ещё не реализованные модули (`sponsors`
  и т. д.) — это отдельная тема, требующая проверки при их реализации.
- Миграция `20260705130000` выдаёт `role_privileges` `alumni.view` +
  `alumni.manage` (scope `all`) системным ролям `superadmin` /
  `tech_admin` / `campus_president` — по образцу
  `20260511175354_education_privileges.sql`. Без этого гранта ни один
  пользователь (включая superadmin на уровне API) не проходит
  `requireAlumniPrivilege`.
- Привилегию `('alumni','access')` (гейт сайдбара/`middleware`) не сеет ни
  одна миграция. `superadmin` обходит `middleware` и получает
  `accessible_modules = ALL_MODULE_CODES` (`/api/auth/me`), поэтому видит
  и открывает модуль. Прочим ролям для доступа к странице нужно выдать
  `alumni.access` (например, через Настройки → роли).
- Сайдбар: пункт «Выпускники» уже существовал; включён добавлением
  `'alumni'` в `IMPLEMENTED_MODULES` (`lib/module-colors.ts`).

## i18n

Подписи модуля — в `messages/{ru,he,en}.json`: `navigation.alumni` и
namespace `alumni.list.*` / `alumni.card.*` (полный паритет ru/he/en).
Легаси-метка навигации `t.nav.alumni` в `lib/i18n/translations.ts`
использовалась сайдбаром и осталась без изменений.
