-- ═════════════════════════════════════════════════════════════════════
-- МЕСЯЧНАЯ ОПЛАТА ПРЕПОДАВАТЕЛЮ ЗА СЕМЕСТР-ГРУППУ (фаза 4).
--
-- Правило владельца: студентке — плата ЗА СЕМЕСТР (разово), а преподавателю —
-- оплата ПОМЕСЯЧНО. Ставка живёт на class_teachers.monthly_rate (миграция
-- 20260720150000). Здесь добавляем тип записи 'monthly' в общий журнал
-- staff_work_entries, привязку к группе и период (год/месяц) для дедупликации.
--
-- Начисление — кнопкой «Начислить за месяц» (эндпоинт generate-monthly),
-- по образцу generate-teaching. Идемпотентно: один преподаватель × группа ×
-- месяц = одна запись. Расчётный лист уже суммирует все записи по типам —
-- 'monthly' появится отдельной строкой автоматически.
--
-- Идемпотентно. Применять ВРУЧНУЮ в Supabase SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE staff_work_entries
  ADD COLUMN IF NOT EXISTS source_class_group_id uuid REFERENCES class_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS period_year  int,
  ADD COLUMN IF NOT EXISTS period_month int;

-- Расширяем допустимые типы записи типом 'monthly' (пересоздаём CHECK).
ALTER TABLE staff_work_entries DROP CONSTRAINT IF EXISTS staff_work_entries_entry_type_check;
ALTER TABLE staff_work_entries ADD CONSTRAINT staff_work_entries_entry_type_check
  CHECK (entry_type IN
    ('teaching','meeting','chavruta','chavruta_plus','shabbat_host','shabbat_family','other','monthly'));

-- Дедуп месячной оплаты: преподаватель × семестр-группа × (год, месяц) → одна запись.
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_monthly_group
  ON staff_work_entries (person_id, source_class_group_id, period_year, period_month)
  WHERE entry_type = 'monthly';
