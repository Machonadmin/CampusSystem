-- ═════════════════════════════════════════════════════════════════════
-- Личные события календаря + напоминания (סנכרון יומן).
--
-- Универсальная модель «добавить в календарь»: ЛЮБУЮ задачу / заметку /
-- напоминание пользователь может положить в свой личный календарь с датой,
-- временем и (опционально) напоминанием. reminder_at — момент напоминания;
-- когда он наступает, серверная материализация (в GET /api/notifications)
-- создаёт уведомление в колокольчике и проставляет reminded_at (идемпотентно,
-- без внешнего планировщика — срабатывает при опросе колокольчика).
--
-- Владелец — owner_id; изоляцию обеспечивает API (RLS в проекте отключён).
-- Отдельная таблица, поэтому деплой до миграции безопасен: API читает
-- защищённо и отдаёт пусто, если таблицы ещё нет.
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor. Идемпотентно.
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS calendar_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  notes       TEXT,
  event_date  DATE NOT NULL,
  event_time  TIME,                       -- NULL = весь день
  all_day     BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_at TIMESTAMPTZ,                 -- когда напомнить (NULL = без напоминания)
  reminded_at TIMESTAMPTZ,                 -- проставляется при срабатывании (идемпотентность)
  source_type TEXT NOT NULL DEFAULT 'manual',  -- manual | task | note | stage | …
  source_id   TEXT,                        -- ссылка на исходную сущность (id)
  link        TEXT,                        -- куда вести по клику
  created_by  UUID REFERENCES persons(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- «Мои события» по дате.
CREATE INDEX IF NOT EXISTS idx_calendar_events_owner_date
  ON calendar_events(owner_id, event_date);

-- Готовые к срабатыванию напоминания.
CREATE INDEX IF NOT EXISTS idx_calendar_events_pending_reminder
  ON calendar_events(reminder_at)
  WHERE reminder_at IS NOT NULL AND reminded_at IS NULL;

-- Не дублировать одну и ту же исходную сущность в календаре одного пользователя.
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_events_source
  ON calendar_events(owner_id, source_type, source_id)
  WHERE source_id IS NOT NULL;
