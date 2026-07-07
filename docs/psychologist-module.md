# Модуль «Психолог / Консультации» (Psychologist / Counseling)

MVP психологического сопровождения студентов: карта сопровождения студента +
журнал консультаций с контрольными визитами. Расчёты контрольных консультаций
(upcoming/overdue) и валидность перехода статуса — чистая, покрытая юнит-тестами
логика (`lib/psychologist/counseling.ts`), НЕ в БД.

**Чувствительные данные о психическом здоровье:** каждый маршрут API гейтится
`psychologist.view` / `psychologist.manage`; страницы `/dashboard/psychologist`
защищены `middleware` (`PROTECTED_MODULES` уже содержит `psychologist`).

## Модель данных

Две таблицы, миграция `20260707160000_psychologist.sql` (идемпотентна;
`set_updated_at()` определяется в самом файле через `CREATE OR REPLACE`).
Записи висят на `education_journeys(id)` студента (`journey_id`), НЕ на `persons` —
тот же приём анкоринга, что в остальных учебных модулях (doctor/food/dormitory).

### `psych_profiles` — карта сопровождения (одна на journey)

| Поле                  | Тип         | Примечание                              |
|-----------------------|-------------|-----------------------------------------|
| `id`                  | uuid PK     | —                                       |
| `journey_id`          | uuid FK     | → `education_journeys(id)` **ON DELETE CASCADE**, **UNIQUE** |
| `presenting_concerns` | text        | жалобы, сформулированный запрос         |
| `background`          | text        | анамнез, предыстория                    |
| `risk_level`          | text        | `none`\|`low`\|`medium`\|`high`, NOT NULL, default `none`; заполненность выше `none` → «бейдж риска» в списке |
| `referral_source`     | text        | источник направления                    |
| `notes`               | text        | заметки                                 |
| `created_at` / `updated_at` | timestamptz | триггер `set_updated_at`          |

Зеркалит `medical_profiles` модуля «Врач». Одна карта на студента (upsert по
`journey_id`).

### `psych_sessions` — журнал консультаций

| Поле             | Тип         | Примечание                                        |
|------------------|-------------|---------------------------------------------------|
| `id`             | uuid PK     | —                                                 |
| `journey_id`     | uuid FK     | → `education_journeys(id)` **ON DELETE CASCADE**   |
| `session_date`   | date        | NOT NULL, дата консультации                       |
| `session_type`   | text        | `intake`\|`followup`\|`crisis`\|`group`\|`other`, default `followup` |
| `summary`        | text        | краткое содержание                                |
| `follow_up_date` | date        | дата контрольной консультации (nullable)          |
| `status`         | text        | `open`\|`closed`, default `open`                  |
| `counselor_id`   | uuid        | кто провёл консультацию (по умолчанию — записавший) |
| `created_by`     | uuid        | кто внёс запись                                   |
| `created_at` / `updated_at` | timestamptz | триггер `set_updated_at`           |

Индексы: `journey_id`, `status`, и частичный `(follow_up_date) WHERE status='open'`
(быстрый worklist контрольных консультаций).

## Логика (чистая, юнит-тесты)

`lib/psychologist/counseling.ts` (+ `counseling.test.ts`, vitest). «Сегодня»
всегда передаётся параметром `todayISO` — Date.now НЕ вызывается, логика
детерминирована. Даты — ISO `YYYY-MM-DD`, сравниваются лексикографически.

- `daysUntil(dateISO, todayISO)` — целое число дней от сегодня до даты (через
  UTC-полночь); отрицательное — дата в прошлом, `0` — сегодня.
- `isUpcomingFollowUp(s, todayISO)` — `status==='open'` и `follow_up_date !== null`
  и `follow_up_date >= todayISO`. **Граница: дата = сегодня → предстоящая.**
- `isOverdueFollowUp(s, todayISO)` — `status==='open'` и `follow_up_date !== null`
  и `follow_up_date < todayISO` (строго в прошлом). Закрытые сессии исключены.
- `canTransitionSession(from, to)` — машина статусов сессии: `open ↔ closed`
  (открыть закрытую сессию заново можно); `from === to` запрещён; любой иной
  статус запрещён.
- `sessionStats(sessions, todayISO)` — агрегат `{ total, open, closed,
  upcoming_followups, overdue_followups }`. Контрольные счётчики берут только
  открытые сессии.

Переход статуса проверяется в PATCH-роуте консультации (`canTransitionSession` →
**409** на недопустимом). Хелперы контроля используются в `/followups` и списке
студентов.

## API (`app/api/psychologist/**`)

