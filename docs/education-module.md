# Модуль «Образование»

Управление учебной траекторией человека: от лида до выпускника. Главная
страница — `app/dashboard/education/page.tsx` (вкладки «Набор», «Приём»,
«Учёба»).

## Journey: лид → абитуриент → студент

Учебная траектория хранится в **`education_journeys`** — одна запись на
journey, а текущая стадия живёт в поле `education_status`:

```
lead  ──►  applicant  ──►  student   (→ graduated / expelled / lost / on_leave)
```

- Один `person` может иметь несколько journey (повторное обучение,
  параллельные направления).
- Переход `lead → applicant` выполняется финалом `convert_to_applicant`
  процесса «Набор» (см. [recruitment-template.md](./recruitment-template.md)).
- `JourneyStatus` (тип в `types/database.ts`):
  `lead | applicant | student | graduated | expelled | lost | on_leave`.

> Часть значений enum зарезервирована под расширение; на момент написания
> БД-enum `person_education_status` содержит `lead | applicant | student |
> alumni`.

## Учреждения

Тип `Institution` (`types/database.ts`):

| code | Учреждение |
|------|-----------|
| `school` | Школа |
| `college` | Колледж |
| `university` | Университет |
| `emuna` | Эмуна |
| `touro` | Touro University |
| `other` | Другое |

Учебные заведения как подразделения помечаются флагом
`departments.is_educational_institution = true` (используется каскадным
селектором направлений).

## Каскадный селектор направлений

Вместо свободного текста направление выбирается каскадом
**Учреждение → Направление → Уровень/Курс** (миграция
`20260607220000_cascade_directions.sql`):

| Таблица | Поля |
|---------|------|
| `reference_directions` | `department_id`, `name_ru`, `code`, `has_levels`, `sort_order`, `is_active` |
| `reference_levels` | `direction_id`, `name_ru`, `sort_order`, `is_active` |

`reference_directions.has_levels` указывает, есть ли у направления уровни.
Компонент выбора — `components/education/CascadeDirectionSelector.tsx`.

## Интересы лида — `lead_interests`

Желаемые направления лида:

| Поле | Назначение |
|------|-----------|
| `person_id` | владелец |
| `direction_id` | направление из `reference_directions` (каскад) |
| `level_id` | уровень из `reference_levels` (если есть) |
| `free_text` | свободный текст — fallback, если каскад не выбран |

API `GET /api/education/leads` собирает интересы и отдаёт человекочитаемую
метку: «Учреждение → Направление, Курс» либо `free_text`.

## Карточка лида / абитуриента

Страница `app/dashboard/education/leads/[id]/page.tsx` — вкладочный layout
с данными человека. Справа — блок процессов
**`components/workflow/ProcessInfoBlock.tsx`**:

- список подэтапов процесса с их статусами и финалами;
- модалка подэтапа: задачи (со ссылками на `/dashboard/tasks/[id]`) и
  кнопки финалов (цвета по `is_positive` и набору «оранжевых» кодов);
- кнопка «▶ Активировать» у `skipped`-подэтапа;
- кнопка «Завершить процесс досрочно»;
- кнопка «Схема процесса» (Mermaid).

Права на странице подбираются через `pickPrivilege(education_status, …)`
(см. [permissions.md](./permissions.md)).

## Вкладки страницы «Образование»

| Вкладка | Содержимое | Источник данных |
|---------|-----------|-----------------|
| Набор | Лиды (`education_status = 'lead'`) | `GET /api/education/leads` |
| Приём | Абитуриенты (`status = 'applicant'`) | `GET /api/education/journeys?status=applicant` |
| Учёба | Студенты/группы | `components/.../StudyTab` |

Список лидов сортируется по дате создания (`application_date`, по убыванию
по умолчанию) с кликабельными заголовками колонок.
