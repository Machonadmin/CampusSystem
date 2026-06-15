# Движок процессов (Workflow Engine)

Универсальный движок бизнес-процессов: шаблон описывает структуру
(подэтапы, задачи, финалы, переходы), а инстанс проигрывает её для
конкретного journey.

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

## Helpers (`lib/workflow/`)

| Функция | Файл | Что делает |
|---------|------|-----------|
| `startProcess(sb, code, journeyId, actorId)` | `start-process.ts` | Создаёт `process_instance`, все `stage_instances` (стартовые → `active`, остальные → `waiting`), стартовые задачи. Идемпотентно: при активном инстансе того же шаблона возвращает существующий. |
| `completeStage(sb, stageInstanceId, finalCode, actorId, resultData?)` | `complete-stage.ts` | Завершает подэтап с финалом, закрывает его задачи. Проверяет `closes_process` у финала: если true — закрывает весь процесс (см. ниже). Иначе активирует следующие подэтапы по `stage_transitions`, помечает недостижимые `waiting` → `skipped`. При отсутствии активных подэтапов — закрывает процесс. |
| `closeProcessEarly(sb, processInstanceId, finalCode, actorId)` | `close-process-early.ts` | Принудительно закрывает весь процесс: незавершённые подэтапы → `skipped`, задачи → `cancelled`. `finalCode` берётся из финалов **последнего** подэтапа (по `sort_order`). |
| `handleTaskCompletion(sb, taskId, actorId)` | `handle-task-completion.ts` | По завершении задачи создаёт следующие задачи подэтапа по `task_transitions`. |
| `reactivateStage(sb, stageInstanceId, actorId)` | `reactivate-stage.ts` | Возвращает `skipped`-подэтап в `active` (если процесс ещё `active`) и создаёт его стартовые задачи. |

Вспомогательные (в `start-process.ts`):
- `mapTaskTemplate(tt, stageInstanceId, actorId, personFullName?)` — шаблон
  задачи → `TaskInsert`. Title формируется как `"<tt.title>: <personFullName>"`,
  если ФИО известно.
- `createStartingTasks(sb, stageTemplateId, stageInstanceId, actorId, personFullName?)`
  — создаёт стартовые задачи подэтапа (по `task_transitions` с
  `from_task_code IS NULL`; если переходов нет — создаёт все шаблоны как
  legacy-fallback).

> Транзакций между шагами **нет** — при ошибке возможно частичное
> состояние. Это сознательное решение движка; helpers пишут предупреждения
> в консоль вместо отката.

## Закрытие процесса финалом (`closes_process`)

Поля `stage_finals.closes_process` (boolean) и
`stage_finals.process_finish_reason` (text) позволяют пометить финал как
«закрывающий процесс». Логика реализована в `completeStage` (шаг 3b):

1. После завершения текущего подэтапа (`status = 'completed'`) и его задач
   загружается запись `stage_finals` по `stage_template_id` + `code`.
2. Если `closes_process = true`:
   - Все оставшиеся `active/waiting` подэтапы процесса → `cancelled`.
   - Все незавершённые задачи процесса → `cancelled`.
   - `process_instance.status = 'cancelled'`,
     `finish_reason = process_finish_reason`.
   - Если `process_finish_reason = 'converted'` →
     `education_journeys.education_status = 'applicant'`.
   - Возврат без обработки `stage_transitions`.
3. Если `closes_process = false` (или финал не найден) — обычный поток.

> `closeProcessEarly` не подходит для этого сценария: он валидирует
> `finalCode` по финалам **последнего** подэтапа, что упадёт ошибкой 400,
> если `closes_process = true` стоит у промежуточного подэтапа.

## Автоматический перевод `waiting → skipped`

После каждого `completeStage` движок проверяет оставшиеся `waiting`-
подэтапы процесса: если **все** их предшественники (по `stage_transitions`)
находятся в `completed` или `skipped`, и сам подэтап не был только что
активирован — он помечается `skipped` автоматически.

Это решает сценарий, когда финал контакта пропускает мероприятие
(`done_event_skip`): мероприятие не получает активирующего перехода,
остаётся `waiting`, затем при завершении документов подэтап
«Мероприятие» оказывается недостижимым и становится `skipped` →
«Решение» может активироваться (предшественники: документы=completed,
мероприятие=skipped).

Вернуть `skipped`-подэтап в работу можно через `reactivateStage`.

## Конверсия лида

Финал с `process_finish_reason = 'converted'` (через `closes_process`)
или финал `convert_to_applicant` в обычном потоке (шаг 6 `completeStage`)
переводят journey: `education_journeys.education_status = 'applicant'`.

## Флаг `has_tasks`

`stage_templates.has_tasks` должен быть синхронизирован с наличием
`stage_task_templates`: при добавлении первого шаблона задачи нужно
выставлять `has_tasks = true`, иначе движок (`startProcess` /
`completeStage`) не создаст задачи для подэтапа
(см. [conventions.md](./conventions.md)).

## Визуализация

Схема процесса рисуется через **Mermaid** в `components/workflow/`
(`ProcessGraphModal`, `ProcessInfoBlock`). Данные отдаёт
`app/api/workflow/processes/[processInstanceId]/graph/route.ts` (узлы из
`stage_templates` + статусы из `stage_instances`, рёбра из
`stage_transitions`).
