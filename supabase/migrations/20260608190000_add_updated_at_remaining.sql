-- Дополнение к 20260608180000: оставшиеся таблицы для updated_at (9 шт.)
-- + created_at для таблиц, где его ещё нет (включая history/junction —
-- created_at как момент записи).
--
-- Идемпотентно: ADD COLUMN IF NOT EXISTS + DROP TRIGGER IF EXISTS.

-- ─── Универсальная функция триггера ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- Группа 1: оставшиеся 9 таблиц — updated_at (+ created_at где нет) + триггер
-- ══════════════════════════════════════════════════════════════════════════════

-- alumni_profiles (created_at + updated_at)
ALTER TABLE alumni_profiles
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS set_updated_at_alumni_profiles ON alumni_profiles;
CREATE TRIGGER set_updated_at_alumni_profiles
  BEFORE UPDATE ON alumni_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- module_privileges (created_at + updated_at)
ALTER TABLE module_privileges
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS set_updated_at_module_privileges ON module_privileges;
CREATE TRIGGER set_updated_at_module_privileges
  BEFORE UPDATE ON module_privileges FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- quality_checks (updated_at)
ALTER TABLE quality_checks
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS set_updated_at_quality_checks ON quality_checks;
CREATE TRIGGER set_updated_at_quality_checks
  BEFORE UPDATE ON quality_checks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- reference_cities (updated_at)
ALTER TABLE reference_cities
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS set_updated_at_reference_cities ON reference_cities;
CREATE TRIGGER set_updated_at_reference_cities
  BEFORE UPDATE ON reference_cities FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- sponsor_profiles (created_at + updated_at)
ALTER TABLE sponsor_profiles
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS set_updated_at_sponsor_profiles ON sponsor_profiles;
CREATE TRIGGER set_updated_at_sponsor_profiles
  BEFORE UPDATE ON sponsor_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- staff_positions (created_at + updated_at)
ALTER TABLE staff_positions
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS set_updated_at_staff_positions ON staff_positions;
CREATE TRIGGER set_updated_at_staff_positions
  BEFORE UPDATE ON staff_positions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- staff_profiles (created_at + updated_at)
ALTER TABLE staff_profiles
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS set_updated_at_staff_profiles ON staff_profiles;
CREATE TRIGGER set_updated_at_staff_profiles
  BEFORE UPDATE ON staff_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- stage_actions (updated_at)
ALTER TABLE stage_actions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS set_updated_at_stage_actions ON stage_actions;
CREATE TRIGGER set_updated_at_stage_actions
  BEFORE UPDATE ON stage_actions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- task_comments (updated_at)
ALTER TABLE task_comments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS set_updated_at_task_comments ON task_comments;
CREATE TRIGGER set_updated_at_task_comments
  BEFORE UPDATE ON task_comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- Группа 2: только created_at (без updated_at, без триггера)
-- (created_at, которого ещё нет в group 1)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE person_family
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE person_privileges
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE person_roles
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE person_status_history
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE role_privileges
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE task_watchers
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE class_enrollments
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE class_teachers
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE journey_communities
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
