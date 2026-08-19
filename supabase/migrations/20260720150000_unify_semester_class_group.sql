-- ═════════════════════════════════════════════════════════════════════
-- ОБЪЕДИНЕНИЕ «СЕМЕСТР» + «УЧЕБНАЯ ГРУППА» В ОДИН ОБЪЕКТ (класс-группа).
--
-- Решение владельца: «сместр» и «קבוצת לימוד» — одно и то же. Единый объект —
-- существующая class_groups, потому что к ней УЖЕ привязаны преподаватели
-- (class_teachers), студентки (class_enrollments), расписание
-- (class_schedule_slots→lessons), календарь и посещаемость. Финансовая
-- таблица semesters остаётся ЛЕГАСИ (только чтение), ничего не удаляется.
--
-- Модель единого «семестра-группы»:
--   • маршрут (מסלול) → study_track_id;
--   • школьная плата за СЕМЕСТР (одна сумма на студентку) → tuition_amount;
--   • преподавателю — МЕСЯЧНАЯ ставка → class_teachers.monthly_rate;
--   • при зачислении студентки порождается ОДИН счёт tuition
--     (class_enrollments.tuition_charge_id → finance_charges.class_group_id).
--
-- ФАЗА 1 — только аддитивные, NULLABLE поля. Поведение НЕ меняется: пока ничего
-- не читает новые колонки. Изменения месячных выплат преподавателю
-- (staff_work_entries) идут отдельной миграцией фазы 4.
--
-- Идемпотентно. Применять ВРУЧНУЮ в Supabase SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

-- ── 1. Идентичность семестра + финансы на едином объекте ─────────────
ALTER TABLE class_groups
  ADD COLUMN IF NOT EXISTS is_semester    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS study_track_id uuid REFERENCES study_tracks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tuition_amount numeric(12,2) CHECK (tuition_amount IS NULL OR tuition_amount >= 0),
  ADD COLUMN IF NOT EXISTS year_label     text,
  ADD COLUMN IF NOT EXISTS term_number    int,
  ADD COLUMN IF NOT EXISTS sem_status     text DEFAULT 'open'
    CHECK (sem_status IS NULL OR sem_status IN ('open','closed'));

-- ── 2. subject_id → необязателен: семестр-группа определяется МАРШРУТОМ,
--        а не предметом. Существующие строки уже non-null, DROP безопасен. ─
ALTER TABLE class_groups ALTER COLUMN subject_id DROP NOT NULL;

-- ── 3. Счёт tuition может ссылаться на единый объект (semester_id — легаси) ─
ALTER TABLE finance_charges
  ADD COLUMN IF NOT EXISTS class_group_id uuid REFERENCES class_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_finance_charges_class_group ON finance_charges(class_group_id);

-- ── 4. Какой счёт tuition породило зачисление (идемпотентность + отчисление) ─
ALTER TABLE class_enrollments
  ADD COLUMN IF NOT EXISTS tuition_charge_id uuid REFERENCES finance_charges(id) ON DELETE SET NULL;

-- ── 5. Месячная ставка преподавателя на группе (оплата = месячная) ────
ALTER TABLE class_teachers
  ADD COLUMN IF NOT EXISTS monthly_rate numeric(12,2) CHECK (monthly_rate IS NULL OR monthly_rate >= 0);

-- ── Индекс для выборки семестров-групп ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_class_groups_semester ON class_groups(is_semester) WHERE is_semester;
