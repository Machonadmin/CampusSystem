-- ============================================================================
-- Judaism module — academic calendar DAY TYPES (spec §3.4, extension). The
-- institute calendar color-codes each special day into one of four kinds. We
-- generalize academic_no_lesson_days ("no lesson at all") into a typed calendar.
--
--   calendar_day_types (EDITABLE reference — NOT a hard enum, per "everything
--   editable"): each type says what it blocks.
--     • full_off    blocks_secular=t blocks_kodesh=t   (holidays / vacations)
--     • no_kodesh   blocks_secular=f blocks_kodesh=t   (secular runs, no Judaism)
--     • kodesh_only blocks_secular=t blocks_kodesh=f   (only Judaism runs)
--     • shortened   blocks nothing, is_shortened=t     (e.g. Fast of Esther)
--
--   academic_no_lesson_days.day_type_code → calendar_day_types(code), DEFAULT
--   'full_off' so existing rows keep today's meaning. Same on template days.
--
--   Lesson generation decides per GROUP KIND (kodesh vs secular): a kodesh group
--   skips a date whose type blocks_kodesh (runs on kodesh_only); a secular group
--   skips blocks_secular (runs on no_kodesh); shortened days still generate.
--
--   A 2026–2027 STARTING template is seeded (editable/removable from the UI).
--   Jewish-holiday dates are NOT invented here — they are color-coded in the
--   source PDF; Chana enters/marks them per year in the calendar editor.
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

-- 1) Editable day-type reference.
CREATE TABLE IF NOT EXISTS calendar_day_types (
  code           TEXT PRIMARY KEY,
  name_he        TEXT,
  name_ru        TEXT,
  name_en        TEXT,
  blocks_secular BOOLEAN NOT NULL DEFAULT false,
  blocks_kodesh  BOOLEAN NOT NULL DEFAULT false,
  is_shortened   BOOLEAN NOT NULL DEFAULT false,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at_calendar_day_types ON calendar_day_types;
CREATE TRIGGER set_updated_at_calendar_day_types
  BEFORE UPDATE ON calendar_day_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO calendar_day_types (code, name_he, name_ru, name_en, blocks_secular, blocks_kodesh, is_shortened, sort_order) VALUES
  ('full_off',    'יום חופש מלא',        'Полный выходной',    'Full day off',   true,  true,  false, 10),
  ('no_kodesh',   'ללא לימודי יהדות',    'Дни без иудаики',    'No Judaism',     false, true,  false, 20),
  ('kodesh_only', 'לימודי יהדות בלבד',   'Только иудаика',     'Judaism only',   true,  false, false, 30),
  ('shortened',   'יום מקוצר',           'Укороченный день',   'Shortened day',  false, false, true,  40)
ON CONFLICT (code) DO NOTHING;

-- 2) day_type_code on the calendar rows (default full_off — existing rows keep meaning).
ALTER TABLE academic_no_lesson_days
  ADD COLUMN IF NOT EXISTS day_type_code TEXT NOT NULL DEFAULT 'full_off'
  REFERENCES calendar_day_types(code);

ALTER TABLE no_lesson_day_template_days
  ADD COLUMN IF NOT EXISTS day_type_code TEXT NOT NULL DEFAULT 'full_off'
  REFERENCES calendar_day_types(code);

-- 3) 2026–2027 starting template (editable/removable). Jewish-holiday dates are
--    NOT seeded — they must be transcribed by a human from the calendar PDF.
--    Note: 02.09 sem I start / 28.12 winter vacation / 02.02 sem II start feed the
--    academic-year/semester settings, NOT this table.
DO $$
DECLARE tpl_id UUID;
BEGIN
  SELECT id INTO tpl_id FROM no_lesson_day_templates WHERE name = 'לוח שנה 2026–2027 (התחלה)' LIMIT 1;
  IF tpl_id IS NULL THEN
    INSERT INTO no_lesson_day_templates (name) VALUES ('לוח שנה 2026–2027 (התחלה)') RETURNING id INTO tpl_id;
    INSERT INTO no_lesson_day_template_days (template_id, month, day, reason, day_type_code, sort_order) VALUES
      (tpl_id, 9,  1,  'פתיחת שנה — אין לימודים', 'full_off',    1),
      (tpl_id, 3,  22, 'תענית אסתר — יום מקוצר',  'shortened',   2),
      (tpl_id, 5,  3,  'חג ממלכתי — קודש בלבד',   'kodesh_only', 3),
      (tpl_id, 5,  10, 'חג ממלכתי — קודש בלבד',   'kodesh_only', 4),
      (tpl_id, 6,  14, 'חג ממלכתי — קודש בלבד',   'kodesh_only', 5);
  END IF;
END $$;
