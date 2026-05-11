-- ─────────────────────────────────────────────────────────────────────────────
-- Education Stage 1.5 — расширение системы прав scope-полем и каталог привилегий.
--
-- Изменения:
--   1. role_privileges.scope — новое поле ('all' / 'department' / 'own')
--   2. Удаляем устаревшую общую привилегию 'manage_education_data'
--   3. Добавляем 17 точечных привилегий education в каталог
--   4. Раздаём дефолтные привилегии ролям с учётом scope
--
-- Поля role_privileges остались как раньше:
--   id, role_id, module, privilege_code, granted_at, granted_by, scope (новое)
-- UNIQUE остаётся (role_id, module, privilege_code) — без scope в ключе.
-- Это значит: одна роль = одна запись для одной привилегии (один scope).
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. Добавляем scope ─────────────────────────────────────────

ALTER TABLE role_privileges
  ADD COLUMN scope TEXT NOT NULL DEFAULT 'all'
  CHECK (scope IN ('all', 'department', 'own'));

COMMENT ON COLUMN role_privileges.scope IS
  'Область действия привилегии: all (везде), department (только в подразделениях из staff_positions), own (только в объектах где пользователь явно фигурирует)';


-- ─── 2. Удаляем старую общую привилегию ────────────────────────

DELETE FROM module_privileges
WHERE module = 'education' AND privilege_code = 'manage_education_data';


-- ─── 3. Каталог 17 привилегий education ────────────────────────

INSERT INTO module_privileges (module, privilege_code, privilege_name, description, sort_order)
VALUES
  -- Группа: Справочники (10-19)
  ('education', 'manage_subjects',         'Управление предметами',
   'Создание, редактирование, активация/деактивация предметов', 10),
  ('education', 'manage_specialties',      'Управление специальностями',
   'Управление справочником специальностей', 11),
  ('education', 'manage_study_groups',     'Управление базовыми группами',
   'Создание/изменение базовых групп (1 курс А, 10 класс и т.п.)', 12),

  -- Группа: Лиды (20-29)
  ('education', 'view_leads',              'Просмотр лидов',
   'Видеть список лидов и их данные', 20),
  ('education', 'manage_leads',            'Управление лидами',
   'Создание, редактирование, смена статуса лидов', 21),
  ('education', 'convert_lead',            'Конвертация лида в абитуриенты',
   'Перевод лида в стадию абитуриента', 22),

  -- Группа: Абитуриенты (30-39)
  ('education', 'view_applicants',         'Просмотр абитуриентов',
   'Видеть список абитуриентов', 30),
  ('education', 'manage_applicants',       'Управление абитуриентами',
   'Создание, редактирование, смена статуса абитуриентов', 31),
  ('education', 'enroll_applicant',        'Зачисление абитуриента',
   'Перевод абитуриента в стадию студента', 32),

  -- Группа: Студенты (40-49)
  ('education', 'view_students',           'Просмотр студентов',
   'Видеть список студентов и их профили', 40),
  ('education', 'manage_students',         'Управление студентами',
   'Редактирование профилей, смена статусов студентов', 41),
  ('education', 'manage_enrollments',      'Управление записями в группы',
   'Запись/снятие студентов в учебные группы', 42),

  -- Группа: Учебные группы (50-59)
  ('education', 'manage_class_groups',     'Управление учебными группами',
   'Создание, редактирование учебных групп (период, уровень, лимит)', 50),
  ('education', 'manage_class_teachers',   'Управление преподавателями групп',
   'Назначение и снятие преподавателей с учебных групп', 51),

  -- Группа: Преподавательские (Этап 3) (60-69)
  ('education', 'mark_attendance',         'Отметка посещаемости',
   'Отмечать присутствие студентов на уроках (Этап 3)', 60),
  ('education', 'set_grades',              'Выставление оценок',
   'Ставить оценки студентам (Этап 3)', 61),
  ('education', 'set_lesson_topics',       'Заполнение тем уроков',
   'Указывать темы и содержание проведённых уроков (Этап 3)', 62);


