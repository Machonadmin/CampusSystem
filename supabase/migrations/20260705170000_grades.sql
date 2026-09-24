-- ═════════════════════════════════════════════════════════════════════
-- Основа оценок (grades) для управления учёбой — Этап 3.
--
-- Базис: задания/работы (assessments) конкретной учебной группы и оценки
-- студентов (grades) за них. Оценка привязана к journey (education_journeys),
-- как и посещаемость, — НЕ к person напрямую.
--
-- В ЭТУ миграцию НЕ входят (отложено на будущее):
--   - вес задания (weight) для взвешенного итога;
--   - тип задания (экзамен / домашняя / проект);
--   - вычисляемая итоговая оценка.
--
-- Привилегия set_grades уже есть в каталоге module_privileges
-- (см. 20260511175354_education_privileges.sql, sort_order 61). Эта миграция
-- лишь гарантирует role_privileges на неё для системных ролей (superadmin,
-- tech_admin, campus_president), scope='all' — идемпотентно, не трогая
-- остальные привилегии/роли. Паттерн идентичен секции 3 в
-- 20260705150000_lessons_attendance.sql.
-- ═════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 0. set_updated_at() — на случай если функции ещё нет в целевой БД
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
$$;


-- ─────────────────────────────────────────────
-- 1. ASSESSMENTS (задания/работы учебной группы)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assessments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_group_id   UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  max_score        NUMERIC(6,2) NOT NULL DEFAULT 100 CHECK (max_score > 0),
  assessment_date  DATE,
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       UUID REFERENCES persons(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_assessments_class_group_date
  ON assessments(class_group_id, assessment_date DESC NULLS LAST);

DROP TRIGGER IF EXISTS set_updated_at_assessments ON assessments;
CREATE TRIGGER set_updated_at_assessments
  BEFORE UPDATE ON assessments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 2. GRADES (оценки студентов за задания)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS grades (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id  UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  journey_id     UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  score          NUMERIC(6,2) NOT NULL CHECK (score >= 0),
  comment        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  graded_by      UUID REFERENCES persons(id) ON DELETE SET NULL,
  graded_at      TIMESTAMPTZ,

  CONSTRAINT grades_assessment_journey_unique
    UNIQUE (assessment_id, journey_id)
);

CREATE INDEX IF NOT EXISTS idx_grades_assessment ON grades(assessment_id);
CREATE INDEX IF NOT EXISTS idx_grades_journey    ON grades(journey_id);

DROP TRIGGER IF EXISTS set_updated_at_grades ON grades;
CREATE TRIGGER set_updated_at_grades
  BEFORE UPDATE ON grades
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 3. ПРИВИЛЕГИИ — гарантируем role_privileges.set_grades для системных ролей
--
-- Только код set_grades, scope='all'. Остальные привилегии/роли не трогаем.
-- ON CONFLICT (role_id, module, privilege_code) DO UPDATE — идемпотентно.
-- ─────────────────────────────────────────────

DO $$
DECLARE
  rcode TEXT;
  rid   UUID;
BEGIN
  FOREACH rcode IN ARRAY ARRAY['superadmin', 'tech_admin', 'campus_president']
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;

    INSERT INTO role_privileges (role_id, module, privilege_code, scope)
    VALUES (rid, 'education', 'set_grades', 'all')
    ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
  END LOOP;
END $$;
