-- ============================================================================
-- Judaism module (Phase 1, spec §3.4): days with no lessons (ימים ללא לימודים) +
-- an EDITABLE template of default days that the system can SUGGEST (never force)
-- when a year opens.
--
-- ⚠ DEVIATION FROM THE LITERAL SPEC SQL (flagged per CLAUDE.md): spec §3.4 writes
-- `academic_year_id uuid`, but there is NO academic_years table in this DB to
-- reference (the academic year is the Hebrew `year_label` TEXT used across
-- class_groups; academic_year_settings is a singleton config row). The spec
-- explicitly permits the fallback ("או year_label, לפי הקיים"), so we key on
-- `year_label` text.
--
-- Lesson generation (spec §4.5) skips any date present here whose scope is 'all'
-- OR equals the group's department_id. Idempotent. Apply MANUALLY via Supabase
-- Dashboard SQL Editor.
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 1) Concrete no-lesson days for a given year_label.
CREATE TABLE IF NOT EXISTS academic_no_lesson_days (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_label  TEXT NOT NULL,                       -- Hebrew year (מחזור), e.g. תשפז
  date        DATE NOT NULL,
  reason      TEXT,                                 -- חג / טיול / אירוע / אחר
  scope       TEXT NOT NULL DEFAULT 'all',          -- 'all' or a department_id (as text)
  created_by  UUID REFERENCES persons(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year_label, date, scope)
);

DROP TRIGGER IF EXISTS set_updated_at_academic_no_lesson_days ON academic_no_lesson_days;
CREATE TRIGGER set_updated_at_academic_no_lesson_days
  BEFORE UPDATE ON academic_no_lesson_days
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_no_lesson_days_year ON academic_no_lesson_days (year_label);
CREATE INDEX IF NOT EXISTS idx_no_lesson_days_date ON academic_no_lesson_days (date);

-- 2) Editable named templates (CRUD). A template is a reusable set of default
--    days (e.g. holidays) that can be SUGGESTED at year open — never mandatory.
CREATE TABLE IF NOT EXISTS no_lesson_day_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES persons(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at_no_lesson_day_templates ON no_lesson_day_templates;
CREATE TRIGGER set_updated_at_no_lesson_day_templates
  BEFORE UPDATE ON no_lesson_day_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3) Template days as recurring Gregorian anchors (month/day). Materialized into
--    academic_no_lesson_days for a chosen year via the "suggest" action.
CREATE TABLE IF NOT EXISTS no_lesson_day_template_days (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES no_lesson_day_templates(id) ON DELETE CASCADE,
  month       SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  day         SMALLINT NOT NULL CHECK (day BETWEEN 1 AND 31),
  reason      TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_no_lesson_template_days_tpl
  ON no_lesson_day_template_days (template_id);
