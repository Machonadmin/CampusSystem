-- ─────────────────────────────────────────────────────────────────────────────
-- Утверждение слотов расписания, попадающих в зарезервированное время кодеш.
--
-- Правило (решение владельца): «утро принадлежит кодеш». Менеджер לימודי חול
-- МОЖЕТ поставить слот на это время, но он не вступает в силу, пока מנהל כללי
-- (роль superadmin) не утвердит. Такой слот заводится со статусом 'pending',
-- НЕ порождает уроки (generate его пропускает) и помечается в сетке
-- «ממתין לאישור». Утверждение → 'active', отклонение → 'rejected'.
--
-- Слоты ВНЕ времени кодеш и слоты, созданные самим מנהל כללי, — сразу 'active'.
-- Код деплой-безопасен: до применения этой миграции всё ведёт себя как раньше
-- (колонки нет → слот считается 'active').
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE class_schedule_slots
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'active';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_schedule_slots_approval_status_chk'
  ) THEN
    ALTER TABLE class_schedule_slots
      ADD CONSTRAINT class_schedule_slots_approval_status_chk
      CHECK (approval_status IN ('active', 'pending', 'rejected'));
  END IF;
END $$;

ALTER TABLE class_schedule_slots
  ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES persons(id) ON DELETE SET NULL;
ALTER TABLE class_schedule_slots
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES persons(id) ON DELETE SET NULL;
ALTER TABLE class_schedule_slots
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_class_schedule_slots_pending
  ON class_schedule_slots (approval_status)
  WHERE approval_status = 'pending';
