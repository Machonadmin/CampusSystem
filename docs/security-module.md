# Модуль «Безопасность» (Security)

MVP журнала инцидентов безопасности кампуса с рабочим процессом статусов:
инцидент → расследование → разрешение → закрытие. Ранг серьёзности (сортировка)
и валидность перехода статуса — чистая, покрытая юнит-тестами логика
(`lib/security/incidents.ts`), НЕ в БД.

## Модель данных

Одна таблица, миграция `20260708130000_security.sql` (идемпотентна;
`set_updated_at()` определяется в самом файле через `CREATE OR REPLACE`).
Применять ПОСЛЕ `20260707120000_dormitory.sql` — FK ссылается на здания.

### `security_incidents` — инциденты

| Поле            | Тип         | Примечание                                                        |
|-----------------|-------------|-------------------------------------------------------------------|
| `id`            | uuid PK     | —                                                                 |
| `occurred_at`   | timestamptz | NOT NULL default now — когда произошёл инцидент                    |
| `building_id`   | uuid FK     | → `dorm_buildings(id)` **ON DELETE SET NULL**                     |
| `location_text` | text        | свободный текст места происшествия                                |
| `category`      | text        | `theft`\|`vandalism`\|`trespassing`\|`altercation`\|`fire`\|`medical`\|`property_damage`\|`other`, default `other` |
| `severity`      | text        | `low`\|`medium`\|`high`\|`critical`, default `medium`             |
| `title`         | text        | NOT NULL                                                          |
| `description`   | text        | —                                                                 |
| `status`        | text        | `open`\|`investigating`\|`resolved`\|`closed`, default `open`     |
| `reported_by`   | uuid        | кто сообщил                                                       |
| `assigned_to`   | uuid        | на кого назначено                                                |
| `resolution`    | text        | как инцидент был разрешён                                        |
| `resolved_at`   | timestamptz | проставляется при переходе в `resolved`, очищается при переоткрытии |
| `created_by`    | uuid        | кто создал запись                                                |
| `created_at` / `updated_at` | timestamptz | триггер `set_updated_at`                            |

Индексы на `status`, `severity`, `category`, `building_id`. Место инцидента
decoupled от прав модуля «Общежитие»: имя здания резолвится ПАКЕТНО в API
(`lib/security/locations-server.ts`) под правом самого security.

## Логика (чистая, юнит-тесты)

`lib/security/incidents.ts` (+ `incidents.test.ts`, vitest):

- `SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 }` / `severityRank(s)` —
  для сортировки (выше — важнее; неизвестная серьёзность → 0).
- `canTransition(from, to)` — машина статусов: `open → investigating | closed`;
  `investigating → resolved | closed`; `resolved → closed | investigating`
  (повторное открытие); `closed` — терминальный; `from === to` запрещён.
- `allowedTransitions(from)` — список допустимых переходов (для кнопок в UI).
- `incidentStats(incidents)` — сводка `{ total, open, investigating, resolved,
  closed, active, by_severity }`, где `active = open + investigating`.

Переход статуса проверяется в PATCH-роуте (`canTransition` → **409** на
недопустимом). Список сортируется по рангу серьёзности убыв., затем свежие
происшествия выше (`occurred_at` убыв.).

## API (`app/api/security/**`)

Чтение — `security.view`, запись — `security.manage`. Ошибки БД → HTTP через
`lib/security/http.ts` (`mapDbError`, включая `PGRST116→404`). Значения
category/severity/status валидируются `lib/security/validation.ts`.

| Метод + маршрут | Право | Назначение |
|-----------------|-------|------------|
| `GET /api/security/incidents` | view | список с фильтрами `?status ?severity ?category ?building_id`; имя здания; сортировка: серьёзность по рангу убыв., затем свежие выше; пагинация `?page ?page_size` |
| `POST /api/security/incidents` | manage | создать инцидент: `occurred_at`, `building_id?`/`location_text?`, `category`, `severity`, `title`, `description` |
| `GET /api/security/incidents/[id]` | view | инцидент + имя здания |
| `PATCH /api/security/incidents/[id]` | manage | смена статуса `canTransition`→409, назначение, серьёзность, `resolution`; `resolved` ставит `resolved_at`, сохраняет при `resolved→closed`, очищает только при `resolved→investigating` |
| `GET /api/security/stats` | view | число инцидентов по статусам + разбивка по серьёзности + число активных |
| `GET /api/security/buildings` | view | здания общежития для пикера места происшествия |

## UI (`app/dashboard/security/**`)

- `/dashboard/security` — журнал инцидентов: бейджи серьёзности и статуса,
  `critical`/`high` визуально подсвечены красным акцентом; фильтры по статусу,
  серьёзности и категории; верхняя сводка из `/stats`. Для роли с `manage` —
  форма нового инцидента с пикером здания, свободным текстом места, датой/временем,
  категорией и серьёзностью.
- `/dashboard/security/[id]` — карточка инцидента: кнопки смены статуса, только
  допустимые переходы `allowedTransitions`; назначение на себя; серьёзность;
  редактор разрешения `resolution` (при переходе в `resolved` несёт текст
  разрешения). Действия под `manage` гейтятся флагом с сервера.

Цвет модуля — красный `getModuleColor('security')`.

## Права и доступ

- Каталог `module_privileges` для `security` (`view`/`manage`) досеивается
  миграцией идемпотентно и выдаётся системным ролям
  `superadmin`/`tech_admin`/`campus_president` со `scope='all'` — тот же приём,
  что в `20260707140000_maintenance.sql`. **NB:** сид 002 уже содержит для
  `security` привилегии `view` (sort_order 1), `manage_access` (2), `view_logs`
  (3); миграция их НЕ трогает (`ON CONFLICT DO NOTHING`), лишь ДОБАВЛЯЕТ `manage`
  на свободном sort_order 4. Грант ограничен `view`/`manage`: `manage_access`/
  `view_logs` не выдаются. Без гранта ни один пользователь не проходит
  `requireSecurityPrivilege`.
- Права модуля читаются через `lib/security/permissions.ts` (общий `reduceScopes`
  из `lib/permissions/scope.ts`).
- Сайдбар: пункт «Безопасность» включён добавлением `'security'` в
  `IMPLEMENTED_MODULES` (`lib/module-colors.ts`); `middleware.PROTECTED_MODULES`
  уже содержит `security`.

## i18n

`messages/{ru,he,en}.json`: `navigation.security` + namespace `security.*`
(`list`/`category`/`severity`/`status`/`form`/`detail`, полный паритет ru/he/en).
Метка сайдбара `nav.security` в `lib/i18n/translations.ts` уже была.

## Проверка

Юнит-тесты `lib/security/incidents.test.ts` (`npm test`, vitest) покрывают
границы: терминальный статус `closed`, путь повторного открытия
(`resolved→investigating`), каждая серьёзность, пустой ввод. `npm run type-check`
и `npm run build` — зелёные. Живой E2E не запускался: он требует применённой
миграции (ручной шаг).
