-- ═════════════════════════════════════════════════════════════════════
-- Реальные подразделения «Набор» (גיוס) и «Приёмная комиссия» (קבלה).
--
-- Оргструктура для двух команд процесса приёма:
--   • גיוס  — набирает лидов и передаёт их дальше.
--   • קבלה  — подписывает этапы приёма (учёба/общежитие/еврейство/врач/директор).
--
-- Помимо создания подразделений, СРАЗУ наполняет их текущими носителями ролей
-- (staff_positions), чтобы команды были не пустыми:
--   recruiter                                   → גיוס
--   head_of_studies, dorm_director,
--   jewishness_officer, school_director,
--   doctor, psychologist                        → קבלה
-- Новых людей в этих ролях позже добавляют в подразделение вручную (в модуле
-- «Сотрудники») — это разовое наполнение существующих.
--
-- Идемпотентно: подразделения заводятся по имени только если их ещё нет;
-- позиции — только если у человека ещё нет активной позиции в этом отделе.
-- departments.name НЕ уникально, поэтому ON CONFLICT не годится — используем
-- явные проверки в DO-блоке.
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  giyus  UUID;
  kabala UUID;
BEGIN
  -- ── Подразделения (создаём, если ещё нет) ────────────────────────────────
  SELECT id INTO giyus FROM departments WHERE name = 'גיוס' LIMIT 1;
  IF giyus IS NULL THEN
    INSERT INTO departments (name) VALUES ('גיוס') RETURNING id INTO giyus;
  END IF;

  SELECT id INTO kabala FROM departments WHERE name = 'קבלה' LIMIT 1;
  IF kabala IS NULL THEN
    INSERT INTO departments (name) VALUES ('קבלה') RETURNING id INTO kabala;
  END IF;

  -- ── Набор → גיוס ─────────────────────────────────────────────────────────
  INSERT INTO staff_positions (person_id, department_id, position_ru, position_he)
  SELECT DISTINCT pr.person_id, giyus, 'Набор', 'גיוס'
  FROM person_roles pr
  JOIN roles r ON r.id = pr.role_id
  WHERE r.code = 'recruiter'
    AND NOT EXISTS (
      SELECT 1 FROM staff_positions sp
      WHERE sp.person_id = pr.person_id AND sp.department_id = giyus AND sp.end_date IS NULL
    );

  -- ── Приёмная комиссия → קבלה ─────────────────────────────────────────────
  INSERT INTO staff_positions (person_id, department_id, position_ru, position_he)
  SELECT DISTINCT pr.person_id, kabala, 'Приёмная комиссия', 'ועדת קבלה'
  FROM person_roles pr
  JOIN roles r ON r.id = pr.role_id
  WHERE r.code IN ('head_of_studies', 'dorm_director', 'jewishness_officer', 'school_director', 'doctor', 'psychologist')
    AND NOT EXISTS (
      SELECT 1 FROM staff_positions sp
      WHERE sp.person_id = pr.person_id AND sp.department_id = kabala AND sp.end_date IS NULL
    );
END $$;
