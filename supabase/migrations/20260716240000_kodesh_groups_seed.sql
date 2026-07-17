-- ═════════════════════════════════════════════════════════════════════
-- ЗАСЕВ КОДЕША (לימודי קודש) — по структуре, заданной владельцем.
--
-- «В кодеше учатся ВСЕ». Деление (חילוק) — 6 групп под кафедрой иудаики:
--   כיתה י (10 кл) · כיתה י"א (11 кл) · כיתה 1 · כיתה 2 · כיתה 3 · כיתה 4.
-- Два фиксированных утренних урока КАЖДЫЙ день (Пн–Чт, ISO 1–4):
--   09:15–10:30 и 11:00–12:10 — всегда кодеш.
--
-- Кодеш переиспользует существующую модель: группы = class_groups под
-- кафедрой иудаики (dept 9a3d7b3f), фикс-слоты = class_schedule_slots.
-- Уроки/посещаемость/единый календарь появляются АВТОМАТИЧЕСКИ, как только
-- студентку записали (class_enrollments) и сгенерировали уроки
-- (POST …/schedule/generate). Учителя/локации проставляются как обычно,
-- новые группы можно добавлять руками (разово или постоянно).
--
-- Идемпотентно. Применять ВРУЧНУЮ через Supabase SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  kodesh_dept UUID := '9a3d7b3f-3f65-4653-a111-4d5296404a27'; -- Кафедра иудаики / לימודי קודש
  subj UUID;
  grp  UUID;
  gname TEXT;
  d INT;
BEGIN
  -- Страховка: кафедра иудаики должна существовать.
  IF NOT EXISTS (SELECT 1 FROM departments WHERE id = kodesh_dept) THEN
    RAISE NOTICE 'Kodesh department % not found — aborting seed.', kodesh_dept;
    RETURN;
  END IF;

  -- 1. Предмет «קודש» под кафедрой иудаики.
  SELECT id INTO subj FROM subjects WHERE name = 'קודש' LIMIT 1;
  IF subj IS NULL THEN
    INSERT INTO subjects (name, name_he, department_id, sort_order)
    VALUES ('קודש', 'קודש', kodesh_dept, 0)
    RETURNING id INTO subj;
  END IF;

  -- 2. Шесть групп кодеша + их фиксированные слоты.
  FOREACH gname IN ARRAY ARRAY['כיתה י', 'כיתה י"א', 'כיתה 1', 'כיתה 2', 'כיתה 3', 'כיתה 4'] LOOP
    SELECT id INTO grp FROM class_groups
      WHERE name = gname AND department_id = kodesh_dept AND subject_id = subj
      LIMIT 1;
    IF grp IS NULL THEN
      INSERT INTO class_groups (name, subject_id, department_id, period_start, period_end, is_active)
      VALUES (gname, subj, kodesh_dept, '2026-09-01', '2027-07-31', TRUE)
      RETURNING id INTO grp;
    END IF;

    -- Фикс-слоты: Пн–Чт (ISO 1–4), два урока в день.
    FOR d IN 1..4 LOOP
      INSERT INTO class_schedule_slots (class_group_id, day_of_week, start_time, end_time)
        VALUES (grp, d, '09:15', '10:30')
        ON CONFLICT (class_group_id, day_of_week, start_time) DO NOTHING;
      INSERT INTO class_schedule_slots (class_group_id, day_of_week, start_time, end_time)
        VALUES (grp, d, '11:00', '12:10')
        ON CONFLICT (class_group_id, day_of_week, start_time) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
