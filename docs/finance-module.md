# Модуль «Финансы» (Finance) — биллинг обучения

MVP биллинга шкар лимуд (платы за обучение) студентов. Модель —
**расчётный ПНК (running ledger)**: начисления и платежи висят на
`education_journeys(id)` студента и НЕ связаны друг с другом (платёж не
привязан к конкретному начислению). Баланс не хранится — считается при
чтении.

## Модель данных

Обе таблицы созданы миграцией `20260705190000_finance_billing.sql`
(деньги — `NUMERIC(12,2)`, одна подразумеваемая валюта учреждения;
мультивалютность не вводится).

### `finance_charges` — начисления (что студент ДОЛЖЕН)

| Поле           | Тип           | Примечание                                  |
|----------------|---------------|---------------------------------------------|
| `id`           | uuid PK       | —                                           |
| `journey_id`   | uuid FK       | → `education_journeys(id)` **ON DELETE RESTRICT** |
| `amount`       | NUMERIC(12,2) | `CHECK (amount >= 0)`                        |
| `description`  | text NOT NULL | назначение начисления                       |
| `period_label` | text          | напр. «2026 семестр 1»                       |
| `due_date`     | date          | срок оплаты                                 |
| `status`       | text          | `active` \| `cancelled` (default `active`)  |
| `created_by`   | uuid FK       | → `persons(id)` ON DELETE SET NULL          |
| `created_at` / `updated_at` | timestamptz | триггер `set_updated_at`       |

### `finance_payments` — платежи (что ПОЛУЧЕНО)

| Поле          | Тип           | Примечание                                            |
|---------------|---------------|-------------------------------------------------------|
| `id`          | uuid PK       | —                                                     |
| `journey_id`  | uuid FK       | → `education_journeys(id)` **ON DELETE RESTRICT**     |
| `amount`      | NUMERIC(12,2) | `CHECK (amount > 0)`                                   |
| `paid_at`     | date NOT NULL | дата платежа                                          |
| `method`      | text          | способ оплаты                                         |
| `reference`   | text          | референс / номер                                      |
| `status`      | text          | `pending` \| `approved` \| `cancelled` (default `pending`) |
| `recorded_by` | uuid FK       | кто внёс (→ `persons`, SET NULL)                       |
| `approved_by` | uuid FK       | кто подтвердил (→ `persons`, SET NULL)                 |
| `approved_at` | timestamptz   | момент подтверждения                                  |
| `created_at` / `updated_at` | timestamptz | триггер `set_updated_at`           |

Индексы `idx_finance_charges_journey` / `idx_finance_payments_journey` на
`journey_id`.

## Правило баланса

```
balance = Σ(finance_charges.amount  WHERE status = 'active')
        − Σ(finance_payments.amount WHERE status = 'approved')
```

Считается **при чтении**, без хранения и без N+1. В списке студентов
агрегируется пакетно (две выборки с `.in('journey_id', …)`), суммы
накапливаются в **целых копейках** (`lib/finance/money.ts` — `toCents` /
`sumCents` / `centsToNumber`), чтобы избежать дрейфа float. `pending` и
`cancelled` в баланс НЕ входят.

**Инвариант:** сумму в подтверждённой части баланса может изменить
**только** право `approve_payment` (эндпоинт `/approve`). `create_invoice`
подтверждённый платёж может лишь отменить (`cancelled`) — правка суммы или
возврат в `pending` у `approved`-платежа запрещены (409).

## API

Все маршруты — под `lib/finance/permissions.ts` (паттерн
`lib/alumni/permissions.ts`, `module='finance'`, кэш 30 c). Ошибки БД →
HTTP через общий `lib/finance/http.ts` (`mapDbError`); даты валидируются
`lib/finance/validation.ts` (`isIsoDate`).

