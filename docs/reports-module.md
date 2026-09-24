# Модуль «Отчёты / Обзор» (Reports / Overview)

READ-ONLY дашборд руководства: сводка ключевых показателей по всем внедрённым
модулям на одной странице `/dashboard/reports`. Модуль **только читает** (SELECT)
из таблиц других модулей и **переиспользует их чистые хелперы** (импортирует их) —
он НЕ создаёт таблиц, НЕ пишет в БД и НЕ меняет файлы/поведение других модулей.

Каждая карточка домена грузится НЕЗАВИСИМО своим эндпоинтом: сбой одного домена
показывает маленькую ошибку в его карточке и НЕ ломает остальные.

Код модуля — `reports`. Чтение под правом `reports.view`.

## Что показывает каждая карточка

| Карточка | Источник данных | Метрики |
|----------|-----------------|---------|
| Студенты (education) | `education_journeys` | всего journey + разбивка по `education_status` |
| Финансы (finance) | `finance_charges` (active), `finance_payments` (approved) | начислено, собрано, задолженность, собираемость %, число должников |
| Общежитие (dormitory) | `dorm_rooms`, `dorm_assignments`, `dorm_buildings` | занятость %, заселено/мест, свободно, число зданий и комнат |
| Питание (food) | `meal_enrollments` (active), `education_journeys` | студентов с планом питания, без плана |
| Эксплуатация (maintenance) | `maintenance_requests` | открытые, в работе, просрочено по SLA, разбивка по приоритету |
| Медпункт (doctor) | `medical_visits` | открытых приёмов, предстоящий/просроченный контроль |
| Психолог (psychologist) | `psych_sessions`, `psych_profiles` | открытых консультаций, предстоящий/просроченный контроль, разбивка по уровню риска |

Цвет каждой карточки — акцент соответствующего модуля (`getModuleColor(...)`);
заголовок страницы — зелёный `getModuleColor('reports')`. RTL-совместимый иврит,
без скобок.

## Корректность агрегации (важно)

PostgREST по умолчанию отдаёт не более `db-max-rows` (обычно **1000**) строк за
запрос и **МОЛЧА** обрезает остальное. Для агрегации это дало бы НЕВЕРНЫЕ итоги.
Поэтому:

- **COUNT (одно число)** — HEAD-запрос `Prefer: count=exact` через
  `.select(col, { count: 'exact', head: true })`, счёт берётся без выборки строк
  (число зданий, число студентов).
- **SUM по деньгам** — читаем ВСЕ строки постранично (`lib/reports/paging.ts`,
  `pageAll`, страница 1000) и суммируем в **целых копейках** (`toCents`/
  `centsToNumber` из `lib/finance/money.ts`), как `sumCentsByJourney` в
  `app/api/finance/students/route.ts`.
- **Логика по строкам** (просрочка заявок, контрольные визиты, занятость на
  сегодня, уникальные записи на питание) — постранично, затем чистые хелперы.

Никогда не полагаемся на то, что единичный `select` вернёт всё.

## Логика (чистая, юнит-тесты)

`lib/reports/summaries.ts` (+ `summaries.test.ts`, vitest) — только чистые
функции: принимают уже вычитанные строки / посчитанные агрегаты и возвращают
сводные объекты. «Сегодня» всегда передаётся параметром `todayISO` — Date.now НЕ
вызывается. Переиспользуют хелперы других модулей, где подходят.

- `studentStatusSummary(journeys)` → `{ total, by_status }`.
- `financeSummary(chargesActiveCents, paymentsApprovedCents, debtorCount)` →
  `{ charged, collected, outstanding, collection_rate, debtor_count }`.
  Деньги через `centsToNumber`; `collection_rate = round(collected/charged*100)`,
  **0 при `charged=0`** (без деления на ноль).
- `occupancySummary(totalCapacity, occupied)` →
  `{ capacity, occupied, free, occupancy_percent }`. `free = max(0, cap-occ)`;
  процент **0 при `capacity=0`**.
- `maintenanceSummary(tickets, todayISO)` → `{ open, in_progress, overdue,
  by_priority }`. Просрочка — `isOverdue` из `lib/maintenance/tickets`.
  `by_priority` — разбивка **активных** (open+in_progress) заявок; все известные
  приоритеты инициализируются нулём.
- `clinicSummary(visits, todayISO)` → `{ open_visits, upcoming_followups,
  overdue_followups }` — через `visitStats` из `lib/doctor/medical`.
