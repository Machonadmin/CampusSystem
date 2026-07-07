# Модуль «Документы» (Documents / מסמכים)

MVP пер-студенческого реестра документов с контролем срока годности: у каждого
студента — список документов (удостоверение, паспорт, сертификат, медицинский,
финансовый, договор, виза, прочее) с датами выдачи и окончания, ссылкой на файл,
статусом `active`/`archived` и заметками. Расчёты срока годности
(`expired` / `expiring_soon`) и агрегаты — чистая, покрытая юнит-тестами логика
(`lib/documents/expiry.ts`), НЕ в БД.

Страницы `/dashboard/documents` защищены `middleware` (`PROTECTED_MODULES` уже
содержит `documents`); каждый маршрут API гейтится `documents.view` /
`documents.manage`.

## ⚠️ Legacy-таблицы НЕ трогаем

В боевой БД от старого дизайна остались таблицы `document_types`,
`document_categories`, `person_documents`, `journey_documents` (шаблоны и
категории документов). **Этот модуль их не использует и не изменяет** — он владеет
отдельной НОВОЙ чистой таблицей `document_records`, привязанной к `journey_id`.
Legacy-таблицы оставлены как есть, чтобы не сломать старые данные и ссылки; их
типы в `types/database.ts` (`DocumentTypeRow` и т.д.) не пересекаются с новыми
`DocumentRecord*`.

## Модель данных

Одна таблица, миграция `20260707180000_documents.sql` (идемпотентна;
`set_updated_at()` определяется в самом файле через `CREATE OR REPLACE`).
Записи висят на `education_journeys(id)` студента (`journey_id`), НЕ на `persons` —
тот же приём анкоринга, что в остальных учебных модулях (food/doctor/dormitory).

### `document_records` — реестр документов

| Поле          | Тип         | Примечание                                                  |
|---------------|-------------|-------------------------------------------------------------|
| `id`          | uuid PK     | —                                                           |
| `journey_id`  | uuid FK     | → `education_journeys(id)` **ON DELETE CASCADE**            |
| `doc_type`    | text        | CHECK `id_card`\|`passport`\|`certificate`\|`medical`\|`financial`\|`contract`\|`visa`\|`other`, default `other` |
| `title`       | text        | NOT NULL, название документа                               |
| `issued_date` | date        | дата выдачи (nullable)                                     |
| `expiry_date` | date        | дата окончания (nullable — бессрочный)                    |
| `file_url`    | text        | ссылка на файл (nullable)                                  |
| `status`      | text        | CHECK `active`\|`archived`, default `active`               |
| `notes`       | text        | заметки                                                    |
| `created_by`  | uuid        | кто внёс запись                                            |
| `created_at` / `updated_at` | timestamptz | триггер `set_updated_at`                    |

Индексы: `journey_id`, `doc_type`, и частичный `(expiry_date) WHERE status='active'`
(быстрый worklist истекающих документов).

## Логика (чистая, юнит-тесты)

`lib/documents/expiry.ts` (+ `expiry.test.ts`, vitest). «Сегодня» всегда
передаётся параметром `todayISO` — Date.now НЕ вызывается, логика
детерминирована. Даты — ISO `YYYY-MM-DD`, сравниваются лексикографически.

- `daysUntilExpiry(expiryISO, todayISO)` — целое число дней до окончания (через
  UTC-полночь); отрицательное — уже просрочен, `0` — истекает сегодня.
- `isExpired(d, todayISO)` — `status==='active'` и `expiry_date !== null` и
  `expiry_date < todayISO` (строго в прошлом). **Граница: дата = сегодня → НЕ
  просрочен** (истекает сегодня, последний действительный день). Архивные исключены.
- `isExpiringSoon(d, todayISO, thresholdDays = 30)` — `status==='active'`,
  `expiry_date !== null`, `expiry_date >= todayISO` и до окончания не больше
  `thresholdDays`. **Граница: дата = сегодня → истекает скоро** (не просрочен).
- `documentStats(docs, todayISO)` — агрегат `{ total, active, archived, expired,
  expiring_soon, by_type }`. `expired` и `expiring_soon` взаимоисключающи и берут
  только активные; `by_type` — разбивка по типам (все документы).

`isExpired`/`isExpiringSoon` используются в списке студентов (флаги
`has_expired`/`has_expiring_soon`, `lib/documents/records-server.ts`),
в worklist `/expiring` и для подсветки строк в карточке студента.

## API (`app/api/documents/**`)

