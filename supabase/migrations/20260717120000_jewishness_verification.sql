-- ═════════════════════════════════════════════════════════════════════
-- ПРОВЕРКА ЕВРЕЙСТВА (בירור יהדות) — статус верификации на студентку.
--
-- Раньше «еврейство» существовало ТОЛЬКО как этап acceptance-процесса
-- (stage code 'jewishness'): не было ни статуса на студентке, ни истории,
-- ни модуля с собственными данными. Здесь заводим:
--   • статус верификации на education_journeys (быстрый для чтения/фильтра/бейджа);
--   • историю изменений статуса (append-only) — кто/когда/почему.
--
-- Статусы: pending (ממתין) · verified (מאושר) · rejected (נדחה) ·
--          needs_review (דורש בדיקה נוספת).
--
-- Синхронизация с acceptance двусторонняя (в коде): завершение этапа
-- 'jewishness' (approved/rejected) пишет статус; установка статуса в модуле
-- завершает этап. source в истории различает происхождение.
--
-- Идемпотентно. Применять ВРУЧНУЮ через Supabase SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE education_journeys
  ADD COLUMN IF NOT EXISTS jewishness_status text NOT NULL DEFAULT 'pending'
    CHECK (jewishness_status IN ('pending', 'verified', 'rejected', 'needs_review')),
  ADD COLUMN IF NOT EXISTS jewishness_verified_by uuid REFERENCES persons(id),
  ADD COLUMN IF NOT EXISTS jewishness_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS jewishness_notes text;

CREATE TABLE IF NOT EXISTS jewishness_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  status text NOT NULL
    CHECK (status IN ('pending', 'verified', 'rejected', 'needs_review')),
  changed_by uuid REFERENCES persons(id),
  note text,
  source text,  -- 'module' | 'acceptance_stage'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jewishness_history_journey
  ON jewishness_status_history (journey_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_education_journeys_jewishness_status
  ON education_journeys (jewishness_status);
