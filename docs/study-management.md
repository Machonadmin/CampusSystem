# Модуль «Управление учёбой» (Study Management)

Этот документ описывает **первый этап** управления учёбой: журнал класса —
уроки конкретной учебной группы (`class_groups`) и посещаемость студентов.
Оценки (`set_grades` уже есть в каталоге привилегий, но поля для них ещё
нет) и расписание/семестры — отдельные, ещё не реализованные этапы.

## Модель данных

Обе таблицы созданы миграцией
`20260705150000_lessons_attendance.sql`. Она также **сама определяет**
функцию `set_updated_at()` (`CREATE OR REPLACE FUNCTION ... RETURNS
TRIGGER`) — на случай, если этой функции ещё нет в целевой БД; это делает
миграцию самодостаточной и не зависящей от того, какие из более ранних
миграций (`20260608190000_add_updated_at_remaining.sql` и др.) были
применены.

### `lessons` (уроки учебной группы)

| Поле             | Тип         | Комментарий                                   |
|------------------|-------------|-----------------------------------------------|
| `id`             | uuid PK     | —                                              |
| `class_group_id` | uuid FK     | → `class_groups(id)`, `ON DELETE CASCADE`      |
| `scheduled_date` | date        | обязательно                                    |
| `scheduled_time` | time        | опционально                                    |
| `topic`          | text        | опционально, заполняется позже                |
| `description`    | text        | опционально                                    |
| `location`       | text        | опционально (аудитория/здание)                 |
| `is_cancelled`   | boolean     | `NOT NULL DEFAULT FALSE`                       |
| `created_by`     | uuid FK     | → `persons(id) ON DELETE SET NULL`             |
| `created_at` / `updated_at` | timestamptz | стандартные, `updated_at` — через триггер |

Уникальность: `UNIQUE (class_group_id, scheduled_date, scheduled_time)` —
в одной группе не может быть двух уроков на одинаковые дату+время.
Индекс `idx_lessons_class_group_date` на `(class_group_id, scheduled_date
DESC)` — под типовую выборку «уроки группы по убыванию даты».

### `attendance` (посещаемость, без оценок на этом этапе)

| Поле         | Тип       | Комментарий                                          |
|--------------|-----------|-------------------------------------------------------|
| `id`         | uuid PK   | —                                                      |
| `lesson_id`  | uuid FK   | → `lessons(id) ON DELETE CASCADE`                      |
| `journey_id` | uuid FK   | → `education_journeys(id) ON DELETE CASCADE`           |
| `status`     | text      | `CHECK (status IN ('present','absent','excused','late'))`, `NOT NULL`, без default |
| `marked_by`  | uuid FK   | → `persons(id) ON DELETE SET NULL`                     |
| `marked_at`  | timestamptz | когда была сделана отметка (не имеет default — заполняется приложением) |
| `created_at` / `updated_at` | timestamptz | стандартные, `updated_at` — через триггер |

Уникальность: `UNIQUE (lesson_id, journey_id)` — одна запись посещаемости
на пару «урок × студент»; повторная отметка обновляет её (см. API ниже).
Индексы `idx_attendance_lesson` и `idx_attendance_journey` — по каждому из
FK отдельно.

Статусов посещаемости четыре: **present** (присутствовал), **absent**
(отсутствовал), **excused** (уважительная причина), **late** (опоздал).
Отдельного значения «не отмечен» в БД нет — оно возникает на уровне API
как отсутствие строки `attendance` для пары (урок, студент); см. `GET
.../attendance` ниже.

## API

Все пять эндпоинтов используют общий хелпер `lib/education/lesson-access.ts`,
который строит `PrivilegeTarget` учебной группы (`{ department_id,
teacher_ids }`) для проверки прав — `department_id` берётся из
`class_groups.department_id`, `teacher_ids` — список `teacher_id` из
`class_teachers` этой группы. Это тот же способ, каким уже вычисляют
target существующие роуты `class-groups/[id]/*`.

- `getClassGroupTarget(sb, classGroupId)` — строит target по id группы.
  Используется в `class-groups/[id]/lessons` (список/создание урока).
- `getLessonAccess(sb, lessonId)` — загружает урок, затем строит target
  его группы через `getClassGroupTarget`. Используется во всех роутах,
  которые оперируют одним уроком (`lessons/[lessonId]` и его
  `attendance`).