- `counselingSummary(sessions, profiles, todayISO)` → `{ open_sessions,
  upcoming_followups, overdue_followups, by_risk }` — через `sessionStats` из
  `lib/psychologist/counseling`; `by_risk` — разбивка `psych_profiles.risk_level`.
- `foodSummary(activeEnrollments, totalStudents)` → `{ enrolled, unenrolled }`;
  `unenrolled = max(0, total-enrolled)`.

Тесты покрывают деление на ноль (`charged=0`, `capacity=0`), пустые входы и
границы дат контроля (`follow_up_date === today` → предстоящий, не просроченный).

## API (`app/api/reports/**`)

Все эндпоинты — `GET`, только чтение, гейт `reports.view`. Ошибки БД → HTTP через
`lib/reports/http.ts` (`mapDbError` + общий `errorResponse`; ошибка авторизации
несёт `status` 401/403, ошибка PostgREST — `code`). Каждый возвращает свой
сводный объект, чтобы сбой одного домена не ронял всю страницу.

| Метод + маршрут | Право | Назначение |
|-----------------|-------|------------|
| `GET /api/reports/students` | view | `studentStatusSummary` по `education_journeys` (постранично) |
| `GET /api/reports/finance` | view | суммы active-начислений и approved-платежей (постранично, копейки) + число должников; `financeSummary` |
| `GET /api/reports/dormitory` | view | Σ `dorm_rooms.capacity` + занятость на сегодня (`isActiveOn`); `occupancySummary` + число зданий/комнат |
| `GET /api/reports/food` | view | уникальные студенты с active-записью на питание + число студентов; `foodSummary` |
| `GET /api/reports/maintenance` | view | `maintenance_requests` (постранично); `maintenanceSummary` |
| `GET /api/reports/clinic` | view | `medical_visits` (постранично); `clinicSummary` |
| `GET /api/reports/counseling` | view | `psych_sessions` + `psych_profiles` (постранично); `counselingSummary` |

## UI (`app/dashboard/reports/**`)

- `page.tsx` — тонкий серверный гейт: сессия + `reports.view`, иначе редирект.
  Всё отображение делегируется клиентскому компоненту (i18n в проекте
  client-only).
- `ReportsClient.tsx` — адаптивная сетка карточек (`auto-fill minmax(280px,1fr)`).
  Каждая карточка (`ReportCard`) грузит свой эндпоинт независимо, со своим
  состоянием loading/error, и рендерит метрики с чёткими подписями на иврите.

## Права и доступ

- Каталог `module_privileges` для `reports` досеивается миграцией
  `20260707170000_reports.sql` идемпотентно. Сид 002 УЖЕ содержит `reports`
  `view`/`export` (sort_order 1/2) — они сохраняются (`ON CONFLICT DO NOTHING`),
  миграция ДОБАВЛЯЕТ только `manage` (sort_order 3 — первый свободный). Системным
  ролям `superadmin`/`tech_admin`/`campus_president` выдаётся `scope='all'` на
  `view`/`manage`. Без гранта ни один пользователь не проходит
  `requireReportsPrivilege`.
- Права читаются через `lib/reports/permissions.ts` (общий `reduceScopes` из
  `lib/permissions/scope.ts`, кэш 30 с).
- Привилегию `('reports','access')` (гейт сайдбара/`middleware`) не сеет ни одна
  миграция; `superadmin` обходит `middleware` и видит пункт. Прочим ролям для
  показа пункта в сайдбаре нужно выдать `reports.access` (Настройки → роли);
  доступ к странице определяется `reports.view`.
- Сайдбар: пункт «Отчёты» включён добавлением `'reports'` в `IMPLEMENTED_MODULES`
  (`lib/module-colors.ts`); пункт, иконка и палитра уже были в `Sidebar.tsx`/
  `module-colors.ts`; `middleware.PROTECTED_MODULES` уже содержит `reports`.

## i18n

`messages/{ru,he,en}.json`: namespace `reports.*`
(`title`/`subtitle`/`loading`/`error`/`empty`/`cards`/`metrics`, полный паритет
ru/he/en). Метки сайдбара `nav.reports` (`Отчёты`/`דוחות`/`Reports`) и
`moduleDesc.reports` в `lib/i18n/translations.ts` уже были.

## Проверка

Юнит-тесты `lib/reports/summaries.test.ts` (`npm test`, vitest) покрывают все
сводки, деление на ноль, пустые входы и границы дат контроля. `npm run type-check`
и `npm run build` — зелёные. Живой E2E не запускался. Модуль остаётся невидимым,
пока не применена миграция `20260707170000_reports.sql` (ручной шаг).
