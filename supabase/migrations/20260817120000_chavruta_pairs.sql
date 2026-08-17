-- ═════════════════════════════════════════════════════════════════════
-- ХАВРУТА-ПАРЫ (שיוך חברותא) — постоянные учебные пары мора↔ученица.
--
-- ОТДЕЛЬНО от chavruta_plus_assignments (то — менторство, влияет на ЗАРПЛАТУ
-- через chavruta_plus_rate). Здесь — чисто УЧЕБНЫЙ шиюх: менеджер закрепляет
-- мору за ученицей для отслеживания, БЕЗ каких-либо денежных последствий
-- (по решению владельца: «שיוך חברותא נפרד ללא שכר»).
--
-- Управляется из «мרכз חברותא» в модуле «Лимудим». Деактивация (is_active=false)
-- вместо удаления — пара сохраняется в истории. UNIQUE не даёт дублей.
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chavruta_pairs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_person_id  uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  student_journey_id uuid NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  is_active          boolean NOT NULL DEFAULT true,
  created_by         uuid REFERENCES persons(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_person_id, student_journey_id)
);

CREATE INDEX IF NOT EXISTS idx_chavruta_pairs_teacher ON chavruta_pairs(teacher_person_id);
CREATE INDEX IF NOT EXISTS idx_chavruta_pairs_student ON chavruta_pairs(student_journey_id);
