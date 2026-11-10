-- ═════════════════════════════════════════════════════════════════════
-- «חבר ליומן גוגל» — право, которое владелец выдаёт людям сам.
-- Решение владельца 2026-11-09.
--
-- Раньше кнопку видел только superadmin (пробный доступ), выдать её другому
-- было нельзя. Теперь — право calendar.google_sync в каталоге:
--   • по умолчанию его нет НИ У КОГО (строк в role_privileges/person_privileges
--     эта миграция не создаёт); superadmin проходит всегда, как везде;
--   • владелец выдаёт право людям на экране «אבטחת מידע», раздел «יומן»;
--   • без права нет кнопки, сервер не выдаёт ссылку, и уже подключённый
--     календарь в Google перестаёт обновляться.
-- Сам календарь в приложении этим правом НЕ закрывается.
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
  'calendar', 'google_sync', 'Подключение календаря к Google', 10,
  'חיבור ליומן גוגל',
  'Подключение календаря к Google',
  'Connect calendar to Google',
  'מציג ביומן כפתור "חבר ליומן גוגל": קישור אישי שמעביר את היומן של העובד (אירועים, פגישות, שיעורים ומשימות) ליומן הגוגל שלו. כשההרשאה נלקחת, היומן בגוגל מפסיק להתעדכן.',
  'Показывает в календаре кнопку «Подключить к Google»: личная ссылка, по которой календарь сотрудника (события, встречи, уроки, задачи) попадает в его Google Calendar. Если право снять, календарь в Google перестаёт обновляться.',
  'Shows a "Connect to Google Calendar" button in the calendar: a personal link that brings the employee''s calendar (events, meetings, lessons, tasks) into their Google Calendar. When the permission is removed, Google stops updating.',
  'view', 'normal', ARRAY['all']
)
ON CONFLICT (module, privilege_code) DO NOTHING;

-- ── 2. Раздел «יומן» на экране «אבטחת מידע» ─────────────────────────────────
INSERT INTO security_tree_nodes (
  name_he, name_ru, name_en,
  description_he, description_ru, description_en,
  module_code, color, sort_order
)
SELECT
  'יומן', 'Календарь', 'Calendar',
  'היומן האישי של העובד. היומן עצמו פתוח לכל עובד; כאן רק החיבור ליומן גוגל.',
  'Личный календарь сотрудника. Сам календарь открыт каждому; здесь только подключение к Google.',
  'The employee''s personal calendar. The calendar itself is open to every employee; this is only the Google connection.',
  'calendar', 'var(--accent)', 0
WHERE NOT EXISTS (
  SELECT 1 FROM security_tree_nodes WHERE module_code = 'calendar' AND parent_id IS NULL
);

INSERT INTO security_tree_items (node_id, module, privilege_code, sort_order)
SELECT n.id, mp.module, mp.privilege_code, COALESCE(mp.sort_order, 0)
  FROM module_privileges mp
  JOIN security_tree_nodes n ON n.module_code = 'calendar' AND n.parent_id IS NULL
 WHERE mp.module = 'calendar'
ON CONFLICT (module, privilege_code) DO UPDATE SET node_id = EXCLUDED.node_id;

-- Самопроверка: право в каталоге и в разделе «יומן».
DO $$
DECLARE in_catalog INT; in_tree INT;
BEGIN
  SELECT count(*) INTO in_catalog
    FROM module_privileges WHERE module = 'calendar' AND privilege_code = 'google_sync';
  SELECT count(*) INTO in_tree
    FROM security_tree_items i
    JOIN security_tree_nodes n ON n.id = i.node_id
   WHERE n.module_code = 'calendar' AND i.module = 'calendar' AND i.privilege_code = 'google_sync';
  IF in_catalog <> 1 OR in_tree <> 1 THEN
    RAISE EXCEPTION 'Право calendar.google_sync не на месте: в каталоге %, в разделе «יומן» %.', in_catalog, in_tree;
  END IF;
END $$;
