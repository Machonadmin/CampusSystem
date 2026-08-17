-- ═════════════════════════════════════════════════════════════════════
-- ЛИЧНЫЕ СОБЫТИЯ СТУДЕНТКИ (אירועים אישיים) — приватный календарь ученицы.
--
-- ЖЁСТКАЯ ПРИВАТНОСТЬ (требование владельца: «הצוות לעולם לא רואה, מאובטח»):
-- эти записи принадлежат ТОЛЬКО ученице. Читать/писать их можно ИСКЛЮЧИТЕЛЬНО
-- через портальный API /api/portal/personal-events, который требует
-- principal='student' и сверяет journey_id с сессией. НЕТ ни одного
-- сотруднического маршрута, читающего эту таблицу — сотрудник не видит её
-- НИКОГДА. Отдельная таблица (не общий calendar_events, который читают
-- сотрудники) — чтобы приватность держалась на структуре, а не на фильтре.
--
-- Применять вручную (идемпотентно, deploy-safe).
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS student_personal_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id    uuid NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  person_id     uuid REFERENCES persons(id) ON DELETE SET NULL,
  title         text NOT NULL,
  event_date    date NOT NULL,
  event_time    time,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_personal_events_journey_date
  ON student_personal_events(journey_id, event_date);
