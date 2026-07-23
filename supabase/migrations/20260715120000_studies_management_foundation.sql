-- ═════════════════════════════════════════════════════════════════════
-- Основа управления учёбой (נושא הלימודים) — роли, учебные единицы, права.
--
-- Структура (согласовано с владельцем):
--   • קודש (иудаизм) — ОДИН руководитель на всех (утро).
--   • חול (светское) — руководитель на КАЖДУЮ единицу-маршрут:
--       תיכון (школа) · קולג׳ · אוניברסיטה · טורו (отдельный) · אמונה (пока не активна).
--     Над ними — «ראש חול» (пока один; может измениться): моделируется как
--     studies_manager с позициями-главой во ВСЕХ единицах חול.
--   • Каждый руководитель: свои מזכירות (секретари) + מורים (учителя).
--
-- Единица = department (используем существующий scope по staff_positions.department_id).
-- Персональные тумблеры секретарей — через person_privileges (уже активирована в коде).
--
-- Права:
--   studies_manager — ВИДИТ всех (view_students=all), УПРАВЛЯЕТ только своей
--     единицей (manage_* = department). Плюс access=all для входа в модуль.
--   studies_secretary — база: видит свою единицу (view_students=department) +
--     access; остальное руководитель выдаёт лично (person_privileges).
--   teacher — БОЛЬШЕ НЕ имеет set_grades (оценки пока только руководитель;
--     при необходимости руководитель выдаёт учителю лично).
--
-- Применять ВРУЧНУЮ через Supabase SQL Editor. Идемпотентно.
-- ═════════════════════════════════════════════════════════════════════

-- 1. Роли ─────────────────────────────────────────────────────────────
INSERT INTO roles (name, code, category, is_system, description) VALUES
  ('אחראי לימודים',  'studies_manager',   'education', FALSE, 'אחראי על יחידת לימוד (חול או קודש) — רואה הכל, מנהל את שלו'),
  ('מזכירת לימודים', 'studies_secretary', 'education', FALSE, 'מזכירות תחת אחראי לימודים — הרשאות נקבעות אישית ע״י האחראי')
ON CONFLICT (code) DO NOTHING;

-- 2. Учебные единицы (departments) ────────────────────────────────────
DO $$
DECLARE u TEXT; existing UUID;
BEGIN
  FOREACH u IN ARRAY ARRAY['לימודי קודש','תיכון','קולג׳','אוניברסיטה','טורו'] LOOP
    SELECT id INTO existing FROM departments WHERE name = u LIMIT 1;
    IF existing IS NULL THEN
      INSERT INTO departments (name) VALUES (u);
    END IF;
  END LOOP;
END $$;

-- 3. Права роли studies_manager ───────────────────────────────────────
DO $$
DECLARE rid UUID; pc TEXT;
BEGIN
  SELECT id INTO rid FROM roles WHERE code = 'studies_manager';
  IF rid IS NOT NULL THEN
    -- вход в модуль + просмотр ВСЕХ учениц
    INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'education', 'access', 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'education', 'view_students', 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    -- управление — только в своей единице (department)
    FOR pc IN VALUES
      ('manage_students'), ('manage_class_groups'), ('manage_class_teachers'),
      ('manage_enrollments'), ('manage_study_groups'), ('manage_subjects'),
      ('manage_specialties'), ('set_grades'), ('mark_attendance'), ('set_lesson_topics')
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
        VALUES (rid, 'education', pc, 'department')
        ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'department';
    END LOOP;
  END IF;
END $$;

-- 4. Права роли studies_secretary (база; остальное — лично) ────────────
DO $$
DECLARE rid UUID;
BEGIN
  SELECT id INTO rid FROM roles WHERE code = 'studies_secretary';
  IF rid IS NOT NULL THEN
    INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'education', 'access', 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'education', 'view_students', 'department')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'department';
  END IF;
END $$;

-- 5. Отзыв set_grades у учителя (оценки пока только руководитель) ──────
DELETE FROM role_privileges
  WHERE module = 'education'
    AND privilege_code = 'set_grades'
    AND role_id = (SELECT id FROM roles WHERE code = 'teacher');
