-- ═════════════════════════════════════════════════════════════════════
-- НОКХУТ МОРИМ (נוכחות מורים) — учитель отмечает «я пришёл» на свой урок,
-- секретариат подтверждает. Учитель видит статус (подтверждено/нет).
--
-- Отдельно от посещаемости УЧЕНИЦ (attendance) — это присутствие самого
-- преподавателя. Привязка к уроку (lessons). Статус: reported (учитель отметил)
-- → approved / rejected (секретариат). Идемпотентно, deploy-safe.
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS teacher_attendance (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id          uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  teacher_person_id  uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','approved','rejected')),
  note               text,
  reported_at        timestamptz NOT NULL DEFAULT now(),
  decided_by         uuid REFERENCES persons(id) ON DELETE SET NULL,
  decided_at         timestamptz,
  UNIQUE (lesson_id, teacher_person_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_attendance_teacher ON teacher_attendance(teacher_person_id);
CREATE INDEX IF NOT EXISTS idx_teacher_attendance_status  ON teacher_attendance(status);
