# Модуль «Спонсоры / Доноры» (Sponsors / תורמים)

MVP модуля доходной стороны: **справочник доноров** и **реестр (ledger) их
пожертвований**. Код модуля — `sponsors`.

## Назначение

- Вести список доноров (физлица, организации, фонды) с контактными данными.
- Регистрировать пожертвования каждого донора: сумма, дата, назначение,
  кампания, способ, статус (обещано / получено / отменено).
- Показывать по каждому донору **сумму полученных пожертвований** и общую
  сводку кампуса (получено / обещано / отменено), а также разбивку по кампаниям.

Модуль **самостоятельный** — доноры и пожертвования НЕ привязаны к студентам
(нет `journey_id`, нет FK на учебные таблицы).

## ⚠️ Legacy `sponsor_profiles` — НЕ трогаем

В БД есть СТАРАЯ таблица `sponsor_profiles` от прежнего дизайна (и типы
`SponsorProfileRow/Insert/Update` в `types/database.ts`). Этот модуль её **не
использует и не изменяет**. Он владеет НОВЫМИ чистыми таблицами `sponsors` и
`donations`. Тип `SponsorRow` (новая таблица) — это НЕ `SponsorProfileRow`
(legacy); не путать.

## Схема БД

Миграция: `supabase/migrations/20260708120000_sponsors.sql` (идемпотентна;
применять вручную через Supabase Dashboard SQL Editor).

### `sponsors`

| Колонка | Тип | Примечание |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `name` | text NOT NULL | имя донора |
| `sponsor_type` | text NOT NULL | CHECK `individual` / `organization` / `foundation`, DEFAULT `individual` |
| `email`, `phone`, `address`, `contact_person`, `notes` | text | опционально |
| `is_active` | boolean NOT NULL | DEFAULT `true` |
| `created_by` | uuid | аудит |
| `created_at`, `updated_at` | timestamptz NOT NULL | триггер `set_updated_at` |

Индексы: `sponsor_type`, `is_active`.

### `donations`

| Колонка | Тип | Примечание |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `sponsor_id` | uuid NOT NULL | FK → `sponsors(id)` **ON DELETE CASCADE** |
| `amount` | numeric(12,2) NOT NULL | CHECK `amount >= 0` |
| `donation_date` | date NOT NULL | ISO `YYYY-MM-DD` |
| `purpose`, `campaign`, `method`, `notes` | text | опционально |
| `status` | text NOT NULL | CHECK `pledged` / `received` / `cancelled`, DEFAULT `pledged` |
| `created_by` | uuid | аудит |
| `created_at`, `updated_at` | timestamptz NOT NULL | триггер `set_updated_at` |

Индексы: `sponsor_id`, `status`, `campaign`.

## Деньги — в целых копейках, без float-дрейфа

Все суммы («получено» по донору, сводка, суммы по кампаниям) считаются в целых
**копейках** через `lib/finance/money.ts` (`toCents` / `sumCents` /
`centsToNumber`), чтобы избежать дрейфа float (`0.1 + 0.2 ≠ 0.3`). PostgREST
может отдать `numeric` строкой — money-хелперы это учитывают (`Number(...)`).

Чистая логика — `lib/sponsors/donations.ts`, покрыта vitest
(`lib/sponsors/donations.test.ts`, включая проверки `0.1 + 0.2`, пустой вход,
смешанные статусы, amount-строки):

- `donationStats(donations)` → `{ total_received, total_pledged, total_cancelled, count_by_status }`.
- `campaignTotals(donations, statusFilter='received')` → `Record<campaign, number>`.
- `matchesSponsorSearch(sponsor, q)` — app-side поиск по имени/email/телефону/контактному лицу.

Пакетные суммы для списка доноров — `lib/sponsors/donations-server.ts`
(`loadDonationAggregates`), читает пожертвования **постранично** (устойчиво к
`db-max-rows` PostgREST) за один проход, без N+1.

## API

Все маршруты гейтятся `requireSponsorsPrivilege('view'|'manage')`. Ошибки БД →
HTTP через `lib/sponsors/http.ts` (`mapDbError`): `PGRST116`→404, `22003`
(numeric overflow)→400, `22007/22008`→400, `23503/23514`→400, `23505`→409.

| Метод | Путь | Право | Назначение |
|---|---|---|---|
| GET | `/api/sponsors` | view | список доноров с `total_received` + сводка `stats`; фильтры `?search ?type ?active` |
| POST | `/api/sponsors` | manage | создать донора |
| GET | `/api/sponsors/[id]` | view | донор по id |
| PATCH | `/api/sponsors/[id]` | manage | правка донора |
| DELETE | `/api/sponsors/[id]` | manage | удалить донора (каскадно — его пожертвования) |
| GET | `/api/sponsors/[id]/donations` | view | пожертвования донора + `stats` + `campaigns` |
| POST | `/api/sponsors/[id]/donations` | manage | записать пожертвование |
| PATCH | `/api/sponsors/donations/[id]` | manage | правка пожертвования / смена статуса |

> **Маршрутизация:** статический сегмент `donations` имеет приоритет над
> динамическим `[id]`, поэтому `/api/sponsors/donations/{uuid}` попадает в
> `donations/[id]`, а `/api/sponsors/{uuid}` — в `[id]` (`sponsor_id` всегда
> uuid, не строка «donations»).

Валидация ввода — `lib/sponsors/validation.ts` (`isSponsorType`,
`isDonationStatus`, `isIsoDate`, `isValidAmount`): кривой ввод отсекается 400 ДО
обращения к БД.

## Права

Новых привилегий не изобретаем: модуль `sponsors` с привилегиями `view` /
`manage`. Каталог `module_privileges` (`sponsors`,`view`/`manage`) досеивается
идемпотентно (сиды 002/reseed определяют их на `sort_order` 1/2; живой каталог
мог «дрейфануть» — `ON CONFLICT DO NOTHING` безопасно пере-добавляет) и
выдаётся системным ролям `superadmin` / `tech_admin` / `campus_president`
`scope='all'`. Без этого блока даже superadmin не прошёл бы
`requireSponsorsPrivilege`.

Страницы `/dashboard/sponsors` защищены middleware (`PROTECTED_MODULES` уже
содержит `sponsors`).

## UI

- `/dashboard/sponsors` — список доноров с суммой полученного по каждому, сводка
  (получено / обещано / доноров), поиск + фильтр типа, кнопка «Новый донор»
  (manage). Клик по строке → карточка донора.
- `/dashboard/sponsors/[id]` — карточка донора: реквизиты (правка/удаление под
  manage), сводка и разбивка по кампаниям, реестр пожертвований со статус-бейджами,
  форма «Записать пожертвование» и правка/смена статуса пожертвования.

Цвет модуля — `getModuleColor('sponsors')` (янтарный). RTL, три языка
(`messages/{ru,he,en}.json`, namespace `sponsors`).

## Человеческий шаг

Миграция НЕ применяется автоматически. Пока не выполнен
`supabase/migrations/20260708120000_sponsors.sql` в проде, таблицы `sponsors` /
`donations` отсутствуют и модуль остаётся невидимым/неработающим (API вернёт
ошибку БД). После применения — модуль активен.
