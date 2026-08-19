-- ═════════════════════════════════════════════════════════════════════
-- ДОСТУП К МОДУЛЮ «ЯХАДУТ» ДЛЯ УПРАВЛЕНЧЕСКИХ РОЛЕЙ.
--
-- Баг (аудит 2026-07-20): модуль 'jewishness' добавлен ПОЗЖЕ общей раздачи
-- «все модули» управленческим ролям (20260708140000), поэтому
-- campus_president / president_secretary / tech_admin НЕ получили к нему
-- доступ и middleware их редиректит с /dashboard/jewishness. Выдаём им все
-- привилегии модуля (scope='all'), как у остальных модулей. Идемпотентно.
-- Логику/структуру не трогаем — только добираем недостающие гранты.
-- ═════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  rid   uuid;
  rcode text;
  pcode text;
BEGIN
  FOREACH rcode IN ARRAY ARRAY['campus_president', 'president_secretary', 'tech_admin'] LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;
    FOREACH pcode IN ARRAY ARRAY['access', 'view', 'create', 'edit'] LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'jewishness', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;
