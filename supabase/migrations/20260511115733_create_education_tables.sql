-- ─────────────────────────────────────────────────────────────────────────────
-- Education module — учебная часть (MVP без семестров и расписания)
--
-- Архитектура:
--   subjects          — справочник предметов
--   study_groups      — базовые группы студентов ("1 курс А")
--   students          — реестр студентов (FK на persons, FK на main study_group)
--   class_groups      — учебные группы (конкретный предмет + преподаватель)
--   class_enrollments — записи студентов в учебные группы (many-to-many)
--
-- Преподаватель = person с person_roles.role_code='teacher'.
-- Отдельной таблицы teachers не создаём.
--
-- НЕ входит в эту миграцию: семестры, расписание, посещаемость, оценки.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────
-- 1. SUBJECTS (справочник предметов)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  name_he     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT subjects_name_unique UNIQUE (name)
);

CREATE TRIGGER subjects_updated_at
  BEFORE UPDATE ON subjects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_subjects_active_sort ON subjects(is_active, sort_order, name);


-- ─────────────────────────────────────────────
-- 2. STUDY_GROUPS (базовые группы)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS study_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  name_he     TEXT,
  year_level  INTEGER,                    -- 1, 2, 3... (опционально, для сортировки)
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT study_groups_name_unique UNIQUE (name)
);

CREATE TRIGGER study_groups_updated_at
  BEFORE UPDATE ON study_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_study_groups_active ON study_groups(is_active, year_level, name);


-- ─────────────────────────────────────────────
-- 3. STUDENTS (реестр студентов)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS students (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id       UUID NOT NULL UNIQUE REFERENCES persons(id) ON DELETE CASCADE,
  main_group_id   UUID REFERENCES study_groups(id) ON DELETE SET NULL,

  -- Статус.
  --   active     — учится
  --   on_leave   — академический отпуск
  --   graduated  — выпустился
  --   expelled   — отчислен
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','on_leave','graduated','expelled')),

  enrolled_at     DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_students_main_group ON students(main_group_id, status)
  WHERE main_group_id IS NOT NULL;
CREATE INDEX idx_students_status ON students(status) WHERE status = 'active';


-- ─────────────────────────────────────────────
-- 4. CLASS_GROUPS (учебные группы)
-- ─────────────────────────────────────────────

-- Конкретная группа по конкретному предмету у конкретного преподавателя.
-- Например: "Талмуд А (Рав Кацнельсон)", "Иврит-3 продвинутый".

CREATE TABLE IF NOT EXISTS class_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  subject_id  UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  teacher_id  UUID NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER class_groups_updated_at
  BEFORE UPDATE ON class_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Индексы под типовые выборки
CREATE INDEX idx_class_groups_subject ON class_groups(subject_id, is_active);
CREATE INDEX idx_class_groups_teacher ON class_groups(teacher_id, is_active);
CREATE INDEX idx_class_groups_active ON class_groups(is_active, name);


-- ─────────────────────────────────────────────
-- 5. CLASS_ENROLLMENTS (записи студентов в учебные группы)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS class_enrollments (
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_group_id  UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (student_id, class_group_id)
);

-- Обратный индекс: "кто в этой учебной группе"
CREATE INDEX idx_class_enrollments_class ON class_enrollments(class_group_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ПРИВИЛЕГИИ (минимум, без раздачи ролям)
--
-- Модуль 'education' уже зарегистрирован в module_privileges (см. миграцию 002).
-- Сейчас просто убеждаемся, что для него есть привилегия 'manage_education_data'
-- — на управление справочниками (предметы, группы, студенты).
-- Раздача ролям делается отдельно через UI Настроек.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO module_privileges (module, privilege_code, privilege_name, description, sort_order)
VALUES ('education', 'manage_education_data', 'Управление учебными данными',
        'Создавать/изменять предметы, группы, студентов', 10)
ON CONFLICT (module, privilege_code) DO NOTHING;
