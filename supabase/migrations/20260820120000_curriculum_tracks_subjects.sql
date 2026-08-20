-- Учебная программа на год (по утверждённой владельцем таблице).
-- Переименование מסלולים, годы, активация Эмуны, трёхъязычные предметы по годам
-- (+ по 2 семестра на предмет, как делает /api/education/subjects), и классы
-- старшей школы (תיכון) как отдельные class_groups для расстановки учениц.
-- Идемпотентно.

-- ── 1. Предметы: трёхъязычные имена + снятие глобального UNIQUE(name) ──────────
-- Один и тот же предмет (עיצוב, כלכלה) встречается в разных מסלולים — глобальный
-- UNIQUE(name) это блокировал.
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS name_ru TEXT;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS name_en TEXT;
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_name_unique;

-- ── 2. Маршруты (מסלולים): имена (he/ru/en), число лет, активация ─────────────
UPDATE study_tracks SET
  name_he = 'תיכון', name_ru = 'Школа', name_en = 'High School',
  years_count = 2, is_active = true
  WHERE code = 'school';

UPDATE study_tracks SET
  name_he = 'קולג'' על בסיס כתה י"א',
  name_ru = 'Колледж (на базе 11 класса)',
  name_en = 'College (based on 11th grade)',
  years_count = 3, is_active = true
  WHERE code = 'college';

UPDATE study_tracks SET
  name_he = 'קולג'' על בסיס כתה ט''',
  name_ru = 'Колледж (на базе 9 класса)',
  name_en = 'College (based on 9th grade)',
  years_count = 4, is_active = true
  WHERE code = 'college_a';

UPDATE study_tracks SET
  name_he = 'אוניברסיטה', name_ru = 'Университет', name_en = 'University',
  years_count = 4, is_active = true
  WHERE code = 'university';

UPDATE study_tracks SET
  name_he = 'טורו', name_ru = 'Туро', name_en = 'Touro',
  years_count = 4, is_active = true
  WHERE code = 'touro';

UPDATE study_tracks SET
  name_he = 'אמונה', name_ru = 'Эмуна', name_en = 'Emuna',
  years_count = 3, is_active = true
  WHERE code = 'emuna';

-- ── 3. Предметы по годам (+ 2 семестра на предмет) ───────────────────────────
DO $$
DECLARE
  v_track uuid; v_dept uuid; v_subject uuid; r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('college_a',  2, 'עיצוב',             'Дизайн',       'Design'),
    ('college',    2, 'עיצוב',             'Дизайн',       'Design'),
    ('university', 2, 'כלכלה',             'Экономика',    'Economics'),
    ('university', 3, 'יחסי ציבור ופרסום', 'PR и реклама', 'PR & Advertising'),
    ('university', 4, 'פדגוגיה',           'Педагогика',   'Pedagogy'),
    ('touro',      2, 'יודאיקה',           'Иудаика',      'Judaic Studies'),
    ('touro',      3, 'כלכלה',             'Экономика',    'Economics'),
    ('touro',      4, 'מחשבים',            'Информатика',  'Computer Science')
  ) AS t(code, yr, he, ru, en) LOOP
    SELECT id, department_id INTO v_track, v_dept FROM study_tracks WHERE code = r.code;
    IF v_track IS NULL THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM subjects WHERE study_track_id = v_track AND year_level = r.yr AND name = r.ru) THEN
      CONTINUE;
    END IF;
    INSERT INTO subjects (name, name_he, name_ru, name_en, department_id, study_track_id, year_level, sort_order, is_active)
    VALUES (r.ru, r.he, r.ru, r.en, v_dept, v_track, r.yr, 0, true)
    RETURNING id INTO v_subject;
    IF v_dept IS NOT NULL THEN
      INSERT INTO class_groups (name, department_id, subject_id, study_track_id, year_level, is_semester, sem_status, term_number, tuition_amount)
      VALUES
        (r.ru || ' · 1', v_dept, v_subject, v_track, r.yr, true, 'open', 1, 210000),
        (r.ru || ' · 2', v_dept, v_subject, v_track, r.yr, true, 'open', 2, 210000);
    END IF;
  END LOOP;
END $$;

-- ── 4. Классы старшей школы (תיכון): כתה י' / כתה י"א ────────────────────────
DO $$
DECLARE v_track uuid; v_dept uuid;
BEGIN
  SELECT id, department_id INTO v_track, v_dept FROM study_tracks WHERE code = 'school';
  IF v_track IS NULL OR v_dept IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM class_groups WHERE study_track_id = v_track AND is_semester = false AND name = 'כתה י''') THEN
    INSERT INTO class_groups (name, department_id, study_track_id, year_level, is_semester, is_active)
    VALUES ('כתה י''', v_dept, v_track, 1, false, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM class_groups WHERE study_track_id = v_track AND is_semester = false AND name = 'כתה י"א') THEN
    INSERT INTO class_groups (name, department_id, study_track_id, year_level, is_semester, is_active)
    VALUES ('כתה י"א', v_dept, v_track, 2, false, true);
  END IF;
END $$;
