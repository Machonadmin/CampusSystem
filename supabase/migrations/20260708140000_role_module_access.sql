-- ═════════════════════════════════════════════════════════════════════
-- Роль → доступ к модулям (основа ролевого входа).
--
-- Сайдбар и middleware показывают модуль пользователю только если у его роли
-- есть привилегия ('<module>', 'access'). До сих пор её не выдавали НИКОМУ,
-- поэтому все не-superadmin видели пустой сайдбар. Эта миграция раздаёт
-- каждой роли доступ + привилегии её модулей по согласованной карте, чтобы
-- при входе врач видел «Медпункт», преподаватель — «Образование» и т.д.
--
-- superadmin НЕ трогаем — он и так видит всё (bypass в /api/auth/me).
-- Идемпотентно: ON CONFLICT DO UPDATE. Ничего не удаляет — только выдаёт.
-- Уровень (кто именно может редактировать) и точный scope преподавателей —
-- предмет последующей тонкой настройки; здесь цель — «чтобы работало».
--
-- Применять вручную через Supabase Dashboard SQL Editor (CampusSystem).
-- ═════════════════════════════════════════════════════════════════════

-- 0. 'access' в каталог привилегий всех модулей — чтобы его можно было
--    выдавать и он отображался в Настройках → Роли.
INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order)
SELECT m, 'access', 'Доступ к модулю', 0
FROM unnest(ARRAY[
  'persons','staff','quality_control','education','finance','dormitory','food',
  'security','alumni','sponsors','tasks','documents','reports','contacts',
  'settings','doctor','psychologist','maintenance'
]) AS m
ON CONFLICT (module, privilege_code) DO NOTHING;

DO $$
DECLARE
  ALL_MODULES TEXT[] := ARRAY[
    'persons','staff','quality_control','education','finance','dormitory','food',
    'security','alumni','sponsors','tasks','documents','reports','contacts',
    'settings','doctor','psychologist','maintenance'
  ];
  rec   RECORD;
  rid   UUID;
  pcode TEXT;
  m     TEXT;
BEGIN
  -- ── 1. Управление — все модули, scope 'all' ──────────────────────────────
  FOR rec IN SELECT unnest(ARRAY['campus_president','president_secretary','tech_admin']) AS role_code
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rec.role_code;
    IF rid IS NULL THEN CONTINUE; END IF;
    FOREACH m IN ARRAY ALL_MODULES
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
        VALUES (rid, m, 'access', 'all')
        ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
      FOR pcode IN SELECT privilege_code FROM module_privileges WHERE module = m
      LOOP
        INSERT INTO role_privileges (role_id, module, privilege_code, scope)
          VALUES (rid, m, pcode, 'all')
          ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
      END LOOP;
    END LOOP;
  END LOOP;

  -- ── 2. Департаментские роли → свои модули, scope 'all' ───────────────────
  --    (access + ВСЕ привилегии модуля — читаются из module_privileges).
  FOR rec IN
    SELECT * FROM (VALUES
      -- Финансы
      ('finance_director','finance'),('finance_director','reports'),('finance_director','documents'),
      ('accountant','finance'),('accountant','reports'),
      -- Руководство образования
      ('rector','education'),('rector','reports'),('rector','alumni'),('rector','documents'),
      ('dean','education'),('dean','reports'),('dean','alumni'),
      ('school_director','education'),('school_director','reports'),('school_director','alumni'),
      ('vice_director','education'),('vice_director','reports'),
      ('dept_head','education'),('dept_head','reports'),
      ('program_head','education'),('program_head','reports'),
      -- Общежитие
      ('dorm_director','dormitory'),('embait','dormitory'),('mashgiach','dormitory'),
      -- Медицина / психология
      ('doctor','doctor'),
      ('psychologist','psychologist'),
      -- Безопасность
      ('security_head','security'),('security_guard','security'),
      -- Эксплуатация
      ('maintenance_head','maintenance'),('maintenance_staff','maintenance'),
      -- Питание
      ('kitchen_head','food'),('kitchen_staff','food'),
      -- Кадры / юрист
      ('hr_director','staff'),('hr_director','contacts'),
      ('lawyer','documents'),('lawyer','contacts')
    ) AS t(role_code, module_code)
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rec.role_code;
    IF rid IS NULL THEN CONTINUE; END IF;
    INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, rec.module_code, 'access', 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    FOR pcode IN SELECT privilege_code FROM module_privileges WHERE module = rec.module_code
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
        VALUES (rid, rec.module_code, pcode, 'all')
        ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;

  -- ── 3. Преподаватели / кураторы → education ──────────────────────────────
  --    Видят модуль (access), но НЕ управляют лидами/приёмом/предметами:
  --    только просмотр студентов и ведение СВОИХ групп (scope='own' —
  --    ограничение по class_teachers), плюс посещаемость/оценки/темы уроков.
  FOR rec IN SELECT unnest(ARRAY['teacher','curator']) AS role_code
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rec.role_code;
    IF rid IS NULL THEN CONTINUE; END IF;
    INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'education', 'access', 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    FOREACH pcode IN ARRAY ARRAY['view_students','mark_attendance','set_grades','set_lesson_topics']
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
        VALUES (rid, 'education', pcode, 'own')
        ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'own';
    END LOOP;
  END LOOP;
END $$;
