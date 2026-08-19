-- ═════════════════════════════════════════════════════════════════════
-- ДОСТУП ТЕХПЕРСОНАЛА К МОДУЛЮ «ЭКСПЛУАТАЦИЯ».
--
-- Баг (аудит 2026-07-20): роль `technical_staff` (уборщица/техперсонал) была
-- заведена БЕЗ единого гранта доступа — с ней человек входил в пустой дашборд.
-- По решению владельца выдаём доступ к 'maintenance' (access + view). Действия
-- ('manage') пока НЕ даём — при необходимости добавим позже. Идемпотентно.
-- ═════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  rid   uuid;
  pcode text;
BEGIN
  SELECT id INTO rid FROM roles WHERE code = 'technical_staff';
  IF rid IS NOT NULL THEN
    FOREACH pcode IN ARRAY ARRAY['access', 'view'] LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'maintenance', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END IF;
END $$;
