-- ============================================================================
-- «Стулья» оргструктуры: роли (права) + должности-ярлыки (reference_positions).
--
-- Модель (согласовано с владельцем по оргсхеме):
--   • Директор (הרב אברהם) — существующая роль campus_president (доступ ко всему)
--     + ярлык-должность «מנהל המכון».
--   • Все управляющие места (главы юнитов, замы) = ОДНА роль unit_manager
--     (scope=department: полное управление своим юнитом). Юнит = подразделение.
--   • Секретариат юнита = роль unit_secretary (scope=department: оперативное
--     ведение — студентки/зачисления/посещаемость/темы; БЕЗ оценок, структуры
--     предметов и назначения преподавателей — это у управляющего).
--   • Преподаватели — существующая роль teacher (own). Студентки — student.
--   • Конкретное «кто именно» (מנהל קולג׳ / מזכירת טורו / רקטור…) — это ЯРЛЫК
--     из reference_positions на staff_positions, отдельно от прав.
--
-- Старые «all»-роли (dean/rector/school_director/dept_head/vice_director/
-- program_head) НЕ трогаем — остаются как legacy; новые назначения идут на
-- unit_manager/unit_secretary. Идемпотентно (ON CONFLICT).
-- ============================================================================

-- ─── 1. Роль «מנהל יחידה» (unit_manager) — полное управление своим юнитом ──────
INSERT INTO roles (code, name, category, description, is_system)
VALUES ('unit_manager', 'מנהל יחידה', 'education',
        'ניהול מלא של יחידה לימודית, מוגבל למחלקה של המשתמש', false)
ON CONFLICT (code) DO NOTHING;

-- access — гейт модуля (all), данные — по подразделению (department).
INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'education', 'access', 'all' FROM roles r WHERE r.code = 'unit_manager'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;

INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'education', p.code, 'department'
FROM roles r CROSS JOIN (VALUES
  ('view_students'), ('view_applicants'), ('manage_students'), ('manage_enrollments'),
  ('manage_class_groups'), ('manage_class_teachers'), ('manage_subjects'),
  ('manage_specialties'), ('manage_study_groups'), ('mark_attendance'),
  ('set_grades'), ('set_lesson_topics')
) AS p(code)
WHERE r.code = 'unit_manager'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;

-- ─── 2. Роль «מזכיר/ת יחידה» (unit_secretary) — оперативное ведение ───────────
INSERT INTO roles (code, name, category, description, is_system)
VALUES ('unit_secretary', 'מזכיר/ת יחידה', 'education',
        'ניהול שוטף של היחידה (תלמידות, שיבוץ, נוכחות) — בלי ציונים ומבנה אקדמי', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'education', 'access', 'all' FROM roles r WHERE r.code = 'unit_secretary'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;

INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'education', p.code, 'department'
FROM roles r CROSS JOIN (VALUES
  ('view_students'), ('view_applicants'), ('manage_students'),
  ('manage_enrollments'), ('mark_attendance'), ('set_lesson_topics')
) AS p(code)
WHERE r.code = 'unit_secretary'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;

-- ─── 3. Ярлыки-должности (reference_positions) ────────────────────────────────
-- 3a. Проставляем ивритские названия существующим должностям (были name_he=NULL).
UPDATE reference_positions SET name_he = 'רקטור'         WHERE name_ru = 'Ректор'                 AND name_he IS NULL;
UPDATE reference_positions SET name_he = 'דיקן'          WHERE name_ru = 'Декан'                  AND name_he IS NULL;
UPDATE reference_positions SET name_he = 'סגן/סגנית מנהל' WHERE name_ru = 'Заместитель директора'  AND name_he IS NULL;
UPDATE reference_positions SET name_he = 'מזכיר/ה'       WHERE name_ru = 'Секретарь'              AND name_he IS NULL;
UPDATE reference_positions SET name_he = 'מורה'          WHERE name_ru = 'Преподаватель'          AND name_he IS NULL;
UPDATE reference_positions SET name_he = 'מורה בכיר'     WHERE name_ru = 'Старший преподаватель'  AND name_he IS NULL;
UPDATE reference_positions SET name_he = 'מורה'          WHERE name_ru = 'Учитель'                AND name_he IS NULL;

-- 3b. Новые должности по оргсхеме (name_ru уникален; ON CONFLICT DO NOTHING).
INSERT INTO reference_positions (name_ru, name_he, category, is_teaching, sort_order) VALUES
  ('Директор института',           'מנהל המכון',           'administrative', false, 1),
  ('Ответственный за лимудей кодеш','אחראי לימודי קודש',    'administrative', false, 30),
  ('Директор старшей школы',        'מנהלת התיכון',         'administrative', false, 31),
  ('Ответственный за колледж',      'אחראית קולג׳',         'administrative', false, 32),
  ('Ответственный за академию',     'אחראי אקדמיה',         'administrative', false, 33),
  ('Директор Туро',                 'מנהל הטורו',           'administrative', false, 34),
  ('Администратор учёбы',           'אדמיניסטרטור',         'administrative', false, 35),
  ('Лектор',                        'מרצה',                 'academic',       true,  16)
ON CONFLICT (name_ru) DO NOTHING;
