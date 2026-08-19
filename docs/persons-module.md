# Модуль «Люди» (People / אנשים)

READ-ONLY справочник **сотрудников** и **студентов**, чтобы роли вроде врача,
преподавателя или куратора могли найти человека и посмотреть его контакты.

## Ключевой принцип: модуль НЕ владеет таблицами

Модуль только **читает** существующие таблицы — никаких `CREATE TABLE`, никаких
записей. Источники данных:

| Данные | Таблицы |
| --- | --- |
| Базовый профиль | `persons` (`full_name`, `hebrew_name`, `email`, `phones`, `photo_url`, `gender`, `birth_date`) |
| Сотрудники | `staff_positions` (действующие: `end_date IS NULL`) + `departments` |
| Студенты | `education_journeys` (`education_status = 'student'`) + `persons` + `departments` |
| Роли человека | `person_roles` → `roles` |

Join'ы зеркалят существующие модули: студенты — тот же паттерн, что
`/api/finance/students` и `/api/alumni` (persons через FK
`applicant_profiles_person_id_fkey`, департамент — через
`education_journeys_primary_department_id_fkey`).

## Права

Новых привилегий не изобретаем — модуль `persons` с привилегиями
`access` / `view` / `manage`. Справочник **читающий**, поэтому API проверяет
только `persons.view` (`requirePersonsPrivilege('view')`). `manage` объявлена в
каталоге для полноты.

Миграция `supabase/migrations/20260708150000_persons_directory.sql`:

1. Досеивает каталог `module_privileges` для `persons` (`access`/`view`/`manage`)
   идемпотентно (`ON CONFLICT DO NOTHING`). Строка `('persons','view')` уже
   существует из сида 002 — остаётся нетронутой.
2. Выдаёт `access` + `view` (`scope='all`') ролям, которым нужно искать людей:
   `teacher`, `curator`, `doctor`, `psychologist`, `dorm_director`, `embait`,
   `mashgiach`, `security_head`, `rector`, `dean`, `school_director`,
   `vice_director`, `dept_head`, `program_head`, `campus_president`,
   `president_secretary`, `tech_admin`, `hr_director`. Тот же цикл `FOREACH` по
   ролям, что в `20260708140000_role_module_access.sql`, идемпотентно
   (`ON CONFLICT DO UPDATE`).

superadmin и «управленческие» роли уже покрыты `20260708140000`.

> Модуль остаётся **невидимым**, пока миграция не применена вручную в
> Supabase (Dashboard SQL Editor) продакшна.

## API (`app/api/persons/**`, все — GET, гейт `persons.view`)

| Эндпоинт | Отдаёт |
| --- | --- |
| `GET /api/persons/staff` | список сотрудников: одна строка на человека с действующей должностью, агрегированные должности, подразделение, email, телефоны, фото; `?search`, `?page`/`?pageSize` |
| `GET /api/persons/students` | список студентов (`education_status='student'`): имя, `education_status`, подразделение, контакты, фото, `journey_id`; `?search`, пагинация |
| `GET /api/persons/directory/[id]` | базовый профиль одного человека: имена, контакты, фото, роли, должности + подразделение и — если студент — `education_status` + `journey_id` |

Пагинация и поиск — app-side (после чтения; поиск по
имени/иврит-имени/email/телефонам). Чтения из БД идут постранично по `PAGE=1000`,
чтобы не обрезаться на `db-max-rows`.

### Почему `…/directory/[id]`, а не `…/[id]`

Путь `GET /api/persons/[id]` **уже занят** — он отдаёт паспортный профиль другим
модулям (Персонал, PersonSelect) и гейтится `persons.view` через общий
module-privileges. Чтобы не менять контракт существующего эндпоинта, детальная
карточка справочника вынесена на отдельный путь `…/directory/[id]`.

## UI (`app/dashboard/persons/**`)

- `/dashboard/persons` — синяя шапка (`getModuleColor('persons')`), две вкладки:
  **צוות / Сотрудники** и **תלמידים / Студенты**. Каждая — искомый список
  карточек (имя + ключевая информация + фото). Есть состояния загрузки/пусто/ошибка.
  Клик по строке открывает карточку человека.
- `/dashboard/persons/[id]` — карточка человека из `…/directory/[id]`.
  Если человек — **студент** И у зрителя есть `education.view_students`, показывается
  ссылка **«לכרטיס הסטודנט» / «К карточке студента»** на
  `/dashboard/education/students/[journeyId]`. Иначе — только читающая информация.

RTL/иврит, без круглых скобок, стиль как в contacts/finance.

## Регистрация

- `lib/module-colors.ts`: `persons` в `IMPLEMENTED_MODULES` (цвет уже был — синий `#2563EB`).
- `components/dashboard/Sidebar.tsx`: пункт `persons` вверху списка модулей.
- `middleware.ts`: `persons` уже в `PROTECTED_MODULES`.
- i18n: namespace `persons` в `messages/{ru,he,en}.json` (ключи идентичны);
  метка сайдбара — `nav.persons` в `lib/i18n/translations.ts` (уже существовала).
