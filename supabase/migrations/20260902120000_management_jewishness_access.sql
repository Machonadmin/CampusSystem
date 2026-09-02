-- ============================================================================
-- «Бирур яхадут» (בירור יהדות) — доступ высшему руководству.
--
-- Роли-«видят-всё» (campus_president, president_secretary, tech_admin) при
-- раздаче доступа к модулям (20260708140000_role_module_access.sql) НЕ получили
-- jewishness — модуль тогда сидел в отдельной миграции и не попал в ALL_MODULES.
-- Итог: у них нет ни плитки, ни ссылки на «בירור יהדות». По решению владельца —
-- дать: access + view + create + edit, scope 'all'.
--
-- superadmin не трогаем (bypass в /api/auth/me). Идемпотентно (ON CONFLICT).
-- ============================================================================

DO $$
DECLARE
  rid UUID;
  rcode TEXT;
  pcode TEXT;
BEGIN
  FOREACH rcode IN ARRAY ARRAY['campus_president', 'president_secretary', 'tech_admin']
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;
    FOREACH pcode IN ARRAY ARRAY['access', 'view', 'create', 'edit']
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'jewishness', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;
