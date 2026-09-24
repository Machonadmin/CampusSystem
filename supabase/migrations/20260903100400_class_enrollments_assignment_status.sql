-- ============================================================================
-- Judaism module (Phase 1, spec §3.5): assignment status on a student's kodesh
-- placement. "The system proposes, Chana approves" — manual placement in Phase 1
-- (the automatic suggestion ENGINE is Phase 3). A non-placed student must carry
-- an explicit reason (exempt / pending / special program) — never a silent empty
-- placement.
--
-- DEFAULT 'active' so all existing/manual enrollments remain valid; only rows the
-- (Phase 3) engine produces will be inserted as 'suggested'.
--
-- Idempotent. Apply MANUALLY via Supabase Dashboard SQL Editor.
-- ============================================================================

ALTER TABLE class_enrollments
  ADD COLUMN IF NOT EXISTS assignment_status text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_enrollments_assignment_status_chk') THEN
    ALTER TABLE class_enrollments
      ADD CONSTRAINT class_enrollments_assignment_status_chk
      CHECK (assignment_status IN ('suggested', 'active', 'exempt', 'pending_assessment', 'special_program'));
  END IF;
END $$;

ALTER TABLE class_enrollments
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES persons(id);

ALTER TABLE class_enrollments
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE class_enrollments
  ADD COLUMN IF NOT EXISTS exempt_reason text;

CREATE INDEX IF NOT EXISTS idx_class_enrollments_assignment_status
  ON class_enrollments (assignment_status);
