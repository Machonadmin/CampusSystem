-- ═════════════════════════════════════════════════════════════════════
-- Отзывы/характеристики на ученицу (חוות דעת). Учитель пишет отзыв о journey,
-- НО только когда его руководитель открыл ему это право (person_privileges
-- education/write_evaluation) — сам гейт через уже активированный движок.
-- Отзыв виден всем, кто выше автора. Append-only журнал.
--
-- RLS отключён; доступ ограничивает API. Применять ВРУЧНУЮ. Идемпотентно.
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS student_evaluations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES persons(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_student_eval_journey ON student_evaluations(journey_id, created_at);
