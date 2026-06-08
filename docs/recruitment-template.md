# Шаблон процесса «Набор» (recruitment)

Процесс работы с лидом до перевода в абитуриенты. Источник структуры —
seed-скрипт `scripts/seed-workflow-recruitment.ts` (запуск:
`npm run seed:workflow-recruitment`).

- **code:** `recruitment`
- **name_ru:** Набор
- **description:** Процесс работы с лидом до перевода в абитуриенты

## Подэтапы

| sort | code | Название | has_tasks | is_optional |
|-----:|------|----------|:---------:|:-----------:|
| 10 | `contact` | Контакт | нет | нет |
| 20 | `documents` | Документы | да | нет |
| 30 | `event` | Мероприятие | * | да |
| 40 | `decision` | Решение | да | нет |

У всех подэтапов `has_action_log = true`, `is_addable = false`.

> \* В seed-скрипте `event` создаётся с `has_tasks: false`. В рабочей БД флаг
> позднее был выставлен в `true` (точечный фикс), чтобы у мероприятия
> появлялись задачи. См. примечание про задачи ниже.

## Финалы по подэтапам

### Контакт (`contact`)
| code | Название | is_positive |
|------|----------|:-----------:|
| `done_event_yes` | Готов, записан на мероприятие | ✓ |
| `done_event_skip` | Готов, мероприятие пропускаем | ✓ |
| `done_event_later` | Готов, мероприятие отложено | ✓ |

### Документы (`documents`)
| code | Название | is_positive |
|------|----------|:-----------:|
| `all_collected` | Все собраны | ✓ |
| `partial` | Частично собраны | ✓ |
| `not_provided` | Не предоставил | ✗ |

### Мероприятие (`event`)
| code | Название | is_positive |
|------|----------|:-----------:|
| `feedback_received` | Обратная связь получена | ✓ |
| `no_show` | Не приехал | ✗ |
| `refused` | Отказ от приезда | ✗ |

### Решение (`decision`)
| code | Название | is_positive |
|------|----------|:-----------:|
| `convert_to_applicant` | Перевести в абитуриенты | ✓ |
| `rejected` | Отказ | ✗ |
| `postponed` | Отложено | ✗ |

## Переходы между подэтапами

```
(start) ──► contact

contact ──(done_event_yes)──►   documents      [after_one]
contact ──(done_event_skip)──►  documents      [after_one]
contact ──(done_event_later)──► documents      [after_one]
contact ──(done_event_yes)──►   event          [after_one]
contact ──(done_event_later)──► event          [after_one]

documents ──(all_collected|partial|not_provided)──► decision  [after_all]
event     ──(feedback_received|no_show|refused)──►  decision  [after_all]
```

Особенности:
- После «Контакта» с `done_event_skip` подэтап **Мероприятие** не
  активируется (переход на `event` отсутствует) — он остаётся `waiting` и
  при закрытии становится `skipped`. Вернуть его можно кнопкой
  «▶ Активировать» (`reactivateStage`).
- В **Решение** ведут переходы `after_all`: оно активируется, только когда
  завершены все активные подэтапы-предшественники (Документы и/или
  Мероприятие).

## Задачи

Seed-скрипт заводит **2** шаблона задач (оба `default_assignee_type:
creator`):

| Подэтап | code | Заголовок | Приоритет | due_days |
|---------|------|-----------|-----------|---------:|
| `documents` | `request_docs` | Запросить документы | normal | 7 |
| `decision` | `make_decision` | Принять решение по лиду | high | 3 |

> **Расхождение с устной спецификацией.** В описании задачи упоминались
> последовательные задачи Мероприятия (`invite_event → arrange_trip →
> get_feedback`) и задачи в «Контакте». В **репозитории** (seed-скрипт)
> их нет — там только две задачи выше, и `task_transitions` для них не
> заводятся скриптом. Возможно, эти задачи и переходы были добавлены
> напрямую в рабочую БД и не отражены в коде.
>
> **TODO: уточнить у разработчика** и при необходимости перенести
> конфигурацию задач/переходов Мероприятия в seed-скрипт, чтобы код был
> источником правды.

## Конверсия в абитуриенты

Финал `convert_to_applicant` в подэтапе **Решение** переводит journey в
статус `applicant` (`completeStage` / `closeProcessEarly`). Процесс
закрывается с `finish_reason = 'converted'`.
