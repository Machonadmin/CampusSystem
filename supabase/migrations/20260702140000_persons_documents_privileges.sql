-- ─────────────────────────────────────────────────────────────────────────────
-- Persons/Documents privileges — включаем enforcement.
--
-- module_privileges для 'persons' и 'documents' существуют с самой первой
-- миграции (002_roles_and_privileges.sql), и уже отображаются в Settings →
-- Roles UI. Но ни один route handler их не проверял — только сессию.
--
-- Эта миграция раздаёт дефолтные гранты, чтобы включение проверки в коде не
-- заблокировало никого, кто уже реально работает в системе. Логика зеркалит
-- уже принятый паттерн из 20260511175354_education_privileges.sql:
--
--   persons.view + documents.view (scope=all) — всем ролям КРОМЕ
--     category='external' (abiturient/alumni/sponsor ещё не логинятся в
--     систему как персонал, и не должны иметь доступ к базе людей).
--
--   persons.create + persons.edit + documents.create — ролям, которые уже
--     управляют записями (system-роли + те, у кого есть 'manage_*'
--     education-привилегии). Department-scoped там, где это осмысленно —
--     это же закрывает исходную дыру (enroll_as_teacher в любое
--     подразделение без проверки).
--
--   persons.delete — только superadmin/tech_admin (деструктивная операция).
--
-- После этой миграции все дефолты можно донастроить в Settings → Roles —
-- новый код ничего не хардкодит, только читает role_privileges.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. persons.view + documents.view → все роли кроме 'external'
INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, m.module, m.privilege_code, 'all'
FROM roles r
CROSS JOIN (VALUES ('persons', 'view'), ('documents', 'view')) AS m(module, privilege_code)
WHERE r.category <> 'external'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';

-- 2. persons.create/edit + documents.create → system-роли, scope=all
DO $$
DECLARE rcode TEXT; rid UUID; pcode TEXT;
BEGIN
  FOREACH rcode IN ARRAY ARRAY['superadmin', 'tech_admin', 'campus_president']
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;
    FOR pcode IN VALUES ('persons:create'), ('persons:edit'), ('documents:create')
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, split_part(pcode, ':', 1), split_part(pcode, ':', 2), 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;

-- 3. persons.create/edit + documents.create → руководители/секретариат
--    education, scope=department (те же роли, что уже управляют lead/applicant/
--    student записями с scope=department — см. 20260511175354, блок 4.4)
DO $$
DECLARE rcode TEXT; rid UUID; pcode TEXT;
BEGIN
  FOREACH rcode IN ARRAY ARRAY['school_director', 'rector', 'dean', 'vice_director', 'dept_head', 'program_head']
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;
    FOR pcode IN VALUES ('persons:create'), ('persons:edit'), ('documents:create')
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, split_part(pcode, ':', 1), split_part(pcode, ':', 2), 'department')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'department';
    END LOOP;
  END LOOP;
END $$;

-- 4. president_secretary: create/edit persons + documents × all (мирроринг
--    её широкого доступа к лидам из 20260511175354, блок 4.3)
DO $$
DECLARE rid UUID; pcode TEXT;
BEGIN
  SELECT id INTO rid FROM roles WHERE code = 'president_secretary';
  IF rid IS NOT NULL THEN
    FOR pcode IN VALUES ('persons:create'), ('persons:edit'), ('documents:create')
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, split_part(pcode, ':', 1), split_part(pcode, ':', 2), 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END IF;
END $$;

-- 5. persons.delete → только superadmin/tech_admin
DO $$
DECLARE rcode TEXT; rid UUID;
BEGIN
  FOREACH rcode IN ARRAY ARRAY['superadmin', 'tech_admin']
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;
    INSERT INTO role_privileges (role_id, module, privilege_code, scope)
    VALUES (rid, 'persons', 'delete', 'all')
    ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
  END LOOP;
END $$;
