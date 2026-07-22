-- ─────────────────────────────────────────────────────────────────────────────
-- Участники встречи (можно пригласить ЛЮБОГО человека, не только студентку).
--
-- Раньше у встречи был один владелец (provider_id) и опционально одна студентка
-- (journey_id). Теперь можно добавить несколько участников-persons. Если
-- приглашённый ВЫШЕ по иерархии, чем создатель — его участие требует
-- подтверждения (status='pending_approval'), пока он не примет/отклонит.
--
-- Аддитивно и идемпотентно. Применять вручную в Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS appointment_attendees (
  appointment_id    uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  person_id         uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'invited'
                    CHECK (status IN ('invited', 'accepted', 'declined', 'pending_approval')),
  requires_approval boolean DEFAULT false,
  responded_at      timestamptz,
  created_at        timestamptz DEFAULT now(),
  PRIMARY KEY (appointment_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_appt_attendees_person ON appointment_attendees(person_id);
CREATE INDEX IF NOT EXISTS idx_appt_attendees_appt ON appointment_attendees(appointment_id);
