# Модуль «Общежитие» (Dormitory)

MVP заселения студентов: здания → комнаты → назначения студентов на диапазон
дат. Занятость и свободные места НЕ хранятся — считаются при чтении из чистой,
покрытой юнит-тестами логики (`lib/dormitory/occupancy.ts`).

## Модель данных

Три таблицы, миграция `20260707120000_dormitory.sql` (идемпотентна;
`set_updated_at()` определяется в самом файле через `CREATE OR REPLACE`).

### `dorm_buildings` — здания

| Поле        | Тип     | Примечание                                   |
|-------------|---------|----------------------------------------------|
| `id`        | uuid PK | —                                            |
| `name`      | text    | NOT NULL                                     |
| `code`      | text    | короткий код здания                          |
| `gender`    | text    | `male` \| `female` \| `mixed` (default mixed) |
| `address`   | text    | —                                            |
| `notes`     | text    | —                                            |
| `is_active` | boolean | NOT NULL default true                        |
| `created_at` / `updated_at` | timestamptz | триггер `set_updated_at`      |

### `dorm_rooms` — комнаты

| Поле          | Тип     | Примечание                                       |
|---------------|---------|--------------------------------------------------|
| `id`          | uuid PK | —                                                |
| `building_id` | uuid FK | → `dorm_buildings(id)` **ON DELETE CASCADE**     |
| `room_number` | text    | NOT NULL                                         |
| `floor`       | int     | —                                                |
| `capacity`    | int     | NOT NULL `CHECK (capacity > 0)`                   |
| `is_active`   | boolean | NOT NULL default true                            |
| `created_at` / `updated_at` | timestamptz | триггер                            |

`UNIQUE (building_id, room_number)` — номер комнаты уникален в пределах здания
(нарушение → 23505 → 409).

### `dorm_assignments` — назначения студента в комнату

| Поле            | Тип     | Примечание                                          |
|-----------------|---------|-----------------------------------------------------|
| `id`            | uuid PK | —                                                   |
| `room_id`       | uuid FK | → `dorm_rooms(id)` **ON DELETE CASCADE**            |
| `journey_id`    | uuid FK | → `education_journeys(id)` **ON DELETE CASCADE**    |
| `assigned_from` | date    | NOT NULL                                            |
| `assigned_to`   | date    | NULL = открытый конец                               |
| `status`        | text    | `active` \| `ended` (default active)                |
| `created_by`    | uuid    | кто создал                                          |
| `created_at` / `updated_at` | timestamptz | триггер                               |

`CHECK (assigned_to IS NULL OR assigned_to >= assigned_from)`. Индексы на
`room_id`, `journey_id` и частичный на `journey_id WHERE status='active'`
(быстрый поиск текущего назначения студента).

Назначения висят на `education_journeys(id)` студента (journey_id), НЕ на
`persons` — тот же приём анкоринга, что в остальных учебных модулях.

## Логика занятости (чистая, юнит-тесты)

`lib/dormitory/occupancy.ts` (+ `occupancy.test.ts`, vitest):

- `isActiveOn(a, dateISO)` — назначение активно на дату: `status='active'` и
  `assigned_from <= date <= (assigned_to ?? +∞)`. Даты ISO `YYYY-MM-DD`
  сравниваются лексикографически.
- `rangesOverlap(aFrom, aTo, bFrom, bTo)` — пересечение диапазонов; `null`
  конца = открытый (+∞): `aFrom <= (bTo ?? 9999-12-31) && bFrom <= (aTo ?? 9999-12-31)`.
- `occupancy(assignments, capacity, dateISO)` → `{ capacity, occupied, free, isFull }`;
  `free = max(0, capacity - occupied)`, `isFull = occupied >= capacity`.
- `canAssign({ roomCapacity, existingActiveOverlapping, studentHasActiveOverlap })`
  → `{ ok, reason? }`; отказ `room_full` (мест нет) или `student_double_booked`
  (у студента уже есть пересекающееся назначение). `room_full` приоритетнее.

