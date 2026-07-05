# Движок процессов (Workflow Engine)

Универсальный движок бизнес-процессов: шаблон описывает структуру
(подэтапы, задачи, финалы, переходы), а инстанс проигрывает её для
конкретного journey.

Вся логика исполнения живёт в **PL/pgSQL-функциях (RPC) в Postgres** —
каждая операция движка выполняется одной транзакцией. TypeScript-слой
(route-хендлеры) отвечает только за аутентификацию, проверку привилегий и
вызов RPC. Прежние helpers `lib/workflow/*.ts` (`startProcess`,
`completeStage`, `closeProcessEarly`, `handleTaskCompletion`,
`reactivateStage`) удалены — конверсия завершена миграциями
`20260702200000`–`20260703120000`.

## Таблицы

### Шаблоны (конструктор)

| Таблица | Назначение |
|---------|-----------|
| `process_templates` | Шаблон процесса (`code`, `name_ru`, `is_active`) |
| `stage_templates` | Подэтапы шаблона (`code`, `sort_order`, `has_tasks`, `has_action_log`, `is_optional`, `is_addable`) |
| `stage_task_templates` | Шаблоны задач подэтапа (`code`, `title`, `default_assignee_type`, `default_priority`, `default_due_days`) |
| `stage_finals` | Возможные финалы подэтапа (`code`, `name_ru`, `is_positive`, `closes_process`, `process_finish_reason`) |
| `stage_transitions` | Переходы между подэтапами |
| `task_transitions` | Переходы между задачами внутри подэтапа |

### Инстансы (выполнение)

| Таблица | Назначение |
|---------|-----------|
| `process_instances` | Запущенный процесс (`journey_id`, `status`, `finish_reason`) |
| `stage_instances` | Состояние подэтапа (`status`, `final_code`, `activated_at`, `completed_at`) |
| `tasks` | Задачи (ссылаются на `stage_instance_id` и `stage_task_template_id`) |
| `stage_actions` | Журнал действий подэтапа (если `has_action_log`) |

Статусы:
- `process_instances.status`: `active | completed | cancelled`
- `stage_instances.status`: `waiting | active | completed | skipped | cancelled`

## Переходы

### Между подэтапами — `stage_transitions`

Поля: `from_stage_template_id` (NULL = стартовый подэтап),
`to_stage_template_id`, `trigger_final_code`, `activation_mode`.

- `trigger_final_code` — какой финал предыдущего подэтапа запускает переход.
- `activation_mode`:
  - **`after_one`** — активировать цель, как только сработал один переход.
  - **`after_all`** — активировать, только когда **все** подэтапы-
    предшественники цели завершены (синхронизация веток).

### Между задачами — `task_transitions`

Аналогично, но внутри одного подэтапа. `from_task_code IS NULL` = стартовая
задача подэтапа. `activation_mode` (`after_one` / `after_all`) определяет,
создаётся ли следующая задача сразу или после завершения всех
предшественниц. Связь задачи с шаблоном — через `tasks.stage_task_template_id`.

## RPC-функции движка (PL/pgSQL)

| Функция | Миграция | Вызывается из | Что делает |
|---------|----------|---------------|-----------|
| `start_process(p_process_code, p_journey_id, p_actor_id)` | `20260702210000` | `POST /api/applications` и `POST /api/education/leads` — автозапуск «Набора» при создании лида; route-хендлеры `complete` / `close-early` — автозапуск «Приёма» после конверсии | Создаёт `process_instance`, все `stage_instances` (стартовые → `active`, остальные → `waiting`) и стартовые задачи активных подэтапов. Идемпотентно: при активном инстансе того же шаблона возвращает существующий (`already_existed: true`). |
| `complete_stage(p_stage_instance_id, p_final_code, p_actor_id, p_result_data)` | `20260703120000`; текущая версия — `20260703170000` | `POST /api/workflow/stages/[stageInstanceId]/complete` | Завершает подэтап с финалом, закрывает его задачи. Если у финала `closes_process = true` — закрывает весь процесс (см. ниже). Иначе активирует следующие подэтапы по `stage_transitions` (`after_one`/`after_all`), создаёт их стартовые задачи, помечает недостижимые `waiting` → `skipped`; при отсутствии активных подэтапов — закрывает процесс. |
| `close_process_early(p_process_instance_id, p_final_code, p_actor_id)` | `20260702230000`; текущая версия — `20260703170000` | `POST /api/workflow/processes/[processInstanceId]/close-early` | Принудительно закрывает весь процесс: незавершённые подэтапы → `skipped`, задачи → `cancelled`, `finish_reason` по `p_final_code`. `p_final_code` валидируется по финалам **последнего** подэтапа (по `sort_order`). |
| `handle_task_completion(p_task_id, p_actor_id)` | `20260702220000` | `PATCH /api/tasks/[id]` — при переходе статуса задачи в `completed` | Создаёт следующие задачи подэтапа по `task_transitions` (`after_one`/`after_all`, дедупликация по `to_task_code`). Для задачи без шаблона или без привязки к подэтапу — тихий no-op (штатный путь для legacy-задач). |
| `reactivate_stage(p_stage_instance_id, p_actor_id)` | `20260702200000` | `POST /api/workflow/stages/[stageInstanceId]/reactivate` | Возвращает `skipped`-подэтап в `active` (только если процесс ещё `active`) и создаёт его стартовые задачи. |

Общие свойства всех пяти функций:

- **Одна транзакция на операцию.** Ошибка на любом шаге откатывает всю
  операцию целиком — частичных состояний больше нет (это был главный риск
  прежней TS-версии, см. историческую аналитику
  [workflow-transaction-risk-analysis.md](./workflow-transaction-risk-analysis.md)).