- `getEnrolledJourneyIds(sb, classGroupId)` — множество `journey_id`,
  записанных в группу; используется и для счётчика `enrolled_count`, и
  для проверки, что отмечаемый студент действительно записан в группу
  урока.

| Метод + путь | Право | Описание |
|---|---|---|
| `GET /api/education/class-groups/[id]/lessons` | `view_students` (target группы) | Список уроков группы, по убыванию `scheduled_date`/`scheduled_time`. Каждый урок дополнен `marked_count` (сколько записей `attendance` у него есть); ответ также содержит `enrolled_count` (сколько студентов записано в группу) — фронт показывает это как «X / Y» в колонке посещаемости. |
| `POST /api/education/class-groups/[id]/lessons` | `set_lesson_topics` (target группы) | Создание урока. Тело: `scheduled_date` обязателен, `scheduled_time`/`topic`/`description`/`location` опциональны. `created_by` = `session.person_id`. |
| `GET /api/education/lessons/[lessonId]` | `view_students` (target группы урока) | Один урок + вся его посещаемость (`id, journey_id, status, marked_by, marked_at`), без наложения на список студентов группы. |
| `PATCH /api/education/lessons/[lessonId]` | `set_lesson_topics` (target группы урока) | Правка `scheduled_date`, `scheduled_time`, `topic`, `description`, `location`, `is_cancelled` (частичный апдейт — только переданные поля). |
| `DELETE /api/education/lessons/[lessonId]` | `set_lesson_topics` (target группы урока) | Удаление урока; посещаемость удаляется каскадно (`ON DELETE CASCADE`). |
| `GET /api/education/lessons/[lessonId]/attendance` | `view_students` (target группы урока) | Посещаемость, **наложенная на список записанных студентов**: каждый `journey`, состоящий в `class_enrollments` группы, возвращается со своим `status`/`marked_by`/`marked_at`, либо с `status: null`, если запись ещё не создана — это и есть UI-состояние «не отмечен». |
| `POST /api/education/lessons/[lessonId]/attendance` | `mark_attendance` (target группы урока) | Массовая отметка. Тело: `{ entries: { journey_id, status }[] }`. Перед сохранением каждый `journey_id` проверяется на членство в `class_enrollments` группы (иначе 400). Upsert по `(lesson_id, journey_id)` — `onConflict: 'lesson_id,journey_id'`; `marked_by` = текущий пользователь, `marked_at` = время запроса. |

Обработка ошибок — `mapDbError` в каждом файле (тот же паттерн, что в
`class-groups/route.ts`): `22P02` → 400 «неверный идентификатор», `23503`
→ 400 «ссылка на несуществующую запись», `23505` → 409 «урок на эту дату
и время уже существует» (только в роутах `lessons`), `23514` → 400
«недопустимый статус» (только в роуте `attendance`, хотя на практике этот
код недостижим — статус уже валидируется вручную до запроса к БД). Статус
`entries[].status` проверяется на принадлежность `present`/`absent`/
`excused`/`late` до обращения к БД — невалидное значение возвращает 400 с
перечислением допустимых.

## Права и доступ

Используются существующие привилегии модуля `education`
(`lib/education/permissions.ts`, каталог засеян
`20260511175354_education_privileges.sql`):

- **`view_students`** — просмотр списка/детали уроков и посещаемости.
- **`set_lesson_topics`** — создание/правка/удаление уроков.
- **`mark_attendance`** — отметка посещаемости.

Новых привилегий эта фича не вводит — только гарантирует, что нужным
ролям выданы уже существующие коды:

- Системные роли `superadmin` / `tech_admin` / `campus_president`
  получают `mark_attendance` и `set_lesson_topics` со `scope='all'` —
  выдаёт блок 3 миграции `20260705150000` (тот же идемпотентный паттерн
  `DO $$ ... ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET
  scope = 'all'`, что и в `20260705130000_alumni_graduation.sql`). Эти же
  роли уже имели `view_students` со `scope='all'` из более ранней
  миграции `20260511175354` (блок для системных ролей) — новая миграция
  её не трогает.
- Роль **`teacher`** уже получила все три привилегии
  (`view_students`, `mark_attendance`, `set_lesson_topics`) со
  `scope='own'` в блоке «4.8 teacher» миграции `20260511175354` —
  миграция `20260705150000` этот грант не создаёт и не изменяет, он
  был выдан заранее.

