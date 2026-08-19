-- ═════════════════════════════════════════════════════════════════════
-- Основа управления учёбой: уроки (lessons) + посещаемость (attendance).
--
-- Это ПЕРВЫЙ шаг: уроки конкретной учебной группы (class_groups) с темой
-- и посещаемостью студентов (education_journeys). Оценки (grades) —
-- отдельный этап в будущем, в эту миграцию НЕ входят.
--
-- Привилегии mark_attendance и set_lesson_topics уже есть в каталоге
-- module_privileges (см. 20260511175354_education_privileges.sql).
-- Эта миграция лишь убеждается, что системные роли (superadmin,
-- tech_admin, campus_president) имеют role_privileges на них
-- (scope='all') — идемпотентно, не трогая остальные привилегии/роли.
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
-- 1. LESSONS (уроки учебной группы)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lessons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_group_id  UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  scheduled_date  DATE NOT NULL,
  scheduled_time  TIME,
  topic           TEXT,
  description     TEXT,
  location        TEXT,
  is_cancelled    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES persons(id) ON DELETE SET NULL,

  CONSTRAINT lessons_class_group_date_time_unique
    UNIQUE (class_group_id, scheduled_date, scheduled_time)
);

CREATE INDEX IF NOT EXISTS idx_lessons_class_group_date
  ON lessons(class_group_id, scheduled_date DESC);

DROP TRIGGER IF EXISTS set_updated_at_lessons ON lessons;
CREATE TRIGGER set_updated_at_lessons
  BEFORE UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 2. ATTENDANCE (посещаемость, без оценок на этом этапе)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  journey_id  UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('present', 'absent', 'excused', 'late')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  marked_by   UUID REFERENCES persons(id) ON DELETE SET NULL,
  marked_at   TIMESTAMPTZ,

  CONSTRAINT attendance_lesson_journey_unique
    UNIQUE (lesson_id, journey_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_lesson ON attendance(lesson_id);
CREATE INDEX IF NOT EXISTS idx_attendance_journey ON attendance(journey_id);

DROP TRIGGER IF EXISTS set_updated_at_attendance ON attendance;
CREATE TRIGGER set_updated_at_attendance
  BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 3. ПРИВИЛЕГИИ — гарантируем role_privileges для системных ролей
--
-- Только 2 конкретных кода (mark_attendance, set_lesson_topics),
-- scope='all'. Остальные привилегии модуля education не трогаем.
-- Паттерн идентичен использованному в 20260511175354_education_privileges.sql
-- и 20260705130000_alumni_graduation.sql.
-- ─────────────────────────────────────────────

DO $$
DECLARE
  rcode TEXT;
  pcode TEXT;
  rid   UUID;
BEGIN
  FOREACH rcode IN ARRAY ARRAY['superadmin', 'tech_admin', 'campus_president']
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;

    FOREACH pcode IN ARRAY ARRAY['mark_attendance', 'set_lesson_topics']
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'education', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;
