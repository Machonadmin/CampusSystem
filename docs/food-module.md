# Модуль «Питание» (Food & Dining)

MVP питания студентов: планы питания → запись студентов на диапазон дат →
диет-профили. Число активных записей НЕ хранится — считается при чтении из
чистой, покрытой юнит-тестами логики (`lib/food/enrollment.ts`).

## Модель данных

Три таблицы, миграция `20260707130000_food.sql` (идемпотентна;
`set_updated_at()` определяется в самом файле через `CREATE OR REPLACE`).

### `meal_plans` — планы питания

| Поле                 | Тип           | Примечание                          |
|----------------------|---------------|-------------------------------------|
| `id`                 | uuid PK       | —                                   |
| `name`               | text          | NOT NULL                            |
| `code`               | text          | короткий код плана                  |
| `description`        | text          | —                                   |
| `includes_breakfast` | boolean       | NOT NULL default true               |
| `includes_lunch`     | boolean       | NOT NULL default true               |
| `includes_dinner`    | boolean       | NOT NULL default true               |
| `price`              | numeric(12,2) | цена (nullable)                     |
| `period_label`       | text          | напр. «2026 семестр 1»               |
| `is_active`          | boolean       | NOT NULL default true               |
| `created_at` / `updated_at` | timestamptz | триггер `set_updated_at`      |

### `meal_enrollments` — запись студента на план

| Поле            | Тип     | Примечание                                       |
|-----------------|---------|--------------------------------------------------|
| `id`            | uuid PK | —                                                |
| `meal_plan_id`  | uuid FK | → `meal_plans(id)` **ON DELETE CASCADE**         |
| `journey_id`    | uuid FK | → `education_journeys(id)` **ON DELETE CASCADE** |
| `enrolled_from` | date    | NOT NULL                                         |
| `enrolled_to`   | date    | NULL = открытый конец                            |
| `status`        | text    | `active` \| `ended` (default active)             |
| `created_by`    | uuid    | кто создал                                       |
| `created_at` / `updated_at` | timestamptz | триггер                            |

`CHECK (enrolled_to IS NULL OR enrolled_to >= enrolled_from)`. Индексы на
`meal_plan_id`, `journey_id` и частичный на `journey_id WHERE status='active'`
(быстрый поиск текущей записи студента).

### `dietary_profiles` — диет-профиль студента (один на journey)

| Поле           | Тип     | Примечание                                       |
|----------------|---------|--------------------------------------------------|
| `id`           | uuid PK | —                                                |
| `journey_id`   | uuid FK | → `education_journeys(id)` CASCADE, **UNIQUE**    |
| `restrictions` | text    | ограничения питания                              |
| `allergies`    | text    | аллергии                                         |
| `notes`        | text    | заметки                                          |
| `created_at` / `updated_at` | timestamptz | триггер                            |

Записи висят на `education_journeys(id)` студента (journey_id), НЕ на `persons`.

## Логика записи (чистая, юнит-тесты)

`lib/food/enrollment.ts` (+ `enrollment.test.ts`, vitest):

- `isActiveOn(e, dateISO)` — запись активна на дату: `status='active'` и
  `enrolled_from <= date <= (enrolled_to ?? +∞)`. Даты ISO `YYYY-MM-DD`
  сравниваются лексикографически.
- `rangesOverlap(aFrom, aTo, bFrom, bTo)` — пересечение диапазонов; `null`
  конца = открытый (+∞): `aFrom <= (bTo ?? 9999-12-31) && bFrom <= (aTo ?? 9999-12-31)`.
- `activeCount(enrollments, dateISO)` — число активных на дату.
- `canEnroll({ studentHasActiveOverlap })` → `{ ok, reason? }`; отказ
  `student_double_enrolled`, если у студента уже есть активная запись,
  пересекающаяся по датам (правило «одна активная запись на план»).

Правило применяется в API при записи и правке: пересечения считаются в SQL,
затем прогоняются через `canEnroll`; конфликт → **409**. Число активных записей
в списке планов считается пакетно (без N+1), постранично (устойчиво к
db-max-rows PostgREST).

## API (`app/api/food/**`)

Чтение — `food.view`, запись — `food.manage`. Ошибки БД → HTTP через
`lib/food/http.ts` (`mapDbError`, включая `PGRST116→404`), даты валидируются
`lib/food/validation.ts` (`isIsoDate`).

| Метод + маршрут | Право | Назначение |
|-----------------|-------|------------|
| `GET /api/food/plans` | view | планы + число активных записей на сегодня |
| `POST /api/food/plans` | manage | создать план |
| `GET/PATCH/DELETE /api/food/plans/[id]` | view/manage | план + счётчик / правка / удаление |
| `GET /api/food/plans/[id]/enrollments` | view | записи на план + имя студента |
| `POST /api/food/plans/[id]/enrollments` | manage | записать студента; 409 при пересечении с активной записью |
| `PATCH /api/food/enrollments/[id]` | manage | завершить или изменить даты; пере-проверка правила |
| `GET /api/food/students` | view | студенты + текущий план; `?search=` |
| `GET /api/food/journeys/[id]` | view | текущая запись студента + история + диет-профиль |
| `GET /api/food/journeys/[id]/dietary` | view | диет-профиль (null, если нет) |
| `PUT /api/food/journeys/[id]/dietary` | manage | создать/обновить диет-профиль (upsert по journey_id) |

## UI (`app/dashboard/food/**`)

- `/dashboard/food` — планы питания карточками: включённые приёмы пищи,
  цена, число активных записей. Для роли с `manage` — добавление плана.
- `/dashboard/food/[id]` — записанные студенты; запись студента через
  поисковый пикер (`/api/food/students`) с датами «с/по»; завершение записи;
  редактор диет-профиля студента. Действия под `manage` гейтятся флагом,
  вычисленным на сервере.

Цвет модуля — янтарный `getModuleColor('food')`.

## Права и доступ

- Каталог `module_privileges` для `food` (`view`/`manage`) досеивается
  миграцией идемпотентно (сид 002 на боевой БД неполон) и выдаётся системным
  ролям `superadmin`/`tech_admin`/`campus_president` со `scope='all'` — тот же
  приём, что в `20260707120000_dormitory.sql`. Без гранта ни один пользователь
  (включая superadmin на уровне API) не проходит `requireFoodPrivilege`.
- Права модуля читаются через `lib/food/permissions.ts` (общий `reduceScopes`
  из `lib/permissions/scope.ts`).
- Привилегию `('food','access')` (гейт сайдбара/`middleware`) не сеет ни одна
  миграция; `superadmin` обходит `middleware`. Прочим ролям для доступа к
  странице нужно выдать `food.access` (Настройки → роли).
- Сайдбар: пункт «Питание» включён добавлением `'food'` в `IMPLEMENTED_MODULES`
  (`lib/module-colors.ts`); `middleware.PROTECTED_MODULES` уже содержит `food`.

## i18n

`messages/{ru,he,en}.json`: `navigation.food` + namespace `food.*`
(`list`/`meal`/`plan`/`form`/`status`/`dietary`, полный паритет ru/he/en).
Метка сайдбара `nav.food` в `lib/i18n/translations.ts` уже была.

## Проверка

Юнит-тесты `lib/food/enrollment.test.ts` (`npm test`, vitest) покрывают
границы: открытый/закрытый конец, смежные непересекающиеся диапазоны, игнор
завершённых, точное касание границ. `npm run type-check` и `npm run build` —
зелёные. Живой E2E не запускался: он требует применённой миграции (ручной шаг).
