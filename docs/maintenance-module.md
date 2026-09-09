# Модуль «Эксплуатация» (Maintenance)

MVP заявок на обслуживание и ремонт помещений кампуса: заявка → назначение →
смена статуса до закрытия. SLA/просрочка и валидность перехода статуса — чистая,
покрытая юнит-тестами логика (`lib/maintenance/tickets.ts`), НЕ в БД.

## Модель данных

Одна таблица, миграция `20260707140000_maintenance.sql` (идемпотентна;
`set_updated_at()` определяется в самом файле через `CREATE OR REPLACE`).
Применять ПОСЛЕ `20260707120000_dormitory.sql` — FK ссылается на здания/комнаты.

### `maintenance_requests` — заявки

| Поле            | Тип         | Примечание                                                        |
|-----------------|-------------|-------------------------------------------------------------------|
| `id`            | uuid PK     | —                                                                 |
| `title`         | text        | NOT NULL                                                          |
| `description`   | text        | —                                                                 |
| `building_id`   | uuid FK     | → `dorm_buildings(id)` **ON DELETE SET NULL**                     |
| `room_id`       | uuid FK     | → `dorm_rooms(id)` **ON DELETE SET NULL**                         |
| `location_text` | text        | свободный текст локации                                           |
| `category`      | text        | `plumbing`\|`electrical`\|`furniture`\|`cleaning`\|`appliance`\|`other`, default `other` |
| `priority`      | text        | `low`\|`normal`\|`high`\|`urgent`, default `normal`               |
| `status`        | text        | `open`\|`in_progress`\|`resolved`\|`closed`\|`cancelled`, default `open` |
| `reported_by`   | uuid        | кто подал                                                        |
| `assigned_to`   | uuid        | на кого назначено                                                |
| `reported_at`   | timestamptz | NOT NULL default now                                             |
| `resolved_at`   | timestamptz | проставляется при переходе в `resolved`, очищается при выходе    |
| `created_at` / `updated_at` | timestamptz | триггер `set_updated_at`                            |

Индексы на `status`, `priority`, `assigned_to`, `building_id`. Локация decoupled
от прав модуля «Общежитие»: имена здания/комнаты резолвятся ПАКЕТНО в API
(`lib/maintenance/locations-server.ts`) под правом самого maintenance.

## Логика (чистая, юнит-тесты)

`lib/maintenance/tickets.ts` (+ `tickets.test.ts`, vitest):

- `SLA_HOURS = { urgent: 4, high: 24, normal: 72, low: 168 }` — норматив реакции
  в часах по приоритету.
- `ticketAgeHours(reportedAtISO, nowISO)` — возраст в целых часах (floor), никогда
  не отрицательный.
- `isOverdue(t, nowISO)` — просрочена, только если статус `open`/`in_progress` и
  возраст **строго** больше SLA приоритета. Ровно на границе SLA — ещё НЕ
  просрочена. Неизвестный приоритет → не просрочена.
- `PRIORITY_RANK = { urgent: 4, high: 3, normal: 2, low: 1 }` / `priorityRank(p)` —
  для сортировки (выше — важнее; неизвестный → 0).
- `canTransition(from, to)` — машина статусов: `open → in_progress | cancelled`;
  `in_progress → resolved | cancelled | open`; `resolved → closed | in_progress`;
  `closed`/`cancelled` — терминальные; `from === to` запрещён.
- `allowedTransitions(from)` — список допустимых переходов (для кнопок в UI).
- `statusCounts(tickets)` — агрегат `Record<status, number>`.

Переход статуса проверяется в PATCH-роуте (`canTransition` → **409** на
недопустимом). `is_overdue` считается для списка/карточки.

## API (`app/api/maintenance/**`)

Чтение — `maintenance.view`, запись — `maintenance.manage`. Ошибки БД → HTTP через
`lib/maintenance/http.ts` (`mapDbError`, включая `PGRST116→404`). Значения
category/priority/status валидируются `lib/maintenance/validation.ts`.

