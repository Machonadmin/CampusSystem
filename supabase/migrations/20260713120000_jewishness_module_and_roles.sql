-- ═════════════════════════════════════════════════════════════════════
-- Модуль «Бирур яхадут» (Jewishness verification) + две новые роли.
-- Фундамент многоэтапного процесса приёма (admission).
--
-- Делает три вещи, все ИДЕМПОТЕНТНО (безопасен для повторного прогона):
--
--   1. РОЛИ (is_system=false, category='education'):
--        • head_of_studies    — «אחראי לימודים»  (ответственный за учёбу)
--        • jewishness_officer — «אחראי יהדות»    (ответственный за яхадут)
--      ON CONFLICT (code) DO NOTHING.
--      NB: остальные роли в БД хранят `name` по-русски; здесь имя намеренно на
--      иврите — ровно как задано в спецификации новых ролей.
--
--   2. КАТАЛОГ module_privileges — строки нового модуля 'jewishness'
--      (access/view/create/edit) + 'access' для 'education' (чтобы грант из п.3
--      был виден/редактируем в Настройках → Роли; строка совпадает с тем, что
--      сеет 20260708140000_role_module_access.sql). view/create/edit заведены
--      на будущее — на этом шаге модуль гейтится только привилегией 'access'.
--      ON CONFLICT (module, privilege_code) DO NOTHING.
--
--   3. ГРАНТЫ role_privileges — форма как в 20260708140000_role_module_access.sql
--      (колонки role_id, module, privilege_code, scope; ON CONFLICT DO UPDATE):
--        • head_of_studies    → education.access   (scope 'all')
--        • jewishness_officer → jewishness.access  (scope 'all')
--
-- Доступ к модулю контролируется привилегией 'access' (та же модель, что
-- middleware и /api/auth/me): superadmin видит всё в обход, поэтому отдельный
-- грант ему не нужен. Реальные записи проверки + загрузка документов — следующий
-- шаг.
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor (CampusSystem).
-- ═════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 1. Новые роли
-- ─────────────────────────────────────────────
INSERT INTO roles (name, code, category, is_system, description) VALUES
  ('אחראי לימודים', 'head_of_studies',    'education', FALSE, 'אחראי לימודים — שלב לימודי בתהליך הקבלה'),
  ('אחראי יהדות',   'jewishness_officer', 'education', FALSE, 'אחראי בירור ואישור יהדות של מועמדות')
ON CONFLICT (code) DO NOTHING;


-- ─────────────────────────────────────────────
-- 2. Каталог привилегий модуля 'jewishness' (+ education.access для п.3)
-- ─────────────────────────────────────────────
INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('jewishness', 'access', 'Доступ к модулю',  0),
  ('jewishness', 'view',   'Просмотр записей', 1),
  ('jewishness', 'create', 'Создание записей', 2),
  ('jewishness', 'edit',   'Редактирование',   3),
  ('education',  'access', 'Доступ к модулю',  0)
ON CONFLICT (module, privilege_code) DO NOTHING;


-- ─────────────────────────────────────────────
-- 3. Гранты доступа новым ролям
--    head_of_studies    → «Образование»  (education.access)
--    jewishness_officer → «Бирур яхадут» (jewishness.access)
-- ─────────────────────────────────────────────
DO $$
DECLARE
  rid UUID;
BEGIN
  SELECT id INTO rid FROM roles WHERE code = 'head_of_studies';
  IF rid IS NOT NULL THEN
    INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'education', 'access', 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
  END IF;

  SELECT id INTO rid FROM roles WHERE code = 'jewishness_officer';
  IF rid IS NOT NULL THEN
    INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'jewishness', 'access', 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
  END IF;
END $$;