- **Системные события** (`process_events`) — best-effort: обёрнуты во
  вложенный `BEGIN/EXCEPTION` (savepoint) и не роняют операцию.
- **Title задач** формируется внутри RPC как
  `"<шаблон.title>: <person.full_name>"`, если ФИО известно.
- **Назначение задач** по `default_assignee_type`: `creator` →
  `p_actor_id` (статус `pending`); `department` / `position` →
  соответствующее поле (статус `unassigned`); иначе — `unassigned`.
- **Стартовые задачи подэтапа** — по `task_transitions` с
  `from_task_code IS NULL`; если переходов у подэтапа нет — создаются все
  его шаблоны задач (legacy-fallback).
- **Коды ошибок**: `P0002` — не найдено (→ 404), `22023` — недопустимое
  состояние/вход (→ 400); маппинг в HTTP-статусы — `lib/api/handler.ts`
  (`jsonError` / `mapPgError`).

## Что осталось в TypeScript (`lib/workflow/`)

| Файл | Назначение |
|------|-----------|
| `start-process.ts` | Только тип `StartProcessResult` — форма ответа RPC `start_process`. Логики нет. |
| `active-stages.ts` | Read-only helper `getActiveStagesWithTasks(sb, journeyIds)` — активные подэтапы с открытыми задачами для колонки «Текущий этап и задачи» в списках (лиды, абитуриенты). Не часть движка — только чтение для UI. |

Route-хендлеры (`app/api/workflow/**`, `app/api/tasks/[id]`) выполняют
аутентификацию и проверку привилегий, затем вызывают RPC.

## Закрытие процесса финалом (`closes_process`)

Поля `stage_finals.closes_process` (boolean) и
`stage_finals.process_finish_reason` (text) позволяют пометить финал как
«закрывающий процесс». Логика реализована в `complete_stage`:

1. После завершения текущего подэтапа (`status = 'completed'`) и его задач
   загружается запись `stage_finals` по `stage_template_id` + `code`.
2. Если `closes_process = true`:
   - Все оставшиеся `active/waiting` подэтапы процесса → `cancelled`.
   - Все незавершённые задачи процесса → `cancelled`.
   - `process_instance.status = 'cancelled'`,
     `finish_reason = process_finish_reason`.
   - Конверсия journey по `finish_reason` (см. ниже).
   - Возврат без обработки `stage_transitions`.
3. Если `closes_process = false` (или финал не найден) — обычный поток.

> `close_process_early` не подходит для этого сценария: он валидирует
> `p_final_code` по финалам **последнего** подэтапа, что упадёт ошибкой 400,
> если `closes_process = true` стоит у промежуточного подэтапа.

## Автоматический перевод `waiting → skipped`

После каждого `complete_stage` движок проверяет оставшиеся `waiting`-
подэтапы процесса: если **все** их предшественники (по `stage_transitions`)
находятся в `completed` или `skipped`, и сам подэтап не был только что
активирован — он помечается `skipped` автоматически.

Это решает сценарий, когда финал контакта пропускает мероприятие
(`done_event_skip`): мероприятие не получает активирующего перехода,
остаётся `waiting`, затем при завершении документов подэтап
«Мероприятие» оказывается недостижимым и становится `skipped` →
«Решение» может активироваться (предшественники: документы=completed,
мероприятие=skipped).

Вернуть `skipped`-подэтап в работу можно через `reactivate_stage`.

## Конверсия journey

Выполняется внутри `complete_stage` / `close_process_early`:

- **lead → applicant**: финал `convert_to_applicant` процесса «Набор» —
  либо через `closes_process` (`finish_reason = 'converted'`), либо в
  обычном потоке при авто-закрытии процесса →
  `education_journeys.education_status = 'applicant'`.
- **applicant → student**: финалы `admitted` / `admitted_conditional`
  процесса «Приём» (через `closes_process`) →
  `education_status = 'student'`; при `admitted_conditional` дополнительно
  `is_conditional_admission = true`
  (см. [admission-template.md](./admission-template.md)).

После конверсии lead → applicant route-хендлеры `complete` / `close-early`
автоматически запускают процесс «Приём» (`start_process('admission', …)`) —
best-effort: ошибка логируется, но не валит уже выполненную конверсию.

## Флаг `has_tasks`

`stage_templates.has_tasks` должен быть синхронизирован с наличием
`stage_task_templates`: при добавлении первого шаблона задачи нужно
выставлять `has_tasks = true`, иначе движок (`start_process` /
`complete_stage` / `reactivate_stage`) не создаст задачи для подэтапа
(см. [conventions.md](./conventions.md)).

## Визуализация

Схема процесса рисуется через **Mermaid** в `components/workflow/`
(`ProcessGraphModal`, `ProcessInfoBlock`). Данные отдаёт
`app/api/workflow/processes/[processInstanceId]/graph/route.ts` (узлы из
`stage_templates` + статусы из `stage_instances`, рёбра из
`stage_transitions`).

## История конверсии TS → RPC

Ход и обоснование переноса движка из TypeScript в Postgres задокументированы
в исторических материалах:
[workflow-transaction-risk-analysis.md](./workflow-transaction-risk-analysis.md)
(анализ рисков прежней TS-версии),
[complete-stage-conversion-prep.md](./complete-stage-conversion-prep.md)
(подготовка конверсии `completeStage`),
[complete-stage-baseline.md](./complete-stage-baseline.md)
(эталон поведения, снятый до конверсии).