Проверка `scope='own'` (см. `hasEducationPrivilege` в
`lib/education/permissions.ts`) означает: пользователь допущен к
действию, только если его `person_id` присутствует в `target.teacher_ids`
— то есть он значится в `class_teachers` конкретной учебной группы.
Преподаватель, не привязанный к группе, получит 403 на все пять
эндпоинтов этой группы, даже если у него есть эти привилегии для других
своих групп.

## Экраны

- `app/dashboard/education/class-groups/[id]/page.tsx` — серверная
  обёртка карточки группы. Строит `PrivilegeTarget` через
  `getClassGroupTarget`, затем тремя параллельными вызовами
  `hasEducationPrivilege` вычисляет флаги `canViewLessons`
  (`view_students`), `canManageLessons` (`set_lesson_topics`),
  `canMarkAttendance` (`mark_attendance`) и передаёт их клиенту. Если
  группа не найдена (или `id` не валиден) — все три флага остаются
  `false`, клиентский компонент покажет свой экран «группа не найдена».
- `ClassGroupCardClient.tsx` — клиентский компонент карточки (бывший
  `page.tsx` до вынесения серверной логики). Добавляет панель вкладок
  поверх прежнего содержимого («Обзор» и «Журнал / уроки»); вкладка
  журнала показывается только при `canViewLessons`, иначе виден только
  «Обзор» (тот же список — предметы, преподаватели, студенты, что и
  раньше).
- `LessonsJournalTab.tsx` — содержимое вкладки журнала:
  - таблица уроков (дата, время, тема, место, посещаемость `marked_count
    / enrolled_count`, действия), с бейджем «Отменён» для `is_cancelled`;
  - кнопка «Добавить урок» — только при `canManageLessons`; открывает
    модалку создания/редактирования (общий компонент для create/edit —
    режим определяется тем, передан ли существующий урок);
  - в каждой строке — кнопка «Посещаемость» (открывает `AttendancePanel`,
    видна всегда при `canViewLessons`) и, только при `canManageLessons`:
    «Изменить», «Отменить»/«Вернуть» (переключает `is_cancelled` через
    `PATCH`), «Удалить» (с `confirm()` и `DELETE`);
  - без `canManageLessons` строки полностью read-only — доступна только
    кнопка «Посещаемость».
- `AttendancePanel.tsx` — модалка посещаемости для одного урока: список
  записанных студентов, у каждого — четыре кнопки-тега статуса
  (present/absent/excused/late) с цветовой индикацией выбранного;
  кнопка «Отметить всех присутствующими» (только при `canMarkAttendance`);
  сохранение — `POST .../attendance` только с теми студентами, у кого
  выбран статус (значение `null` = «ещё не решено», не отправляется).
  Без `canMarkAttendance` все кнопки статуса неактивны, кнопки сохранения
  нет — только подсказка «Только просмотр — нет права отмечать
  посещаемость» и список текущих статусов.

## i18n

Все подписи вкладки журнала — в namespace `education.journal`
(`messages/{ru,he,en}.json`), **51 ключ**, полный паритет между тремя
языками (заголовки, названия колонок, названия статусов, кнопки, тексты
пусто/загрузка/ошибка, подписи формы). Компоненты используют только
`useTranslations('education.journal')` — жёстко закодированных строк на
экранах журнала нет.

## Побочные находки: FK hint для `persons`

При сквозной проверке (создание тестовой группы с преподавателем и
студентами) вскрылась ошибка PostgREST: `education_journeys` и
`class_teachers` имеют **по два** внешних ключа на `persons`
(`person_id`/`deleted_by` и `teacher_id`/`added_by` соответственно), из-за
чего неявный embed `person:persons(...)` в select-запросах падал с
`Could not embed because more than one relationship was found`. Ошибка
задевала не только новый роут `attendance`, но и три уже существовавших
роута группы — карточка группы (`class-groups/[id]/route.ts`), список
групп (`class-groups/route.ts`) и список записанных студентов
(`class-groups/[id]/enrollments/route.ts`); она была скрыта, пока таблица
`class_groups` была пуста на боевой БД. Исправлено явным указанием
FK-констрейнта в каждом select (`persons!class_teachers_teacher_id_fkey`
и `persons!applicant_profiles_person_id_fkey` — второе имя сохранилось от
переименования `applicant_profiles` → `education_journeys`, см.
`20260512162314_education_journeys_part1_create.sql`).