Чтение — `psychologist.view`, запись — `psychologist.manage`. Ошибки БД → HTTP
через `lib/psychologist/http.ts` (`mapDbError`, включая `PGRST116→404`). Даты
валидируются `lib/psychologist/validation.ts` (`isIsoDate`), статус сессии —
`isSessionStatus`, тип — `isSessionType`, уровень риска — `isRiskLevel`.

| Метод + маршрут | Право | Назначение |
|-----------------|-------|------------|
| `GET /api/psychologist/students` | view | студенты (`education_journeys status='student'`) + persons; число ОТКРЫТЫХ консультаций и уровень риска; `?search` по ФИО/email/телефонам app-side |
| `GET /api/psychologist/journeys/[id]` | view | карта сопровождения + история консультаций (свежие сверху) |
| `GET /api/psychologist/journeys/[id]/profile` | view | карта сопровождения (или `null`) |
| `PUT /api/psychologist/journeys/[id]/profile` | manage | создать/обновить карту (upsert по `journey_id`) |
| `GET /api/psychologist/journeys/[id]/sessions` | view | консультации студента |
| `POST /api/psychologist/journeys/[id]/sessions` | manage | записать консультацию: `session_date` (обяз.), `session_type` (default `followup`), `summary`, `follow_up_date?`; статус `open`, аудит `counselor_id`/`created_by` из сессии |
| `GET /api/psychologist/sessions/[id]` | view | консультация по id |
| `PATCH /api/psychologist/sessions/[id]` | manage | правка полей, установка/очистка `follow_up_date`, смена статуса `canTransitionSession`→**409** |
| `GET /api/psychologist/followups` | view | worklist: открытые консультации с датой контроля, разбиты на `upcoming`/`overdue` (чистые хелперы), с именем студента |

## UI (`app/dashboard/psychologist/**`)

- `/dashboard/psychologist` — список студентов с индикатором: бейдж числа
  открытых консультаций + бейдж уровня риска. Поиск. Сверху — worklist
  контрольных консультаций (upcoming + overdue) для роли с `manage`. Клик по
  студенту → его карта сопровождения.
- `/dashboard/psychologist/[id]` — карта студента: редактируемая панель профиля
  (жалобы, анамнез, уровень риска, источник направления, заметки), история
  консультаций, форма «записать консультацию» (дата, тип, содержание, дата
  контроля), закрытие/переоткрытие каждой консультации (только переходы,
  разрешённые `canTransitionSession`). Действия под `manage` гейтятся флагом с
  сервера.

Цвет модуля — фиолетовый `getModuleColor('psychologist')`. RTL-совместимый иврит,
без скобок.

## Права и доступ

- Каталог `module_privileges` для `psychologist` досеивается миграцией
  идемпотентно. Сид 002 УЖЕ содержит `psychologist` `view`/`create`/`edit`
  (sort_order 1/2/3) — они сохраняются (`ON CONFLICT DO NOTHING`), миграция
  ДОБАВЛЯЕТ только `manage` (sort_order 4 — первый свободный). Системным ролям
  `superadmin`/`tech_admin`/`campus_president` выдаётся `scope='all'` ТОЛЬКО на
  `view`/`manage` (не `create`/`edit`). Без гранта ни один пользователь не
  проходит `requirePsychologistPrivilege`.
- Права читаются через `lib/psychologist/permissions.ts` (общий `reduceScopes` из
  `lib/permissions/scope.ts`, кэш 30 с).
- Привилегию `('psychologist','access')` (гейт сайдбара/`middleware`) не сеет ни
  одна миграция; `superadmin` обходит `middleware` и видит пункт. Прочим ролям
  для показа пункта в сайдбаре нужно выдать `psychologist.access` (Настройки →
  роли); доступ к самой странице определяется `psychologist.view`.
- Сайдбар: пункт «Психолог» включён добавлением `'psychologist'` в
  `IMPLEMENTED_MODULES` (`lib/module-colors.ts`); пункт и иконка уже были в
  `Sidebar.tsx`; `middleware.PROTECTED_MODULES` уже содержит `psychologist`.

## i18n

`messages/{ru,he,en}.json`: namespace `psychologist.*`
(`list`/`followups`/`risk`/`profile`/`session`/`status`, полный паритет
ru/he/en). Метка сайдбара `nav.psychologist`
(`Психолог`/`פסיכולוג`/`Psychologist`) в `lib/i18n/translations.ts` уже была.

## Проверка

Юнит-тесты `lib/psychologist/counseling.test.ts` (`npm test`, vitest) покрывают
границы: `follow_up_date === today` → upcoming (не overdue), `null` даты
контроля, исключение закрытых сессий из счётчиков контроля, переходы статуса и
`from===to`. `npm run type-check` и `npm run build` — зелёные. Живой E2E не
запускался: он требует применённой миграции (ручной шаг).
