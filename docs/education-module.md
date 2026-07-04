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
  При конверсии автоматически запускается процесс «Приём».
- Переход `applicant → student` выполняется финалами `admitted` /
  `admitted_conditional` процесса «Приём»
  (см. [admission-template.md](./admission-template.md)); при условном
  зачислении ставится флаг `education_journeys.is_conditional_admission`.
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
| Приём | Абитуриенты (`status = 'applicant'`) | `GET /api/education/journeys?status=applicant&with_stages=1` |
| Учёба | Студенты/группы | `components/.../StudyTab` |

### Список лидов (вкладка «Набор»)

Колонки: **ФИО** / **Учреждение** / **Направление** / **Телефон** /
**Email** / **Дата подачи** / **Текущий этап и задачи**.

Колонка «Текущий этап и задачи» показывает активные подэтапы с
вложенными незавершёнными задачами, сгруппированными по подэтапу.
Если активных подэтапов нет — «Не в работе».

Источник данных: `GET /api/education/leads?process_status=active|closed|all`
(по умолчанию `active`).

**Фильтр по статусу процесса** (select над таблицей):

| Значение | Показывает |
|---------|-----------|
| `active` (по умолчанию) | Нет процесса ИЛИ есть активный |
| `closed` | Есть завершённый/отменённый и нет активного |
| `all` | Всех лидов |

Список сортируется по `application_date` (по убыванию по умолчанию).
Кликабельные заголовки: ИМЯ, ДАТА ПОДАЧИ.

### Список абитуриентов (вкладка «Приём»)

Колонки: **ФИО** / **Дата заявки** / **Телефон** / **Email** /
**Учреждение** / **Направление** / **Статус** / **Текущий этап и задачи**.

Колонка «Текущий этап и задачи» — та же, что в списке лидов: активные
подэтапы процесса «Приём» с незавершёнными задачами; если активных
подэтапов нет — «Не в работе». Данные добавляет параметр `with_stages=1`
эндпоинта `GET /api/education/journeys` (общий helper
`lib/workflow/active-stages.ts`, используется и в `GET /api/education/leads`).

Клик по ФИО открывает ту же карточку `leads/[id]`, что и для лида, — блок
`ProcessInfoBlock` показывает оба процесса journey («Набор» и «Приём»).
