-- ============================================================================
-- Judaism module (Phase 2, spec §3.6): course hours + teacher approvals + teacher
-- hour-quotas.
--
--   • class_groups.hours — declared hours of a COURSE (editable). Meaningful only
--     on course rows (parent_semester_id set); harmless on others.
--   • teacher_course_approvals — Chana proposes a teacher for a course; Moshe
--     approves / rejects / requests info.
--   • teacher_hour_quotas — Moshe's approved hours per teacher (per year, or per
--     year+term). Owner decision (§6.1): the quota is "in principle from the
--     contract, but Moshe can update and add for teachers not yet registered" →
--     stored with a `source` marker ('contract' | 'manual'); there is no contract-
--     hours table to auto-derive from yet, so it is Moshe-entered. Over-quota only
--     WARNS (never blocks) — enforced in the UI/checks layer, not here.
--
-- ⚠ year key: keyed on `year_label` text (+ nullable term_number), NOT a uuid
-- academic_year_id — there is no academic_years table (same as Phase 1 §3.4).
--
-- Idempotent. Apply MANUALLY via Supabase Dashboard SQL Editor.
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 1) Course hours.
ALTER TABLE class_groups
  ADD COLUMN IF NOT EXISTS hours int;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_groups_hours_chk') THEN
    ALTER TABLE class_groups
      ADD CONSTRAINT class_groups_hours_chk CHECK (hours IS NULL OR hours >= 0);
  END IF;
END $$;

-- 2) Teacher → course approvals (Chana proposes, Moshe decides).
CREATE TABLE IF NOT EXISTS teacher_course_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_group_id UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  proposed_by     UUID REFERENCES persons(id),        -- Chana
  status          TEXT NOT NULL DEFAULT 'proposed'
                    CHECK (status IN ('proposed','approved','rejected','info_requested')),
  decided_by      UUID REFERENCES persons(id),        -- Moshe
  decided_at      TIMESTAMPTZ,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_group_id, teacher_id)
);

DROP TRIGGER IF EXISTS set_updated_at_teacher_course_approvals ON teacher_course_approvals;
CREATE TRIGGER set_updated_at_teacher_course_approvals
  BEFORE UPDATE ON teacher_course_approvals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_teacher_course_approvals_course ON teacher_course_approvals (course_group_id);
CREATE INDEX IF NOT EXISTS idx_teacher_course_approvals_status ON teacher_course_approvals (status);

-- 3) Teacher hour-quotas (set by Moshe).
CREATE TABLE IF NOT EXISTS teacher_hour_quotas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id     UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  year_label     TEXT NOT NULL,                        -- Hebrew year (מחזור)
  term_number    INT,                                  -- NULL = whole-year quota
  approved_hours NUMERIC(6,1) NOT NULL CHECK (approved_hours >= 0),
  source         TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('contract','manual')),
  set_by         UUID REFERENCES persons(id),          -- Moshe
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at_teacher_hour_quotas ON teacher_hour_quotas;
CREATE TRIGGER set_updated_at_teacher_hour_quotas
  BEFORE UPDATE ON teacher_hour_quotas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One quota per (teacher, year, term) — COALESCE handles the NULL (year-level) term.
CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_hour_quotas_teacher_year_term
  ON teacher_hour_quotas (teacher_id, year_label, COALESCE(term_number, -1));
