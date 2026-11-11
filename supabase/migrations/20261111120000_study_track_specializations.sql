-- ═════════════════════════════════════════════════════════════════════
-- מגמות בתוך מסלול (2026-11-11, решение владельца): «אוניברסיטה — כלכלה» и
-- «אוניברסיטה — פרסום (PR)» — не отдельные маршруты, а מגמות внутри
-- маршрута «אוניברסיטה».
--
-- 1) study_track_specializations — справочник מגמות (у любого маршрута).
-- 2) specialization_id в journey_study_tracks (מגמה студентки), subjects и
--    class_groups (מקצוע/קבוצה מגמה; NULL = общий для всего маршрута).
-- 3) Перенос данных: всё, что висело на univ_economics / univ_pr (מקצועות,
--    קבוצות, назначения студенток, ответственные), переезжает на university
--    с соответствующей מגמה; старые маршруты ДЕАКТИВИРУЮТСЯ (не удаляются —
--    история сохраняется). По словам владельца, студенток на них нет.
--
-- Идемпотентно. Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS study_track_specializations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id    uuid NOT NULL REFERENCES study_tracks(id) ON DELETE CASCADE,
  code        text NOT NULL CHECK (code ~ '^[a-z0-9_]{2,40}$'),
  name_he     text NOT NULL,
  name_ru     text NOT NULL DEFAULT '',
  name_en     text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (track_id, code)
);
CREATE INDEX IF NOT EXISTS idx_study_track_specializations_track ON study_track_specializations(track_id);
ALTER TABLE study_track_specializations ENABLE ROW LEVEL SECURITY;

ALTER TABLE journey_study_tracks
  ADD COLUMN IF NOT EXISTS specialization_id uuid REFERENCES study_track_specializations(id) ON DELETE SET NULL;
ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS specialization_id uuid REFERENCES study_track_specializations(id) ON DELETE SET NULL;
ALTER TABLE class_groups
  ADD COLUMN IF NOT EXISTS specialization_id uuid REFERENCES study_track_specializations(id) ON DELETE SET NULL;

DO $$
DECLARE
  uni   uuid;
  old   uuid;
  spec  uuid;
  pair  record;
BEGIN
  SELECT id INTO uni FROM study_tracks WHERE code = 'university';
  IF uni IS NULL THEN
    RAISE NOTICE 'study_tracks.university not found — skipping data move';
    RETURN;
  END IF;

  FOR pair IN
    SELECT * FROM (VALUES
      ('univ_economics', 'economics', 'כלכלה',       'Экономика',     'Economics', 10),
      ('univ_pr',        'pr',        'פרסום (PR)',  'Реклама / PR',  'PR',        20)
    ) AS v(old_code, spec_code, he, ru, en, ord)
  LOOP
    INSERT INTO study_track_specializations (track_id, code, name_he, name_ru, name_en, sort_order)
    VALUES (uni, pair.spec_code, pair.he, pair.ru, pair.en, pair.ord)
    ON CONFLICT (track_id, code) DO NOTHING;
    SELECT id INTO spec FROM study_track_specializations WHERE track_id = uni AND code = pair.spec_code;

    SELECT id INTO old FROM study_tracks WHERE code = pair.old_code;
    IF old IS NULL THEN CONTINUE; END IF;

    UPDATE subjects     SET study_track_id = uni, specialization_id = spec WHERE study_track_id = old;
    UPDATE class_groups SET study_track_id = uni, specialization_id = spec WHERE study_track_id = old;

    -- Назначения студенток: переносим, если у неё ещё нет строки university
    -- (иначе — только проставляем מגמה существующей строке и убираем старую).
    UPDATE journey_study_tracks j
       SET specialization_id = spec
     WHERE j.track_id = uni
       AND j.specialization_id IS NULL
       AND EXISTS (SELECT 1 FROM journey_study_tracks o WHERE o.journey_id = j.journey_id AND o.track_id = old);
    DELETE FROM journey_study_tracks o
     WHERE o.track_id = old
       AND EXISTS (SELECT 1 FROM journey_study_tracks j WHERE j.journey_id = o.journey_id AND j.track_id = uni);
    UPDATE journey_study_tracks SET track_id = uni, specialization_id = spec WHERE track_id = old;

    INSERT INTO study_track_managers (track_id, person_id, created_by)
      SELECT uni, person_id, created_by FROM study_track_managers WHERE track_id = old
      ON CONFLICT (track_id, person_id) DO NOTHING;
    DELETE FROM study_track_managers WHERE track_id = old;

    UPDATE study_tracks SET is_active = false WHERE id = old;
  END LOOP;
END $$;
