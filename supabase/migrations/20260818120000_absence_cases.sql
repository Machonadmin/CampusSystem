-- ═════════════════════════════════════════════════════════════════════
-- טיפול בהעדרויות — «случаи отсутствия».
--
-- Ответственный отмечает пропуск/исключительную ситуацию ученицы и может
-- ПЕРЕДАТЬ обработку другому подразделению (решение владельца: «האחראי מסמן
-- ומעביר למחלקה אחרת»). Принимающее подразделение обрабатывает и закрывает.
--
-- status: open → in_handling → resolved. assigned_department_id — кто сейчас
-- ведёт случай (null = у открывшего / общий). Идемпотентно, deploy-safe.
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS absence_cases (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id             uuid NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  lesson_id              uuid REFERENCES lessons(id) ON DELETE SET NULL,
  absence_date           date,
  note                   text,
  status                 text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_handling','resolved')),
  assigned_department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  opened_by              uuid REFERENCES persons(id) ON DELETE SET NULL,
  opened_at              timestamptz NOT NULL DEFAULT now(),
  handled_by             uuid REFERENCES persons(id) ON DELETE SET NULL,
  resolution             text,
  resolved_at            timestamptz,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_absence_cases_status  ON absence_cases(status);
CREATE INDEX IF NOT EXISTS idx_absence_cases_dept    ON absence_cases(assigned_department_id);
CREATE INDEX IF NOT EXISTS idx_absence_cases_journey ON absence_cases(journey_id);
