# `completeStage` → RPC: подготовка к совместной сессии

> **Историческая заметка:** конверсия завершена — `complete_stage` теперь
> RPC (миграция `20260703120000`, см. [workflow-engine.md](./workflow-engine.md)),
> `lib/workflow/complete-stage.ts` удалён. Документ ниже — запись подготовки
> к той сессии, оставлена как история решения, не как открытая задача.

> Документ подготовки, НЕ изменение кода. Цель — чтобы к моменту, когда мы
> сядем вместе конвертировать `completeStage` в атомарный RPC (5-я, последняя
> и самая рискованная функция движка), уже был: (1) точный разбор всех веток
> и всех записей в БД, (2) список тонкостей, которые обязательно сохранить
> дословно или явно решить, (3) ручной чек-лист регрессии для прогона до и
> после изменения. Три предыдущие функции (`reactivateStage`, `startProcess`,
> `handleTaskCompletion`) + `closeProcessEarly` уже переведены в RPC и
> проверены живьём.

Исходник: `lib/workflow/complete-stage.ts`. Вызывающий:
`app/api/workflow/stages/[stageInstanceId]/complete/route.ts`.

---

## 1. Структура функции (сверху вниз)

Вход: `stageInstanceId`, `finalCode`, `actorId`, `resultData?`.

1. **Загрузка** stage_instance + template + process. Проверки:
   - не найдено → 404 (`Подэтап не найден`);
   - `status <> 'active'` → 400 (`Подэтап не активен`).
2. **Завершить текущий подэтап**: `status='completed'`, `final_code`,
   `completed_at`, `completed_by`, `result_data=resultData ?? {}`. + событие
   `Подэтап завершён: <finalCode>` (best-effort).
3. **Завершить задачи этого подэтапа**: все, кроме уже `completed`/`cancelled`
   → `completed`, `completed_at=now`.

Далее — **развилка** по флагу `stage_finals.closes_process` для (текущий
подэтап, `finalCode`):

### Ветка A — `closes_process = true` (шаг 3b, ранний return)
- `processFinishReason = final.process_finish_reason ?? finalCode`.
- а. Остальные `active|waiting` подэтапы → **`cancelled`** (+ событие
  `Подэтап отменён` на каждый, best-effort).
- б. Незавершённые задачи всех подэтапов процесса → `cancelled`.
- в. `process_instances.status = '`**`cancelled`**`'`, `finish_reason`,
  `finished_at`.
- г. Если `processFinishReason === 'converted'` →
  `education_journeys.education_status = 'applicant'` (**без**
  `application_date`).
- **return** `{ process_completed: true, finish_reason: processFinishReason,
  activated_stage_ids: [] }`.

### Ветка B — обычный поток (`closes_process` ложно/нет финала)
4. Найти исходящие переходы `stage_transitions` по
   `(from_stage_template_id, trigger_final_code=finalCode)`.
5. **Активировать целевые подэтапы**: для каждого уникального
   `to_stage_template_id`:
   - `after_one` → активировать;
   - `after_all` → активировать, только если **все** предшественники
     (`stage_instances` предшествующих stage_template) в статусе
     `completed|skipped`;
   - найти `waiting` instance цели → `active`, `activated_at` + событие
     `Подэтап активирован` (best-effort);
   - если у цели `has_tasks` и `actorId` не null →
     `createStartingTasks` (создаёт стартовые задачи).
6. **5b. Skip недостижимых** `waiting`-подэтапов: если все их предшественники
   уже `completed|skipped` → `skipped`. **Ошибка тут проглатывается**
   (`console.error`, без throw) — единственное место, кроме событий, где сбой
   не роняет операцию.
7. **6. Авто-закрытие процесса**: если не осталось `active` подэтапов →
   `process_instances.status = '`**`completed`**`'`, `finish_reason` из
   `finalCode` (convert→converted / rejected / postponed / иначе null),
   `finished_at`. Если `finalCode==='convert_to_applicant'` →
   journey `education_status='applicant'` (**без** `application_date`).
- **return** `{ process_completed, finish_reason, activated_stage_ids }`.

