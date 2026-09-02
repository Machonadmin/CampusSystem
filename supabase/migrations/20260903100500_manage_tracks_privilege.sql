-- ============================================================================
-- Judaism module (Phase 1, spec §3.2 / §2): the study-track catalog is
-- INSTITUTE-level, not kodesh. Add a `manage_tracks` privilege that governs
-- study_tracks CRUD, and grant it to institute-level roles — explicitly NOT to
-- Chana (jewish_studies_manager). Chana's Phase-1 kodesh actions (assign students,
-- edit group names, build the timetable) REUSE her existing department-scoped
-- codes (manage_enrollments / manage_class_groups) — no new kodesh_* codes are
-- introduced in Phase 1 (those + Moshe's role are Phase 2, spec §7).
--
-- Registered under module 'studies' (the education privilege catalog module since
-- 20260819120000); hasEducationPrivilege reads education/recruitment/admission/
-- studies, so the grant is honored regardless of the label.
--
-- Idempotent. Apply MANUALLY via Supabase Dashboard SQL Editor.
-- ============================================================================

-- 1) Catalog entry.
INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('studies', 'manage_tracks', 'Управление маршрутами обучения', 14)
ON CONFLICT (module, privilege_code) DO NOTHING;

-- 2) Grant to institute-level roles that exist (never to kodesh/Chana).
DO $$
DECLARE
  rid  UUID;
  rcode TEXT;
BEGIN
  FOREACH rcode IN ARRAY ARRAY['superadmin', 'tech_admin', 'head_of_studies', 'campus_president'] LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;
    INSERT INTO role_privileges (role_id, module, privilege_code, scope)
    VALUES (rid, 'studies', 'manage_tracks', 'all')
    ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
  END LOOP;
END $$;
