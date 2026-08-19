-- ═══════════════════════════════════════════════════════════════════════════
-- Модуль «Отчёты / Обзор» (reports) — READ-ONLY дашборд руководства.
--
-- У модуля НЕТ собственных таблиц: эндпоинты только SELECT-ят из таблиц других
-- модулей и переиспользуют их чистые хелперы. Поэтому здесь ТОЛЬКО блок прав
-- («issue #1» grant block) — без CREATE TABLE.
--
-- Применяется ВРУЧНУЮ через Supabase SQL editor (как остальные модульные
-- миграции). До применения модуль невидим: sidebar остаётся серым для тех, у
-- кого нет доступа, и эндпоинты вернут 403.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- Права модуля 'reports' — issue #1 grant block.
--   Каталог module_privileges для 'reports' досеивается идемпотентно, затем
--   системным ролям выдаётся scope='all'. Паттерн идентичен section 3 в
--   20260707160000_psychologist.sql.
--   NB: сид 002 УЖЕ завёл привилегии 'reports' view/export (sort_order 1/2) —
--   ON CONFLICT DO NOTHING их сохраняет; мы лишь добавляем 'manage'
--   (sort_order 3 — первый свободный). Системным ролям выдаём view/manage.
-- ─────────────────────────────────────────────

INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('reports', 'view',   'Просмотр отчётов',    1),
  ('reports', 'manage', 'Управление отчётами', 3)
ON CONFLICT (module, privilege_code) DO NOTHING;

DO $$
DECLARE
  rcode TEXT;
  pcode TEXT;
  rid   UUID;
BEGIN
  FOREACH rcode IN ARRAY ARRAY['superadmin', 'tech_admin', 'campus_president']
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;

    FOREACH pcode IN ARRAY ARRAY['view', 'manage']
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'reports', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;
