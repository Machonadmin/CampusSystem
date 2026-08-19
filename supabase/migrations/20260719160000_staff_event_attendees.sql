-- ═════════════════════════════════════════════════════════════════════
-- УЧАСТНИЦЫ СОБЫТИЙ СОТРУДНИКА (шаббат-приёмы и т.п.).
--
-- Одно СОБЫТИЕ = одна запись staff_work_entries (тип shabbat_host /
-- shabbat_family), несущая ОПЛАТУ (сумму задаёт менеджер за событие). К нему
-- прикрепляются НЕСКОЛЬКО учениц — здесь. Так оплата за событие едина (не
-- дублируется по ученице), а на карточке КАЖДОЙ отмеченной ученицы видно, что
-- она была (публичный summary — да; private_notes — только менеджер/автор).
--
-- Универсально: подходит любой многоучастниковой рабочей записи, не только
-- шаббату. Идемпотентно; применять вручную.
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS staff_event_attendees (
  work_entry_id      uuid NOT NULL REFERENCES staff_work_entries(id) ON DELETE CASCADE,
  student_journey_id uuid NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (work_entry_id, student_journey_id)
);

-- Обратный индекс: «на каких событиях была эта ученица».
CREATE INDEX IF NOT EXISTS idx_event_attendees_student
  ON staff_event_attendees (student_journey_id);
