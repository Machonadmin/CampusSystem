-- ═════════════════════════════════════════════════════════════════════
-- Заметки к уроку (הערות שיעור). Учитель пишет заметку к своему уроку —
-- сохраняется навсегда (append-only), видна всем, кто выше него. Несколько
-- заметок на урок (журнал), поэтому отдельная таблица, а не поле в lessons.
--
-- RLS в проекте отключён; доступ ограничивает API (view/mark на группе урока).
-- Применять ВРУЧНУЮ через Supabase SQL Editor. Идемпотентно.
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lesson_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id  UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES persons(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lesson_notes_lesson ON lesson_notes(lesson_id, created_at);
