-- ─────────────────────────────────────────────────────────────────────────────
-- Education Stage 1 — расширение схемы для:
--   • привязки к departments (subjects, study_groups, class_groups, students)
--   • специальностей (Реклама/PR, Экономика — для Университета и Колледжа)
--   • расширения class_groups (уровень, период, лимит)
--   • many-to-many преподавателей с учебными группами
--
-- Все базовые таблицы Education пустые — миграция без переходных NULL→NOT NULL.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────
-- 1. SPECIALTIES (справочник специальностей)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS specialties (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  name          TEXT NOT NULL,
  name_he       TEXT,
  code          TEXT,                    -- опционально, короткий код (например "PR")
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Уникальность имени в рамках подразделения
  CONSTRAINT specialties_dept_name_unique UNIQUE (department_id, name)
);

CREATE TRIGGER specialties_updated_at
  BEFORE UPDATE ON specialties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_specialties_department ON specialties(department_id, is_active, sort_order);


-- ─────────────────────────────────────────────
-- 2. SUBJECTS — добавляем department_id (NOT NULL)
-- ─────────────────────────────────────────────

ALTER TABLE subjects
  ADD COLUMN department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT;

CREATE INDEX idx_subjects_department ON subjects(department_id, is_active, sort_order);


-- ─────────────────────────────────────────────
-- 3. STUDY_GROUPS — добавляем department_id, specialty_id, year_start
-- ─────────────────────────────────────────────

ALTER TABLE study_groups
  ADD COLUMN department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  ADD COLUMN specialty_id  UUID REFERENCES specialties(id) ON DELETE SET NULL,
  ADD COLUMN year_start    INTEGER;

-- Бизнес-правило: если specialty_id задан, его department_id должен совпадать
-- с department_id группы. Проверим в API, на уровне БД не делаем (требует триггера).

CREATE INDEX idx_study_groups_department ON study_groups(department_id, is_active);
CREATE INDEX idx_study_groups_specialty ON study_groups(specialty_id)
  WHERE specialty_id IS NOT NULL;


-- ─────────────────────────────────────────────
-- 4. STUDENTS — добавляем primary_department_id, specialty_id, year_level, year_start
-- ─────────────────────────────────────────────

ALTER TABLE students
  ADD COLUMN primary_department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  ADD COLUMN specialty_id          UUID REFERENCES specialties(id) ON DELETE SET NULL,
  ADD COLUMN year_level             INTEGER,
  ADD COLUMN year_start             INTEGER;

CREATE INDEX idx_students_primary_department ON students(primary_department_id, status);
CREATE INDEX idx_students_specialty ON students(specialty_id)
  WHERE specialty_id IS NOT NULL;


-- ─────────────────────────────────────────────
-- 5. CLASS_GROUPS — добавляем department_id, level, period_start, period_end, max_participants
-- ─────────────────────────────────────────────

ALTER TABLE class_groups
  ADD COLUMN department_id    UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  ADD COLUMN level             TEXT,
  ADD COLUMN period_start      DATE,
  ADD COLUMN period_end        DATE,
  ADD COLUMN max_participants  INTEGER;

-- Если оба указаны — period_end должен быть после period_start
ALTER TABLE class_groups
  ADD CONSTRAINT class_groups_period_consistency CHECK (
    period_start IS NULL OR period_end IS NULL OR period_end >= period_start
  );

-- max_participants должен быть положительным
ALTER TABLE class_groups
  ADD CONSTRAINT class_groups_max_participants_positive CHECK (
    max_participants IS NULL OR max_participants > 0
  );

CREATE INDEX idx_class_groups_department ON class_groups(department_id, is_active);


-- ─────────────────────────────────────────────
-- 6. CLASS_TEACHERS (преподаватели учебных групп, many-to-many)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS class_teachers (
  class_group_id  UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by        UUID REFERENCES persons(id) ON DELETE SET NULL,
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,  -- основной преподаватель группы (один)

  PRIMARY KEY (class_group_id, teacher_id)
);

-- Обратный индекс: "у каких групп этот преподаватель"
CREATE INDEX idx_class_teachers_teacher ON class_teachers(teacher_id);

-- Гарантируем максимум одного is_primary=true на группу через unique partial index
CREATE UNIQUE INDEX idx_class_teachers_primary_per_group
  ON class_teachers(class_group_id)
  WHERE is_primary = TRUE;