| Метод + маршрут | Право | Назначение |
|-----------------|-------|------------|
| `GET /api/maintenance/requests` | view | список с фильтрами `?status ?priority ?building_id ?assigned=me`; имена локации + `is_overdue`; сортировка: приоритет по рангу убыв., затем старые выше; пагинация `?page ?page_size` |
| `POST /api/maintenance/requests` | manage | создать заявку |
| `GET /api/maintenance/requests/[id]` | view | заявка + имена локации + `is_overdue` |
| `PATCH /api/maintenance/requests/[id]` | manage | смена статуса `canTransition`→409, назначение, приоритет, описание; `resolved` ставит `resolved_at`, выход из `resolved` очищает |
| `GET /api/maintenance/stats` | view | число заявок по статусам + общее число просроченных |
| `GET /api/maintenance/locations` | view | здания общежития + комнаты для пикера локации |
| `GET /api/maintenance/tasks` | view | задачи из модуля «Задачи», помеченные как задачи по эксплуатации; `?status=all` добавляет закрытые |
| `GET /api/tasks/maintenance-staff` | сотрудник (не студент) | `person_id` носителей ролей техслужбы — для галочки в форме задачи. Живёт в `/api/tasks`, а не здесь: задачу создаёт и тот, у кого нет доступа к эксплуатации |

## UI (`app/dashboard/maintenance/**`)

- `/dashboard/maintenance` — список заявок: бейджи статуса и приоритета,
  просроченные подсвечены красным акцентом; фильтры по статусу и приоритету;
  верхняя сводка из `/stats`. Для роли с `manage` — форма новой заявки с пикером
  локации здание/комната из `/api/maintenance/locations` плюс свободным текстом.
- `/dashboard/maintenance/[id]` — карточка заявки: кнопки смены статуса, только
  допустимые переходы `allowedTransitions`; назначение на себя; приоритет;
  редактор описания. Действия под `manage` гейтятся флагом с сервера.
- Над списком заявок — отдельный блок **«Задачи по эксплуатации»**
  (`MaintenanceTasksSection`): задачи из модуля «Задачи», помеченные автором.
  Намеренно НЕ смешиваются с заявками и НЕ входят в верхнюю сводку: у задачи нет
  ни здания, ни категории, ни SLA, поэтому в общем списке счётчики бы «врали».
  Клик ведёт на карточку задачи (`/dashboard/tasks/[id]`).

Цвет модуля — коричневый `getModuleColor('maintenance')`.

## Права и доступ

- Каталог `module_privileges` для `maintenance` (`view`/`manage`) досеивается
  миграцией идемпотентно (сид 002 на боевой БД неполон) и выдаётся системным
  ролям `superadmin`/`tech_admin`/`campus_president` со `scope='all'` — тот же
  приём, что в `20260707130000_food.sql`. Грант ограничен именно `view`/`manage`:
  если сид 002 завёл иные привилегии `maintenance`, они НЕ выдаются. Без гранта
  ни один пользователь не проходит `requireMaintenancePrivilege`.
- Права модуля читаются через `lib/maintenance/permissions.ts` (общий
  `reduceScopes` из `lib/permissions/scope.ts`).
- Привилегию `('maintenance','access')` (гейт сайдбара/`middleware`) не сеет ни
  одна миграция; `superadmin` обходит `middleware`. Прочим ролям для доступа к
  странице нужно выдать `maintenance.access` (Настройки → роли).
- Сайдбар: пункт «Эксплуатация» включён добавлением `'maintenance'` в
  `IMPLEMENTED_MODULES` (`lib/module-colors.ts`); `middleware.PROTECTED_MODULES`
  уже содержит `maintenance`.

## Связь с модулем «Задачи»

