-- ═════════════════════════════════════════════════════════════════════
-- Люди (People) — новая привилегия 'persons.view_sensitive'.
--
-- Проблема (QA FIX #4): чувствительные PII-поля персоны (passport_number,
-- address, nationality, marital_status, birth_date) сейчас возвращаются
-- ЛЮБОМУ, у кого есть 'persons.view'. Справочник людей нужен многим ролям
-- (врач, куратор, преподаватель…), но паспорт/адрес/семейное положение им
-- видеть НЕ положено. Вводим отдельную привилегию 'view_sensitive' и
-- отдаём эти поля только КОНСЕРВАТИВНОМУ набору ролей.
--
-- Каталог module_privileges досеивается идемпотентно (ON CONFLICT DO NOTHING),
-- затем привилегия (scope='all') выдаётся ролям тем же циклом FOREACH +
-- ON CONFLICT DO UPDATE, что в 20260708150000_persons_directory.sql.
--
-- Набор ролей — только те, кому легитимно нужен полный PII:
--   superadmin, tech_admin, campus_president, president_secretary, hr_director.
-- (НЕ раздаём широко.)
--
-- Идемпотентно. Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 1. Каталог: новая привилегия 'view_sensitive' модуля 'persons'.
--    sort_order 3 (после access=0, view=1, manage=2).
-- ─────────────────────────────────────────────

INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('persons', 'view_sensitive', 'Просмотр чувствительных данных', 3)
ON CONFLICT (module, privilege_code) DO NOTHING;


-- ─────────────────────────────────────────────
-- 2. Выдача 'view_sensitive' (scope='all') консервативному набору ролей.
--    Идемпотентно: ON CONFLICT DO UPDATE.
-- ─────────────────────────────────────────────

DO $$
DECLARE
  rcode TEXT;
  rid   UUID;
BEGIN
  FOREACH rcode IN ARRAY ARRAY[
    'superadmin', 'tech_admin', 'campus_president',
    'president_secretary', 'hr_director'
  ]
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;

    INSERT INTO role_privileges (role_id, module, privilege_code, scope)
    VALUES (rid, 'persons', 'view_sensitive', 'all')
    ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
  END LOOP;
END $$;