| Метод + маршрут | Право | Назначение |
|-----------------|-------|------------|
| `GET /api/finance/students` | `view` | студенты + вычисляемый баланс (`?search=`) |
| `GET /api/finance/journeys/[id]/ledger` | `view` | ПНК студента: начисления + платежи + итоги |
| `POST /api/finance/journeys/[id]/charges` | `create_invoice` | создать начисление |
| `PATCH /api/finance/charges/[id]` | `create_invoice` | правка / отмена начисления (`status='cancelled'`) |
| `DELETE /api/finance/charges/[id]` | `create_invoice` | жёсткое удаление начисления |
| `POST /api/finance/journeys/[id]/payments` | `create_invoice` | зафиксировать платёж (создаётся `pending`) |
| `POST /api/finance/payments/[id]/approve` | `approve_payment` | подтвердить платёж (только из `pending`; ставит `approved_by`/`approved_at`) |
| `PATCH /api/finance/payments/[id]` | `create_invoice` | правка / отмена платежа (`status` — только `pending`/`cancelled`) |

Разделение прав: `view` — чтение списков/ПНК/баланса; `create_invoice` —
создание/правка/отмена начисления И запись платежа (входит как `pending`);
`approve_payment` — подтверждение платежа. Финансы в MVP — `scope='all'`.

## UI

- `/dashboard/finance` — список студентов: колонки «Начислено / Оплачено /
  Баланс» (баланс красный, если студент должен; зелёный, если оплачено),
  поиск, клик по строке → карточка.
- `/dashboard/finance/[id]` (`[id]` = journey id) — финансовая карточка:
  карточки итогов (баланс, начислено, подтверждено, ожидает), таблицы
  начислений и платежей со статус-бейджами, inline-формы «Начисление» и
  «Платёж», построчные действия «Отменить / Удалить / Подтвердить».
  Кнопки действий гейтятся **флагами, вычисленными на сервере**
  (`create_invoice` / `approve_payment`) в `page.tsx`, а данные ПНК тянет
  клиент (`FinanceLedgerClient`) через API — чтобы обновляться после
  каждой мутации.

## Права и доступ

- Каталог `module_privileges` для `finance` (`view` / `create_invoice` /
  `approve_payment` / `manage_budget` / `export_reports`) засеян в
  `002_roles_and_privileges.sql`. Как и у `alumni`, на боевой БД сид `002`
  применён не полностью, поэтому миграция `20260705190000`
  **досеивает каталог сама** (`INSERT … ON CONFLICT DO NOTHING`) и выдаёт
  `role_privileges` `finance.*` (scope `all`) системным ролям `superadmin`
  / `tech_admin` / `campus_president`. Без гранта ни один пользователь
  (включая superadmin на уровне API) не проходит `requireFinancePrivilege`.
- Привилегию `('finance','access')` (гейт сайдбара/`middleware`) не сеет
  ни одна миграция; `superadmin` обходит `middleware`. Прочим ролям для
  доступа к странице нужно выдать `finance.access` (Настройки → роли).
- Сайдбар: пункт «Финансы» включён добавлением `'finance'` в
  `IMPLEMENTED_MODULES` (`lib/module-colors.ts`).

## Отложено (не в этом MVP)

Бюджеты (`manage_budget`), пожертвования/спонсоры, зарплаты; генерация
PDF счёта/квитанции; возвраты/зачёты; мультивалютность; экспорт отчётов
(`export_reports`); привязка платежа к конкретному начислению.

## i18n

Подписи — в `messages/{ru,he,en}.json`: `navigation.finance` и namespace
`finance.*` (`list` / `ledger` / `action` / `form` / `status` / `confirm`,
полный паритет ru/he/en).

## Проверка

E2E (14/14): один временный студент; начисления 5000 + 3000 `active` и
1000 `cancelled`; платежи 4000 `pending` и 2000 `approved` → баланс
6000; подтверждение платежа 4000 → баланс 2000; студент виден в
`/api/finance/students` с балансом 2000. Данные E2E удаляются FK-безопасно
(платежи → начисления → journey → person → audit_log), superadmin не
трогается.