---

## 2. Полный список записей в БД (что RPC должен воспроизвести)

| # | Таблица | Условие | Изменение |
|---|---------|---------|-----------|
| 2 | stage_instances | текущий | → completed + final_code/completed_*/result_data |
| 2 | process_events | текущий | «Подэтод завершён» (best-effort) |
| 3 | tasks | этого подэтапа, не completed/cancelled | → completed |
| 3b-а | stage_instances | active/waiting процесса | → **cancelled** |
| 3b-а | process_events | каждый отменённый | «Подэтап отменён» (best-effort) |
| 3b-б | tasks | незавершённые всего процесса | → cancelled |
| 3b-в | process_instances | этот | → **cancelled** + finish_reason |
| 3b-г | education_journeys | если converted | → applicant |
| 5 | stage_instances | целевой waiting | → active |
| 5 | process_events | целевой | «Подэтап активирован» (best-effort) |
| 5 | tasks | если у цели has_tasks | createStartingTasks |
| 5b | stage_instances | недостижимые waiting | → skipped (ошибка проглатывается) |
| 6 | process_instances | если не осталось active | → **completed** + finish_reason |
| 6 | education_journeys | если convert_to_applicant | → applicant |

---

## 3. Тонкости, которые ОБЯЗАТЕЛЬНО сохранить дословно (или явно решить вместе)

1. **Конверсия лида закодирована в ДВУХ местах** (3b-г и 6) с разной обвязкой.
   Это тот самый «дубль», отмеченный в
   `workflow-transaction-risk-analysis.md` §5. При переносе — не «упрощать»
   в одно место без явного согласования: ветки реально разные (см. п.2).

2. **Разный статус процесса в двух ветках.** Ветка A (closes_process) ставит
   процессу `status='cancelled'`; ветка 6 (авто-закрытие) — `status='completed'`.
   Для стандартного шаблона «Набор» все финалы с `closes_process=true`
   (включая `convert_to_applicant` на подэтапе «Решение») идут через ветку A →
   процесс закрывается как **`cancelled`** с `finish_reason='converted'`.
   Ветка 6 для `convert_to_applicant` фактически не срабатывает в «Наборе»
   (сработала бы только если бы этот финал НЕ закрывал процесс). Эту
   зависимость поведения от флага `closes_process` надо перенести один в один.

3. **`application_date` НЕ обновляется** ни в 3b-г, ни в 6 — в отличие от
   `close_process_early` (там при конверсии ставится `application_date=now`).
   Это существующее расхождение между функциями. Кандидат на выравнивание,
   но **только по явному решению** — по умолчанию сохраняем текущее поведение
   `completeStage` (не трогаем `application_date`).

4. **Асимметрия проверки `after_all`.** Шаг 5 (активация) считает
   предшественников завершёнными по `every(status ∈ {completed,skipped})`,
   **без** проверки «предшественников найдено >= ожидалось». Шаг 5b (skip
   недостижимых) — с проверкой `length >= predTemplateIds.length`. Это
   расхождение внутри одной функции; при переносе сохранить оба варианта как
   есть (не «чинить» на ходу).

5. **Проглоченная ошибка в 5b.** Единственное не-событийное место, где сбой
   логируется и НЕ роняет операцию. В атомарном RPC надо решить: (а)
   сохранить best-effort (savepoint вокруг skip) — тогда неудачный skip не
   откатывает уже сделанные активации; или (б) сделать атомарным. По аналогии
   с предыдущими конверсиями «событие=best-effort, данные=атомарно» — но 5b
   это данные, а не событие. **Явная точка решения для сессии.** Рекомендация:
   savepoint (сохранить исходное best-effort-поведение дословно), т.к. skip
   недостижимых — вторичная оптимизация состояния, а не критичная запись.

6. **Все события (`process_events`) — best-effort** (`void _evErr`),
   как и в трёх уже перенесённых функциях: savepoint на каждый INSERT.

7. **`resultData`** передавать как `jsonb`-параметр (`p_result_data jsonb`),
   `result_data = COALESCE(p_result_data, '{}'::jsonb)`.

