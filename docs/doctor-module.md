# Модуль «Врач / Медпункт» (Doctor / Clinic)

MVP медкарт студентов и приёмов в медпункте: медкарта студента + журнал приёмов
с контрольными визитами. Расчёты контрольных визитов (upcoming/overdue) и
валидность перехода статуса приёма — чистая, покрытая юнит-тестами логика
(`lib/doctor/medical.ts`), НЕ в БД.

**Чувствительные медицинские данные:** каждый маршрут API гейтится
`doctor.view` / `doctor.manage`; страницы `/dashboard/doctor` защищены
`middleware` (`PROTECTED_MODULES` уже содержит `doctor`).

## Модель данных

Две таблицы, миграция `20260707150000_doctor.sql` (идемпотентна;
`set_updated_at()` определяется в самом файле через `CREATE OR REPLACE`).
Записи висят на `education_journeys(id)` студента (`journey_id`), НЕ на `persons` —
тот же приём анкоринга, что в остальных учебных модулях (food/dormitory).

### `medical_profiles` — медкарта (одна на journey)

| Поле                 | Тип         | Примечание                              |
|----------------------|-------------|-----------------------------------------|
| `id`                 | uuid PK     | —                                       |
| `journey_id`         | uuid FK     | → `education_journeys(id)` **ON DELETE CASCADE**, **UNIQUE** |
| `blood_type`         | text        | группа крови                            |
| `chronic_conditions` | text        | хронические заболевания                 |
| `allergies`          | text        | аллергии (заполненность → «флаг аллергии» в списке) |
| `medications`        | text        | лекарства                               |
| `emergency_contact`  | text        | экстренный контакт                      |
| `notes`              | text        | заметки                                 |
| `created_at` / `updated_at` | timestamptz | триггер `set_updated_at`          |

Зеркалит `dietary_profiles` модуля «Питание». Одна карта на студента (upsert по
`journey_id`).

### `medical_visits` — журнал приёмов

| Поле             | Тип         | Примечание                                        |
|------------------|-------------|---------------------------------------------------|
| `id`             | uuid PK     | —                                                 |
| `journey_id`     | uuid FK     | → `education_journeys(id)` **ON DELETE CASCADE**   |
| `visit_date`     | date        | NOT NULL, дата приёма                             |
| `reason`         | text        | причина обращения                                |
| `diagnosis`      | text        | диагноз                                          |
| `treatment`      | text        | лечение                                          |
| `attended_by`    | uuid        | кто принял (по умолчанию — записавший клиницист) |
| `follow_up_date` | date        | дата контрольного визита (nullable)              |
| `status`         | text        | `open`\|`closed`, default `open`                 |
| `notes`          | text        | заметки                                          |
| `created_by`     | uuid        | кто внёс запись                                  |
| `created_at` / `updated_at` | timestamptz | триггер `set_updated_at`           |

Индексы: `journey_id`, `status`, и частичный `(follow_up_date) WHERE status='open'`
(быстрый worklist контрольных визитов).

## Логика (чистая, юнит-тесты)

`lib/doctor/medical.ts` (+ `medical.test.ts`, vitest). «Сегодня» всегда
передаётся параметром `todayISO` — Date.now НЕ вызывается, логика
детерминирована. Даты — ISO `YYYY-MM-DD`, сравниваются лексикографически.

- `daysUntil(dateISO, todayISO)` — целое число дней от сегодня до даты (через
  UTC-полночь); отрицательное — дата в прошлом, `0` — сегодня.
- `isUpcomingFollowUp(v, todayISO)` — `status==='open'` и `follow_up_date !== null`
  и `follow_up_date >= todayISO`. **Граница: дата = сегодня → предстоящий.**
- `isOverdueFollowUp(v, todayISO)` — `status==='open'` и `follow_up_date !== null`
  и `follow_up_date < todayISO` (строго в прошлом). Закрытые приёмы исключены.
- `canTransitionVisit(from, to)` — машина статусов приёма: `open ↔ closed`
  (открыть закрытый приём заново можно); `from === to` запрещён; любой иной
  статус запрещён.
- `visitStats(visits, todayISO)` — агрегат `{ total, open, closed,
  upcoming_followups, overdue_followups }`. Контрольные счётчики берут только
  открытые приёмы.

Переход статуса проверяется в PATCH-роуте приёма (`canTransitionVisit` → **409**
на недопустимом). Хелперы контроля используются в `/followups` и списке студентов.

## API (`app/api/doctor/**`)

