-- ═════════════════════════════════════════════════════════════════════
-- «ניהול שלי» — פאנל ניהול, פגישות, המסלול שלי становятся модулями со
-- своим правом. Решение владельца 2026-11-25 («להפוך את הכל למודלים»).
--
-- Раньше «פאנל ניהול» и «פגישות» были открыты любому сотруднику, а «המסלול
-- שלי» — ответственному маршрута. Теперь у каждого право '<модуль>.access'
-- («כניסה ל…»), которое владелец выдаёт и снимает на экране «אבטחת מידע».
-- superadmin проходит всегда. Что человек видит ВНУТРИ модуля, по-прежнему
-- решают фильтры (свои встречи, свои цели, свои маршруты).
--
-- Что делает миграция:
--   1. Три права в каталоге.
--   2. Три раздела на экране «אבטחת מידע».
--   3. Чтобы ни у кого не пропал экран, которым он пользуется, — личная
--      выдача тем, у кого доступ есть сегодня:
--        • פאנל ניהול и פגישות — всем активным учётным записям сотрудников
--          (кроме служебной campus.internal; superadmin и так проходит);
--        • המסלול שלי — ответственным маршрутов (study_track_managers) и тем,
--          кому лично выдано manage_tracks.
--      Уже существующие личные строки (в том числе запрет) не трогаются.
--
-- Идемпотентно. Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

-- ── 1. Права в каталоге ────────────────────────────────────────────────────
INSERT INTO module_privileges (
  module, privilege_code, privilege_name, sort_order,
  name_he, name_ru, name_en,
  description_he, description_ru, description_en,
  level, risk, allowed_scopes
) VALUES
(
  'management', 'access', 'Доступ к модулю', 0,
  'כניסה לפאנל ניהול', 'Вход в «Панель управления»', 'Enter the management panel',
  'פותח את "פאנל ניהול" בתפריט: יעדים, ישיבות הנהלה ומשימות מהן. כל אחד רואה רק את מה שהוא יצר, משתתף בו או אחראי עליו.',
  'Открывает «Панель управления» в меню: цели, совещания и задачи из них. Каждый видит только то, что создал сам, где участвует или за что отвечает.',
  'Opens the management panel in the menu: goals, management meetings and their tasks. Everyone sees only what they created, attend or are responsible for.',
  'access', 'normal', ARRAY['all']
),
(
  'meetings', 'access', 'Доступ к модулю', 0,
  'כניסה לפגישות', 'Вход во «Встречи»', 'Enter meetings',
  'פותח את "פגישות" בתפריט: יומן הפגישות, בקשות לפגישה ומה שהועבר אליי. כל אחד רואה רק את הפגישות שלו, יומן שהוא מנהל, ומה ששיתפו איתו.',
  'Открывает «Встречи» в меню: календарь встреч, запросы на встречу и переданное мне. Каждый видит только свои встречи, календарь, который он ведёт, и то, чем с ним поделились.',
  'Opens meetings in the menu: the meetings calendar, meeting requests and items passed to me. Everyone sees only their own meetings, a calendar they manage and what was shared with them.',
  'access', 'sensitive', ARRAY['all']
),
(
  'my_track', 'access', 'Доступ к модулю', 0,
  'כניסה להמסלול שלי', 'Вход в «Мой маршрут»', 'Enter my track',
  'פותח את "המסלול שלי" בתפריט: התלמידות במסלולים שהעובד אחראי עליהם. מי שיש לו ניהול מסלולים רואה את כל המסלולים.',
  'Открывает «Мой маршрут» в меню: студентки маршрутов, за которые сотрудник отвечает. С правом управления маршрутами — все маршруты.',
  'Opens my track in the menu: students of the tracks the employee is responsible for. With track management, all tracks.',
  'access', 'sensitive', ARRAY['all']
)
ON CONFLICT (module, privilege_code) DO NOTHING;