Эти же правила применяются в API при создании/правке назначения: пересечения
считаются в SQL, затем прогоняются через `canAssign`; конфликт → **409**.
Занятость в списках зданий/комнат считается пакетно (без N+1), постранично
(устойчиво к db-max-rows PostgREST).

## API (`app/api/dormitory/**`)

Чтение — `dormitory.view`, запись — `dormitory.manage`. Ошибки БД → HTTP через
`lib/dormitory/http.ts` (`mapDbError`, включая `PGRST116→404`), даты
валидируются `lib/dormitory/validation.ts` (`isIsoDate`).

| Метод + маршрут | Право | Назначение |
|-----------------|-------|------------|
| `GET /api/dormitory/buildings` | view | здания + сводка занятости на сегодня |
| `POST /api/dormitory/buildings` | manage | создать здание |
| `GET/PATCH/DELETE /api/dormitory/buildings/[id]` | view/manage | здание + сводка / правка / удаление |
| `GET /api/dormitory/buildings/[id]/rooms` | view | комнаты здания + занятость |
| `POST /api/dormitory/buildings/[id]/rooms` | manage | создать комнату |
| `GET/PATCH/DELETE /api/dormitory/rooms/[id]` | view/manage | комната + занятость / правка / удаление |
| `GET /api/dormitory/rooms/[id]/assignments` | view | назначения комнаты + имя студента |
| `POST /api/dormitory/rooms/[id]/assignments` | manage | заселить студента; 409 при переполнении/двойном бронировании |
| `PATCH /api/dormitory/assignments/[id]` | manage | завершить или изменить даты; пере-проверка конфликтов |
| `GET /api/dormitory/journeys/[id]` | view | текущее назначение студента + история |
| `GET /api/dormitory/students` | view | студенты + текущая комната; `?search=` |

## UI (`app/dashboard/dormitory/**`)

- `/dashboard/dormitory` — здания карточками с индикатором занятости
  (полоса заполнения), для роли с `manage` — добавление здания. Клик по
  зданию → его комнаты.
- `/dashboard/dormitory/[id]` — комнаты сеткой (занятость и свободные места);
  добавление комнаты; выбор комнаты открывает панель: список заселений,
  поисковый пикер студента (`/api/dormitory/students`), даты «с/по», заселение
  и завершение. Действия под `manage` гейтятся флагом, вычисленным на сервере.

Цвет модуля — циан `getModuleColor('dormitory')`.

## Права и доступ

- Каталог `module_privileges` для `dormitory` (`view`/`manage`) досеивается
  миграцией идемпотентно (сид 002 на боевой БД неполон) и выдаётся системным
  ролям `superadmin`/`tech_admin`/`campus_president` со `scope='all'` — тот же
  приём, что в `20260705130000_alumni_graduation.sql`. Без гранта ни один
  пользователь (включая superadmin на уровне API) не проходит
  `requireDormitoryPrivilege`.
- Права модуля читаются через `lib/dormitory/permissions.ts` (общий
  `reduceScopes` из `lib/permissions/scope.ts`).
- Привилегию `('dormitory','access')` (гейт сайдбара/`middleware`) не сеет ни
  одна миграция; `superadmin` обходит `middleware`. Прочим ролям для доступа к
  странице нужно выдать `dormitory.access` (Настройки → роли).
- Сайдбар: пункт «Общежитие» включён добавлением `'dormitory'` в
  `IMPLEMENTED_MODULES` (`lib/module-colors.ts`); `middleware.PROTECTED_MODULES`
  уже содержит `dormitory`.

## i18n

`messages/{ru,he,en}.json`: `navigation.dormitory` + namespace `dormitory.*`
(`list`/`building`/`room`/`form`/`gender`/`status`, полный паритет ru/he/en).
Метка сайдбара `nav.dormitory` в `lib/i18n/translations.ts` уже была.

## Проверка

Юнит-тесты `lib/dormitory/occupancy.test.ts` (`npm test`, vitest) покрывают
границы: ровно на вместимости, открытый/закрытый конец, смежные непересекающиеся
диапазоны, игнор завершённых. `npm run type-check` и `npm run build` — зелёные.
Живой E2E не запускался: он требует применённой миграции (ручной шаг).
