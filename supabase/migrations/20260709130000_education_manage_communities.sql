-- ═════════════════════════════════════════════════════════════════════
-- Образование — новая привилегия 'education.manage_communities'.
--
-- Проблема (QA FIX #13): записи общин (communities) сейчас создаются,
-- редактируются и удаляются ЛЮБЫМ авторизованным пользователем (маршруты
-- проверяли только requireAuth). Вводим отдельную привилегию управления
-- общинами и гейтим POST/PATCH/DELETE за ней.
--
-- Каталог module_privileges досеивается идемпотентно (ON CONFLICT DO NOTHING),
-- затем привилегия (scope='all') выдаётся тому же набору ролей руководства
-- образования + управления, который эффективно держит 'manage_leads' после
-- 20260708140000_role_module_access.sql. Тот же цикл FOREACH +
-- ON CONFLICT DO UPDATE, что в 20260708150000_persons_directory.sql.
--
-- Общины НЕ привязаны к подразделению, поэтому scope='all' — правильный
-- выбор: requireEducationPrivilege('manage_communities') вызывается без
-- target, и при scope='all' проверка проходит.
--
-- Идемпотентно. Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 1. Каталог: новая привилегия 'manage_communities' модуля 'education'.
--    sort_order 70 (новая группа «Общины», после последней = 62).
-- ─────────────────────────────────────────────

INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('education', 'manage_communities', 'Управление общинами', 70)
ON CONFLICT (module, privilege_code) DO NOTHING;


-- ─────────────────────────────────────────────
-- 2. Выдача 'manage_communities' (scope='all') ролям руководства.
--    Идемпотентно: ON CONFLICT DO UPDATE.
-- ─────────────────────────────────────────────

DO $$
DECLARE
  rcode TEXT;
  rid   UUID;
BEGIN
  FOREACH rcode IN ARRAY ARRAY[
    'superadmin', 'tech_admin', 'campus_president', 'president_secretary',
    'rector', 'dean', 'school_director', 'vice_director',
    'dept_head', 'program_head'
  ]
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;

    INSERT INTO role_privileges (role_id, module, privilege_code, scope)
    VALUES (rid, 'education', 'manage_communities', 'all')
    ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
  END LOOP;
END $$;
