-- ═════════════════════════════════════════════════════════════════════
-- Хеврута: «חברותא קבועה» — день недели и время у постоянной пары.
--
-- Решения владельца 2026-10-13: хеврута одна, один тариф за встречу
-- (хеврута-плюс с помесячной оплатой упразднена). Мора отмечает ученицу как
-- «קבועה» — например, «с этого момента каждую среду». Тогда в этот день утром
-- приходит напоминание, что у неё хеврута, а после встречи — вопрос, была ли
-- встреча. Оплачивается только встреча, которую мора подтвердила.
--
-- Постоянная пара = строка chavruta_pairs (её ведёт и «מרכז חברותא»):
--   weekday    — день недели, 0 = воскресенье … 6 = суббота (как JS getDay);
--   start_time — время начала по Израилю.
-- Обе колонки необязательны: у пар, заведённых в центре, дня ещё нет, его
-- ставит мора. Без дня пара просто стоит в её списке, без напоминаний.
--
-- chavruta_skips — ответ «не состоялась» на вопрос после встречи (пара + дата).
-- На зарплату не влияет: оплата идёт только по записанным встречам
-- (staff_work_entries, entry_type='chavruta'). Нужна, чтобы вопрос не висел и
-- мора видела свой ответ.
--
-- Идемпотентно. Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE chavruta_pairs
  ADD COLUMN IF NOT EXISTS weekday    smallint CHECK (weekday BETWEEN 0 AND 6),
  ADD COLUMN IF NOT EXISTS start_time time;

CREATE TABLE IF NOT EXISTS chavruta_skips (
  pair_id    uuid NOT NULL REFERENCES chavruta_pairs(id) ON DELETE CASCADE,
  skip_date  date NOT NULL,
  created_by uuid REFERENCES persons(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pair_id, skip_date)
);

-- Как и все таблицы схемы (миграция 20260908120000): доступ только с сервера.
ALTER TABLE chavruta_skips ENABLE ROW LEVEL SECURITY;
