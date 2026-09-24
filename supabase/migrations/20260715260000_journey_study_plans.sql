-- ═════════════════════════════════════════════════════════════════════
-- Учебный план студентки (קבוצת כניסה + משך לימודים), выбираемый
-- ОТВЕТСТВЕННЫМ руководителем (решение владельца 2026-07-15: «של מי שאחראי
-- יהיה גישה לבחור את זה עבור התלמידה»).
--
--   entry_group             — קבוצת כניסה: 'after_9' (אחרי כיתה ט') |
--                             'above_11' (מעל כיתה י"א).
--   expected_duration_years — משך לימודים צפוי: 2 | 3 | 4.
--
-- Отдельная таблица (НЕ трогаем education_journeys), поэтому деплой до
-- миграции безопасен: API читает защищённо и отдаёт пусто, если таблицы нет.
-- RLS отключён; доступ ограничивает API (view_students / manage_students).
-- Применять ВРУЧНУЮ. Идемпотентно.
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS journey_study_plans (
  journey_id              UUID PRIMARY KEY REFERENCES education_journeys(id) ON DELETE CASCADE,
  entry_group             TEXT,
  expected_duration_years SMALLINT,
  updated_by              UUID REFERENCES persons(id),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
