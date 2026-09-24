-- ═════════════════════════════════════════════════════════════════════
-- ПОЧИНКА прав модуля «Эксплуатация» (maintenance)
--
-- СИМПТОМ, ради которого написано: плитка «תחזוקה» на главной ЕСТЬ, но клик по
-- ней возвращает на главную. Причина — два разных права на один экран:
--   • maintenance.access — по нему рисуются плитка и пункт меню;
--   • maintenance.view   — его требует сама страница.
-- Если выдан только первый, модуль видно, но войти нельзя.
--
-- Так получается, когда 20260708140000_role_module_access.sql (он выдаёт роли
-- ВСЕ привилегии модуля, перебирая module_privileges) отработал РАНЬШЕ, чем
-- 20260707140000_maintenance.sql успел завести в каталоге строки view/manage:
-- перебирать было нечего, и досталось только 'access'.
--
-- Этот файл ИДЕМПОТЕНТЕН и НИЧЕГО НЕ ОТБИРАЕТ: он лишь досевает каталог
-- привилегий модуля и выдаёт view/manage/access ролям техслужбы — ровно то
-- состояние, которое и так предполагалось двумя миграциями выше.
--
-- НЕ ПОМОЖЕТ, если доступ человеку выдан персонально (person_privileges), а не
-- через роль: тогда нужное право ставится в «Настройки → Пользователи и права».
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

-- 1. Каталог привилегий модуля (без него права не появятся ни на экране
--    «Настройки → Роли», ни в персональных оверрайдах).
INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('maintenance', 'view',   'Просмотр',   1),
  ('maintenance', 'manage', 'Управление', 2)
ON CONFLICT (module, privilege_code) DO NOTHING;

-- 2. Ролям техслужбы — access (плитка/меню) + view/manage (сам экран).
--    Роли, которых нет в этой БД, молча пропускаются.
DO $$
DECLARE
  rcode TEXT;
  pcode TEXT;
  rid   UUID;
BEGIN
  FOREACH rcode IN ARRAY ARRAY['maintenance_head', 'maintenance_staff']
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;

    FOREACH pcode IN ARRAY ARRAY['access', 'view', 'manage']
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'maintenance', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;