Чтение — `documents.view`, запись — `documents.manage`. Ошибки БД → HTTP через
`lib/documents/http.ts` (`mapDbError`, включая `PGRST116→404`). Ввод валидируется
`lib/documents/validation.ts` (`isIsoDate`, `isDocType`, `isDocStatus`) ДО обращения
к БД (кривой ввод → 400, а не 500).

| Метод + маршрут | Право | Назначение |
|-----------------|-------|------------|
| `GET /api/documents/students` | view | студенты (`education_journeys status='student'`) + persons; число документов и флаги `has_expired`/`has_expiring_soon`; `?search` по ФИО/email/телефонам app-side |
| `GET /api/documents/journeys/[id]` | view | документы студента (по сроку окончания, затем свежие) |
| `POST /api/documents/journeys/[id]` | manage | добавить документ: `doc_type`, `title` (обяз.), `issued_date?`, `expiry_date?`, `file_url?`, `notes`; статус `active`, аудит `created_by` из сессии |
| `GET /api/documents/[id]` | view | документ по id |
| `PATCH /api/documents/[id]` | manage | правка полей; архивирование `status='archived'` / возврат `status='active'` (`isDocStatus`); даты `null/''` → очистить |
| `DELETE /api/documents/[id]` | manage | жёсткое удаление документа |
| `GET /api/documents/expiring` | view | worklist по всем студентам: активные документы с датой окончания, разбиты на `expired`/`expiring_soon` (чистые хелперы), с именем студента |

Мягкое архивирование — через `PATCH status='archived'`; `DELETE` — необратимое
жёсткое удаление (только `manage`). Все выборки списков читают ПОСТРАНИЧНО
(устойчиво к db-max-rows PostgREST).

## UI (`app/dashboard/documents/**`)

- `/dashboard/documents` — список студентов с индикатором: бейдж числа документов
  + бейдж «просрочен» (красный) / «истекает» (янтарный). Поиск. Сверху — worklist
  истекающих документов (`expired` + `expiring_soon`). Клик по студенту → его
  реестр.
- `/dashboard/documents/[id]` — реестр документов студента: таблица (тип, название
  со ссылкой на файл, дата выдачи, дата окончания с подсветкой red/amber, статус),
  форма «добавить документ» (тип, название, даты выдачи/окончания, ссылка, заметки),
  архивирование/возврат и удаление каждого документа. Действия под `manage`
  гейтятся флагом с сервера.

Цвет модуля — серый `getModuleColor('documents')`. RTL-совместимый иврит, без скобок.

## Права и доступ

- Каталог `module_privileges` для `documents` досеивается миграцией идемпотентно.
  Сид 002 УЖЕ содержит `documents` `view`/`create`/`manage_templates`
  (sort_order 1/2/3) — они сохраняются (`ON CONFLICT DO NOTHING`), миграция
  ДОБАВЛЯЕТ только `manage` (свободный sort_order 4). Системным ролям
  `superadmin`/`tech_admin`/`campus_president` выдаётся `scope='all'` ТОЛЬКО на
  `view`/`manage`. Без гранта ни один пользователь не проходит
  `requireDocumentsPrivilege`.
- Права читаются через `lib/documents/permissions.ts` (общий `reduceScopes` из
  `lib/permissions/scope.ts`, кэш 30 с).
- Сайдбар: пункт «Документы» включён добавлением `'documents'` в
  `IMPLEMENTED_MODULES` (`lib/module-colors.ts`); пункт, иконка и метка
  (`nav.documents`) уже были в `Sidebar.tsx` / `lib/i18n/translations.ts`;
  `middleware.PROTECTED_MODULES` уже содержит `documents`.

## i18n

`messages/{ru,he,en}.json`: namespace `documents.*` (`list`/`expiring`/`fields`/
`types`/`status`/`add`/`registry`/`errors`, полный паритет ru/he/en — 47 ключей).
Метка сайдбара `nav.documents` (`Документы`/`מסמכים`/`Documents`) в
`lib/i18n/translations.ts` уже была.

## Проверка

Юнит-тесты `lib/documents/expiry.test.ts` (`npm test`, vitest) покрывают границы:
`expiry_date === today` → expiring_soon (не expired), `null` даты окончания
(бессрочный), исключение архивных из счётчиков просрочки, край порога
(`thresholdDays`) и разбивку `by_type`. `npm run type-check` и `npm run build` —
зелёные. Живой E2E не запускался: он требует применённой миграции (ручной шаг).

## Ручной шаг (миграция)

Модуль остаётся невидимым/неработающим, пока в боевой Supabase не применена
`supabase/migrations/20260707180000_documents.sql` (создаёт `document_records`,
индексы, триггер и раздаёт права). Применять вручную через Supabase Dashboard
SQL Editor.
