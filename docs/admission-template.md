# Шаблон процесса «Приём» (admission)

Процесс приёмной комиссии: абитуриент → студент.

- **code:** `admission`
- **name_ru:** Приём
- **description:** Процесс приёмной комиссии: абитуриент → студент

Автозапуск — при конверсии лида в абитуриента: route-хендлеры
`POST /api/workflow/stages/[stageInstanceId]/complete` и
`POST /api/workflow/processes/[processInstanceId]/close-early` после
`finish_reason = 'converted'` вызывают RPC `start_process('admission', …)`.
Вызов best-effort (ошибка логируется, но не валит уже выполненную
конверсию) и идемпотентен (повторный запуск вернёт существующий инстанс).

Миграции: `20260703170000_admission_student_conversion.sql` (конверсия в
студента + флаг `is_conditional_admission`),
`20260703180000_admission_process_template.sql` (сам шаблон).

## Подэтапы

| sort | code | Название | has_tasks | is_optional |
|-----:|------|----------|:---------:|:-----------:|
| 10 | `admission_decision` | Приёмное решение | да | нет |
| 20 | `waitlist` | Список ожидания | да | нет |

У всех подэтапов `has_action_log = true`, `is_addable = false`.

## Финалы по подэтапам

### Приёмное решение (`admission_decision`)

| code | Название | is_positive | closes_process | process_finish_reason |
|------|----------|:-----------:|:--------------:|:---------------------:|
| `admitted` | Принят | ✓ | **true** | `admitted` |
| `admitted_conditional` | Условно принят | ✓ | **true** | `admitted_conditional` |
| `waitlisted` | В список ожидания | ✗ | false | — |
| `rejected` | Отклонён | ✗ | **true** | `rejected` |

### Список ожидания (`waitlist`)

| code | Название | is_positive | closes_process | process_finish_reason |
|------|----------|:-----------:|:--------------:|:---------------------:|
| `admitted` | Принят из списка | ✓ | **true** | `admitted` |
| `rejected` | Отклонён из списка | ✗ | **true** | `rejected` |

Финалы с `closes_process = true` закрывают весь процесс через `complete_stage`
(см. [workflow-engine.md](./workflow-engine.md)). Конверсия в студента —
по `process_finish_reason`:

- `admitted` → `education_journeys.education_status = 'student'`;
- `admitted_conditional` → то же + `education_journeys.is_conditional_admission = true`;
- `rejected` → journey остаётся `applicant`.

Как и у «Набора», успешное закрытие через `closes_process` оставляет
`process_instances.status = 'cancelled'` (с `finish_reason = 'admitted' /
'admitted_conditional' / 'rejected'`) — это сознательная особенность движка.

## Переходы между подэтапами

```
(start) ──► admission_decision

admission_decision ──(waitlisted)──► waitlist  [after_one]
```

Финалы `admitted`, `admitted_conditional`, `rejected` не ведут к следующим
подэтапам — процесс закрывается через `closes_process = true`. Пока
абитуриент в списке ожидания, процесс остаётся открытым.

## Задачи и переходы между задачами

`task_transitions` для этого шаблона нет — при активации подэтапа движок
создаёт все его шаблоны задач (legacy-fallback, по одной задаче на подэтап).

### Приёмное решение (`admission_decision`)

| code | Заголовок | Назначение | Приоритет |
|------|-----------|-----------|-----------|
| `make_decision` | Рассмотреть заявку и принять решение | `creator` | high |

### Список ожидания (`waitlist`)

| code | Заголовок | Назначение | Приоритет |
|------|-----------|-----------|-----------|
| `waitlist_review` | Решение по списку ожидания | `creator` | normal |

`creator` здесь — сотрудник, выполнивший конверсию лида (он же actor
автозапуска процесса).

## Title задач с ФИО абитуриента

Как и в «Наборе», title формируется как `"<title>: <person.full_name>"`,
например: `"Рассмотреть заявку и принять решение: Иванов Иван"`.
