-- Тזמון תזכורות למשימות.
--
-- remind_days_before — за сколько дней до срока прислать раннее напоминание
-- исполнителю (в дополнение к уже существующим «משימה למחר» / «משימה להיום»).
-- NULL = раннего напоминания нет (поведение как раньше).
-- Напоминания после просрочки (на 1-й, 3-й и 7-й день) работают для всех
-- открытых задач и колонки не требуют.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS remind_days_before SMALLINT;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_remind_days_before_range;
ALTER TABLE tasks ADD CONSTRAINT tasks_remind_days_before_range
  CHECK (remind_days_before IS NULL OR remind_days_before BETWEEN 2 AND 30);

COMMENT ON COLUMN tasks.remind_days_before IS
  'За сколько дней до due_date прислать раннее напоминание исполнителю (2..30). NULL = нет.';
