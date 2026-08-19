-- ═════════════════════════════════════════════════════════════════════
-- Сообщения студентке от сотрудника (staff → student). Сотрудник, который
-- ведёт студентку, отправляет ей сообщение; студентка читает его в своём
-- кабинете (только чтение — ответить в v1 нельзя). read_at помечается, когда
-- студентка открыла/просмотрела сообщение.
--
-- RLS отключён; доступ ограничивает API. Применять ВРУЧНУЮ. Идемпотентно.
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS student_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id     UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  from_person_id UUID REFERENCES persons(id),
  subject        TEXT,
  body           TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  read_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_student_messages_journey ON student_messages(journey_id, created_at DESC);
