-- ============================================================================
-- מקצוע (subject) переходит под МАРШРУТ (study_track) + ГОД (year_level).
--
-- Продуктовая модель (согласовано с владельцем):
--   מסלול (study_track) → שנה (year א'/ב'/…) → מקצוע (subject) → 2 סמסטרים.
--
-- Раньше subject висел ТОЛЬКО на department. Теперь он висит на study_track
-- (+ year_level), а department выводится из маршрута — чтобы существующая
-- видимость/права по подразделению продолжали работать (ответственный за
-- маршрут = у кого staff_position в соответствующем department).
--
-- НИЧЕГО НЕ УДАЛЯЕТСЯ. Только ADD COLUMN + мягкий сид связи маршрут→подразделение.
-- Чистка тестовых данных делается ОТДЕЛЬНЫМ скриптом (по согласованию).
-- ============================================================================

-- 1) Связь маршрут → ответственное подразделение (учебное заведение).
ALTER TABLE study_tracks
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id) ON DELETE SET NULL;

-- Сид: сопоставляем по каноничному (русскому) имени подразделения.
-- Если имя не совпало — department_id остаётся NULL (обрабатываем в API).
UPDATE study_tracks st
SET department_id = d.id
FROM departments d
WHERE st.department_id IS NULL AND (
  (st.code = 'school'     AND d.name = 'Школа')        OR
  (st.code = 'college'    AND d.name = 'Колледж')      OR
  (st.code = 'university' AND d.name = 'Университет')  OR
  (st.code = 'touro'      AND d.name ILIKE 'Touro%')
);

-- 2) Subject: маршрут + год. department_id становится необязательным.
ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS study_track_id uuid REFERENCES study_tracks(id) ON DELETE SET NULL;

ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS year_level int
  CHECK (year_level IS NULL OR (year_level BETWEEN 1 AND 6));

ALTER TABLE subjects
  ALTER COLUMN department_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subjects_study_track ON subjects(study_track_id);
