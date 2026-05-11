-- ─────────────────────────────────────────────────────────────────────────────
-- Tasks recurrence — поддержка серий повторяющихся задач (подход F).
--
-- Регулярная задача не имеет отдельной "сущности шаблона" в БД.
-- Вместо этого при создании генерируется массив реальных задач,
-- объединённых общим recurrence_series_id. Каждая задача в серии
-- знает своё правило (recurrence_rule) и порядковый номер (recurrence_position).
--
-- Структура recurrence_rule (JSONB):
--   {
--     "frequency": "daily" | "weekly" | "monthly" | "yearly",
--     "time": "HH:MM" | null,           -- для daily: время каждого дня
--     "weekdays": [1,3,5] | null,       -- для weekly: 1=Пн..7=Вс (ISO)
--     "monthly_day": 1..31 | null,      -- для monthly
--     "yearly_month": 1..12 | null,     -- для yearly
--     "yearly_day": 1..31 | null,       -- для yearly
--     "end_type": "never" | "until_date" | "after_count",
--     "end_date": "YYYY-MM-DD" | null,  -- для until_date
--     "end_after_count": 1..N | null    -- для after_count
--   }
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurrence_series_id UUID,
  ADD COLUMN IF NOT EXISTS recurrence_rule JSONB,
  ADD COLUMN IF NOT EXISTS recurrence_position INTEGER;

COMMENT ON COLUMN tasks.recurrence_series_id IS
  'UUID серии повторяющихся задач. NULL для разовых задач. Общий для всех экземпляров одной серии.';
COMMENT ON COLUMN tasks.recurrence_rule IS
  'Правило повторения (frequency, end_type, etc). Копируется в каждый экземпляр серии для самодостаточности.';
COMMENT ON COLUMN tasks.recurrence_position IS
  'Порядковый номер задачи в серии (1, 2, 3...). NULL для разовых.';

-- Согласованность полей recurrence:
-- Все три поля либо все NULL (разовая задача), либо все NOT NULL (часть серии)
ALTER TABLE tasks
  ADD CONSTRAINT tasks_recurrence_consistency CHECK (
    (recurrence_series_id IS NULL AND recurrence_rule IS NULL AND recurrence_position IS NULL)
    OR
    (recurrence_series_id IS NOT NULL AND recurrence_rule IS NOT NULL AND recurrence_position IS NOT NULL)
  );

-- Индекс для быстрого поиска задач серии (DELETE по series_id, отображение серии)
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_series
  ON tasks(recurrence_series_id)
  WHERE recurrence_series_id IS NOT NULL;
