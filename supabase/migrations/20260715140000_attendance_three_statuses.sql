-- ═════════════════════════════════════════════════════════════════════
-- Новая модель посещаемости (согласовано с владельцем):
--   • 3 статуса вместо 4: present / late / absent (убираем 'excused').
--   • Веса: present=0, late=0.5, absent=1 — генерируемый столбец weight.
--   • scheduled_end_time у урока — якорь для окна редактирования (учитель
--     правит во время урока + 30 мин; см. фазу 3b).
--   • teacher_attendance_grants — доп. время конкретному учителю
--     (постоянное: lesson_id NULL, или разовое: lesson_id задан).
--
-- Существующие 'excused' → 'present' (оправдано, не штрафуем). ЕСЛИ важно
-- иначе — сообщите, поправим до запуска.
--
-- Применять ВРУЧНУЮ через Supabase SQL Editor. Идемпотентно.
-- ═════════════════════════════════════════════════════════════════════

-- 1. 4 статуса → 3 (+ миграция 'excused')
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
UPDATE attendance SET status = 'present' WHERE status NOT IN ('present', 'late', 'absent');
ALTER TABLE attendance ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('present', 'late', 'absent'));

-- 2. Вес (0 / 0.5 / 1) — генерируемый столбец
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS weight NUMERIC
  GENERATED ALWAYS AS (CASE status WHEN 'absent' THEN 1 WHEN 'late' THEN 0.5 ELSE 0 END) STORED;

-- 3. Время окончания урока — якорь окна редактирования
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS scheduled_end_time TIME;

-- 4. Персональное доп. время учителю на редактирование посещаемости
CREATE TABLE IF NOT EXISTS teacher_attendance_grants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  lesson_id     UUID REFERENCES lessons(id) ON DELETE CASCADE,   -- NULL = постоянно; задан = разово на урок
  extra_minutes INTEGER NOT NULL DEFAULT 0,
  granted_by    UUID REFERENCES persons(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tag_teacher ON teacher_attendance_grants(teacher_id);
CREATE INDEX IF NOT EXISTS idx_tag_lesson ON teacher_attendance_grants(lesson_id);
