-- ============================================================================
-- Judaism module (Phase 1, spec §3.2 / §1.4): study_tracks corrected catalog +
-- category dimension. The main track is the student's "serial number" — one of
-- the institute enrollment tracks. Full CRUD from the UI is added in the API/UI
-- layer; this migration only reconciles the DATA toward the owner-finalized
-- catalog, non-destructively.
--
-- ⚠ DEVIATIONS FROM THE LITERAL SPEC SQL (flagged per CLAUDE.md):
--   • Spec §3.2 asks to ADD `default_years int`. The table ALREADY has
--     `years_count int NOT NULL DEFAULT 4 CHECK (1..8)` (migration 20260818170000)
--     with identical meaning. We REUSE `years_count` and DO NOT add a duplicate
--     `default_years` column.
--   • Spec §1.4 lists the catalog as touro/school/college only. Reality has
--     school, college (Group B, 3y), college_a (Group A, 4y), university, touro,
--     emuna(inactive). We reconcile:
--       - college_a  → code 'college_g9'  (base grade 9, 4y, category college)
--       - college    → code 'college_g11' (base grade 11, 3y, category college)
--       - university stays ACTIVE; we ADD univ_economics + univ_pr as the split
--         targets. Re-assigning existing 'university' students to economics/PR
--         and then deactivating 'university' is a MANUAL owner action in the UI
--         (touches live journey links — cannot be inferred here). See §6.3.
--       - emuna is left untouched (inactive).
--
-- Renames change only the text `code`/names; FK links (subjects, class_groups,
-- journey_study_tracks) are by track id → unaffected. Idempotent. Apply MANUALLY
-- via Supabase Dashboard SQL Editor.
-- ============================================================================

-- 1) Category dimension (school|college|university|... — editable, optional).
ALTER TABLE study_tracks
  ADD COLUMN IF NOT EXISTS category text;

-- 2) Reconcile the two college codes (only if the old code still exists and the
--    new one does not — safe to re-run).
UPDATE study_tracks
SET code = 'college_g9',
    name_he = 'קולג'' (בסיס כיתה 9)',
    name_ru = 'Колледж (база 9 класс, 4 года)',
    name_en = 'College (grade 9 base, 4y)',
    category = 'college',
    years_count = 4
WHERE code = 'college_a'
  AND NOT EXISTS (SELECT 1 FROM study_tracks WHERE code = 'college_g9');

UPDATE study_tracks
SET code = 'college_g11',
    name_he = 'קולג'' (בסיס כיתה 11)',
    name_ru = 'Колледж (база 11 класс, 3 года)',
    name_en = 'College (grade 11 base, 3y)',
    category = 'college',
    years_count = 3
WHERE code = 'college'
  AND NOT EXISTS (SELECT 1 FROM study_tracks WHERE code = 'college_g11');

-- 3) Backfill category + canonical years on the remaining existing tracks.
UPDATE study_tracks SET category = 'school',     years_count = 2 WHERE code = 'school'     AND category IS NULL;
UPDATE study_tracks SET category = 'university', years_count = 4 WHERE code = 'university' AND category IS NULL;
UPDATE study_tracks SET category = 'touro',      years_count = 4 WHERE code = 'touro'      AND category IS NULL;

-- 4) Add the two university split-target tracks (spec §1.4: אוניברסיטה — כלכלה /
--    פרסום). 4 years each, university category. Added ACTIVE; the generic
--    'university' track stays active until the owner re-assigns its students.
INSERT INTO study_tracks (code, name_he, name_ru, name_en, category, years_count, sort_order, is_active)
VALUES
  ('univ_economics', 'אוניברסיטה — כלכלה',       'Университет — экономика', 'University — Economics', 'university', 4, 31, true),
  ('univ_pr',        'אוניברסיטה — פרסום (PR)',  'Университет — реклама/PR', 'University — PR',        'university', 4, 32, true)
ON CONFLICT (code) DO NOTHING;

-- Inherit department_id from the existing 'university' track so the structure
-- filter shows them to the same manager (mirrors 20260819160000 for college_a).
UPDATE study_tracks
SET department_id = (SELECT department_id FROM study_tracks WHERE code = 'university' LIMIT 1)
WHERE code IN ('univ_economics', 'univ_pr')
  AND department_id IS NULL;