-- ─── 4. Раздача дефолтных привилегий ролям ─────────────────────
--
-- Логика: для каждой роли вставляем привилегии с подходящим scope.
-- Используем подзапросы SELECT id FROM roles WHERE code = '...' для получения role_id.

-- 4.1 SYSTEM-роли: всё со scope='all'
DO $$
DECLARE
  rcode TEXT;
  pcode TEXT;
  rid UUID;
BEGIN
  FOREACH rcode IN ARRAY ARRAY['superadmin', 'tech_admin', 'campus_president']
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;
    FOR pcode IN SELECT privilege_code FROM module_privileges WHERE module = 'education'
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'education', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;


-- 4.2 hr_director: только просмотр × all
DO $$
DECLARE rid UUID; pcode TEXT;
BEGIN
  SELECT id INTO rid FROM roles WHERE code = 'hr_director';
  IF rid IS NOT NULL THEN
    FOR pcode IN VALUES ('view_leads'), ('view_applicants'), ('view_students')
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'education', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END IF;
END $$;


-- 4.3 president_secretary: просмотр всего + управление лидами × all
DO $$
DECLARE rid UUID; pcode TEXT;
BEGIN
  SELECT id INTO rid FROM roles WHERE code = 'president_secretary';
  IF rid IS NOT NULL THEN
    FOR pcode IN VALUES
      ('view_leads'), ('view_applicants'), ('view_students'),
      ('manage_leads'), ('convert_lead')
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'education', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END IF;
END $$;


-- 4.4 Управленческие роли подразделений: всё × department
-- school_director, rector, dean, vice_director — широкие управленцы своего подразделения
DO $$
DECLARE
  rcode TEXT;
  pcode TEXT;
  rid UUID;
BEGIN
  FOREACH rcode IN ARRAY ARRAY['school_director', 'rector', 'dean', 'vice_director']
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;
    FOR pcode IN VALUES
      ('view_leads'), ('manage_leads'), ('convert_lead'),
      ('view_applicants'), ('manage_applicants'), ('enroll_applicant'),
      ('view_students'), ('manage_students'), ('manage_enrollments'),
      ('manage_class_groups'), ('manage_class_teachers'),
      ('manage_study_groups')
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'education', pcode, 'department')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'department';
    END LOOP;
  END LOOP;
END $$;


-- 4.5 dept_head: управление группами и преподавателями × department
DO $$
DECLARE rid UUID; pcode TEXT;
BEGIN
  SELECT id INTO rid FROM roles WHERE code = 'dept_head';
  IF rid IS NOT NULL THEN
    FOR pcode IN VALUES
      ('manage_class_groups'), ('manage_class_teachers'),
      ('view_students'), ('manage_enrollments')
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'education', pcode, 'department')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'department';
    END LOOP;
  END IF;
END $$;


-- 4.6 program_head: специальности + просмотр × department
DO $$
DECLARE rid UUID; pcode TEXT;
BEGIN
  SELECT id INTO rid FROM roles WHERE code = 'program_head';
  IF rid IS NOT NULL THEN
    FOR pcode IN VALUES
      ('manage_specialties'), ('view_students'), ('view_applicants')
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'education', pcode, 'department')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'department';
    END LOOP;
  END IF;
END $$;


-- 4.7 curator: просмотр студентов + управление записями × department
DO $$
DECLARE rid UUID; pcode TEXT;
BEGIN
  SELECT id INTO rid FROM roles WHERE code = 'curator';
  IF rid IS NOT NULL THEN
    FOR pcode IN VALUES ('view_students'), ('manage_enrollments')
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'education', pcode, 'department')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'department';
    END LOOP;
  END IF;
END $$;


-- 4.8 teacher: преподавательские привилегии × own (Этап 3)
DO $$
DECLARE rid UUID; pcode TEXT;
BEGIN
  SELECT id INTO rid FROM roles WHERE code = 'teacher';
  IF rid IS NOT NULL THEN
    FOR pcode IN VALUES
      ('mark_attendance'), ('set_grades'), ('set_lesson_topics'),
      ('view_students')  -- видит студентов своих групп
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'education', pcode, 'own')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'own';
    END LOOP;
  END IF;
END $$;