-- ── 2. Разделы на экране «אבטחת מידע» ───────────────────────────────────────
INSERT INTO security_tree_nodes (
  name_he, name_ru, name_en, description_he, description_ru, description_en,
  module_code, color, sort_order
)
SELECT v.name_he, v.name_ru, v.name_en, v.d_he, v.d_ru, v.d_en, v.code, 'var(--accent)', 0
  FROM (VALUES
    ('management', 'פאנל ניהול', 'Панель управления', 'Management panel',
     'יעדים, ישיבות הנהלה ומשימות מהן.', 'Цели, совещания и задачи из них.', 'Goals, management meetings and their tasks.'),
    ('meetings', 'פגישות', 'Встречи', 'Meetings',
     'יומן הפגישות, בקשות לפגישה ומה שהועבר.', 'Календарь встреч, запросы на встречу и переданное.', 'Meetings calendar, meeting requests and passed items.'),
    ('my_track', 'המסלול שלי', 'Мой маршрут', 'My track',
     'התלמידות במסלולים שהעובד אחראי עליהם.', 'Студентки маршрутов, за которые отвечает сотрудник.', 'Students of the tracks the employee is responsible for.')
  ) AS v(code, name_he, name_ru, name_en, d_he, d_ru, d_en)
 WHERE NOT EXISTS (
   SELECT 1 FROM security_tree_nodes n WHERE n.module_code = v.code AND n.parent_id IS NULL
 );

INSERT INTO security_tree_items (node_id, module, privilege_code, sort_order)
SELECT n.id, mp.module, mp.privilege_code, COALESCE(mp.sort_order, 0)
  FROM module_privileges mp
  JOIN security_tree_nodes n ON n.module_code = mp.module AND n.parent_id IS NULL
 WHERE mp.module IN ('management', 'meetings', 'my_track')
ON CONFLICT (module, privilege_code) DO UPDATE SET node_id = EXCLUDED.node_id;

-- ── 3. Личная выдача тем, у кого доступ есть сегодня ──────────────────────
-- פאנל ניהול и פגישות — всем активным учётным записям сотрудников, кроме
-- служебной (campus.internal) и superadmin (он проходит и так).
INSERT INTO person_privileges (person_id, module, privilege_code, is_granted, reason)
SELECT DISTINCT a.person_id, m.module, 'access', true,
       'המודול קיבל הרשאה משלו (25.11.2026): ניתנה לכל מי שהיה לו גישה עד עכשיו'
  FROM person_accounts a
 CROSS JOIN (VALUES ('management'), ('meetings')) AS m(module)
 WHERE a.is_active = true
   AND a.login_email NOT ILIKE '%@campus.internal'
   AND NOT EXISTS (
     SELECT 1 FROM person_roles pr JOIN roles r ON r.id = pr.role_id
      WHERE pr.person_id = a.person_id AND r.code = 'superadmin'
   )
ON CONFLICT (person_id, module, privilege_code) DO NOTHING;

-- המסלול שלי — ответственным маршрутов и тем, кому лично выдано manage_tracks.
INSERT INTO person_privileges (person_id, module, privilege_code, is_granted, reason)
SELECT DISTINCT x.person_id, 'my_track', 'access', true,
       'המודול קיבל הרשאה משלו (25.11.2026): ניתנה לכל מי שהיה לו גישה עד עכשיו'
  FROM (
    SELECT person_id FROM study_track_managers
    UNION
    SELECT person_id FROM person_privileges
     WHERE privilege_code = 'manage_tracks' AND is_granted = true
       AND (expires_at IS NULL OR expires_at > now())
  ) x
ON CONFLICT (person_id, module, privilege_code) DO NOTHING;

-- Самопроверка: по одному праву и разделу на каждый модуль.
DO $$
DECLARE in_catalog INT; in_tree INT;
BEGIN
  SELECT count(*) INTO in_catalog FROM module_privileges
   WHERE module IN ('management', 'meetings', 'my_track') AND privilege_code = 'access';
  SELECT count(*) INTO in_tree
    FROM security_tree_items i JOIN security_tree_nodes n ON n.id = i.node_id
   WHERE n.module_code = i.module AND i.module IN ('management', 'meetings', 'my_track')
     AND i.privilege_code = 'access';
  IF in_catalog <> 3 OR in_tree <> 3 THEN
    RAISE EXCEPTION 'Права «ניהול שלי» не на месте: в каталоге %, в разделах %.', in_catalog, in_tree;
  END IF;
END $$;

-- Кому выдано (для проверки глазами):
SELECT pp.module, p.full_name
  FROM person_privileges pp JOIN persons p ON p.id = pp.person_id
 WHERE pp.module IN ('management', 'meetings', 'my_track') AND pp.privilege_code = 'access'
 ORDER BY pp.module, p.full_name;