Чтение — `doctor.view`, запись — `doctor.manage`. Ошибки БД → HTTP через
`lib/doctor/http.ts` (`mapDbError`, включая `PGRST116→404`). Даты валидируются
`lib/doctor/validation.ts` (`isIsoDate`), статус приёма — `isVisitStatus`.

| Метод + маршрут | Право | Назначение |
|-----------------|-------|------------|
| `GET /api/doctor/students` | view | студенты (`education_journeys status='student'`) + persons; число ОТКРЫТЫХ приёмов и флаг аллергии; `?search` по ФИО/email/телефонам app-side |
| `GET /api/doctor/journeys/[id]` | view | медкарта студента + история приёмов (свежие сверху) |
| `GET /api/doctor/journeys/[id]/profile` | view | медкарта (или `null`) |
| `PUT /api/doctor/journeys/[id]/profile` | manage | создать/обновить медкарту (upsert по `journey_id`) |
| `GET /api/doctor/journeys/[id]/visits` | view | приёмы студента |
| `POST /api/doctor/journeys/[id]/visits` | manage | записать приём: `visit_date` (обяз.), `reason`, `diagnosis`, `treatment`, `follow_up_date?`, `notes`; статус `open`, аудит `created_by`/`attended_by` из сессии |
| `GET /api/doctor/visits/[id]` | view | приём по id |
| `PATCH /api/doctor/visits/[id]` | manage | правка полей, установка/очистка `follow_up_date`, смена статуса `canTransitionVisit`→**409** |
| `GET /api/doctor/followups` | view | worklist: открытые приёмы с датой контроля, разбиты на `upcoming`/`overdue` (чистые хелперы), с именем студента |

## UI (`app/dashboard/doctor/**`)

- `/dashboard/doctor` — список студентов с индикатором здоровья: бейдж числа
  открытых приёмов + бейдж аллергии. Поиск. Сверху — worklist контрольных
  визитов (upcoming + overdue) для роли с `manage`. Клик по студенту → его
  медкарта.
- `/dashboard/doctor/[id]` — медкарта студента: редактируемая панель профиля
  (группа крови, аллергии, хронические, лекарства, экстренный контакт, заметки —
  зеркалит диет-редактор «Питания»), история приёмов, форма «записать приём»
  (дата, причина, диагноз, лечение, дата контроля), закрытие/переоткрытие каждого
  приёма (только переходы, разрешённые `canTransitionVisit`). Действия под
  `manage` гейтятся флагом с сервера.

Цвет модуля — зелёный `getModuleColor('doctor')`. RTL-совместимый иврит.

## Права и доступ

- Каталог `module_privileges` для `doctor` досеивается миграцией идемпотентно.
  Сид 002 УЖЕ содержит `doctor` `view`/`create`/`edit` — они сохраняются
  (`ON CONFLICT DO NOTHING`), миграция ДОБАВЛЯЕТ только `manage`. Системным ролям
  `superadmin`/`tech_admin`/`campus_president` выдаётся `scope='all'` ТОЛЬКО на
  `view`/`manage` (не `create`/`edit`). Без гранта ни один пользователь не
  проходит `requireDoctorPrivilege`.
- Права читаются через `lib/doctor/permissions.ts` (общий `reduceScopes` из
  `lib/permissions/scope.ts`, кэш 30 с).
- Привилегию `('doctor','access')` (гейт сайдбара/`middleware`) не сеет ни одна
  миграция; `superadmin` обходит `middleware` и видит пункт. Прочим ролям для
  показа пункта в сайдбаре нужно выдать `doctor.access` (Настройки → роли);
  доступ к самой странице определяется `doctor.view`.
- Сайдбар: пункт «Врач» включён добавлением `'doctor'` в `IMPLEMENTED_MODULES`
  (`lib/module-colors.ts`); пункт и иконка уже были в `Sidebar.tsx`;
  `middleware.PROTECTED_MODULES` уже содержит `doctor`.

## i18n

`messages/{ru,he,en}.json`: namespace `doctor.*` (`list`/`followups`/`profile`/
`visit`/`status`, полный паритет ru/he/en). Метка сайдбара `nav.doctor`
(`Врач`/`רופא`/`Doctor`) в `lib/i18n/translations.ts` уже была.

## Проверка

Юнит-тесты `lib/doctor/medical.test.ts` (`npm test`, vitest) покрывают границы:
`follow_up_date === today` → upcoming (не overdue), `null` даты контроля,
исключение закрытых приёмов из счётчиков контроля, переходы статуса и `from===to`.
`npm run type-check` и `npm run build` — зелёные. Живой E2E не запускался: он
требует применённой миграции (ручной шаг).
