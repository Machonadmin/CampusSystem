-- ═════════════════════════════════════════════════════════════════════
-- Люди (People / אנשים) — MVP: ЧИТАЮЩИЙ справочник сотрудников и студентов,
-- чтобы роли вроде врача/преподавателя могли найти человека и посмотреть его
-- контакты. Модуль НЕ владеет ни одной таблицей — только читает существующие
-- (persons, staff_positions, staff_profiles, education_journeys, departments,
-- person_roles). Никаких CREATE TABLE.
--
-- Права: НОВЫХ привилегий не изобретаем — модуль 'persons' с привилегиями
-- 'access' / 'view' / 'manage'. Каталог module_privileges досеивается
-- идемпотентно (ON CONFLICT DO NOTHING), затем 'access' и 'view' (scope='all')
-- выдаются ролям, которым нужно искать людей. Тот же цикл FOREACH по ролям,
-- что в 20260708140000_role_module_access.sql.
--
-- NB: сид 002 УЖЕ содержит ('persons','view') sort_order 1 (используется
-- модулем «Персонал» для его же привилегий create/edit/delete). ON CONFLICT
-- DO NOTHING оставляет эту строку как есть — конфликта нет, блок идемпотентен.
-- 'access' досеивается 20260708140000 (sort_order 0); повторный INSERT здесь
-- ничего не ломает. 'manage' добавляется для полноты каталога, хотя справочник
-- ЧИТАЮЩИЙ и API проверяет только 'view'.
--
-- superadmin/tech_admin/campus_president/president_secretary уже покрыты
-- 20260708140000 (им выдан доступ ко всем модулям, включая 'persons').
-- Здесь дораздаём просмотр остальным ролям, которым нужен справочник людей.
--
-- Страницы /dashboard/persons защищены middleware (PROTECTED_MODULES уже
-- содержит 'persons').
--
-- Идемпотентно. Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 1. Каталог привилегий модуля 'persons' — issue #1 block.
--    Досеиваем идемпотентно; существующие строки (напр. ('persons','view')
--    из сида 002) остаются нетронутыми.
-- ─────────────────────────────────────────────

INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('persons', 'access', 'Доступ к модулю', 0),
  ('persons', 'view',   'Просмотр',        1),
  ('persons', 'manage', 'Управление',      2)
ON CONFLICT (module, privilege_code) DO NOTHING;


-- ─────────────────────────────────────────────
-- 2. Выдача 'access' + 'view' (scope='all') ролям, которым нужно
--    искать людей в справочнике. Идемпотентно: ON CONFLICT DO UPDATE.
-- ─────────────────────────────────────────────

DO $$
DECLARE
  rcode TEXT;
  pcode TEXT;
  rid   UUID;
BEGIN
  FOREACH rcode IN ARRAY ARRAY[
    'teacher', 'curator', 'doctor', 'psychologist',
    'dorm_director', 'embait', 'mashgiach',
    'security_head', 'rector', 'dean', 'school_director', 'vice_director',
    'dept_head', 'program_head',
    'campus_president', 'president_secretary', 'tech_admin', 'hr_director'
  ]
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;

    FOREACH pcode IN ARRAY ARRAY['access', 'view']
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'persons', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;
