-- ============================================================================
-- Judaism module (spec §3.3, architect decision): two-step jewishness verification
-- (Moshe → Chana) on the EXISTING mechanism — NO parallel table.
--
--   • One source of truth stays education_journeys.jewishness_status (+ the
--     append-only jewishness_status_history). We only ADD the intermediate state
--     'initial_checked' and two actor columns for Moshe's initial check; the
--     existing jewishness_verified_by/at now represent CHANA's FINAL approval.
--
--   Flow: pending --(Moshe: initial_check)--> initial_checked --(Chana: final
--   approve)--> verified.  'verified' is the GATE into the kodesh assignment list.
--
--   • Privilege jewishness_final_approve — granted to Chana (jewish_studies_manager).
--     jewishness_initial_check (Moshe) already exists from Phase 2.
--
-- Idempotent. Apply MANUALLY via Supabase Dashboard SQL Editor.
-- ============================================================================

-- 1) Allow the new intermediate state in both CHECK constraints.
ALTER TABLE education_journeys
  DROP CONSTRAINT IF EXISTS education_journeys_jewishness_status_check;
ALTER TABLE education_journeys
  ADD CONSTRAINT education_journeys_jewishness_status_check
  CHECK (jewishness_status IN ('pending','initial_checked','verified','rejected','needs_review','partial'));

ALTER TABLE jewishness_status_history
  DROP CONSTRAINT IF EXISTS jewishness_status_history_status_check;
ALTER TABLE jewishness_status_history
  ADD CONSTRAINT jewishness_status_history_status_check
  CHECK (status IN ('pending','initial_checked','verified','rejected','needs_review','partial'));

-- 2) Actor columns for Moshe's initial check (final approval reuses verified_by/at).
ALTER TABLE education_journeys
  ADD COLUMN IF NOT EXISTS jewishness_initial_checked_by uuid REFERENCES persons(id);
ALTER TABLE education_journeys
  ADD COLUMN IF NOT EXISTS jewishness_initial_checked_at timestamptz;

-- 3) Privilege catalog + grant final approval to Chana.
INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('studies', 'jewishness_final_approve', 'Финальное утверждение еврейства', 26)
ON CONFLICT (module, privilege_code) DO NOTHING;

INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'education', 'jewishness_final_approve', 'all'
FROM roles r WHERE r.code = 'jewish_studies_manager'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;
