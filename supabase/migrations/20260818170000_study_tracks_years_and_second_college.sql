-- ============================================================================
-- Две мכללות + количество лет на маршрут.
--
-- Согласовано с владельцем:
--   • מכללה под מסלול א׳ (Группа А) — для младших, 4 года.
--   • מכללה под מסלול ב׳ (Группа Б) — 3 года.
--   • בית ספר — 2 года; אוניברסיטה/טורו — 4 года.
--
-- Год у предмета (year_level) ограничивается числом лет маршрута (years_count),
-- поэтому в форме создания מקצוע список годов подстраивается под маршрут.
-- ============================================================================

-- 1) Кол-во лет обучения на маршрут.
ALTER TABLE study_tracks
  ADD COLUMN IF NOT EXISTS years_count int NOT NULL DEFAULT 4
  CHECK (years_count BETWEEN 1 AND 8);

UPDATE study_tracks SET years_count = 2 WHERE code = 'school';
UPDATE study_tracks SET years_count = 3 WHERE code = 'college';      -- Группа Б, 3 года
UPDATE study_tracks SET years_count = 4 WHERE code IN ('university', 'touro');

-- 2) Существующий 'college' — это מכללה Группы Б (3 года). Уточняем название,
--    чтобы отличать от новой мכллы Группы А.
UPDATE study_tracks
SET name_he = 'מכללה (קבוצה ב׳)',
    name_ru = 'Колледж (Группа Б, 3 года)',
    name_en = 'College (Group B, 3y)'
WHERE code = 'college';

-- 3) Новый маршрут: מכללה Группы А (4 года), привязан к «Колледж (4 года)».
INSERT INTO study_tracks (code, name_he, name_ru, name_en, department_id, years_count, sort_order, is_active)
VALUES (
  'college_a',
  'מכללה (קבוצה א׳)',
  'Колледж (Группа А, 4 года)',
  'College (Group A, 4y)',
  'a0000000-0000-4000-8000-000000000003',
  4,
  15,
  true
)
ON CONFLICT (code) DO NOTHING;
