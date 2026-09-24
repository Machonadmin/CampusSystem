-- ═════════════════════════════════════════════════════════════════════
-- Календарь (Calendar) — ЛИЧНЫЙ календарь сотрудника.
--
-- Календарь ПЕРСОНАЛЬНЫЙ и self-scoped: провайдер — всегда залогиненный
-- пользователь (provider_id = session.person_id). Страница /dashboard/calendar
-- доступна ЛЮБОМУ залогиненному сотруднику (только auth-gate), это НЕ модуль из
-- PROTECTED_MODULES → блок прав НЕ нужен и НЕ добавляется.
--
-- Две таблицы:
--   • appointments    — встреча, которую пользователь ставит себе, опционально
--     со студентом (journey_id → education_journeys). Времена timestamptz,
--     статус scheduled/completed/cancelled/no_show, CHECK (ends_at > starts_at).
--   • calendar_blocks — день, в который пользователь недоступен (выходной).
--     UNIQUE (provider_id, block_date) → пометка идемпотентна.
--
-- Обе таблицы висят на persons(id) провайдера (provider_id) с ON DELETE CASCADE.
-- appointments.journey_id → education_journeys(id) ON DELETE SET NULL (студент
-- опционален; удаление учебного пути НЕ удаляет встречу, лишь обнуляет ссылку).
--
-- Расчёты сетки месяца, пересечения интервалов (защита от двойного
-- бронирования), выборки по дню — ЧИСТАЯ логика в lib/calendar/calendar.ts
-- (покрыта vitest), НЕ в БД.
--
-- Идемпотентно: CREATE TABLE IF NOT EXISTS; DROP TRIGGER IF EXISTS + CREATE;
-- set_updated_at() определяется здесь же через CREATE OR REPLACE.
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 0. set_updated_at() — на случай если функции ещё нет в целевой БД
--    (идентична версии проекта)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
$$;


-- ─────────────────────────────────────────────
-- 1. APPOINTMENTS (встречи пользователя)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS appointments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  journey_id   UUID REFERENCES education_journeys(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  reason       TEXT,
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')) DEFAULT 'scheduled',
  notes        TEXT,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_appointments_provider   ON appointments(provider_id);
CREATE INDEX IF NOT EXISTS idx_appointments_journey    ON appointments(journey_id);
CREATE INDEX IF NOT EXISTS idx_appointments_starts_at  ON appointments(starts_at);

DROP TRIGGER IF EXISTS set_updated_at_appointments ON appointments;
CREATE TRIGGER set_updated_at_appointments
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 2. CALENDAR_BLOCKS (выходные / дни недоступности)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS calendar_blocks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  block_date   DATE NOT NULL,
  reason       TEXT,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_id, block_date)
);

CREATE INDEX IF NOT EXISTS idx_calendar_blocks_provider   ON calendar_blocks(provider_id);
CREATE INDEX IF NOT EXISTS idx_calendar_blocks_block_date ON calendar_blocks(block_date);

DROP TRIGGER IF EXISTS set_updated_at_calendar_blocks ON calendar_blocks;
CREATE TRIGGER set_updated_at_calendar_blocks
  BEFORE UPDATE ON calendar_blocks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
