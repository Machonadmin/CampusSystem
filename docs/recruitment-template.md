# Шаблон процесса «Набор» (recruitment)

Процесс работы с лидом до перевода в абитуриенты.

- **code:** `recruitment`
- **name_ru:** Набор
- **description:** Процесс работы с лидом до перевода в абитуриенты

Автозапуск — при создании нового лида (`POST /api/education/leads`).

## Подэтапы

| sort | code | Название | has_tasks | is_optional |
|-----:|------|----------|:---------:|:-----------:|
| 10 | `contact` | Контакт | да | нет |
| 20 | `documents` | Документы | да | нет |
| 30 | `event` | Мероприятие | да | да |
| 40 | `decision` | Решение | да | нет |

У всех подэтапов `has_action_log = true`, `is_addable = false`.

## Финалы по подэтапам

### Контакт (`contact`)

| code | Название | is_positive | closes_process | process_finish_reason |
|------|----------|:-----------:|:--------------:|:---------------------:|
| `done_event_yes` | Записан на мероприятие | ✓ | false | — |
| `done_event_skip` | Без мероприятия | ✓ | false | — |
| `rejected` | Отказ | ✗ | **true** | `rejected` |
| `postponed` | Поступление отложено | ✗ | **true** | `postponed` |

### Документы (`documents`)

| code | Название | is_positive | closes_process |
|------|----------|:-----------:|:--------------:|
| `all_collected` | Все собраны | ✓ | false |
| `partial` | Частично собраны | ✓ | false |
| `not_provided` | Не предоставил | ✗ | false |

### Мероприятие (`event`)

| code | Название | is_positive | closes_process |
|------|----------|:-----------:|:--------------:|
| `feedback_received` | Обратная связь получена | ✓ | false |
| `no_show` | Не приехал | ✗ | false |
| `refused` | Отказ от приезда | ✗ | false |

### Решение (`decision`)

| code | Название | is_positive | closes_process | process_finish_reason |
|------|----------|:-----------:|:--------------:|:---------------------:|
| `convert_to_applicant` | Перевести в абитуриенты | ✓ | **true** | `converted` |
| `rejected` | Отказ | ✗ | **true** | `rejected` |
| `postponed` | Отложено | ✗ | **true** | `postponed` |

Финалы с `closes_process = true` закрывают весь процесс через `complete_stage`
(см. [workflow-engine.md](./workflow-engine.md)). При `process_finish_reason = 'converted'`
дополнительно: `education_journeys.education_status = 'applicant'` и
автозапуск процесса «Приём» (см. [admission-template.md](./admission-template.md)).

## Переходы между подэтапами

```
(start) ──► contact

contact ──(done_event_yes)──►  documents  [after_one]
contact ──(done_event_skip)──► documents  [after_one]
contact ──(done_event_yes)──►  event      [after_one]

documents ──(all_collected|partial|not_provided)──► decision  [after_all]
event     ──(feedback_received|no_show|refused)──►  decision  [after_all]
```

Финалы `rejected` и `postponed` (Контакт, Решение) не ведут к следующим
подэтапам — вместо этого процесс закрывается через `closes_process = true`.

**Сценарий `done_event_skip`:**
- Контакт → `done_event_skip` → активируются Документы.
- Мероприятие не получает перехода, остаётся `waiting`.
- При завершении Документов движок помечает Мероприятие → `skipped`
  (все предшественники Решения в terminal-состоянии → Решение активируется).
- Мероприятие можно вернуть кнопкой «▶ Активировать» (RPC `reactivate_stage`).

## Задачи и переходы между задачами

### Контакт (`contact`)

Одна стартовая задача:

| code | Заголовок | Назначение |
|------|-----------|-----------|
| `first_contact` | Связаться с новым лидом | `creator` |

### Документы (`documents`)

Две **параллельные** стартовые задачи (обе `from_task_code IS NULL`):

| code | Заголовок | Назначение |
|------|-----------|-----------|
| `collect_docs` | Собрать документы | `creator` |
| `verify_docs` | Проверить документы | `creator` |

Обе создаются при активации подэтапа. Завершение одной не блокирует другую.

### Мероприятие (`event`)

Три **последовательные** задачи:

| code | Заголовок | Назначение | Активируется после |
|------|-----------|-----------|-------------------|
| `invite_event` | Пригласить на мероприятие | `creator` | старт (NULL) |
| `arrange_trip` | Организовать приезд | `creator` | `invite_event` |
| `get_feedback` | Получить обратную связь | `creator` | `arrange_trip` |

При активации подэтапа создаётся только `invite_event`. RPC
`handle_task_completion` создаёт следующую задачу после завершения предыдущей.

### Решение (`decision`)

| code | Заголовок | Назначение |
|------|-----------|-----------|
| `make_decision` | Принять решение по лиду | `creator` |

## Title задач с ФИО лида

`mapTaskTemplate` формирует title как `"<tt.title>: <person.full_name>"`,
если ФИО известно. Например: `"Связаться с новым лидом: Иванов Иван Иванович"`.
