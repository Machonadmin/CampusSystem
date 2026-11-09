-- ═════════════════════════════════════════════════════════════════════
-- Мטלות להגשה + מצב בקורס (דרישות מנהל טורו, 2026-11-03).
--
-- 1) assessments.requires_submission — задание, которое ученица сдаёт файлом
--    в портале (מטלה להגשה). Срок сдачи = assessment_date (та же колонка,
--    что и дата обычной работы). false = обычная работа/экзамен, как раньше.
--
-- 2) assessment_submissions — сданный файл: одна сдача на (задание, ученица);
--    повторная сдача заменяет файл (строка обновляется). Файл лежит в приватном
--    бакете `documents` по пути submissions/<assessment>/<journey>/<uuid>-<имя>.
--
-- 3) course_results — מצב בקורס ученицы в учебной группе: статус
--    (in_progress / passed / failed / incomplete / withdrawn) + ציון סופי.
--    Нет строки = «в процессе».
--
-- Идемпотентно. Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS requires_submission boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS assessment_submissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id  uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  journey_id     uuid NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  storage_path   text NOT NULL,
  file_name      text NOT NULL,
  mime_type      text,
  size_bytes     integer CHECK (size_bytes IS NULL OR size_bytes >= 0),
  note           text,
  submitted_by   uuid REFERENCES persons(id) ON DELETE SET NULL,
  submitted_at   timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assessment_submissions_unique UNIQUE (assessment_id, journey_id)
);

CREATE INDEX IF NOT EXISTS idx_assessment_submissions_journey
  ON assessment_submissions(journey_id);

DROP TRIGGER IF EXISTS set_updated_at_assessment_submissions ON assessment_submissions;
CREATE TRIGGER set_updated_at_assessment_submissions
  BEFORE UPDATE ON assessment_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS course_results (
  class_group_id uuid NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  journey_id     uuid NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'in_progress'
                   CHECK (status IN ('in_progress','passed','failed','incomplete','withdrawn')),
  final_grade    numeric(6,2) CHECK (final_grade IS NULL OR (final_grade >= 0 AND final_grade <= 100)),
  note           text,
  updated_by     uuid REFERENCES persons(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_group_id, journey_id)
);

CREATE INDEX IF NOT EXISTS idx_course_results_journey ON course_results(journey_id);

DROP TRIGGER IF EXISTS set_updated_at_course_results ON course_results;
CREATE TRIGGER set_updated_at_course_results
  BEFORE UPDATE ON course_results
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Как и все таблицы схемы (миграция 20260908120000): доступ только с сервера.
ALTER TABLE assessment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_results ENABLE ROW LEVEL SECURITY;
