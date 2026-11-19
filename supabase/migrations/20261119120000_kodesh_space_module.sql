-- ═════════════════════════════════════════════════════════════════════
-- «מרחב יהדות» — отдельный модуль меню со своим правом.
-- Решение владельца 2026-11-19.
--
-- Раньше «מרחב יהדות» был особым «домом» для главы кафедры иудаики: после
-- входа она попадала туда, у неё был свой боковой список, а значок
-- приложения и «בית» в навигации вели на общую главную. Теперь главная одна
-- для всех, а «מרחב יהדות» — пункт меню (модуль kodesh_space).
--
-- Что делает миграция:
--   1. Право kodesh_space.access («כניסה למרחב יהדות») в каталоге.
--   2. Раздел «מרחב יהדות» на экране «אבטחת מידע».
--   3. Выдаёт право ЛИЧНО тем, кто сейчас глава кафедры иудаики, — чтобы
--      ни у кого не пропал доступ, который был до этого. Дальше право выдаёт
--      и снимает владелец на экране «אבטחת מידע».
-- superadmin проходит всегда, как везде.
--
-- Идемпотентно. Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

-- ── 1. Право в каталоге ────────────────────────────────────────────────────
INSERT INTO module_privileges (
  module, privilege_code, privilege_name, sort_order,
  name_he, name_ru, name_en,
  description_he, description_ru, description_en,
  level, risk, allowed_scopes
) VALUES (
  'kodesh_space', 'access', 'Доступ к модулю', 0,
  'כניסה למרחב יהדות',
  'Вход в «Пространство иудаики»',
  'Enter the Judaic studies space',
  'פותח את "מרחב יהדות" בתפריט: מצב השיבוץ לרמות, קורסים, מורות שממתינות לאישור, ורשימת התלמידות (עם תמונה ומספר התראות פתוחות). המסכים שאליהם המרחב מקשר בודקים כל אחד את ההרשאה שלו.',
  'Открывает «Пространство иудаики» в меню: распределение по уровням, курсы, преподаватели на утверждении и список студенток (с фото и числом открытых оповещений). Экраны, на которые ведёт пространство, проверяют каждый своё право.',
  'Opens the Judaic studies space in the menu: level assignment, courses, teachers awaiting approval and the student list (with photo and open alert count). The screens it links to each check their own permission.',
  'access', 'sensitive', ARRAY['all']
)
ON CONFLICT (module, privilege_code) DO NOTHING;

-- ── 2. Раздел «מרחב יהדות» на экране «אבטחת מידע» ───────────────────────────
INSERT INTO security_tree_nodes (
  name_he, name_ru, name_en,
  description_he, description_ru, description_en,
  module_code, color, sort_order
)
SELECT
  'מרחב יהדות', 'Пространство иудаики', 'Judaic studies space',
  'המסך של לימודי יהדות: שיבוץ לרמות, קורסים, מורות ותלמידות.',
  'Экран иудаики: распределение по уровням, курсы, преподаватели и студентки.',
  'The Judaic studies screen: level assignment, courses, teachers and students.',
  'kodesh_space', 'var(--accent)', 0
WHERE NOT EXISTS (
  SELECT 1 FROM security_tree_nodes WHERE module_code = 'kodesh_space' AND parent_id IS NULL
);

INSERT INTO security_tree_items (node_id, module, privilege_code, sort_order)
SELECT n.id, mp.module, mp.privilege_code, COALESCE(mp.sort_order, 0)
  FROM module_privileges mp
  JOIN security_tree_nodes n ON n.module_code = 'kodesh_space' AND n.parent_id IS NULL
 WHERE mp.module = 'kodesh_space'
ON CONFLICT (module, privilege_code) DO UPDATE SET node_id = EXCLUDED.node_id;

-- ── 3. Личная выдача нынешним главам кафедры иудаики ───────────────────────
-- Кафедра иудаики: departments.id = 9a3d7b3f-3f65-4653-a111-4d5296404a27
-- (KODESH_DEPT_ID в lib/education/kodesh-exceptions.ts). Уже существующую
-- личную строку (в том числе запрет) не трогаем.
INSERT INTO person_privileges (person_id, module, privilege_code, is_granted, reason)
SELECT DISTINCT sp.person_id, 'kodesh_space', 'access', true,
       'מרחב יהדות הפך למודול נפרד (19.11.2026): ההרשאה ניתנה לראש החוג, שהשתמשה בו עד עכשיו'
  FROM staff_positions sp
 WHERE sp.department_id = '9a3d7b3f-3f65-4653-a111-4d5296404a27'
   AND sp.is_head = true
   AND (sp.end_date IS NULL OR sp.end_date > CURRENT_DATE)
ON CONFLICT (person_id, module, privilege_code) DO NOTHING;

-- Самопроверка: право в каталоге и в разделе «מרחב יהדות».
DO $$
DECLARE in_catalog INT; in_tree INT;
BEGIN
  SELECT count(*) INTO in_catalog
    FROM module_privileges WHERE module = 'kodesh_space' AND privilege_code = 'access';
  SELECT count(*) INTO in_tree
    FROM security_tree_items i
    JOIN security_tree_nodes n ON n.id = i.node_id
   WHERE n.module_code = 'kodesh_space' AND i.module = 'kodesh_space' AND i.privilege_code = 'access';
  IF in_catalog <> 1 OR in_tree <> 1 THEN
    RAISE EXCEPTION 'Право kodesh_space.access не на месте: в каталоге %, в разделе «מרחב יהדות» %.', in_catalog, in_tree;
  END IF;
END $$;

-- Кому выдано (для проверки глазами):
SELECT p.full_name, pp.is_granted, pp.reason
  FROM person_privileges pp JOIN persons p ON p.id = pp.person_id
 WHERE pp.module = 'kodesh_space' AND pp.privilege_code = 'access';
