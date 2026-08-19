-- ─────────────────────────────────────────────────────────────────────────────
-- Многоструктурное членство студентки (טורו как надстройка над אוניברסיטה).
--
-- Студентка (education_journeys) остаётся ОДНОЙ записью с одним primary_department
-- (как раньше), но может ДОПОЛНИТЕЛЬНО состоять в других структурах через эту
-- таблицу. Руководитель структуры видит студенток, для которых его структура —
-- primary ИЛИ есть членство здесь (общий доступ к одной и той же карточке).
--
-- Аддитивно и идемпотентно. Применять вручную в Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS journey_structures (
  journey_id     uuid NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  department_id  uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  added_by       uuid REFERENCES persons(id),
  added_at       timestamptz DEFAULT now(),
  PRIMARY KEY (journey_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_journey_structures_dept ON journey_structures(department_id);
CREATE INDEX IF NOT EXISTS idx_journey_structures_journey ON journey_structures(journey_id);