8. **Дубль с `close_process_early` НЕ объединять.** Ветка A похожа на
   `closeProcessEarly`, но: A ставит `cancelled`, `closeProcessEarly` —
   `completed`; A триггерится финалом текущего подэтапа, `closeProcessEarly`
   валидирует финал против последнего подэтапа. Это разные операции.

9. **Маппинг ошибок в route.** Сейчас
   `complete/route.ts` читает только `e.status`/`e.message` (как это было в
   `close-early` до правки). После перехода на RPC надо так же перевести его
   на `jsonError`, иначе «не найдено» (P0002) станет 500. Коды: 404 не найден
   → `P0002`; 400 не активен → `22023`.

---

## 4. Ручной чек-лист регрессии (прогнать ДО и ПОСЛЕ конверсии)

Все сценарии — на тестовом лиде через `POST /api/applications` (автозапуск
«Набора»), проверка через `/graph`, `/stages/[id]`, события; уборка тестовых
данных после. Ожидаемые состояния фиксируем ДО (на текущем TS-коде), потом
сверяем ПОСЛЕ (на RPC) — должны совпасть один в один.

**Сценарий 1 — обычный переход `after_one` (`done_event_skip`).**
Контакт → `done_event_skip`. Ожидаем: Контакт=completed, его задача=completed,
Документы=active + 2 задачи созданы, Мероприятие остаётся waiting, процесс
active. `activated_stage_ids`=[Документы].

**Сценарий 2 — `after_one` c ветвлением (`done_event_yes`).**
Новый лид, Контакт → `done_event_yes`. Ожидаем: активируются И Документы, И
Мероприятие (два перехода из одного финала), у обоих созданы задачи.

**Сценарий 3 — `after_all` слияние на «Решение».**
Довести лид до состояния, где и Документы, и Мероприятие активны. Завершить
Документы (`all_collected`) → «Решение» НЕ активируется (Мероприятие ещё не
завершено). Затем завершить Мероприятие (`feedback_received`) → «Решение»
активируется. Это ключевая проверка ветки B/after_all.

**Сценарий 4 — skip недостижимого (5b) через `done_event_skip`.**
Контакт → `done_event_skip` (Мероприятие остаётся waiting без входящего
перехода от этого финала). Завершить Документы (`all_collected`). Ожидаем:
«Решение» активируется, а Мероприятие → **skipped** (его предшественники
терминальны, оно недостижимо).

**Сценарий 5 — `closes_process` без конверсии (ветка A).**
Контакт → `rejected`. Ожидаем: все остальные подэтапы → cancelled, все задачи
→ cancelled, процесс `status='cancelled'`, `finish_reason='rejected'`, journey
остаётся `lead`. События «Подэтап отменён» на отменённых.

**Сценарий 6 — конверсия в абитуриента (ветка A, `converted`).**
Довести до «Решение» активным, завершить `convert_to_applicant`. Ожидаем:
процесс `status='cancelled'`, `finish_reason='converted'`, journey
`education_status='applicant'`, `process_completed=true`. (Сверить, что
`application_date` НЕ изменился — см. тонкость №3.)

**Сценарий 7 — ошибки.** Завершение несуществующего подэтапа → 404; завершение
уже не-active подэтапа → 400.

Для каждого сценария фиксируем: статусы всех подэтапов, статусы всех задач,
`process.status` + `finish_reason`, `journey.education_status`, набор событий,
и возвращаемый объект (`activated_stage_ids`, `process_completed`,
`finish_reason`).

---

## 5. Предлагаемый план сессии

1. Вместе просмотреть §3 (тонкости) — согласовать по каждой: сохранить как
   есть или выровнять. Особенно №3 (`application_date`) и №5 (5b best-effort).
2. Прогнать чек-лист §4 на **текущем** коде, записать фактические состояния
   как «эталон».
3. Написать RPC `complete_stage(...)`, миграцию (не применять сразу — как
   обычно, применяешь ты вручную).
4. Применить миграцию, прогнать тот же чек-лист на RPC, сверить с эталоном.
5. Коммит локально (не пушить).
