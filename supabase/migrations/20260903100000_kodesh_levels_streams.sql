-- ============================================================================
-- Judaism module (Phase 1, spec §3.1): kodesh levels + streams (רמה + זרם).
--
-- Owner-finalized target (spec §1.3): the kodesh study dimension is 6 LEVELS,
-- where levels 1 & 2 split into two STREAMS (בית ספר / אוניברסיטה) → 8 groups:
--   1  רמה 1 בית ספר       level 1  stream school
--   2  רמה 1 אוניברסיטה    level 1  stream university
--   3  רמה 2 בית ספר       level 2  stream school
--   4  רמה 2 אוניברסיטה    level 2  stream university
--   5  רמה 3               level 3  stream —
--   6  רמה 4               level 4  stream —
--   7  רמה 5               level 5  stream —
--   8  רמה 6               level 6  stream —
--
-- ⚠ Spec §1.3 says the CURRENT seed is "6 groups by class"; in reality the DB is
-- already at 6 LEVELS (רמה א'..ו') — migrations 20260820160000 (rename) +
-- 20260820180000 (create). This migration is written against the ACTUAL current
-- state: it does NOT re-run the class→level rename. It (a) adds kodesh_level +
-- kodesh_stream columns, (b) backfills the 6 existing levels, marking levels 1 & 2
-- as the "school" stream, (c) creates the 2 missing "university" stream groups for
-- levels 1 & 2. Existing student enrollments in levels 1 & 2 stay put (they land
-- in the school stream); re-mapping students across the 8 groups is manual by
-- Chana at first semester open (spec §6.3 — still OPEN).
--
-- Group NAMES are editable by Chana (privilege manage_class_groups on kodesh);
-- the names set here are only the default suggestion (spec §0.3).
--
-- Idempotent. RLS off in project — access enforced in API. Apply MANUALLY via
-- Supabase Dashboard SQL Editor.
-- ============================================================================

-- 1) Columns on class_groups (level + stream as DATA, not encoded in the name).
ALTER TABLE class_groups
  ADD COLUMN IF NOT EXISTS kodesh_level  smallint;

ALTER TABLE class_groups
  ADD COLUMN IF NOT EXISTS kodesh_stream text;

-- CHECK: level 1..6 (or NULL for non-kodesh groups); stream school|university|NULL.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_groups_kodesh_level_chk') THEN
    ALTER TABLE class_groups
      ADD CONSTRAINT class_groups_kodesh_level_chk
      CHECK (kodesh_level IS NULL OR kodesh_level BETWEEN 1 AND 6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_groups_kodesh_stream_chk') THEN
    ALTER TABLE class_groups
      ADD CONSTRAINT class_groups_kodesh_stream_chk
      CHECK (kodesh_stream IS NULL OR kodesh_stream IN ('school', 'university'));
  END IF;
END $$;

-- Fast lookup of kodesh level groups.
CREATE INDEX IF NOT EXISTS idx_class_groups_kodesh_level
  ON class_groups (kodesh_level, kodesh_stream)
  WHERE kodesh_level IS NOT NULL;

-- 2) Backfill the 6 existing kodesh levels. Match by the default Hebrew names
--    (רמה א'..ו') or by the RU/EN default names, ONLY on kodesh dept level rows
--    (parent_semester_id IS NULL) that are not yet tagged with kodesh_level.
DO $$
DECLARE
  kodesh_dept uuid := '9a3d7b3f-3f65-4653-a111-4d5296404a27';
  r RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM departments WHERE id = kodesh_dept) THEN RETURN; END IF;

  FOR r IN SELECT * FROM (VALUES
    (1, 'רמה א''', 'Уровень 1', 'Level 1'),
    (2, 'רמה ב''', 'Уровень 2', 'Level 2'),
    (3, 'רמה ג''', 'Уровень 3', 'Level 3'),
    (4, 'רמה ד''', 'Уровень 4', 'Level 4'),
    (5, 'רמה ה''', 'Уровень 5', 'Level 5'),
    (6, 'רמה ו''', 'Уровень 6', 'Level 6')
  ) AS t(lvl, he, ru, en) LOOP
    UPDATE class_groups
    SET kodesh_level = r.lvl,
        -- levels 1 & 2 become the "school" stream group; 3–6 have no stream.
        kodesh_stream = CASE WHEN r.lvl IN (1, 2) THEN 'school' ELSE NULL END
    WHERE department_id = kodesh_dept
      AND parent_semester_id IS NULL
      AND kodesh_level IS NULL
      AND (name_he = r.he OR name = r.ru OR name_en = r.en);
  END LOOP;
END $$;

-- 3) Rename the just-tagged default levels to the spec §1.3 default names — ONLY
--    where they still carry the old default name (so manual edits by Chana and
--    re-runs are preserved).
DO $$
DECLARE
  kodesh_dept uuid := '9a3d7b3f-3f65-4653-a111-4d5296404a27';
  r RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM departments WHERE id = kodesh_dept) THEN RETURN; END IF;

  FOR r IN SELECT * FROM (VALUES
    (1, 'school',     'רמה 1 בית ספר',    'Уровень 1 (школа)',        'Level 1 (school)',      'רמה א'''),
    (2, 'school',     'רמה 2 בית ספר',    'Уровень 2 (школа)',        'Level 2 (school)',      'רמה ב''')
  ) AS t(lvl, strm, he, ru, en, old_he) LOOP
    UPDATE class_groups
    SET name = r.ru, name_he = r.he, name_en = r.en
    WHERE department_id = kodesh_dept
      AND parent_semester_id IS NULL
      AND kodesh_level = r.lvl
      AND kodesh_stream = r.strm
      AND name_he = r.old_he;
  END LOOP;
END $$;

-- 4) Create the 2 missing "university" stream groups for levels 1 & 2 (if absent).
--    subject_id = the 'קודש' subject when present (mirrors the seeded levels).
DO $$
DECLARE
  kodesh_dept uuid := '9a3d7b3f-3f65-4653-a111-4d5296404a27';
  subj uuid;
  r RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM departments WHERE id = kodesh_dept) THEN RETURN; END IF;
  SELECT id INTO subj FROM subjects WHERE name = 'קודש' LIMIT 1;

  FOR r IN SELECT * FROM (VALUES
    (1, 'רמה 1 אוניברסיטה', 'Уровень 1 (университет)', 'Level 1 (university)'),
    (2, 'רמה 2 אוניברסיטה', 'Уровень 2 (университет)', 'Level 2 (university)')
  ) AS t(lvl, he, ru, en) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM class_groups
      WHERE department_id = kodesh_dept
        AND parent_semester_id IS NULL
        AND kodesh_level = r.lvl
        AND kodesh_stream = 'university'
    ) THEN
      INSERT INTO class_groups
        (name, name_he, name_en, department_id, subject_id, is_semester, is_active,
         kodesh_level, kodesh_stream)
      VALUES
        (r.ru, r.he, r.en, kodesh_dept, subj, false, true, r.lvl, 'university');
    END IF;
  END LOOP;
END $$;
