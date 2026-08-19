# Модуль «Контакты» (Contacts / אנשי קשר)

MVP справочника внешних контактов и организаций: поставщики, партнёры,
госорганы, экстренные, медицина, финансы, образование, прочее. У каждого
контакта — тип (организация/человек), категория, email, телефон, адрес, сайт,
контактное лицо, заметки и флаг активности. Поиск, валидация email и агрегаты —
чистая, покрытая юнит-тестами логика (`lib/contacts/directory.ts`), НЕ в БД.

**САМОСТОЯТЕЛЬНЫЙ справочник** — модуль НЕ привязан к студентам: нет `journey_id`
и вообще никаких FK на учебные таблицы (в отличие от food/doctor/documents).

Страницы `/dashboard/contacts` защищены `middleware` (`PROTECTED_MODULES` уже
содержит `contacts`); каждый маршрут API гейтится `contacts.view` /
`contacts.manage`.

## Модель данных

Одна таблица, миграция `20260707190000_contacts.sql` (идемпотентна;
`set_updated_at()` определяется в самом файле через `CREATE OR REPLACE`).

### `contacts` — справочник

| Поле             | Тип         | Примечание                                                  |
|------------------|-------------|-------------------------------------------------------------|
| `id`             | uuid PK     | —                                                           |
| `name`           | text        | NOT NULL, имя организации или человека                     |
| `contact_type`   | text        | CHECK `organization`\|`person`, default `organization`     |
| `category`       | text        | CHECK `supplier`\|`government`\|`partner`\|`emergency`\|`medical`\|`financial`\|`education`\|`other`, default `other` |
| `email`          | text        | nullable, валидируется `isValidEmail` в API               |
| `phone`          | text        | nullable                                                   |
| `address`        | text        | nullable                                                   |
| `website`        | text        | nullable                                                   |
| `contact_person` | text        | nullable, контактное лицо организации                      |
| `notes`          | text        | заметки                                                    |
| `is_active`      | boolean     | NOT NULL default `true`, мягкая деактивация через PATCH   |
| `created_by`     | uuid        | кто внёс запись                                            |
| `created_at` / `updated_at` | timestamptz | триггер `set_updated_at`                     |

Индексы: `category`, `contact_type`, `is_active`.

## Логика (чистая, юнит-тесты)

`lib/contacts/directory.ts` (+ `directory.test.ts`, vitest).

- `isValidEmail(s)` — простая здравая проверка: непустой, без пробелов, ровно
  один `@` с непустой локальной частью, домен содержит точку и все метки домена
  непустые — отсекает точку с краю и двойные точки. Сознательно НЕ полная
  RFC-валидация — цель отсечь пустое и явно кривое (400 до БД).
- `matchesSearch(c, q)` — case-insensitive подстрока по имени, email, телефону,
  контактному лицу и категории; пустой запрос совпадает со всеми. Используется
  и в API (`?search`), и в клиенте.
- `contactStats(contacts)` — агрегат `{ total, active, by_type, by_category }`.
  Разбивки включают все контакты; активность отражается счётчиком `active`.
  Используется для сводной панели.

## API (`app/api/contacts/**`)

Чтение — `contacts.view`, запись — `contacts.manage`. Ошибки БД → HTTP через
`lib/contacts/http.ts` (`mapDbError`, включая `PGRST116→404`). Ввод валидируется
`lib/contacts/validation.ts` (`isContactType`, `isContactCategory`) и
`isValidEmail` ДО обращения к БД (кривой ввод → 400, а не 500).

| Метод + маршрут | Право | Назначение |
|-----------------|-------|------------|
| `GET /api/contacts` | view | справочник; фильтры `?search` (app-side, `matchesSearch`) `?category` `?type` `?active`; постранично; ответ `{ contacts, stats }` — stats по ВСЕМУ справочнику |
| `POST /api/contacts` | manage | создать: `name` (обяз.), `contact_type`, `category`, `email` (валидируется если задан), `phone`, `address`, `website`, `contact_person`, `notes`, `is_active`; аудит `created_by` из сессии |
| `GET /api/contacts/[id]` | view | контакт по id |
| `PATCH /api/contacts/[id]` | manage | правка полей; `email` `null/''` → очистить; `name` не может стать пустым; `is_active` — boolean |
| `DELETE /api/contacts/[id]` | manage | удаление контакта; мягкая деактивация — через `PATCH is_active=false` |

Выборка списка читает ПОСТРАНИЧНО (устойчиво к db-max-rows PostgREST).

## UI (`app/dashboard/contacts/**`)

Одна страница `/dashboard/contacts`:

- Заголовок с кнопкой «Новый контакт» для роли с `manage`.
- Сводная панель: всего / активных + чипы категорий с количеством.
- Поиск (app-side, `matchesSearch`) + фильтр категории.
- Таблица: имя (с контактным лицом), тип, категория, email, телефон, статус
  (активен/неактивен). Клик по строке для `manage` открывает inline-редактор.
- Inline-редактор (создание и правка): имя, тип, категория, email, телефон,
  контактное лицо, адрес, сайт, заметки, чекбокс активности; сохранить/отмена и
  удаление в режиме правки. Клиент повторяет валидацию имени и email до отправки.

Цвет модуля — розовый `getModuleColor('contacts')`. RTL-совместимый иврит, без скобок.

## Права и доступ

- Каталог `module_privileges` для `contacts` досеивается миграцией идемпотентно.
  Сид 002 НЕ содержит привилегий `contacts` вовсе — миграция заводит `view`
  (sort_order 1) и `manage` (sort_order 2); `ON CONFLICT DO NOTHING` сохраняет
  идемпотентность. Системным ролям `superadmin`/`tech_admin`/`campus_president`
  выдаётся `scope='all'` на `view`/`manage`. Без гранта ни один пользователь не
  проходит `requireContactsPrivilege`.
- Права читаются через `lib/contacts/permissions.ts` (общий `reduceScopes` из
  `lib/permissions/scope.ts`, кэш 30 с).
- Сайдбар: пункт «Контакты» включён добавлением `'contacts'` в
  `IMPLEMENTED_MODULES` (`lib/module-colors.ts`); пункт, иконка и метка
  (`nav.contacts`) уже были в `Sidebar.tsx` / `lib/i18n/translations.ts`;
  `middleware.PROTECTED_MODULES` уже содержит `contacts`.

## i18n

`messages/{ru,he,en}.json`: namespace `contacts.*` (`list`/`stats`/`fields`/
`types`/`categories`/`form`/`status`/`errors`, полный паритет ru/he/en — 45
ключей). Метка сайдбара `nav.contacts` (`Контакты`/`אנשי קשר`/`Contacts`) в
`lib/i18n/translations.ts` уже была.

## Проверка

Юнит-тесты `lib/contacts/directory.test.ts` (`npm test`, vitest) покрывают:
валидные/пустые/кривые email (двойной `@`, домен без точки, пробелы), поиск по
всем полям с null-полями и пустым запросом, агрегаты с неактивными контактами.
`npm run type-check` и `npm run build` — зелёные. Живой E2E не запускался: он
требует применённой миграции (ручной шаг).

## Ручной шаг (миграция)

Модуль остаётся невидимым/неработающим, пока в боевой Supabase не применена
`supabase/migrations/20260707190000_contacts.sql` (создаёт `contacts`, индексы,
триггер и раздаёт права). Применять вручную через Supabase Dashboard SQL Editor.
