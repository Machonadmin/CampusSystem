# Ключевые таблицы БД

Полные типы всех таблиц — в `types/database.ts` (Row / Insert / Update +
интерфейс `Database`). Ниже — самые важные сущности. Миграции лежат в
`supabase/migrations/` и применяются **вручную** через Supabase Dashboard.

## Люди и траектория

### `persons`
Базовая карточка человека.

| Поле | Тип | Примечание |
|------|-----|-----------|
| `id` | uuid | PK |
| `last_name` / `first_name` / `middle_name` | text | ФИО по частям |
| `full_name` | text | **GENERATED ALWAYS** — read-only, не вставлять/обновлять |
| `hebrew_name` | text | |
| `gender` | enum | `female \| male \| other` |
| `birth_date` | date | |
| `photo_url` | text | |
| `email`, `phones`, `address` | text/json | `phones`/`address` — JSON |
| `education_status` | enum | дублирующая отметка стадии |
| `created_at`, `updated_at` | timestamptz | |

### `education_journeys`
Учебная траектория (см. [education-module.md](./education-module.md)).
Ключевые поля: `person_id`, `education_status`, `opened_at`, `closed_at`,
`application_date`, `referral_source`, `desired_department_id`,
`primary_department_id`, `specialty_id`, `created_at`, `updated_at`.

### `lead_interests`
Желаемые направления лида: `person_id`, `direction_id`, `level_id`,
`free_text`.

## Задачи

### `tasks`
| Поле | Примечание |
|------|-----------|
| `title`, `description`, `module`, `priority`, `status` | основное |
| `assignee_type` | `person \| department \| position \| unassigned` |
| `assignee_id` / `department_id` / `position_id` | по типу назначения |
| `creator_id` | NOT NULL |
| `due_date` / `due_time` / `due_all_day` | срок |
| `recurrence_*` | повторяющиеся задачи |
| `stage_instance_id` | привязка к подэтапу процесса |
| `stage_task_template_id` | шаблон задачи (для `task_transitions`; NULL — legacy) |

## Движок процессов

(подробно — в [workflow-engine.md](./workflow-engine.md))

### Шаблоны
- `process_templates` — `code`, `name_ru`, `is_active`.
- `stage_templates` — `process_template_id`, `code`, `sort_order`,
  `has_tasks`, `has_action_log`, `is_optional`, `is_addable`.
- `stage_task_templates` — `stage_template_id`, `code`, `title`,
  `default_assignee_type`, `default_priority`, `default_due_days`,
  `sort_order`.
- `stage_finals` — `stage_template_id`, `code`, `name_ru`, `is_positive`,
  `sort_order`.
- `stage_transitions` — `from_stage_template_id` (NULL=старт),
  `to_stage_template_id`, `trigger_final_code`, `activation_mode`.
- `task_transitions` — `stage_template_id`, `from_task_code` (NULL=старт),
  `to_task_code`, `activation_mode`, `sort_order`.

### Инстансы
- `process_instances` — `process_template_id`, `journey_id`, `status`,
  `finish_reason`, `started_at`, `finished_at`.
- `stage_instances` — `process_instance_id`, `stage_template_id`,
  `status`, `final_code`, `activated_at`, `completed_at`, `completed_by`.
- `stage_actions` — журнал действий подэтапа.

## Справочники направлений

- `reference_directions` — `department_id`, `name_ru`, `code`,
  `has_levels`, `sort_order`, `is_active`.
- `reference_levels` — `direction_id`, `name_ru`, `sort_order`,
  `is_active`.

## Права

`roles`, `module_privileges`, `role_privileges` (со `scope`),
`person_roles`, `person_privileges` — см. [permissions.md](./permissions.md).

## Триггеры `updated_at`

`updated_at` обновляется триггером `BEFORE UPDATE`. В проекте есть **две**
функции-триггера (по историческим причинам сосуществуют, делают одно и
то же — `NEW.updated_at = NOW()`):

| Функция | Введена в миграции |
|---------|--------------------|
| `update_updated_at_column()` | `20260608180000_add_updated_at_universal.sql` |
| `set_updated_at()` | `20260608190000_add_updated_at_remaining.sql` |

Эти две миграции добавили `updated_at` (+ `created_at`, где не было) и
триггеры к основным сущностям:

- **Первая миграция (12 триггеров):** `education_journeys`, `stage_finals`,
  `stage_transitions`, `lead_interests`, `stage_templates`,
  `stage_task_templates`, `task_transitions`, `person_relatives`,
  `reference_levels`, `departments`, `roles`, `person_accounts`.
- **Вторая миграция (9 триггеров):** `alumni_profiles`,
  `module_privileges`, `quality_checks`, `reference_cities`,
  `sponsor_profiles`, `staff_positions`, `staff_profiles`,
  `stage_actions`, `task_comments`.

Часть таблиц (`persons`, `communities`, образовательные справочники и др.)
получила триггер `updated_at` ещё в более ранних миграциях.

**Junction- и history-таблицы** (`person_roles`, `role_privileges`,
`task_watchers`, `class_enrollments`, `class_teachers`,
`journey_communities`, `person_status_history`, `enrollments`,
`person_family`, `person_privileges`) получили только `created_at`
**без** триггера `updated_at` — для них имеет смысл момент записи, а не
обновления.