Задачи и эксплуатация — РАЗНЫЕ вещи с разными сотрудниками, поэтому связь
намеренно узкая (решение владельца): далеко не всё, что кто-то поручает,
касается техслужбы, и поручение секретарю «внести всех учеников» на доске
техслужбы не нужно.

**Правило.** Задача попадает на доску техслужбы при ДВУХ условиях сразу:

1. она персонально назначена человеку с ролью `maintenance_head` /
   `maintenance_staff` (роль выдаётся в «Настройки → Пользователи и права»), И
2. автор подтвердил это галочкой «это задача по эксплуатации» в форме задачи.

Галочка появляется, только когда выбран такой исполнитель, и по умолчанию
ВКЛЮЧЕНА: раз уж выбрали техника, чаще всего это его работа; цена лишней
галочки — одна строка в списке, цена забытой — фича не работает.

**Одна запись, два экрана.** Строка в `maintenance_requests` НЕ создаётся: это
та же самая задача, показанная вторым экраном. Поэтому «выполнено» в одном месте
— «выполнено» в обоих по построению, разъехаться нечему.

**Хранение — без миграции.** Метка живёт в `tasks.metadata` (JSONB, существует
с первого дня, `NOT NULL DEFAULT '{}'`), а не в новой колонке и не в
`tasks.module`: миграции здесь применяются владельцем вручную, и фича обязана
работать сразу после деплоя. Тот же приём уже используется для автозадач приёма
(`metadata.source='acceptance'`). Единый источник правил —
`lib/tasks/maintenance-link.ts` (+ `maintenance-link.test.ts`), «кто такой
человек из техслужбы» — `lib/maintenance/staff-server.ts` (fail-closed: ошибка
чтения ролей → пустое множество → метки нет).

**Решает сервер, не клиент.**

- метка сохраняется, только если `canBeMaintenanceTask` подтвердил персональное
  назначение на человека из техслужбы (`POST /api/tasks`,
  `POST /api/tasks/series`, `PATCH /api/tasks/[id]`);
- при переназначении помеченной задачи на человека вне техслужбы метка
  снимается автоматически — иначе задача секретаря осталась бы висеть на доске;
- переключатель на карточке задачи показывается, только если он что-то изменит
  (исполнитель из техслужбы ИЛИ метка уже стоит — чтобы её можно было снять
  после того, как у исполнителя убрали роль).

**Видимость — «техслужба видит техслужбу».** Блок видит любой с
`maintenance.view`, без разделения «руководитель / сотрудник» (размер команды
ещё не определён — решение владельца отложено). `getTaskAccess` выдаёт таким
людям поле `isMaintenanceViewer` и ТОЛЬКО просмотр (и, как следствие,
комментарии); менять статус и редактировать по-прежнему могут автор,
исполнитель и суперадмин.

**Коды ролей зарезервированы.** `maintenance_head` / `maintenance_staff` внесены
в `lib/auth/reserved-roles.ts`: обладание кодом — единственный признак «человек
из техслужбы», поэтому переименование кода из экрана ролей молча выключило бы
связку, а создание новой роли с таким кодом позволило бы выкладывать на доску
произвольные задачи. Название роли на экране меняется свободно, сам код — нет.

## i18n

`messages/{ru,he,en}.json`: `navigation.maintenance` + namespace `maintenance.*`
(`list`/`category`/`priority`/`status`/`form`/`detail`/`tasks`, полный паритет ru/he/en);
галочка и бейдж — в `tasks.create_modal.maintenance_*` / `tasks.card.maintenance_*`.
Метка сайдбара `nav.maintenance` в `lib/i18n/translations.ts` уже была.

## Проверка

Юнит-тесты `lib/maintenance/tickets.test.ts` (`npm test`, vitest) покрывают
границы: SLA ровно на границе, терминальные статусы, путь повторного открытия,
нулевой/отрицательный возраст, неизвестный приоритет. `npm run type-check` и
`npm run build` — зелёные. Живой E2E не запускался: он требует применённой
миграции (ручной шаг).
