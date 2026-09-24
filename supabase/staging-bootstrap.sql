-- ============================================================
-- CampusSystem — staging bootstrap (СГЕНЕРИРОВАНО, не редактировать)
-- Источник: supabase/migrations (все миграции в порядке применения)
-- Собрать заново: bash scripts/build-staging-bootstrap.sh
-- Применение: SQL Editor нового проекта Supabase → вставить → Run
-- ============================================================


-- ─────────────────────────────────────────────────────────
-- 001_initial_schema.sql
-- ─────────────────────────────────────────────────────────
-- Migration: 001_initial_schema
-- Campus Management System — core tables, departments, and roles

-- ─────────────────────────────────────────────
-- PERSONS (unified people directory)
-- ─────────────────────────────────────────────
CREATE TABLE persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  hebrew_name TEXT,
  gender TEXT CHECK (gender IN ('female', 'male', 'other')),
  birth_date DATE,
  photo_url TEXT,
  email TEXT,
  phones JSONB DEFAULT '[]',
  address JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- PERSON ACCOUNTS (login credentials)
-- ─────────────────────────────────────────────
CREATE TABLE person_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  login_email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- PERSON FAMILY (relatives / emergency contacts)
-- ─────────────────────────────────────────────
CREATE TABLE person_family (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  relative_type TEXT CHECK (relative_type IN ('mother','father','emergency','other')),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  relation_note TEXT
);

-- ─────────────────────────────────────────────
-- APPLICANT PROFILES
-- ─────────────────────────────────────────────
CREATE TABLE applicant_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'new' CHECK (status IN ('new','reviewing','accepted','rejected')),
  application_date DATE DEFAULT CURRENT_DATE,
  referral_source TEXT,
  community_contact_name TEXT,
  community_contact_role TEXT,
  community_phone TEXT,
  community_email TEXT,
  notes TEXT
);

-- ─────────────────────────────────────────────
-- ENROLLMENTS (students at any institution)
-- ─────────────────────────────────────────────
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  institution TEXT NOT NULL CHECK (institution IN ('university','touro','college','school','emuna','other')),
  direction TEXT,
  level TEXT,
  enrollment_date DATE,
  graduation_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','graduated','expelled','academic_leave')),
  notes TEXT
);

-- ─────────────────────────────────────────────
-- STAFF PROFILES
-- ─────────────────────────────────────────────
CREATE TABLE staff_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  employment_type TEXT DEFAULT 'staff' CHECK (employment_type IN ('staff','intern','volunteer','contractor')),
  hire_date DATE,
  fire_date DATE,
  notes TEXT
);

-- ─────────────────────────────────────────────
-- DEPARTMENTS (tree structure)
-- ─────────────────────────────────────────────
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES departments(id),
  head_person_id UUID REFERENCES persons(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- STAFF POSITIONS (one person, many positions)
-- ─────────────────────────────────────────────
CREATE TABLE staff_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id),
  position_ru TEXT NOT NULL,
  position_he TEXT,
  is_head BOOLEAN DEFAULT FALSE,
  start_date DATE,
  end_date DATE
);

-- ─────────────────────────────────────────────
-- ALUMNI PROFILES
-- ─────────────────────────────────────────────
CREATE TABLE alumni_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  graduation_year INTEGER,
  institution TEXT,
  direction TEXT,
  current_location TEXT,
  current_occupation TEXT,
  notes TEXT
);

-- ─────────────────────────────────────────────
-- SPONSOR PROFILES (individuals & organizations)
-- ─────────────────────────────────────────────
CREATE TABLE sponsor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID REFERENCES persons(id) ON DELETE CASCADE,
  sponsor_type TEXT NOT NULL CHECK (sponsor_type IN ('individual','organization')),
  org_name TEXT,
  org_contact_name TEXT,
  org_contact_phone TEXT,
  org_contact_email TEXT,
  notes TEXT
);

-- ─────────────────────────────────────────────
-- ROLES
-- ─────────────────────────────────────────────
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  category TEXT CHECK (category IN ('system','campus','campus_management','education','medical','finance','legal','dormitory','security','maintenance','food','technical','custom','external')),
  description TEXT,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- ROLE PRIVILEGES (per module)
-- ─────────────────────────────────────────────
CREATE TABLE role_privileges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  can_create BOOLEAN DEFAULT FALSE,
  can_view BOOLEAN DEFAULT FALSE,
  can_edit BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  is_confidential BOOLEAN DEFAULT FALSE
);

-- ─────────────────────────────────────────────
-- PERSON ROLES (role assignments)
-- ─────────────────────────────────────────────
CREATE TABLE person_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES persons(id)
);

-- ─────────────────────────────────────────────
-- auto-update updated_at on persons
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER persons_updated_at
  BEFORE UPDATE ON persons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- SEED: departments for Machon Hamesh campus
-- ─────────────────────────────────────────────
INSERT INTO departments (name, parent_id) VALUES
  ('ЕВРЕЙСКИЙ УНИВЕРСИТЕТ КАМПУС «МАХОН ХАМЕШ»', NULL);

WITH root AS (
  SELECT id FROM departments WHERE parent_id IS NULL LIMIT 1
)
INSERT INTO departments (name, parent_id)
SELECT t.name, root.id
FROM root,
(VALUES
  ('Университет'),
  ('Touro University'),
  ('Колледж'),
  ('Школа'),
  ('Эмуна'),
  ('Кафедра иудаики'),
  ('Общежитие'),
  ('Отдел безопасности'),
  ('Бухгалтерия'),
  ('Юридический отдел'),
  ('Хозяйственная деятельность'),
  ('Техническое обслуживание'),
  ('Администрация'),
  ('Блок питания')
) AS t(name);

-- ─────────────────────────────────────────────
-- SEED: base system roles
-- ─────────────────────────────────────────────
INSERT INTO roles (name, code, category, is_system, description) VALUES
  ('Суперадминистратор',    'superadmin',       'system',    TRUE,  'Полный доступ ко всей системе'),
  ('Технический администратор', 'tech_admin',   'system',    TRUE,  'Техническое администрирование'),
  ('Президент кампуса',     'campus_president', 'campus',    TRUE,  'Доступ ко всему кроме технических настроек'),
  ('Ректор',                'rector',           'campus',    TRUE,  'Руководство университетом'),
  ('Администратор кампуса', 'campus_admin',     'campus',    FALSE, 'Административный сотрудник'),
  ('Врач кампуса',          'campus_doctor',    'medical',   FALSE, 'Доступ к медицинским данным'),
  ('Психолог',              'psychologist',     'medical',   FALSE, 'Доступ к данным психолога'),
  ('Преподаватель',         'teacher',          'education', FALSE, 'Преподавательский состав'),
  ('Студент',               'student',          'education', FALSE, 'Студент учебного заведения'),
  ('Финансовый директор',   'finance_director', 'campus',    FALSE, 'Управление финансами');


-- ─────────────────────────────────────────────────────────
-- 002_roles_and_privileges.sql
-- ─────────────────────────────────────────────────────────
-- Migration: 002_roles_and_privileges
-- Replaces initial roles seed, restructures role_privileges to a
-- code-based system, and adds module_privileges + person_privileges tables.

-- ─────────────────────────────────────────────
-- 0. Extend category check constraint to include 'external'
-- ─────────────────────────────────────────────
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_category_check;
ALTER TABLE roles ADD CONSTRAINT roles_category_check
  CHECK (category IN ('system','campus','campus_management','education','medical','finance','legal','dormitory','security','maintenance','food','technical','custom','external'));

-- ─────────────────────────────────────────────
-- 1. Clear existing roles and re-seed
-- ─────────────────────────────────────────────
TRUNCATE TABLE person_roles, role_privileges, roles CASCADE;

INSERT INTO roles (name, code, category, is_system, description) VALUES
-- Системные
('Суперадминистратор',       'superadmin',          'system',    TRUE,  'Полный доступ ко всей системе'),
('Технический администратор','tech_admin',           'system',    TRUE,  'Техническое администрирование'),
-- Управление кампусом
('Президент кампуса',        'campus_president',     'campus',    TRUE,  'Руководство кампусом'),
('Секретарь президента',     'president_secretary',  'campus',    FALSE, 'Секретарь президента кампуса'),
-- Финансы и юридический
('Финансовый директор',      'finance_director',     'campus',    FALSE, 'Управление финансами'),
('Бухгалтер',                'accountant',           'campus',    FALSE, 'Бухгалтерия'),
('Юрист',                    'lawyer',               'campus',    FALSE, 'Юридический отдел'),
-- Образование — руководство
('Ректор',                   'rector',               'education', FALSE, 'Ректор университета'),
('Декан',                    'dean',                 'education', FALSE, 'Декан факультета'),
('Директор учебного заведения','school_director',    'education', FALSE, 'Директор колледжа или школы'),
('Заместитель директора',    'vice_director',        'education', FALSE, 'Заместитель директора'),
('Заведующий кафедрой',      'dept_head',            'education', FALSE, 'Заведующий кафедрой'),
('Руководитель программы',   'program_head',         'education', FALSE, 'Руководитель образовательной программы'),
-- Образование — преподаватели
('Преподаватель',            'teacher',              'education', FALSE, 'Преподаватель или учитель'),
('Куратор',                  'curator',              'education', FALSE, 'Куратор или завуч'),
-- Образование — учащиеся
('Студент',                  'student',              'education', FALSE, 'Студент университета или колледжа'),
('Ученик',                   'pupil',                'education', FALSE, 'Ученик школы'),
-- Общежитие
('Директор общежития',       'dorm_director',        'campus',    FALSE, 'Директор общежития'),
('Эмбайт',                   'embait',               'campus',    FALSE, 'Эмбайт общежития'),
('Машгиах',                  'mashgiach',            'campus',    FALSE, 'Машгиах'),
-- Медицина
('Врач',                     'doctor',               'medical',   FALSE, 'Врач кампуса'),
('Психолог',                 'psychologist',         'medical',   FALSE, 'Психолог кампуса'),
-- Безопасность
('Начальник охраны',         'security_head',        'campus',    FALSE, 'Начальник отдела безопасности'),
('Охранник',                 'security_guard',       'campus',    FALSE, 'Сотрудник охраны'),
-- Эксплуатация
('Руководитель эксплуатации','maintenance_head',     'campus',    FALSE, 'Начальник отдела эксплуатации'),
('Сотрудник эксплуатации',   'maintenance_staff',    'campus',    FALSE, 'Инженер или мастер'),
-- Питание
('Руководитель кухни',       'kitchen_head',         'campus',    FALSE, 'Директор кухни или шеф-повар'),
('Сотрудник кухни',          'kitchen_staff',        'campus',    FALSE, 'Повар или сотрудник кухни'),
-- Технический персонал
('Технический персонал',     'technical_staff',      'campus',    FALSE, 'Уборщица и технический персонал'),
-- Внешние участники
('Абитуриент',               'applicant',            'external',  FALSE, 'Абитуриент кампуса'),
('Выпускник',                'alumni',               'external',  FALSE, 'Выпускник кампуса'),
('Спонсор',                  'sponsor',              'external',  FALSE, 'Спонсор кампуса');

-- ─────────────────────────────────────────────
-- 2. Module privileges catalogue
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS module_privileges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module         TEXT NOT NULL,
  privilege_code TEXT NOT NULL,
  privilege_name TEXT NOT NULL,
  description    TEXT,
  sort_order     INTEGER DEFAULT 0,
  UNIQUE(module, privilege_code)
);

-- ─────────────────────────────────────────────
-- 3. Replace role_privileges with code-based table
-- ─────────────────────────────────────────────
DROP TABLE IF EXISTS role_privileges CASCADE;

CREATE TABLE role_privileges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id        UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module         TEXT NOT NULL,
  privilege_code TEXT NOT NULL,
  granted_at     TIMESTAMPTZ DEFAULT NOW(),
  granted_by     UUID REFERENCES persons(id),
  UNIQUE(role_id, module, privilege_code)
);

-- ─────────────────────────────────────────────
-- 4. Per-person privilege overrides
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS person_privileges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id      UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  module         TEXT NOT NULL,
  privilege_code TEXT NOT NULL,
  is_granted     BOOLEAN NOT NULL DEFAULT TRUE,
  reason         TEXT,
  expires_at     TIMESTAMPTZ,
  granted_at     TIMESTAMPTZ DEFAULT NOW(),
  granted_by     UUID REFERENCES persons(id),
  UNIQUE(person_id, module, privilege_code)
);

-- ─────────────────────────────────────────────
-- 5. Seed module_privileges catalogue
-- ─────────────────────────────────────────────
INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
-- Persons
('persons',      'view',              'Просмотр',                    1),
('persons',      'create',            'Создание',                    2),
('persons',      'edit',              'Редактирование',              3),
('persons',      'delete',            'Удаление',                    4),
-- Приёмная комиссия
('applicants',   'view',              'Просмотр заявок',             1),
('applicants',   'create',            'Создание заявок',             2),
('applicants',   'edit',              'Редактирование заявок',       3),
('applicants',   'change_status',     'Изменение статуса',           4),
('applicants',   'delete',            'Удаление заявок',             5),
-- Образование
('education',    'view',              'Просмотр',                    1),
('education',    'manage_groups',     'Управление группами',         2),
('education',    'manage_schedule',   'Управление расписанием',      3),
('education',    'manage_grades',     'Выставление оценок',          4),
('education',    'view_own_only',     'Только свои данные',          5),
-- Финансы
('finance',      'view',              'Просмотр',                    1),
('finance',      'create_invoice',    'Создание счетов',             2),
('finance',      'approve_payment',   'Подтверждение платежей',      3),
('finance',      'manage_budget',     'Управление бюджетом',         4),
('finance',      'export_reports',    'Экспорт отчётов',             5),
-- Общежитие
('dormitory',    'view',              'Просмотр',                    1),
('dormitory',    'manage_rooms',      'Управление комнатами',        2),
('dormitory',    'manage_residents',  'Управление жильцами',         3),
-- Питание
('food',         'view_menu',         'Просмотр меню',               1),
('food',         'manage_menu',       'Управление меню',             2),
('food',         'manage_orders',     'Управление заказами',         3),
-- Безопасность
('security',     'view',              'Просмотр',                    1),
('security',     'manage_access',     'Управление пропусками',       2),
('security',     'view_logs',         'Просмотр журнала',            3),
-- Медицина
('doctor',       'view',              'Просмотр записей',            1),
('doctor',       'create',            'Создание записей',            2),
('doctor',       'edit',              'Редактирование',              3),
('psychologist', 'view',              'Просмотр записей',            1),
('psychologist', 'create',            'Создание записей',            2),
('psychologist', 'edit',              'Редактирование',              3),
-- Выпускники
('alumni',       'view',              'Просмотр',                    1),
('alumni',       'manage',            'Управление',                  2),
-- Спонсоры
('sponsors',     'view',              'Просмотр',                    1),
('sponsors',     'manage',            'Управление',                  2),
-- Задачи
('tasks',        'view_own',          'Свои задачи',                 1),
('tasks',        'view_all',          'Все задачи',                  2),
('tasks',        'create',            'Создание задач',              3),
('tasks',        'assign',            'Назначение задач',            4),
('tasks',        'delete',            'Удаление задач',              5),
-- Документы
('documents',    'view',              'Просмотр',                    1),
('documents',    'create',            'Создание',                    2),
('documents',    'manage_templates',  'Управление шаблонами',        3),
-- Отчёты
('reports',      'view',              'Просмотр отчётов',            1),
('reports',      'export',            'Экспорт отчётов',             2),
-- Настройки
('settings',     'view',              'Просмотр',                    1),
('settings',     'manage_roles',      'Управление ролями',           2),
('settings',     'manage_departments','Управление отделами',         3),
('settings',     'manage_system',     'Системные настройки',         4);


-- ─────────────────────────────────────────────────────────
-- 004_auth_functions.sql
-- ─────────────────────────────────────────────────────────
-- Migration: 004_auth_functions
-- Database-side helpers for authentication.

-- ─────────────────────────────────────────────
-- verify_login
-- Returns account + person info + role codes for a given email.
-- Called from the login API route; password check happens in app layer.
-- SECURITY DEFINER allows the anon key to read password_hash safely.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION verify_login(p_email TEXT)
RETURNS TABLE (
  person_id    UUID,
  login_email  TEXT,
  password_hash TEXT,
  is_active    BOOLEAN,
  full_name    TEXT,
  roles        TEXT[]
) AS $$
  SELECT
    pa.person_id,
    pa.login_email,
    pa.password_hash,
    pa.is_active,
    p.full_name,
    COALESCE(ARRAY_AGG(r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
  FROM person_accounts pa
  JOIN persons p ON p.id = pa.person_id
  LEFT JOIN person_roles pr ON pr.person_id = pa.person_id
  LEFT JOIN roles r ON r.id = pr.role_id
  WHERE pa.login_email = lower(trim(p_email))
  GROUP BY pa.person_id, pa.login_email, pa.password_hash, pa.is_active, p.full_name;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ─────────────────────────────────────────────
-- update_last_login
-- Called after a successful login to record the timestamp.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_last_login(p_person_id UUID)
RETURNS VOID AS $$
  UPDATE person_accounts
  SET last_login = NOW()
  WHERE person_id = p_person_id;
$$ LANGUAGE SQL SECURITY DEFINER;


-- ─────────────────────────────────────────────────────────
-- 005_create_superadmin.sql
-- ─────────────────────────────────────────────────────────
-- Migration: 005_create_superadmin
-- One-time bootstrap migration that creates the first superadmin user.
-- Already applied against production — this file is kept for reference and
-- for reproducing the schema on fresh environments.
--
-- To use on a fresh environment: replace the placeholders below with a real
-- email and a bcrypt hash (12 rounds), or prefer running
-- scripts/create-admin.ts, which reads ADMIN_EMAIL / ADMIN_PASSWORD from env vars.

DO $$
DECLARE
  v_person_id     UUID;
  v_role_id       UUID;
  v_email         TEXT := 'REPLACE_WITH_ADMIN_EMAIL';
  v_password_hash TEXT := 'REPLACE_WITH_BCRYPT_HASH';
BEGIN

  -- Skip if account already exists
  IF EXISTS (
    SELECT 1 FROM person_accounts WHERE login_email = v_email
  ) THEN
    RAISE NOTICE 'Superadmin already exists — skipping.';
    RETURN;
  END IF;

  -- 1. Create person record
  INSERT INTO persons (full_name, email)
  VALUES ('Суперадминистратор', v_email)
  RETURNING id INTO v_person_id;

  -- 2. Create login account with pre-hashed password
  INSERT INTO person_accounts (person_id, login_email, password_hash, is_active)
  VALUES (
    v_person_id,
    v_email,
    v_password_hash,
    TRUE
  );

  -- 3. Assign superadmin role
  SELECT id INTO v_role_id FROM roles WHERE code = 'superadmin';

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role "superadmin" not found — run migration 002 first.';
  END IF;

  INSERT INTO person_roles (person_id, role_id)
  VALUES (v_person_id, v_role_id);

  RAISE NOTICE 'Superadmin created: % (person_id: %)', v_email, v_person_id;

END $$;


-- ─────────────────────────────────────────────────────────
-- 006_disable_rls_auth_tables.sql
-- ─────────────────────────────────────────────────────────
-- Migration: 006_disable_rls_auth_tables
-- The login API uses the Supabase service role key which bypasses RLS.
-- However, if RLS was enabled by default on these tables, queries with
-- the anon key (or before the service role key is configured) would fail.
-- This migration disables RLS on the core tables so the app works even
-- if SUPABASE_SECRET_KEY falls back to the anon key temporarily.
--
-- NOTE: Once proper RLS policies are designed per role, re-enable RLS
-- and replace this migration with granular policies.

ALTER TABLE persons           DISABLE ROW LEVEL SECURITY;
ALTER TABLE person_accounts   DISABLE ROW LEVEL SECURITY;
ALTER TABLE person_family     DISABLE ROW LEVEL SECURITY;
ALTER TABLE person_roles      DISABLE ROW LEVEL SECURITY;
ALTER TABLE roles             DISABLE ROW LEVEL SECURITY;
ALTER TABLE role_privileges   DISABLE ROW LEVEL SECURITY;
ALTER TABLE module_privileges DISABLE ROW LEVEL SECURITY;
ALTER TABLE person_privileges DISABLE ROW LEVEL SECURITY;
ALTER TABLE departments       DISABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles    DISABLE ROW LEVEL SECURITY;
ALTER TABLE staff_positions   DISABLE ROW LEVEL SECURITY;
ALTER TABLE applicant_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments       DISABLE ROW LEVEL SECURITY;
ALTER TABLE alumni_profiles   DISABLE ROW LEVEL SECURITY;
ALTER TABLE sponsor_profiles  DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────
-- 007_education_module.sql
-- ─────────────────────────────────────────────────────────
-- Статусы жизненного цикла человека
CREATE TYPE person_education_status AS ENUM (
  'lead',           -- потенциальный абитуриент
  'applicant',      -- абитуриент
  'student',        -- студент/ученик
  'alumni'          -- выпускник
);

-- История переходов статусов
CREATE TABLE person_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  from_status person_education_status,
  to_status person_education_status NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  changed_by UUID REFERENCES persons(id),
  comment TEXT
);

-- Направления интереса лида (несколько)
CREATE TABLE lead_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  institution TEXT NOT NULL CHECK (institution IN ('university','touro','college','school','emuna','other')),
  direction TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Добавить поля в applicant_profiles
ALTER TABLE applicant_profiles
  ADD COLUMN IF NOT EXISTS education_status person_education_status DEFAULT 'lead',
  ADD COLUMN IF NOT EXISTS institution TEXT,
  ADD COLUMN IF NOT EXISTS direction TEXT,
  ADD COLUMN IF NOT EXISTS level TEXT,
  ADD COLUMN IF NOT EXISTS interview_date DATE,
  ADD COLUMN IF NOT EXISTS decision_date DATE,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Добавить поля в persons для образования
ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS education_status person_education_status,
  ADD COLUMN IF NOT EXISTS marital_status TEXT,
  ADD COLUMN IF NOT EXISTS nationality TEXT,
  ADD COLUMN IF NOT EXISTS passport_number TEXT;


-- ─────────────────────────────────────────────────────────
-- 008_update_role_categories.sql
-- ─────────────────────────────────────────────────────────
-- Update role categories
UPDATE roles SET category = 'system' WHERE code IN ('superadmin', 'tech_admin');
UPDATE roles SET category = 'campus_management' WHERE code IN ('campus_president', 'president_secretary');
UPDATE roles SET category = 'finance' WHERE code IN ('finance_director', 'accountant');
UPDATE roles SET category = 'legal' WHERE code = 'lawyer';
UPDATE roles SET category = 'education' WHERE code IN (
  'rector', 'dean', 'school_director', 'vice_director',
  'dept_head', 'program_head', 'teacher', 'curator',
  'student', 'pupil', 'applicant', 'alumni'
);
UPDATE roles SET category = 'dormitory' WHERE code IN ('dorm_director', 'embait', 'mashgiach');
UPDATE roles SET category = 'medical' WHERE code IN ('doctor', 'psychologist');
UPDATE roles SET category = 'security' WHERE code IN ('security_head', 'security_guard');
UPDATE roles SET category = 'maintenance' WHERE code IN ('maintenance_head', 'maintenance_staff');
UPDATE roles SET category = 'food' WHERE code IN ('kitchen_head', 'kitchen_staff');
UPDATE roles SET category = 'technical' WHERE code = 'technical_staff';
UPDATE roles SET category = 'external' WHERE code IN ('sponsor', 'guest');


-- ─────────────────────────────────────────────────────────
-- 20260503203944_add_hr_director_role.sql
-- ─────────────────────────────────────────────────────────
-- Add HR Director role (Начальник отдела кадров)

-- Relax category constraint to allow 'campus_management' if not already done
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_category_check;
ALTER TABLE roles ADD CONSTRAINT roles_category_check
  CHECK (category IN (
    'system','campus','campus_management','education','medical',
    'finance','legal','dormitory','security','maintenance',
    'food','technical','custom','external'
  ));

INSERT INTO roles (name, code, category, description, is_system)
VALUES (
  'Начальник отдела кадров',
  'hr_director',
  'campus_management',
  'Управляет персоналом, структурой организации, кадровым учётом',
  false
);

INSERT INTO role_privileges (role_id, module, privilege_code)
SELECT r.id, m.module, m.privilege_code
FROM roles r
CROSS JOIN (VALUES
  ('staff',     'view'),
  ('staff',     'create'),
  ('staff',     'edit'),
  ('staff',     'delete'),
  ('persons',   'view'),
  ('tasks',     'view'),
  ('tasks',     'create'),
  ('tasks',     'edit'),
  ('tasks',     'delete'),
  ('documents', 'view'),
  ('documents', 'create'),
  ('documents', 'edit'),
  ('reports',   'view')
) AS m(module, privilege_code)
WHERE r.code = 'hr_director';


-- ─────────────────────────────────────────────────────────
-- 20260504120000_add_dept_fields.sql
-- ─────────────────────────────────────────────────────────
ALTER TABLE departments ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS description TEXT;


-- ─────────────────────────────────────────────────────────
-- 20260506120000_create_quality_control_tables.sql
-- ─────────────────────────────────────────────────────────
-- ─────────────────────────────────────────────────────────────────────────────
-- Quality Control module — templates + checks
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- 1. TEMPLATES (шаблоны проверок)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quality_check_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,

  -- JSON array of blocks, each containing an array of questions.
  -- Block example:
  --   { "id": "block_2", "title": "...", "order": 2,
  --     "questions": [
  --       { "id": "q1", "text": "...", "type": "scale_1_5",
  --         "required": true, "order": 1 }
  --     ]
  --   }
  --
  -- Supported question types:
  --   scale_1_5   — rating 1–5
  --   number      — integer/decimal input
  --   text_short  — single-line text
  --   text_long   — multi-line textarea
  --   yes_no_partial — Да / Нет / Частично
  --
  -- Block 1 (admin_info) and Block 9 (summary) are structural:
  -- their data is stored in dedicated columns on quality_checks,
  -- but they are included in the template so the UI can render them
  -- in correct order with the right labels.
  structure   JSONB NOT NULL,

  is_active   BOOLEAN DEFAULT TRUE,
  created_by  UUID REFERENCES persons(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- 2. CHECKS (проверки уроков)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quality_checks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES quality_check_templates(id),

  -- Lesson / session info (Block 1 — admin info)
  lesson_date          DATE NOT NULL,
  lesson_time          TIME NOT NULL,
  observer_person_id   UUID NOT NULL REFERENCES persons(id),
  teacher_person_id    UUID NOT NULL REFERENCES persons(id),
  group_name           TEXT,
  course_name          TEXT,

  -- Organisational details (optional)
  started_on_time  BOOLEAN,
  delay_minutes    INTEGER,
  delay_reason     TEXT,
  technical_issues TEXT,

  -- Question answers (Blocks 2–8).
  -- Keyed by question id from the template, e.g.:
  --   { "q1":  { "value": 4, "comment": "Чётко обозначила тему" },
  --     "q10": { "value": 12 },
  --     "q14": { "value": "Один студент разговаривал" } }
  answers JSONB,

  -- Summary (Block 9 — stored as dedicated columns for easy querying)
  strengths             TEXT,
  areas_for_improvement TEXT,
  action_item           TEXT,
  overall_rating        INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
  teacher_feedback      TEXT,

  -- Lifecycle
  status       TEXT NOT NULL DEFAULT 'planned'
                   CHECK (status IN ('planned', 'in_progress', 'completed')),
  created_by   UUID REFERENCES persons(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ─────────────────────────────────────────────
-- 3. INDEXES
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_quality_checks_teacher   ON quality_checks(teacher_person_id);
CREATE INDEX IF NOT EXISTS idx_quality_checks_observer  ON quality_checks(observer_person_id);
CREATE INDEX IF NOT EXISTS idx_quality_checks_date      ON quality_checks(lesson_date);
CREATE INDEX IF NOT EXISTS idx_quality_checks_status    ON quality_checks(status);
CREATE INDEX IF NOT EXISTS idx_quality_templates_active ON quality_check_templates(is_active);

-- ─────────────────────────────────────────────
-- 4. DEFAULT TEMPLATE — "Проверка урока (полная)"
-- ─────────────────────────────────────────────

INSERT INTO quality_check_templates (name, description, structure, is_active)
SELECT * FROM (VALUES (
  'Проверка урока (полная)',
  'Подробная оценка качества преподавания по 9 критериям',
  $template$
  {
    "blocks": [
      {
        "id": "block_1",
        "title": "Административная информация",
        "order": 1,
        "type": "admin_info",
        "questions": []
      },
      {
        "id": "block_2",
        "title": "План и цель урока",
        "order": 2,
        "questions": [
          {
            "id": "q1",
            "text": "Преподаватель открыла урок с чётко сформулированной целью",
            "type": "scale_1_5",
            "required": true,
            "order": 1
          },
          {
            "id": "q2",
            "text": "Содержание урока соответствует заявленным целям",
            "type": "scale_1_5",
            "required": true,
            "order": 2
          },
          {
            "id": "q3",
            "text": "Цели урока были понятны ученицам",
            "type": "scale_1_5",
            "required": true,
            "order": 3
          },
          {
            "id": "q4",
            "text": "Материал урока соответствует уровню и потребностям группы",
            "type": "scale_1_5",
            "required": true,
            "order": 4
          },
          {
            "id": "q5",
            "text": "Преподаватель придерживалась запланированной структуры урока",
            "type": "scale_1_5",
            "required": true,
            "order": 5
          }
        ]
      },
      {
        "id": "block_3",
        "title": "Качество объяснения",
        "order": 3,
        "questions": [
          {
            "id": "q6",
            "text": "Ясность и доступность объяснений",
            "type": "scale_1_5",
            "required": true,
            "order": 1
          },
          {
            "id": "q7",
            "text": "Использование примеров и аналогий для иллюстрации материала",
            "type": "scale_1_5",
            "required": true,
            "order": 2
          },
          {
            "id": "q8",
            "text": "Систематическая проверка понимания материала",
            "type": "scale_1_5",
            "required": true,
            "order": 3
          },
          {
            "id": "q9",
            "text": "Оптимальный темп подачи материала",
            "type": "scale_1_5",
            "required": true,
            "order": 4
          }
        ]
      },
      {
        "id": "block_4",
        "title": "Вовлечённость учениц",
        "order": 4,
        "questions": [
          {
            "id": "q10",
            "text": "Количество активно участвующих учениц",
            "type": "number",
            "required": false,
            "order": 1
          },
          {
            "id": "q11",
            "text": "Общий уровень активности учениц на уроке",
            "type": "scale_1_5",
            "required": true,
            "order": 2
          },
          {
            "id": "q12",
            "text": "Качество взаимодействия преподавателя с ученицами",
            "type": "scale_1_5",
            "required": true,
            "order": 3
          },
          {
            "id": "q13",
            "text": "Вовлечённость учениц в самостоятельную работу",
            "type": "scale_1_5",
            "required": true,
            "order": 4
          }
        ]
      },
      {
        "id": "block_5",
        "title": "Управление классом",
        "order": 5,
        "questions": [
          {
            "id": "q14",
            "text": "Описание дисциплинарных ситуаций (при наличии)",
            "type": "text_short",
            "required": false,
            "order": 1
          },
          {
            "id": "q15",
            "text": "Общий контроль над классом",
            "type": "scale_1_5",
            "required": true,
            "order": 2
          },
          {
            "id": "q16",
            "text": "Эффективная реакция на отвлечения и нарушения",
            "type": "scale_1_5",
            "required": true,
            "order": 3
          },
          {
            "id": "q17",
            "text": "Поддержание рабочей атмосферы в классе",
            "type": "scale_1_5",
            "required": true,
            "order": 4
          }
        ]
      },
      {
        "id": "block_6",
        "title": "Личностный аспект",
        "order": 6,
        "questions": [
          {
            "id": "q18",
            "text": "Профессиональный облик и уверенность преподавателя",
            "type": "scale_1_5",
            "required": true,
            "order": 1
          },
          {
            "id": "q19",
            "text": "Уважительное и внимательное отношение к ученицам",
            "type": "scale_1_5",
            "required": true,
            "order": 2
          },
          {
            "id": "q20",
            "text": "Эмоциональный климат на уроке",
            "type": "scale_1_5",
            "required": true,
            "order": 3
          },
          {
            "id": "q21",
            "text": "Способность мотивировать и воодушевлять учениц",
            "type": "scale_1_5",
            "required": true,
            "order": 4
          }
        ]
      },
      {
        "id": "block_7",
        "title": "Методика",
        "order": 7,
        "questions": [
          {
            "id": "q22",
            "text": "Разнообразие методов и приёмов обучения",
            "type": "scale_1_5",
            "required": true,
            "order": 1
          },
          {
            "id": "q23",
            "text": "Использование наглядных и дидактических материалов",
            "type": "scale_1_5",
            "required": true,
            "order": 2
          },
          {
            "id": "q24",
            "text": "Применение дифференцированного подхода к ученицам",
            "type": "scale_1_5",
            "required": true,
            "order": 3
          }
        ]
      },
      {
        "id": "block_8",
        "title": "Завершение урока",
        "order": 8,
        "questions": [
          {
            "id": "q25",
            "text": "Качество подведения итогов урока",
            "type": "scale_1_5",
            "required": true,
            "order": 1
          },
          {
            "id": "q26",
            "text": "Соответствие завершения урока поставленным целям",
            "type": "scale_1_5",
            "required": true,
            "order": 2
          },
          {
            "id": "q27",
            "text": "Задание домашней работы и разъяснение требований",
            "type": "scale_1_5",
            "required": false,
            "order": 3
          },
          {
            "id": "q28",
            "text": "Завершение урока в установленное время",
            "type": "scale_1_5",
            "required": true,
            "order": 4
          }
        ]
      },
      {
        "id": "block_9",
        "title": "Оценка и обратная связь",
        "order": 9,
        "type": "summary",
        "questions": [
          {
            "id": "q29",
            "text": "Сильные стороны урока",
            "type": "text_long",
            "required": true,
            "order": 1,
            "maps_to": "strengths"
          },
          {
            "id": "q30",
            "text": "Зоны для роста и улучшения",
            "type": "text_long",
            "required": true,
            "order": 2,
            "maps_to": "areas_for_improvement"
          },
          {
            "id": "q31",
            "text": "Рекомендации и конкретные шаги для улучшения",
            "type": "text_long",
            "required": true,
            "order": 3,
            "maps_to": "action_item"
          },
          {
            "id": "q32",
            "text": "Общая оценка урока",
            "type": "scale_1_5",
            "required": true,
            "order": 4,
            "maps_to": "overall_rating"
          },
          {
            "id": "q33",
            "text": "Комментарий преподавателя к проверке",
            "type": "text_long",
            "required": false,
            "order": 5,
            "maps_to": "teacher_feedback"
          }
        ]
      }
    ]
  }
  $template$::jsonb,
  true
)) AS v(name, description, structure, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM quality_check_templates WHERE name = 'Проверка урока (полная)'
);


-- ─────────────────────────────────────────────────────────
-- 20260510000000_add_feature_privileges.sql
-- ─────────────────────────────────────────────────────────
-- Feature-level permissions for granular access control within modules

CREATE TABLE IF NOT EXISTS feature_privileges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code   TEXT NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  module_code TEXT NOT NULL,
  feature_code TEXT NOT NULL,
  can_view    BOOLEAN DEFAULT false,
  can_create  BOOLEAN DEFAULT false,
  can_edit    BOOLEAN DEFAULT false,
  can_delete  BOOLEAN DEFAULT false,
  UNIQUE(role_code, module_code, feature_code)
);

CREATE INDEX IF NOT EXISTS idx_feature_privileges_role   ON feature_privileges(role_code);
CREATE INDEX IF NOT EXISTS idx_feature_privileges_module ON feature_privileges(module_code, feature_code);

-- Default superadmin grants for quality_control features
INSERT INTO feature_privileges (role_code, module_code, feature_code, can_view, can_create, can_edit, can_delete)
VALUES
  ('superadmin', 'quality_control', 'planned',   true, true, true, true),
  ('superadmin', 'quality_control', 'history',   true, true, true, true),
  ('superadmin', 'quality_control', 'templates', true, true, true, true)
ON CONFLICT (role_code, module_code, feature_code) DO NOTHING;


-- ─────────────────────────────────────────────────────────
-- 20260510222518_create_cities_reference.sql
-- ─────────────────────────────────────────────────────────
-- Migration: cities reference table
-- Replaces hardcoded CITIES_BY_COUNTRY in lib/geo.ts with editable DB rows.

CREATE TABLE IF NOT EXISTS reference_cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (country, city)
);

CREATE INDEX IF NOT EXISTS idx_reference_cities_country ON reference_cities(country);

-- Seed from existing CITIES_BY_COUNTRY (idempotent via ON CONFLICT)
INSERT INTO reference_cities (country, city) VALUES
-- Israel (40)
('Израиль', 'Иерусалим'), ('Израиль', 'Тель-Авив'), ('Израиль', 'Хайфа'),
('Израиль', 'Ришон-ле-Цион'), ('Израиль', 'Петах-Тиква'), ('Израиль', 'Ашдод'),
('Израиль', 'Нетания'), ('Израиль', 'Беэр-Шева'), ('Израиль', 'Бней-Брак'),
('Израиль', 'Холон'), ('Израиль', 'Рамат-Ган'), ('Израиль', 'Ашкелон'),
('Израиль', 'Бат-Ям'), ('Израиль', 'Реховот'), ('Израиль', 'Герцлия'),
('Израиль', 'Кфар-Саба'), ('Израиль', 'Хадера'), ('Израиль', 'Модиин'),
('Израиль', 'Назарет'), ('Израиль', 'Рамла'), ('Израиль', 'Лод'),
('Израиль', 'Нагария'), ('Израиль', 'Тверия'), ('Израиль', 'Кармиэль'),
('Израиль', 'Эйлат'), ('Израиль', 'Акко'), ('Израиль', 'Умм-эль-Фахм'),
('Израиль', 'Тайбе'), ('Израиль', 'Сахнин'), ('Израиль', 'Арад'),
('Израиль', 'Димона'), ('Израиль', 'Офаким'), ('Израиль', 'Кирьят-Ям'),
('Израиль', 'Кирьят-Моцкин'), ('Израиль', 'Кирьят-Шмона'), ('Израиль', 'Йокнеам'),
('Израиль', 'Маале-Адумим'), ('Израиль', 'Бейт-Шемеш'), ('Израиль', 'Ор-Иехуда'),
('Израиль', 'Цфат'),
-- Russia (27)
('Россия', 'Москва'), ('Россия', 'Санкт-Петербург'), ('Россия', 'Новосибирск'),
('Россия', 'Екатеринбург'), ('Россия', 'Казань'), ('Россия', 'Нижний Новгород'),
('Россия', 'Челябинск'), ('Россия', 'Самара'), ('Россия', 'Омск'),
('Россия', 'Ростов-на-Дону'), ('Россия', 'Уфа'), ('Россия', 'Красноярск'),
('Россия', 'Воронеж'), ('Россия', 'Пермь'), ('Россия', 'Волгоград'),
('Россия', 'Краснодар'), ('Россия', 'Саратов'), ('Россия', 'Тюмень'),
('Россия', 'Ижевск'), ('Россия', 'Барнаул'), ('Россия', 'Ярославль'),
('Россия', 'Владивосток'), ('Россия', 'Иркутск'), ('Россия', 'Хабаровск'),
('Россия', 'Махачкала'), ('Россия', 'Оренбург'), ('Россия', 'Томск'),
-- USA (22)
('США', 'Нью-Йорк'), ('США', 'Лос-Анджелес'), ('США', 'Чикаго'),
('США', 'Хьюстон'), ('США', 'Финикс'), ('США', 'Филадельфия'),
('США', 'Сан-Антонио'), ('США', 'Сан-Диего'), ('США', 'Даллас'),
('США', 'Сан-Хосе'), ('США', 'Остин'), ('США', 'Джексонвилл'),
('США', 'Сан-Франциско'), ('США', 'Шарлотт'), ('США', 'Индианаполис'),
('США', 'Сиэтл'), ('США', 'Денвер'), ('США', 'Бостон'),
('США', 'Майами'), ('США', 'Атланта'), ('США', 'Лас-Вегас'), ('США', 'Портленд'),
-- Ukraine (15)
('Украина', 'Киев'), ('Украина', 'Харьков'), ('Украина', 'Одесса'),
('Украина', 'Днепр'), ('Украина', 'Запорожье'), ('Украина', 'Львов'),
('Украина', 'Кривой Рог'), ('Украина', 'Николаев'), ('Украина', 'Винница'),
('Украина', 'Херсон'), ('Украина', 'Полтава'), ('Украина', 'Черновцы'),
('Украина', 'Хмельницкий'), ('Украина', 'Черкассы'), ('Украина', 'Житомир'),
-- Belarus (10)
('Беларусь', 'Минск'), ('Беларусь', 'Гомель'), ('Беларусь', 'Могилёв'),
('Беларусь', 'Витебск'), ('Беларусь', 'Гродно'), ('Беларусь', 'Брест'),
('Беларусь', 'Бобруйск'), ('Беларусь', 'Барановичи'), ('Беларусь', 'Борисов'),
('Беларусь', 'Пинск'),
-- Kazakhstan (10)
('Казахстан', 'Алматы'), ('Казахстан', 'Астана'), ('Казахстан', 'Шымкент'),
('Казахстан', 'Актобе'), ('Казахстан', 'Тараз'), ('Казахстан', 'Павлодар'),
('Казахстан', 'Усть-Каменогорск'), ('Казахстан', 'Семей'), ('Казахстан', 'Атырау'),
('Казахстан', 'Костанай'),
-- Germany (15)
('Германия', 'Берлин'), ('Германия', 'Гамбург'), ('Германия', 'Мюнхен'),
('Германия', 'Кёльн'), ('Германия', 'Франкфурт'), ('Германия', 'Штутгарт'),
('Германия', 'Дюссельдорф'), ('Германия', 'Дортмунд'), ('Германия', 'Эссен'),
('Германия', 'Лейпциг'), ('Германия', 'Бремен'), ('Германия', 'Дрезден'),
('Германия', 'Ганновер'), ('Германия', 'Нюрнберг'), ('Германия', 'Дуйсбург'),
-- France (15)
('Франция', 'Париж'), ('Франция', 'Марсель'), ('Франция', 'Лион'),
('Франция', 'Тулуза'), ('Франция', 'Ницца'), ('Франция', 'Нант'),
('Франция', 'Страсбург'), ('Франция', 'Монпелье'), ('Франция', 'Бордо'),
('Франция', 'Лилль'), ('Франция', 'Ренн'), ('Франция', 'Реймс'),
('Франция', 'Гавр'), ('Франция', 'Гренобль'), ('Франция', 'Дижон'),
-- UK (15)
('Великобритания', 'Лондон'), ('Великобритания', 'Бирмингем'), ('Великобритания', 'Манчестер'),
('Великобритания', 'Лидс'), ('Великобритания', 'Глазго'), ('Великобритания', 'Ливерпуль'),
('Великобритания', 'Ньюкасл'), ('Великобритания', 'Шеффилд'), ('Великобритания', 'Бристоль'),
('Великобритания', 'Эдинбург'), ('Великобритания', 'Лестер'), ('Великобритания', 'Белфаст'),
('Великобритания', 'Ковентри'), ('Великобритания', 'Брайтон'), ('Великобритания', 'Кардифф'),
-- Canada (15)
('Канада', 'Торонто'), ('Канада', 'Монреаль'), ('Канада', 'Ванкувер'),
('Канада', 'Калгари'), ('Канада', 'Эдмонтон'), ('Канада', 'Оттава'),
('Канада', 'Виннипег'), ('Канада', 'Квебек'), ('Канада', 'Гамильтон'),
('Канада', 'Китченер'), ('Канада', 'Лондон'), ('Канада', 'Виктория'),
('Канада', 'Галифакс'), ('Канада', 'Саскатун'), ('Канада', 'Реджайна'),
-- Australia (11)
('Австралия', 'Сидней'), ('Австралия', 'Мельбурн'), ('Австралия', 'Брисбен'),
('Австралия', 'Перт'), ('Австралия', 'Аделаида'), ('Австралия', 'Голд-Кост'),
('Австралия', 'Канберра'), ('Австралия', 'Ньюкасл'), ('Австралия', 'Хобарт'),
('Австралия', 'Дарвин'), ('Австралия', 'Сансшайн-Кост'),
-- Argentina (10)
('Аргентина', 'Буэнос-Айрес'), ('Аргентина', 'Кордова'), ('Аргентина', 'Росарио'),
('Аргентина', 'Мендоса'), ('Аргентина', 'Ла-Плата'), ('Аргентина', 'Сальта'),
('Аргентина', 'Мар-дель-Плата'), ('Аргентина', 'Санта-Фе'), ('Аргентина', 'Сан-Хуан'),
('Аргентина', 'Тукуман'),
-- Brazil (10)
('Бразилия', 'Сан-Паулу'), ('Бразилия', 'Рио-де-Жанейро'), ('Бразилия', 'Бразилиа'),
('Бразилия', 'Салвадор'), ('Бразилия', 'Форталеза'), ('Бразилия', 'Белу-Оризонти'),
('Бразилия', 'Манаус'), ('Бразилия', 'Куритиба'), ('Бразилия', 'Ресифи'),
('Бразилия', 'Порту-Алегри'),
-- Georgia (6)
('Грузия', 'Тбилиси'), ('Грузия', 'Кутаиси'), ('Грузия', 'Батуми'),
('Грузия', 'Рустави'), ('Грузия', 'Гори'), ('Грузия', 'Зугдиди'),
-- Armenia (5)
('Армения', 'Ереван'), ('Армения', 'Гюмри'), ('Армения', 'Ванадзор'),
('Армения', 'Вагаршапат'), ('Армения', 'Абовян'),
-- Azerbaijan (5)
('Азербайджан', 'Баку'), ('Азербайджан', 'Гянджа'), ('Азербайджан', 'Сумгайыт'),
('Азербайджан', 'Мингечевир'), ('Азербайджан', 'Нахчыван'),
-- Uzbekistan (6)
('Узбекистан', 'Ташкент'), ('Узбекистан', 'Самарканд'), ('Узбекистан', 'Наманган'),
('Узбекистан', 'Андижан'), ('Узбекистан', 'Фергана'), ('Узбекистан', 'Бухара'),
-- Turkey (10)
('Турция', 'Стамбул'), ('Турция', 'Анкара'), ('Турция', 'Измир'),
('Турция', 'Бурса'), ('Турция', 'Анталья'), ('Турция', 'Адана'),
('Турция', 'Конья'), ('Турция', 'Газиантеп'), ('Турция', 'Мерсин'),
('Турция', 'Диярбакыр'),
-- India (10)
('Индия', 'Мумбаи'), ('Индия', 'Дели'), ('Индия', 'Бангалор'),
('Индия', 'Хайдарабад'), ('Индия', 'Ченнаи'), ('Индия', 'Колката'),
('Индия', 'Пуне'), ('Индия', 'Джайпур'), ('Индия', 'Ахмадабад'),
('Индия', 'Сурат'),
-- China (10)
('Китай', 'Пекин'), ('Китай', 'Шанхай'), ('Китай', 'Гуанчжоу'),
('Китай', 'Шэньчжэнь'), ('Китай', 'Чэнду'), ('Китай', 'Тяньцзинь'),
('Китай', 'Ухань'), ('Китай', 'Сиань'), ('Китай', 'Нанкин'),
('Китай', 'Ханчжоу'),
-- Spain (10)
('Испания', 'Мадрид'), ('Испания', 'Барселона'), ('Испания', 'Валенсия'),
('Испания', 'Севилья'), ('Испания', 'Сарагоса'), ('Испания', 'Малага'),
('Испания', 'Мурсия'), ('Испания', 'Пальма'), ('Испания', 'Бильбао'),
('Испания', 'Аликанте'),
-- Italy (10)
('Италия', 'Рим'), ('Италия', 'Милан'), ('Италия', 'Неаполь'),
('Италия', 'Турин'), ('Италия', 'Палермо'), ('Италия', 'Генуя'),
('Италия', 'Болонья'), ('Италия', 'Флоренция'), ('Италия', 'Венеция'),
('Италия', 'Верона'),
-- Poland (10)
('Польша', 'Варшава'), ('Польша', 'Краков'), ('Польша', 'Лодзь'),
('Польша', 'Вроцлав'), ('Польша', 'Познань'), ('Польша', 'Гданьск'),
('Польша', 'Щецин'), ('Польша', 'Быдгощ'), ('Польша', 'Люблин'),
('Польша', 'Катовице')
ON CONFLICT (country, city) DO NOTHING;


-- ─────────────────────────────────────────────────────────
-- 20260511000343_create_tasks_module.sql
-- ─────────────────────────────────────────────────────────
-- ─────────────────────────────────────────────────────────────────────────────
-- Tasks module — единая система задач для всего кампуса (MVP+)
--
-- Покрывает три режима назначения:
--   • себе                   (assignee_type='person', assignee_id=self)
--   • другому человеку       (assignee_type='person', assignee_id=other)
--   • в пул отдела           (assignee_type='department', department_id=X)
--
-- Поддерживает: комментарии, наблюдателей (watchers), историю смены статуса.
-- Не входит в MVP+: recurrence, подзадачи, шаблоны задач, файлы, уведомления.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────
-- 1. TASKS (основная таблица)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Содержимое
  title         TEXT NOT NULL,
  description   TEXT,

  -- Контекст создания.
  -- module = откуда задача (общая доска, форма лида, форма сотрудника, и т.д.)
  -- metadata = ссылки на связанные сущности, специфичные для модуля-источника.
  -- Примеры metadata:
  --   { "lead_id": "uuid" }                       — задача из карточки лида
  --   { "employee_id": "uuid" }                   — задача из карточки сотрудника
  --   { "quality_check_id": "uuid" }              — задача из проверки качества
  --   { }                                          — задача с общей доски
  module        TEXT NOT NULL DEFAULT 'general'
                  CHECK (module IN ('general','education','staff','quality_control')),
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Назначение
  assignee_type TEXT NOT NULL DEFAULT 'person'
                  CHECK (assignee_type IN ('person','department')),
  assignee_id   UUID REFERENCES persons(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,

  -- Автор задачи
  creator_id    UUID NOT NULL REFERENCES persons(id),

  -- Статус.
  --   unassigned  — задача в пуле отдела, никто не взял
  --   pending     — назначена, ожидает начала работы
  --   in_progress — исполнитель работает
  --   review      — отдана на проверку автору
  --   completed   — выполнена
  --   cancelled   — отменена автором
  --   declined    — исполнитель отказался (возвращается автору)
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('unassigned','pending','in_progress',
                                    'review','completed','cancelled','declined')),

  -- Приоритет
  priority      TEXT NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low','normal','high','urgent')),

  -- Сроки.
  -- Три поля вместо одного timestamp:
  --   due_date     — дата дедлайна (NULL = без срока)
  --   due_time     — конкретное время (NULL = весь день)
  --   due_all_day  — true когда время не важно (дублирует due_time IS NULL,
  --                  но удобно для UI-логики и фильтров)
  due_date      DATE,
  due_time      TIME,
  due_all_day   BOOLEAN NOT NULL DEFAULT TRUE,

  -- Когда задачу взяли из пула отдела (NULL для задач не из пула).
  claimed_at    TIMESTAMPTZ,

  -- Таймстемпы
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,

  -- ─── Бизнес-правила ─────────────────────────

  -- 1) Согласованность assignee_type с заполненностью полей:
  --    'person'     требует assignee_id, department_id опционален (но обычно NULL)
  --    'department' требует department_id
  CONSTRAINT tasks_assignee_consistency CHECK (
    (assignee_type = 'person'     AND assignee_id IS NOT NULL)
    OR
    (assignee_type = 'department' AND department_id IS NOT NULL)
  ),

  -- 2) Статус 'unassigned' возможен только для задач в пуле отдела
  --    и подразумевает отсутствие конкретного исполнителя.
  CONSTRAINT tasks_unassigned_only_for_pool CHECK (
    (status = 'unassigned' AND assignee_type = 'department' AND assignee_id IS NULL)
    OR
    (status <> 'unassigned')
  ),

  -- 3) Согласованность due_time и due_all_day:
  --    due_all_day=true   ⇒ due_time должно быть NULL
  --    due_all_day=false  ⇒ due_time должно быть заполнено
  CONSTRAINT tasks_due_time_consistency CHECK (
    (due_all_day = TRUE  AND due_time IS NULL)
    OR
    (due_all_day = FALSE AND due_time IS NOT NULL)
  ),

  -- 4) Время дедлайна не может быть без даты
  CONSTRAINT tasks_due_time_requires_date CHECK (
    due_time IS NULL OR due_date IS NOT NULL
  )
);


-- ─── Триггер защиты: исполнитель должен иметь активный аккаунт ──────────────
-- Не позволяет назначить задачу на person'а, у которого нет person_account
-- или у которого account деактивирован. creator_id тоже проверяется.

CREATE OR REPLACE FUNCTION tasks_validate_account()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Проверка автора (всегда обязателен)
  IF NOT EXISTS (
    SELECT 1 FROM person_accounts
    WHERE person_id = NEW.creator_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'creator_id % does not have an active person_account', NEW.creator_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Проверка исполнителя (только если назначен)
  IF NEW.assignee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM person_accounts
    WHERE person_id = NEW.assignee_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'assignee_id % does not have an active person_account', NEW.assignee_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_validate_account_trigger
  BEFORE INSERT OR UPDATE OF assignee_id, creator_id ON tasks
  FOR EACH ROW EXECUTE FUNCTION tasks_validate_account();


-- ─── Триггер автообновления updated_at ──────────────────────────────────────

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─── Индексы для типовых выборок ────────────────────────────────────────────

-- "Назначенные мне" + сортировка по дате создания
CREATE INDEX idx_tasks_assignee_status
  ON tasks(assignee_id, status, created_at DESC)
  WHERE assignee_id IS NOT NULL;

-- "Мои задачи" (где я автор)
CREATE INDEX idx_tasks_creator_status
  ON tasks(creator_id, status, created_at DESC);

-- "Пул отдела" — задачи без исполнителя в моих отделах
CREATE INDEX idx_tasks_department_pool
  ON tasks(department_id, status, priority, due_date)
  WHERE status = 'unassigned';

-- Фильтр по модулю на общей доске
CREATE INDEX idx_tasks_module ON tasks(module, status, created_at DESC);

-- Поиск просроченных
CREATE INDEX idx_tasks_due_date ON tasks(due_date)
  WHERE status NOT IN ('completed','cancelled');


-- ─────────────────────────────────────────────
-- 2. TASK_COMMENTS (комментарии к задачам)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES persons(id),

  content     TEXT NOT NULL,

  -- Тип комментария.
  -- 'comment'        — обычный комментарий
  -- 'decline_reason' — причина отказа от выполнения (status → declined)
  -- 'status_note'    — заметка при смене статуса
  comment_type TEXT NOT NULL DEFAULT 'comment'
                  CHECK (comment_type IN ('comment','decline_reason','status_note')),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_comments_task ON task_comments(task_id, created_at);


-- ─────────────────────────────────────────────
-- 3. TASK_WATCHERS (наблюдатели за задачей)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_watchers (
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  person_id  UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  added_by   UUID REFERENCES persons(id),
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (task_id, person_id)
);

-- Обратный индекс: "за какими задачами я слежу"
CREATE INDEX idx_task_watchers_person ON task_watchers(person_id);


-- ─────────────────────────────────────────────
-- 4. TASK_STATUS_HISTORY (история смены статусов)
-- ─────────────────────────────────────────────

-- Лёгкая версия аудит-лога: фиксируем только смену статуса и автора смены.
-- Заполняется из API-кода (Supabase не передаёт current_user в триггерах),
-- но валидируется триггером — нельзя вставить запись с from_status,
-- не совпадающим с текущим статусом задачи (защита от рассинхрона).

CREATE TABLE IF NOT EXISTS task_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id    UUID NOT NULL REFERENCES persons(id),

  from_status TEXT,
  to_status   TEXT NOT NULL,
  note        TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_status_history_task ON task_status_history(task_id, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ПРИВИЛЕГИИ
--
-- Модуль 'tasks' доступен по факту наличия активного person_account —
-- проверка делается в коде middleware, без записей в role_privileges.
--
-- В каталоге module_privileges остаётся одна запись 'delete' как формальная
-- отметка "в этом модуле существует операция удаления". В role_privileges
-- никому не раздаётся: право удаления = "автор задачи ИЛИ суперадмин"
-- реализуется в API-обработчике DELETE /api/tasks/:id.
--
-- Удаляем неиспользуемые привилегии из 002_roles_and_privileges.sql
-- (view_own, view_all, create, assign): они зарезервированы исторически,
-- но не используются в логике модуля.
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM module_privileges
WHERE module = 'tasks' AND privilege_code IN ('view_own','view_all','create','assign');

-- Убедимся, что 'delete' существует (на случай если его нет в каталоге).
INSERT INTO module_privileges (module, privilege_code, privilege_name, description, sort_order)
VALUES ('tasks', 'delete', 'Удаление задач', 'Право безвозвратно удалить задачу', 1)
ON CONFLICT (module, privilege_code) DO NOTHING;


-- ─────────────────────────────────────────────────────────
-- 20260511105850_add_tasks_recurrence.sql
-- ─────────────────────────────────────────────────────────
-- ─────────────────────────────────────────────────────────────────────────────
-- Tasks recurrence — поддержка серий повторяющихся задач (подход F).
--
-- Регулярная задача не имеет отдельной "сущности шаблона" в БД.
-- Вместо этого при создании генерируется массив реальных задач,
-- объединённых общим recurrence_series_id. Каждая задача в серии
-- знает своё правило (recurrence_rule) и порядковый номер (recurrence_position).
--
-- Структура recurrence_rule (JSONB):
--   {
--     "frequency": "daily" | "weekly" | "monthly" | "yearly",
--     "time": "HH:MM" | null,           -- для daily: время каждого дня
--     "weekdays": [1,3,5] | null,       -- для weekly: 1=Пн..7=Вс (ISO)
--     "monthly_day": 1..31 | null,      -- для monthly
--     "yearly_month": 1..12 | null,     -- для yearly
--     "yearly_day": 1..31 | null,       -- для yearly
--     "end_type": "never" | "until_date" | "after_count",
--     "end_date": "YYYY-MM-DD" | null,  -- для until_date
--     "end_after_count": 1..N | null    -- для after_count
--   }
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurrence_series_id UUID,
  ADD COLUMN IF NOT EXISTS recurrence_rule JSONB,
  ADD COLUMN IF NOT EXISTS recurrence_position INTEGER;

COMMENT ON COLUMN tasks.recurrence_series_id IS
  'UUID серии повторяющихся задач. NULL для разовых задач. Общий для всех экземпляров одной серии.';
COMMENT ON COLUMN tasks.recurrence_rule IS
  'Правило повторения (frequency, end_type, etc). Копируется в каждый экземпляр серии для самодостаточности.';
COMMENT ON COLUMN tasks.recurrence_position IS
  'Порядковый номер задачи в серии (1, 2, 3...). NULL для разовых.';

-- Согласованность полей recurrence:
-- Все три поля либо все NULL (разовая задача), либо все NOT NULL (часть серии)
ALTER TABLE tasks
  ADD CONSTRAINT tasks_recurrence_consistency CHECK (
    (recurrence_series_id IS NULL AND recurrence_rule IS NULL AND recurrence_position IS NULL)
    OR
    (recurrence_series_id IS NOT NULL AND recurrence_rule IS NOT NULL AND recurrence_position IS NOT NULL)
  );

-- Индекс для быстрого поиска задач серии (DELETE по series_id, отображение серии)
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_series
  ON tasks(recurrence_series_id)
  WHERE recurrence_series_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────
-- 20260511115733_create_education_tables.sql
-- ─────────────────────────────────────────────────────────
-- ─────────────────────────────────────────────────────────────────────────────
-- Education module — учебная часть (MVP без семестров и расписания)
--
-- Архитектура:
--   subjects          — справочник предметов
--   study_groups      — базовые группы студентов ("1 курс А")
--   students          — реестр студентов (FK на persons, FK на main study_group)
--   class_groups      — учебные группы (конкретный предмет + преподаватель)
--   class_enrollments — записи студентов в учебные группы (many-to-many)
--
-- Преподаватель = person с person_roles.role_code='teacher'.
-- Отдельной таблицы teachers не создаём.
--
-- НЕ входит в эту миграцию: семестры, расписание, посещаемость, оценки.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────
-- 1. SUBJECTS (справочник предметов)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  name_he     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT subjects_name_unique UNIQUE (name)
);

CREATE TRIGGER subjects_updated_at
  BEFORE UPDATE ON subjects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_subjects_active_sort ON subjects(is_active, sort_order, name);


-- ─────────────────────────────────────────────
-- 2. STUDY_GROUPS (базовые группы)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS study_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  name_he     TEXT,
  year_level  INTEGER,                    -- 1, 2, 3... (опционально, для сортировки)
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT study_groups_name_unique UNIQUE (name)
);

CREATE TRIGGER study_groups_updated_at
  BEFORE UPDATE ON study_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_study_groups_active ON study_groups(is_active, year_level, name);


-- ─────────────────────────────────────────────
-- 3. STUDENTS (реестр студентов)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS students (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id       UUID NOT NULL UNIQUE REFERENCES persons(id) ON DELETE CASCADE,
  main_group_id   UUID REFERENCES study_groups(id) ON DELETE SET NULL,

  -- Статус.
  --   active     — учится
  --   on_leave   — академический отпуск
  --   graduated  — выпустился
  --   expelled   — отчислен
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','on_leave','graduated','expelled')),

  enrolled_at     DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_students_main_group ON students(main_group_id, status)
  WHERE main_group_id IS NOT NULL;
CREATE INDEX idx_students_status ON students(status) WHERE status = 'active';


-- ─────────────────────────────────────────────
-- 4. CLASS_GROUPS (учебные группы)
-- ─────────────────────────────────────────────

-- Конкретная группа по конкретному предмету у конкретного преподавателя.
-- Например: "Талмуд А (Рав Кацнельсон)", "Иврит-3 продвинутый".

CREATE TABLE IF NOT EXISTS class_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  subject_id  UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  teacher_id  UUID NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER class_groups_updated_at
  BEFORE UPDATE ON class_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Индексы под типовые выборки
CREATE INDEX idx_class_groups_subject ON class_groups(subject_id, is_active);
CREATE INDEX idx_class_groups_teacher ON class_groups(teacher_id, is_active);
CREATE INDEX idx_class_groups_active ON class_groups(is_active, name);


-- ─────────────────────────────────────────────
-- 5. CLASS_ENROLLMENTS (записи студентов в учебные группы)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS class_enrollments (
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_group_id  UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (student_id, class_group_id)
);

-- Обратный индекс: "кто в этой учебной группе"
CREATE INDEX idx_class_enrollments_class ON class_enrollments(class_group_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ПРИВИЛЕГИИ (минимум, без раздачи ролям)
--
-- Модуль 'education' уже зарегистрирован в module_privileges (см. миграцию 002).
-- Сейчас просто убеждаемся, что для него есть привилегия 'manage_education_data'
-- — на управление справочниками (предметы, группы, студенты).
-- Раздача ролям делается отдельно через UI Настроек.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO module_privileges (module, privilege_code, privilege_name, description, sort_order)
VALUES ('education', 'manage_education_data', 'Управление учебными данными',
        'Создавать/изменять предметы, группы, студентов', 10)
ON CONFLICT (module, privilege_code) DO NOTHING;


-- ─────────────────────────────────────────────────────────
-- 20260511142109_extend_education_tables.sql
-- ─────────────────────────────────────────────────────────
-- ─────────────────────────────────────────────────────────────────────────────
-- Education Stage 1 — расширение схемы для:
--   • привязки к departments (subjects, study_groups, class_groups, students)
--   • специальностей (Реклама/PR, Экономика — для Университета и Колледжа)
--   • расширения class_groups (уровень, период, лимит)
--   • many-to-many преподавателей с учебными группами
--
-- Все базовые таблицы Education пустые — миграция без переходных NULL→NOT NULL.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────
-- 1. SPECIALTIES (справочник специальностей)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS specialties (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  name          TEXT NOT NULL,
  name_he       TEXT,
  code          TEXT,                    -- опционально, короткий код (например "PR")
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Уникальность имени в рамках подразделения
  CONSTRAINT specialties_dept_name_unique UNIQUE (department_id, name)
);

CREATE TRIGGER specialties_updated_at
  BEFORE UPDATE ON specialties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_specialties_department ON specialties(department_id, is_active, sort_order);


-- ─────────────────────────────────────────────
-- 2. SUBJECTS — добавляем department_id (NOT NULL)
-- ─────────────────────────────────────────────

ALTER TABLE subjects
  ADD COLUMN department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT;

CREATE INDEX idx_subjects_department ON subjects(department_id, is_active, sort_order);


-- ─────────────────────────────────────────────
-- 3. STUDY_GROUPS — добавляем department_id, specialty_id, year_start
-- ─────────────────────────────────────────────

ALTER TABLE study_groups
  ADD COLUMN department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  ADD COLUMN specialty_id  UUID REFERENCES specialties(id) ON DELETE SET NULL,
  ADD COLUMN year_start    INTEGER;

-- Бизнес-правило: если specialty_id задан, его department_id должен совпадать
-- с department_id группы. Проверим в API, на уровне БД не делаем (требует триггера).

CREATE INDEX idx_study_groups_department ON study_groups(department_id, is_active);
CREATE INDEX idx_study_groups_specialty ON study_groups(specialty_id)
  WHERE specialty_id IS NOT NULL;


-- ─────────────────────────────────────────────
-- 4. STUDENTS — добавляем primary_department_id, specialty_id, year_level, year_start
-- ─────────────────────────────────────────────

ALTER TABLE students
  ADD COLUMN primary_department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  ADD COLUMN specialty_id          UUID REFERENCES specialties(id) ON DELETE SET NULL,
  ADD COLUMN year_level             INTEGER,
  ADD COLUMN year_start             INTEGER;

CREATE INDEX idx_students_primary_department ON students(primary_department_id, status);
CREATE INDEX idx_students_specialty ON students(specialty_id)
  WHERE specialty_id IS NOT NULL;


-- ─────────────────────────────────────────────
-- 5. CLASS_GROUPS — добавляем department_id, level, period_start, period_end, max_participants
-- ─────────────────────────────────────────────

ALTER TABLE class_groups
  ADD COLUMN department_id    UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  ADD COLUMN level             TEXT,
  ADD COLUMN period_start      DATE,
  ADD COLUMN period_end        DATE,
  ADD COLUMN max_participants  INTEGER;

-- Если оба указаны — period_end должен быть после period_start
ALTER TABLE class_groups
  ADD CONSTRAINT class_groups_period_consistency CHECK (
    period_start IS NULL OR period_end IS NULL OR period_end >= period_start
  );

-- max_participants должен быть положительным
ALTER TABLE class_groups
  ADD CONSTRAINT class_groups_max_participants_positive CHECK (
    max_participants IS NULL OR max_participants > 0
  );

CREATE INDEX idx_class_groups_department ON class_groups(department_id, is_active);


-- ─────────────────────────────────────────────
-- 6. CLASS_TEACHERS (преподаватели учебных групп, many-to-many)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS class_teachers (
  class_group_id  UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by        UUID REFERENCES persons(id) ON DELETE SET NULL,
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,  -- основной преподаватель группы (один)

  PRIMARY KEY (class_group_id, teacher_id)
);

-- Обратный индекс: "у каких групп этот преподаватель"
CREATE INDEX idx_class_teachers_teacher ON class_teachers(teacher_id);

-- Гарантируем максимум одного is_primary=true на группу через unique partial index
CREATE UNIQUE INDEX idx_class_teachers_primary_per_group
  ON class_teachers(class_group_id)
  WHERE is_primary = TRUE;


-- ─────────────────────────────────────────────────────────
-- 20260511175354_education_privileges.sql
-- ─────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────
-- 20260511210517_drop_class_groups_teacher_id.sql
-- ─────────────────────────────────────────────────────────
-- ─────────────────────────────────────────────────────────────────────────────
-- Удаление legacy-колонки class_groups.teacher_id
--
-- Эта колонка была в первой версии схемы Education (когда у группы был
-- один преподаватель). Позже добавили class_teachers many-to-many, и
-- teacher_id стал дублем данных. Сейчас поле используется только в POST
-- /api/education/class-groups как teacher_ids[0]. Удаляем колонку и работаем
-- только через class_teachers.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE class_groups DROP COLUMN teacher_id;


-- ─────────────────────────────────────────────────────────
-- 20260511211428_drop_class_groups_max_participants.sql
-- ─────────────────────────────────────────────────────────
-- ─────────────────────────────────────────────────────────────────────────────
-- Удаление поля class_groups.max_participants
--
-- Поле было добавлено в миграции расширения, но в бизнес-логике не используется.
-- Удаляем для чистоты схемы (по аналогии с предыдущим удалением teacher_id).
-- При необходимости можно вернуть отдельной миграцией.
-- ─────────────────────────────────────────────────────────────────────────────

-- CHECK constraint тоже удалится автоматически вместе с колонкой
ALTER TABLE class_groups DROP COLUMN max_participants;


-- ─────────────────────────────────────────────────────────
-- 20260511231004_quality_checks_class_group.sql
-- ─────────────────────────────────────────────────────────
-- Link quality_checks to class_groups from Education module
ALTER TABLE quality_checks
  ADD COLUMN class_group_id UUID REFERENCES class_groups(id) ON DELETE SET NULL;

COMMENT ON COLUMN quality_checks.class_group_id IS
  'Учебная группа из модуля Образование. group_name и course_name остаются как снимок (если группу удалят).';

CREATE INDEX idx_quality_checks_class_group ON quality_checks(class_group_id)
  WHERE class_group_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────
-- 20260512162314_education_journeys_part1_create.sql
-- ─────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════════════
-- Education Journeys: переход от applicant_profiles к модели "один
-- person → много journeys". Шаг 1: создать новое, ничего не удалять.
--
-- После применения этого файла старые таблицы (enrollments, students,
-- lead_interests) ОСТАЮТСЯ. Удаляет их Файл 2 после проверки кода.
-- ═════════════════════════════════════════════════════════════════════


-- ─── 1. Восстановить reference_cities (была удалена) ─────────────────
CREATE TABLE IF NOT EXISTS reference_cities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country     TEXT NOT NULL,
  city        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (country, city)
);

COMMENT ON TABLE reference_cities IS
  'Справочник городов по странам. Используется в формах общин, адресов.';


-- ─── 2. Справочник общин communities ─────────────────────────────────
CREATE TABLE communities (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  name_he                TEXT,
  country                TEXT NOT NULL,
  city                   TEXT NOT NULL,
  default_contact_name   TEXT,
  default_contact_role   TEXT,
  default_contact_phone  TEXT,
  default_contact_email  TEXT,
  notes                  TEXT,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (name, city, country)
);

CREATE INDEX idx_communities_country_city ON communities(country, city);
CREATE INDEX idx_communities_active ON communities(is_active) WHERE is_active = true;

COMMENT ON TABLE communities IS
  'Справочник еврейских общин и организаций, через которые приходят лиды.';


-- ─── 3. Переименовать applicant_profiles → education_journeys ────────
ALTER TABLE applicant_profiles RENAME TO education_journeys;

-- Добавляем новые поля
ALTER TABLE education_journeys
  ADD COLUMN opened_at             DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN closed_at             DATE,

  -- Желаемое (заполняется на стадии лида/абитуриента)
  ADD COLUMN desired_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN desired_specialty_id  UUID REFERENCES specialties(id) ON DELETE SET NULL,

  -- Студенческие поля (заполняются когда становится студентом)
  ADD COLUMN primary_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN specialty_id          UUID REFERENCES specialties(id) ON DELETE SET NULL,
  ADD COLUMN main_group_id         UUID REFERENCES study_groups(id) ON DELETE SET NULL,
  ADD COLUMN year_level            INTEGER,
  ADD COLUMN year_start            INTEGER,
  ADD COLUMN enrolled_at           DATE;

-- Заполняем opened_at у существующих записей
UPDATE education_journeys SET opened_at = application_date WHERE application_date IS NOT NULL;

-- Partial unique index: у одного person+department только один активный journey
CREATE UNIQUE INDEX idx_education_journeys_active_per_dept
  ON education_journeys(person_id, desired_department_id)
  WHERE closed_at IS NULL AND desired_department_id IS NOT NULL;

CREATE INDEX idx_education_journeys_person ON education_journeys(person_id);
CREATE INDEX idx_education_journeys_status ON education_journeys(education_status);

COMMENT ON TABLE education_journeys IS
  'Учебная траектория человека через систему. Один person может иметь много journeys (повторное обучение, параллельные направления). Статус живёт в education_status.';


-- ─── 4. Связь journey ↔ communities (many-to-many) ───────────────────
CREATE TABLE journey_communities (
  journey_id     UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  community_id   UUID NOT NULL REFERENCES communities(id) ON DELETE RESTRICT,

  -- Контакт ДЛЯ ЭТОГО journey (может отличаться от default в communities)
  contact_name   TEXT,
  contact_role   TEXT,
  contact_phone  TEXT,
  contact_email  TEXT,
  notes          TEXT,

  added_at       TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (journey_id, community_id)
);

CREATE INDEX idx_journey_communities_journey   ON journey_communities(journey_id);
CREATE INDEX idx_journey_communities_community ON journey_communities(community_id);

COMMENT ON TABLE journey_communities IS
  'Связь journey с общинами. На один journey может быть несколько общин (привели через X, дополнительный контакт через Y). Контакт хранится в самой связи на случай если для этого journey контакт отличался от default-контакта общины.';


-- ─── 5. Документы journey (отдельная таблица) ────────────────────────
CREATE TABLE journey_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id      UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  document_type   TEXT NOT NULL,
  -- Возможные значения document_type (не enum, чтобы можно было добавлять):
  -- 'passport', 'school_diploma', 'medical_certificate', 'photo',
  -- 'application_letter', 'recommendation', 'other'

  status          TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'received' | 'verified' | 'rejected' | 'expired'

  file_url        TEXT,
  notes           TEXT,
  uploaded_at     TIMESTAMPTZ,
  uploaded_by     UUID REFERENCES persons(id) ON DELETE SET NULL,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_journey_documents_journey ON journey_documents(journey_id);
CREATE INDEX idx_journey_documents_type    ON journey_documents(document_type);

COMMENT ON TABLE journey_documents IS
  'Документы по journey. Опционально на стадии лида, обязательно (валидация на уровне кода) для абитуриента и далее.';


-- ─── 6. Поля в persons ───────────────────────────────────────────────
ALTER TABLE persons
  ADD COLUMN source             TEXT,
  ADD COLUMN source_details     TEXT,
  ADD COLUMN guardian_person_id UUID REFERENCES persons(id) ON DELETE SET NULL;

COMMENT ON COLUMN persons.source IS
  'Откуда узнал о кампусе в первый раз. Значения: social_media | friend | community | ad | event | other';

COMMENT ON COLUMN persons.guardian_person_id IS
  'Контактное лицо/опекун. Тот же тип persons, чтобы избежать дублирования контактных данных.';


-- ─── 7. Триггеры updated_at ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_communities_updated_at ON communities;
CREATE TRIGGER update_communities_updated_at
  BEFORE UPDATE ON communities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_journey_documents_updated_at ON journey_documents;
CREATE TRIGGER update_journey_documents_updated_at
  BEFORE UPDATE ON journey_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ─── ═══════════════════════════════════════════════════════════════ ─
-- Конец миграции Part 1.
--
-- НЕ удалено в этой миграции (это сделает Part 2 после проверки кода):
-- - Таблица students (заменяется journey со status='student')
-- - Таблица enrollments (legacy, не используется)
-- - Таблица lead_interests (заменяется FK desired_department/specialty)
-- - Поля education_journeys: institution, direction, level
-- - Поля education_journeys: community_contact_name/role/phone/email
-- - persons.education_status (статус живёт в journey)
-- - class_enrollments.student_id → переименовать в journey_id (большая операция)
-- ─── ═══════════════════════════════════════════════════════════════ ─


-- ─────────────────────────────────────────────────────────
-- 20260512180000_class_enrollments_to_journey.sql
-- ─────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════════════
-- Переключение class_enrollments со students на education_journeys
--
-- До:  student_id → students(id)
-- После: journey_id → education_journeys(id)
--
-- В class_enrollments сейчас 0 записей.
-- ═════════════════════════════════════════════════════════════════════

-- 1. Удалить старый FK
ALTER TABLE class_enrollments
  DROP CONSTRAINT IF EXISTS class_enrollments_student_id_fkey;

-- 2. Удалить составной PK (student_id, class_group_id)
ALTER TABLE class_enrollments
  DROP CONSTRAINT IF EXISTS class_enrollments_pkey;

-- 3. Переименовать колонку
ALTER TABLE class_enrollments
  RENAME COLUMN student_id TO journey_id;

-- 4. Новый FK → education_journeys
ALTER TABLE class_enrollments
  ADD CONSTRAINT class_enrollments_journey_id_fkey
    FOREIGN KEY (journey_id) REFERENCES education_journeys(id) ON DELETE CASCADE;

-- 5. Восстановить PK
ALTER TABLE class_enrollments
  ADD CONSTRAINT class_enrollments_pkey PRIMARY KEY (journey_id, class_group_id);

COMMENT ON COLUMN class_enrollments.journey_id IS
  'Journey (education_journeys) со status=student, записанный в учебную группу.';

-- ─── Проверка ────────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='class_enrollments'
-- ORDER BY ordinal_position;
-- → journey_id, class_group_id, enrolled_at
--
-- SELECT conname FROM pg_constraint
-- WHERE conrelid='class_enrollments'::regclass;
-- → class_enrollments_pkey, class_enrollments_journey_id_fkey,
--   class_enrollments_class_group_id_fkey (FK на class_groups)


-- ─────────────────────────────────────────────────────────
-- 20260512200000_create_person_relatives.sql
-- ─────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════════════
-- person_relatives — связи между людьми (семейные, контактные, опекуны).
--
-- Архитектурное решение: любой человеческий контакт = person с минимумом
-- полей (ФИО + телефон + email). Связь определяется отношением.
-- Один person может иметь несколько ролей (преподаватель + папа студента).
--
-- Типы отношений живут в коде (RelationType TS-enum), не в БД-enum, чтобы
-- было проще расширять.
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE person_relatives (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id      UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  relative_id    UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  relation_type  TEXT NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),

  -- Защита от self-reference
  CONSTRAINT person_relatives_no_self_ref CHECK (person_id <> relative_id),

  -- Уникальность: одна и та же роль одного и того же relative
  UNIQUE (person_id, relative_id, relation_type)
);

CREATE INDEX idx_person_relatives_person   ON person_relatives(person_id);
CREATE INDEX idx_person_relatives_relative ON person_relatives(relative_id);

COMMENT ON TABLE person_relatives IS
  'Связи между людьми: семейные, контактные, опекуны. Один person может иметь несколько ролей (например, преподаватель + папа студента).';

COMMENT ON COLUMN person_relatives.relation_type IS
  'Тип отношения: mother | father | parent | spouse | child | sibling | grandparent | guardian | community_contact | emergency_contact | other';


-- ─────────────────────────────────────────────────────────
-- 20260519230516_create_reference_positions.sql
-- ─────────────────────────────────────────────────────────
CREATE TABLE reference_positions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ru       TEXT NOT NULL,
  name_he       TEXT,
  category      TEXT NOT NULL CHECK (category IN ('academic', 'administrative', 'support')),
  is_teaching   BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 100,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_position_name_ru UNIQUE (name_ru)
);

CREATE INDEX idx_reference_positions_category ON reference_positions(category);
CREATE INDEX idx_reference_positions_active   ON reference_positions(is_active);

COMMENT ON TABLE reference_positions IS
  'Справочник должностей. Используется в staff_positions для нормализации данных.';
COMMENT ON COLUMN reference_positions.category IS
  'academic = преподавательские, administrative = управленческие, support = вспомогательные';
COMMENT ON COLUMN reference_positions.is_teaching IS
  'true = должность даёт право преподавать (например, в учебной группе)';

-- Начальные данные (21 должность)
INSERT INTO reference_positions (name_ru, name_he, category, is_teaching, sort_order) VALUES
  -- Преподавательские (academic, is_teaching=true)
  ('Преподаватель',               NULL,       'academic',       true,  10),
  ('Старший преподаватель',       NULL,       'academic',       true,  11),
  ('Доцент',                      NULL,       'academic',       true,  12),
  ('Профессор',                   NULL,       'academic',       true,  13),
  ('Учитель',                     NULL,       'academic',       true,  14),
  ('ЭмБайт',                      'אם בית',   'academic',       true,  15),

  -- Руководящие (administrative, is_teaching=false)
  ('Президент кампуса',           NULL,       'administrative', false, 20),
  ('Ректор',                      NULL,       'administrative', false, 21),
  ('Директор школы',              NULL,       'administrative', false, 22),
  ('Декан',                       NULL,       'administrative', false, 23),
  ('Заместитель директора',       NULL,       'administrative', false, 24),
  ('Заведующий кафедрой',         NULL,       'administrative', false, 25),
  ('Заведующий программой',       NULL,       'administrative', false, 26),
  ('HR-директор',                 NULL,       'administrative', false, 27),
  ('Секретарь',                   NULL,       'administrative', false, 28),

  -- Вспомогательные (support, is_teaching=false)
  ('Бухгалтер',                   NULL,       'support',        false, 40),
  ('IT-администратор',            NULL,       'support',        false, 41),
  ('Технический администратор',   NULL,       'support',        false, 42),
  ('Инспектор контроля качества', NULL,       'support',        false, 43),
  ('Психолог',                    NULL,       'support',        false, 44),
  ('Врач',                        NULL,       'support',        false, 45);


-- ─────────────────────────────────────────────────────────
-- 20260520100620_staff_positions_add_position_id.sql
-- ─────────────────────────────────────────────────────────
ALTER TABLE staff_positions
  ADD COLUMN position_id UUID REFERENCES reference_positions(id) ON DELETE SET NULL;

CREATE INDEX idx_staff_positions_position_id ON staff_positions(position_id);

COMMENT ON COLUMN staff_positions.position_id IS
  'FK на справочник должностей. position_ru оставлен для legacy записей.';

-- Заполнить position_id для существующих записей по точному совпадению имени
UPDATE staff_positions sp
SET position_id = rp.id
FROM reference_positions rp
WHERE sp.position_id IS NULL
  AND LOWER(TRIM(sp.position_ru)) = LOWER(TRIM(rp.name_ru));


-- ─────────────────────────────────────────────────────────
-- 20260520120000_split_full_name.sql
-- ─────────────────────────────────────────────────────────
-- 1. Добавить три новых поля (nullable пока)
ALTER TABLE persons ADD COLUMN last_name   TEXT;
ALTER TABLE persons ADD COLUMN first_name  TEXT;
ALTER TABLE persons ADD COLUMN middle_name TEXT;

-- 2. Заполнить существующие записи вручную
UPDATE persons SET last_name='Шемякин',  first_name='Константин'                         WHERE id='506b86df-6458-4318-adbb-38d79bed3e91';
UPDATE persons SET last_name='Бекерман', first_name='Авраам'                              WHERE id='f8d95222-e5fb-4063-8a60-979450219d0e';
UPDATE persons SET last_name='Бекерман', first_name='Аврахам'                             WHERE id='972f9d5c-eecc-4b4f-b3d2-62aecc2f46b6';
UPDATE persons SET last_name='Файн',     first_name='Аделина',   middle_name='Петровна'  WHERE id='c5152829-dbf9-44ae-b64a-fd0df4f6c898';
UPDATE persons SET last_name='Фролова',  first_name='Василиса',  middle_name='Владимировна' WHERE id='5e82980c-1dce-44a2-a35a-7fd930f00a46';
UPDATE persons SET first_name='Суперадминистратор'     WHERE id='778359af-0b37-4289-9d59-84628a97c386';
UPDATE persons SET first_name='Тестовый пользователь'  WHERE id='581699b7-0329-44d3-87e9-bddceb1bb4a1';
UPDATE persons SET first_name='Контактное лицо общины' WHERE id='14829dce-ab39-4332-83dd-734e747c42a0';
UPDATE persons SET first_name='שרה שמח'                WHERE id='b234097a-766f-4dea-ad95-9f103680c05f';

-- 3. Удалить старую full_name и пересоздать как GENERATED ALWAYS STORED
ALTER TABLE persons DROP COLUMN full_name;
ALTER TABLE persons ADD COLUMN full_name TEXT
  GENERATED ALWAYS AS (
    TRIM(
      COALESCE(last_name, '') ||
      CASE WHEN first_name IS NOT NULL AND first_name != '' THEN
        CASE WHEN last_name IS NOT NULL AND last_name != '' THEN ' ' ELSE '' END || first_name
      ELSE '' END ||
      CASE WHEN middle_name IS NOT NULL AND middle_name != '' THEN ' ' || middle_name ELSE '' END
    )
  ) STORED;

-- 4. first_name обязательно после заполнения
ALTER TABLE persons ALTER COLUMN first_name SET NOT NULL;

-- Проверка:
-- SELECT id, last_name, first_name, middle_name, full_name FROM persons;


-- ─────────────────────────────────────────────────────────
-- 20260529100000_create_workflow_engine.sql
-- ─────────────────────────────────────────────────────────
-- ============================================================
-- Workflow Engine: шаблоны + экземпляры бизнес-процессов
-- ============================================================

-- 1. Шаблон процесса (верхний уровень)
CREATE TABLE IF NOT EXISTS process_templates (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  description       TEXT,
  module            TEXT,                         -- 'staff' | 'education' | 'finance' | …
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Шаблон этапа (входит в процесс)
CREATE TABLE IF NOT EXISTS stage_templates (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  process_template_id   UUID        NOT NULL REFERENCES process_templates(id) ON DELETE CASCADE,
  name                  TEXT        NOT NULL,
  description           TEXT,
  sort_order            INTEGER     NOT NULL DEFAULT 0,
  is_initial            BOOLEAN     NOT NULL DEFAULT false,  -- стартовый этап
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stage_templates_process ON stage_templates(process_template_id);

-- 3. Шаблон задачи внутри этапа
CREATE TABLE IF NOT EXISTS stage_task_templates (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_template_id   UUID        NOT NULL REFERENCES stage_templates(id) ON DELETE CASCADE,
  title               TEXT        NOT NULL,
  description         TEXT,
  assignee_type       TEXT,                       -- 'person' | 'department' | 'any'
  department_id       UUID        REFERENCES departments(id) ON DELETE SET NULL,
  priority            TEXT        NOT NULL DEFAULT 'normal',
  due_days            INTEGER,                    -- срок в днях от начала этапа
  sort_order          INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stage_task_templates_stage ON stage_task_templates(stage_template_id);

-- 4. Финальные состояния (исходы) этапа
CREATE TABLE IF NOT EXISTS stage_finals (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_template_id   UUID        NOT NULL REFERENCES stage_templates(id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,       -- 'Одобрен', 'Отклонён', …
  code                TEXT        NOT NULL,       -- 'approved', 'rejected', …
  sort_order          INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stage_template_id, code)
);
CREATE INDEX IF NOT EXISTS idx_stage_finals_stage ON stage_finals(stage_template_id);

-- 5. Правила переходов между этапами
CREATE TABLE IF NOT EXISTS stage_transitions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_stage_id   UUID        NOT NULL REFERENCES stage_templates(id) ON DELETE CASCADE,
  final_id        UUID        NOT NULL REFERENCES stage_finals(id)    ON DELETE CASCADE,
  to_stage_id     UUID        REFERENCES stage_templates(id)          ON DELETE SET NULL,  -- NULL = процесс завершён
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_stage_id, final_id)
);

-- 6. Экземпляр процесса (запущенный процесс)
CREATE TABLE IF NOT EXISTS process_instances (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  process_template_id   UUID        NOT NULL REFERENCES process_templates(id) ON DELETE RESTRICT,
  entity_type           TEXT        NOT NULL,     -- 'person' | 'lead' | 'enrollment' | …
  entity_id             UUID        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'active',  -- 'active' | 'completed' | 'cancelled'
  started_by            UUID        REFERENCES persons(id) ON DELETE SET NULL,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_process_instances_template ON process_instances(process_template_id);
CREATE INDEX IF NOT EXISTS idx_process_instances_entity   ON process_instances(entity_type, entity_id);

-- 7. Экземпляр этапа
CREATE TABLE IF NOT EXISTS stage_instances (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  process_instance_id   UUID        NOT NULL REFERENCES process_instances(id) ON DELETE CASCADE,
  stage_template_id     UUID        NOT NULL REFERENCES stage_templates(id)   ON DELETE RESTRICT,
  status                TEXT        NOT NULL DEFAULT 'active',  -- 'active' | 'completed' | 'skipped'
  final_id              UUID        REFERENCES stage_finals(id) ON DELETE SET NULL,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ,
  completed_by          UUID        REFERENCES persons(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stage_instances_process ON stage_instances(process_instance_id);
CREATE INDEX IF NOT EXISTS idx_stage_instances_stage   ON stage_instances(stage_template_id);

-- 8. Лог действий внутри этапа
CREATE TABLE IF NOT EXISTS stage_actions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_instance_id   UUID        NOT NULL REFERENCES stage_instances(id) ON DELETE CASCADE,
  actor_id            UUID        REFERENCES persons(id) ON DELETE SET NULL,
  action_type         TEXT        NOT NULL,  -- 'comment' | 'final_selected' | 'task_completed' | 'file_attached'
  payload             JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stage_actions_stage_instance ON stage_actions(stage_instance_id);

-- Привязка задач к экземплярам этапов
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS stage_instance_id UUID REFERENCES stage_instances(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_stage_instance ON tasks(stage_instance_id);


-- ─────────────────────────────────────────────────────────
-- 20260529130000_recreate_workflow_engine.sql
-- ─────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════
-- ШАГ A: DROP всех существующих таблиц движка
-- ═════════════════════════════════════════════════════════

-- Сначала убрать связь tasks → stage_instances
ALTER TABLE tasks DROP COLUMN IF EXISTS stage_instance_id;

-- DROP CASCADE для всех таблиц движка
DROP TABLE IF EXISTS stage_actions CASCADE;
DROP TABLE IF EXISTS stage_instances CASCADE;
DROP TABLE IF EXISTS process_instances CASCADE;
DROP TABLE IF EXISTS stage_transitions CASCADE;
DROP TABLE IF EXISTS stage_finals CASCADE;
DROP TABLE IF EXISTS stage_task_templates CASCADE;
DROP TABLE IF EXISTS stage_templates CASCADE;
DROP TABLE IF EXISTS process_templates CASCADE;

-- ═════════════════════════════════════════════════════════
-- ШАГ B: Создать заново по спецификации
-- ═════════════════════════════════════════════════════════

CREATE TABLE process_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  name_ru         TEXT NOT NULL,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE process_templates IS 'Шаблоны бизнес-процессов (Набор, Приём, ...)';

CREATE TABLE stage_templates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_template_id   UUID NOT NULL REFERENCES process_templates(id) ON DELETE CASCADE,
  code                  TEXT NOT NULL,
  name_ru               TEXT NOT NULL,
  description           TEXT,
  has_tasks             BOOLEAN NOT NULL DEFAULT false,
  has_action_log        BOOLEAN NOT NULL DEFAULT true,
  is_optional           BOOLEAN NOT NULL DEFAULT false,
  is_addable            BOOLEAN NOT NULL DEFAULT false,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (process_template_id, code)
);

COMMENT ON TABLE stage_templates IS 'Подэтапы шаблона процесса';
COMMENT ON COLUMN stage_templates.is_optional IS 'Подэтап может быть пропущен при создании экземпляра';
COMMENT ON COLUMN stage_templates.is_addable IS 'Подэтап можно добавить в уже запущенный экземпляр';

CREATE TABLE stage_task_templates (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_template_id        UUID NOT NULL REFERENCES stage_templates(id) ON DELETE CASCADE,
  code                     TEXT NOT NULL,
  title                    TEXT NOT NULL,
  description              TEXT,
  default_assignee_type    TEXT CHECK (default_assignee_type IN ('role', 'department', 'creator', 'manual')),
  default_role_code        TEXT,
  default_priority         TEXT NOT NULL DEFAULT 'normal' CHECK (default_priority IN ('low', 'normal', 'high', 'urgent')),
  default_due_days         INTEGER,
  sort_order               INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (stage_template_id, code)
);

COMMENT ON TABLE stage_task_templates IS 'Задачи, которые автогенерируются при активации подэтапа';
COMMENT ON COLUMN stage_task_templates.default_due_days IS 'Срок выполнения = сегодня + due_days (если null — без срока)';

CREATE TABLE stage_finals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_template_id   UUID NOT NULL REFERENCES stage_templates(id) ON DELETE CASCADE,
  code                TEXT NOT NULL,
  name_ru             TEXT NOT NULL,
  is_positive         BOOLEAN NOT NULL DEFAULT true,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  UNIQUE (stage_template_id, code)
);

COMMENT ON TABLE stage_finals IS 'Возможные варианты завершения подэтапа';

CREATE TABLE stage_transitions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_stage_template_id   UUID REFERENCES stage_templates(id) ON DELETE CASCADE,
  to_stage_template_id     UUID NOT NULL REFERENCES stage_templates(id) ON DELETE CASCADE,
  trigger_final_code       TEXT,
  activation_mode          TEXT NOT NULL DEFAULT 'after_one' CHECK (activation_mode IN ('after_one', 'after_all')),
  sort_order               INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE stage_transitions IS 'Переходы между подэтапами шаблона. NULL from = начальный подэтап.';

CREATE TABLE process_instances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_template_id UUID NOT NULL REFERENCES process_templates(id),
  journey_id          UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  collected_data      JSONB NOT NULL DEFAULT '{}',
  started_at          TIMESTAMPTZ DEFAULT NOW(),
  finished_at         TIMESTAMPTZ,
  finish_reason       TEXT,
  created_by          UUID REFERENCES persons(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (journey_id, process_template_id, status) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_process_instances_journey ON process_instances(journey_id);
CREATE INDEX idx_process_instances_status ON process_instances(status);

COMMENT ON TABLE process_instances IS 'Экземпляр процесса для конкретного journey';

CREATE TABLE stage_instances (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_instance_id   UUID NOT NULL REFERENCES process_instances(id) ON DELETE CASCADE,
  stage_template_id     UUID NOT NULL REFERENCES stage_templates(id),
  status                TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'skipped', 'cancelled')),
  final_code            TEXT,
  result_data           JSONB,
  activated_at          TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  completed_by          UUID REFERENCES persons(id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stage_instances_process ON stage_instances(process_instance_id);
CREATE INDEX idx_stage_instances_status ON stage_instances(status);

COMMENT ON TABLE stage_instances IS 'Состояние конкретного подэтапа в экземпляре процесса';

CREATE TABLE stage_actions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_instance_id     UUID NOT NULL REFERENCES stage_instances(id) ON DELETE CASCADE,
  action_type           TEXT NOT NULL,
  content               TEXT NOT NULL,
  metadata              JSONB,
  created_by            UUID REFERENCES persons(id),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stage_actions_stage ON stage_actions(stage_instance_id);
CREATE INDEX idx_stage_actions_created ON stage_actions(created_at DESC);

COMMENT ON TABLE stage_actions IS 'Лента действий подэтапа';

-- Восстановить связь tasks → stage_instances
ALTER TABLE tasks ADD COLUMN stage_instance_id UUID REFERENCES stage_instances(id) ON DELETE SET NULL;
CREATE INDEX idx_tasks_stage_instance ON tasks(stage_instance_id);

COMMENT ON COLUMN tasks.stage_instance_id IS 'Если задача создана из подэтапа процесса, ссылка на подэтап';


-- ─────────────────────────────────────────────────────────
-- 20260531150000_tasks_position_assignee.sql
-- ─────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════════
-- Расширение задач (tasks) и шаблонов задач этапа (stage_task_templates) для
-- поддержки исполнителя-должности ('position') и честного «не назначено».
--
-- Применено вручную через Supabase Dashboard 2026-05-31; файл добавлен для
-- соответствия репозитория состоянию БД.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. stage_task_templates: 'position' в assignee_type + новые колонки ────────
ALTER TABLE stage_task_templates
  DROP CONSTRAINT IF EXISTS stage_task_templates_default_assignee_type_check;

ALTER TABLE stage_task_templates
  ADD CONSTRAINT stage_task_templates_default_assignee_type_check
    CHECK (default_assignee_type IN ('role', 'department', 'position', 'creator', 'manual'));

ALTER TABLE stage_task_templates
  ADD COLUMN IF NOT EXISTS default_position_id   UUID REFERENCES reference_positions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

-- ─── 2. tasks: новая колонка position_id ────────────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES reference_positions(id) ON DELETE SET NULL;

-- ─── 3. tasks: расширяем assignee_type ('position', 'unassigned') ────────────────
ALTER TABLE tasks DROP CONSTRAINT tasks_assignee_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_assignee_type_check
  CHECK (assignee_type IN ('person', 'department', 'position', 'unassigned'));

-- ─── 4. tasks: согласованность типа и полей ─────────────────────────────────────
ALTER TABLE tasks DROP CONSTRAINT tasks_assignee_consistency;
ALTER TABLE tasks ADD CONSTRAINT tasks_assignee_consistency CHECK (
  (assignee_type = 'person'     AND assignee_id   IS NOT NULL) OR
  (assignee_type = 'department' AND department_id IS NOT NULL) OR
  (assignee_type = 'position'   AND position_id   IS NOT NULL) OR
  (assignee_type = 'unassigned' AND assignee_id IS NULL
                                AND department_id IS NULL
                                AND position_id IS NULL)
);

-- ─── 5. tasks: unassigned-статус для пулов department/position/unassigned ────────
ALTER TABLE tasks DROP CONSTRAINT tasks_unassigned_only_for_pool;
ALTER TABLE tasks ADD CONSTRAINT tasks_unassigned_only_for_pool CHECK (
  (status = 'unassigned'
     AND assignee_type IN ('department', 'position', 'unassigned')
     AND assignee_id IS NULL)
  OR
  (status <> 'unassigned')
);


-- ─────────────────────────────────────────────────────────
-- 20260607220000_cascade_directions.sql
-- ─────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════════
-- Каскадный селектор направлений — Этап 1: структура БД.
--
-- Цель: перейти от свободного текста направления (lead_interests.direction)
-- к каскаду Учреждение (departments) → Направление (reference_directions)
-- → Уровень/Курс (reference_levels).
--
-- Применяется ВРУЧНУЮ через Supabase Dashboard → SQL Editor.
-- Наполнение справочника данными — отдельным скриптом (НЕ здесь).
-- RLS-политики в этой миграции не задаются (по решению владельца БД).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. departments: флаг учебного заведения ────────────────────────────────────
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS is_educational_institution BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN departments.is_educational_institution IS
  'Является ли этот отдел учебным заведением (для каскадного селектора направлений)';

-- ─── 2. Справочник направлений ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reference_directions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name_ru       TEXT        NOT NULL,
  code          TEXT,
  has_levels    BOOLEAN     NOT NULL DEFAULT false,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reference_directions_dept ON reference_directions(department_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reference_directions_code
  ON reference_directions(code) WHERE code IS NOT NULL;

COMMENT ON TABLE reference_directions IS
  'Справочник направлений обучения в учебных заведениях';
COMMENT ON COLUMN reference_directions.department_id IS
  'Учебное заведение (departments с is_educational_institution=true)';
COMMENT ON COLUMN reference_directions.has_levels IS
  'true = у направления есть уровни/курсы (reference_levels)';

-- ─── 3. Справочник уровней (курсов/классов) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS reference_levels (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_id  UUID        NOT NULL REFERENCES reference_directions(id) ON DELETE CASCADE,
  name_ru       TEXT        NOT NULL,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reference_levels_direction ON reference_levels(direction_id);

COMMENT ON TABLE reference_levels IS
  'Справочник уровней (курсов/классов) внутри направлений';

-- ─── 4. Триггер updated_at для reference_directions ─────────────────────────────
-- Функция update_updated_at_column() уже существует (создана в более ранней
-- миграции). CREATE OR REPLACE — идемпотентно и безопасно.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_reference_directions_updated_at ON reference_directions;
CREATE TRIGGER update_reference_directions_updated_at
  BEFORE UPDATE ON reference_directions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── 5. Переход lead_interests на справочник ────────────────────────────────────
-- В таблице только тестовые записи — очищаем перед сменой структуры.
DELETE FROM lead_interests;

ALTER TABLE lead_interests
  DROP COLUMN IF EXISTS institution,
  DROP COLUMN IF EXISTS direction;

ALTER TABLE lead_interests
  ADD COLUMN IF NOT EXISTS direction_id UUID
    REFERENCES reference_directions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS level_id UUID
    REFERENCES reference_levels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS free_text TEXT;

COMMENT ON COLUMN lead_interests.direction_id IS
  'FK на справочник направлений (новая схема). Может быть null.';
COMMENT ON COLUMN lead_interests.level_id IS
  'FK на справочник уровней. Может быть null, если у направления нет уровней.';
COMMENT ON COLUMN lead_interests.free_text IS
  'Свободный текст направления для учреждений без справочника. Fallback.';

-- ─── 6. Маркировка учебных заведений ────────────────────────────────────────────
UPDATE departments SET is_educational_institution = true
WHERE id IN (
  '5741d8d4-d1e5-4140-9056-a9916962a414',  -- Университет
  '6724b3d4-3281-4a9a-a2ac-a5eefab02260',  -- Touro University
  '71278f74-51dd-4985-ba24-cb7096b153a3',  -- Колледж
  '6f37f079-e0be-443c-b87e-f6af9fff8dc2',  -- Школа
  'fbb1f80f-21b2-4a3d-91ac-89e8eef4a941'   -- Эмуна
);


-- ─────────────────────────────────────────────────────────
-- 20260608120000_task_transitions.sql
-- ─────────────────────────────────────────────────────────
-- task_transitions: переходы между задачами внутри подэтапа.
-- Аналог stage_transitions, но для задач (stage_task_templates) внутри
-- одного stage_template. from_task_code IS NULL = стартовая задача
-- (создаётся при активации подэтапа).

-- ─── UNIQUE на (stage_template_id, code) ──────────────────────────────────────
-- Нужен для логической целостности task_transitions.from/to_task_code.
-- Данные не ломаются: code уникален в рамках шаблона по факту.
ALTER TABLE stage_task_templates
  ADD CONSTRAINT stage_task_templates_stage_code_unique
  UNIQUE (stage_template_id, code);

-- ─── Таблица переходов между задачами ─────────────────────────────────────────
CREATE TABLE task_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_template_id UUID NOT NULL REFERENCES stage_templates(id)
    ON DELETE CASCADE,
  from_task_code TEXT,  -- NULL = стартовая задача
  to_task_code TEXT NOT NULL,
  activation_mode TEXT NOT NULL DEFAULT 'after_one'
    CHECK (activation_mode IN ('after_one', 'after_all')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_transitions_stage
  ON task_transitions(stage_template_id);
CREATE INDEX idx_task_transitions_from
  ON task_transitions(stage_template_id, from_task_code);

COMMENT ON TABLE task_transitions IS
  'Переходы между задачами внутри подэтапа: какая задача активирует какую при завершении';

-- ─── Связь живой задачи с её шаблоном ─────────────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS stage_task_template_id UUID
  REFERENCES stage_task_templates(id) ON DELETE SET NULL;

CREATE INDEX idx_tasks_task_template
  ON tasks(stage_task_template_id)
  WHERE stage_task_template_id IS NOT NULL;

COMMENT ON COLUMN tasks.stage_task_template_id IS
  'FK на шаблон задачи. NULL для legacy задач или для созданных вне шаблонов. Используется для task_transitions.';

-- ─── Обратная совместимость: стартовые transitions для существующих задач ─────
-- По одной "стартовой" transition (NULL → code) на каждый существующий шаблон.
-- После миграции старые подэтапы создают свои задачи как раньше.
INSERT INTO task_transitions (stage_template_id, from_task_code, to_task_code, activation_mode, sort_order)
SELECT stt.stage_template_id, NULL, stt.code, 'after_one', stt.sort_order
FROM stage_task_templates stt;


-- ─────────────────────────────────────────────────────────
-- 20260608180000_add_updated_at_universal.sql
-- ─────────────────────────────────────────────────────────
-- Добавляет updated_at (и created_at там где отсутствует) для всех таблиц,
-- у которых этих колонок нет. Исключены: лог/аудит-таблицы и junction-таблицы.
--
-- ВАЖНО: миграция идемпотентна через ADD COLUMN IF NOT EXISTS и
-- DROP TRIGGER IF EXISTS перед каждым CREATE TRIGGER.

-- ─── Функция триггера (idempotent) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
$$;

-- ─── education_journeys — нет ни created_at, ни updated_at ────────────────────
ALTER TABLE education_journeys
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS education_journeys_updated_at ON education_journeys;
CREATE TRIGGER education_journeys_updated_at
  BEFORE UPDATE ON education_journeys FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─── stage_finals — нет timestamps ───────────────────────────────────────────
ALTER TABLE stage_finals
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS stage_finals_updated_at ON stage_finals;
CREATE TRIGGER stage_finals_updated_at
  BEFORE UPDATE ON stage_finals FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─── stage_transitions — нет timestamps ──────────────────────────────────────
ALTER TABLE stage_transitions
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS stage_transitions_updated_at ON stage_transitions;
CREATE TRIGGER stage_transitions_updated_at
  BEFORE UPDATE ON stage_transitions FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─── Таблицы с created_at: добавляем только updated_at ───────────────────────

ALTER TABLE lead_interests
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS lead_interests_updated_at ON lead_interests;
CREATE TRIGGER lead_interests_updated_at
  BEFORE UPDATE ON lead_interests FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE stage_templates
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS stage_templates_updated_at ON stage_templates;
CREATE TRIGGER stage_templates_updated_at
  BEFORE UPDATE ON stage_templates FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE stage_task_templates
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS stage_task_templates_updated_at ON stage_task_templates;
CREATE TRIGGER stage_task_templates_updated_at
  BEFORE UPDATE ON stage_task_templates FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE task_transitions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS task_transitions_updated_at ON task_transitions;
CREATE TRIGGER task_transitions_updated_at
  BEFORE UPDATE ON task_transitions FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE person_relatives
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS person_relatives_updated_at ON person_relatives;
CREATE TRIGGER person_relatives_updated_at
  BEFORE UPDATE ON person_relatives FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE reference_levels
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS reference_levels_updated_at ON reference_levels;
CREATE TRIGGER reference_levels_updated_at
  BEFORE UPDATE ON reference_levels FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS departments_updated_at ON departments;
CREATE TRIGGER departments_updated_at
  BEFORE UPDATE ON departments FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS roles_updated_at ON roles;
CREATE TRIGGER roles_updated_at
  BEFORE UPDATE ON roles FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE person_accounts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS person_accounts_updated_at ON person_accounts;
CREATE TRIGGER person_accounts_updated_at
  BEFORE UPDATE ON person_accounts FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ─────────────────────────────────────────────────────────
-- 20260608190000_add_updated_at_remaining.sql
-- ─────────────────────────────────────────────────────────
-- Дополнение к 20260608180000: оставшиеся таблицы для updated_at (9 шт.)
-- + created_at для таблиц, где его ещё нет (включая history/junction —
-- created_at как момент записи).
--
-- Идемпотентно: ADD COLUMN IF NOT EXISTS + DROP TRIGGER IF EXISTS.

-- ─── Универсальная функция триггера ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- Группа 1: оставшиеся 9 таблиц — updated_at (+ created_at где нет) + триггер
-- ══════════════════════════════════════════════════════════════════════════════

-- alumni_profiles (created_at + updated_at)
ALTER TABLE alumni_profiles
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS set_updated_at_alumni_profiles ON alumni_profiles;
CREATE TRIGGER set_updated_at_alumni_profiles
  BEFORE UPDATE ON alumni_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- module_privileges (created_at + updated_at)
ALTER TABLE module_privileges
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS set_updated_at_module_privileges ON module_privileges;
CREATE TRIGGER set_updated_at_module_privileges
  BEFORE UPDATE ON module_privileges FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- quality_checks (updated_at)
ALTER TABLE quality_checks
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS set_updated_at_quality_checks ON quality_checks;
CREATE TRIGGER set_updated_at_quality_checks
  BEFORE UPDATE ON quality_checks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- reference_cities (updated_at)
ALTER TABLE reference_cities
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS set_updated_at_reference_cities ON reference_cities;
CREATE TRIGGER set_updated_at_reference_cities
  BEFORE UPDATE ON reference_cities FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- sponsor_profiles (created_at + updated_at)
ALTER TABLE sponsor_profiles
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS set_updated_at_sponsor_profiles ON sponsor_profiles;
CREATE TRIGGER set_updated_at_sponsor_profiles
  BEFORE UPDATE ON sponsor_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- staff_positions (created_at + updated_at)
ALTER TABLE staff_positions
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS set_updated_at_staff_positions ON staff_positions;
CREATE TRIGGER set_updated_at_staff_positions
  BEFORE UPDATE ON staff_positions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- staff_profiles (created_at + updated_at)
ALTER TABLE staff_profiles
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS set_updated_at_staff_profiles ON staff_profiles;
CREATE TRIGGER set_updated_at_staff_profiles
  BEFORE UPDATE ON staff_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- stage_actions (updated_at)
ALTER TABLE stage_actions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS set_updated_at_stage_actions ON stage_actions;
CREATE TRIGGER set_updated_at_stage_actions
  BEFORE UPDATE ON stage_actions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- task_comments (updated_at)
ALTER TABLE task_comments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS set_updated_at_task_comments ON task_comments;
CREATE TRIGGER set_updated_at_task_comments
  BEFORE UPDATE ON task_comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- Группа 2: только created_at (без updated_at, без триггера)
-- (created_at, которого ещё нет в group 1)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE person_family
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE person_privileges
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE person_roles
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE person_status_history
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE role_privileges
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE task_watchers
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE class_enrollments
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE class_teachers
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE journey_communities
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();


-- ─────────────────────────────────────────────────────────
-- 20260617100000_add_soft_delete.sql
-- ─────────────────────────────────────────────────────────
-- Soft delete для education_journeys (лидов)
ALTER TABLE education_journeys
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES persons(id);

CREATE INDEX IF NOT EXISTS idx_education_journeys_is_deleted
  ON education_journeys(is_deleted)
  WHERE is_deleted = true;


-- ─────────────────────────────────────────────────────────
-- 20260617110000_process_events.sql
-- ─────────────────────────────────────────────────────────
-- Лента событий подэтапа
CREATE TABLE IF NOT EXISTS process_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_instance_id UUID NOT NULL REFERENCES stage_instances(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('system','note','call','meeting','message','email')),
  content TEXT NOT NULL,
  author_id UUID REFERENCES persons(id),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_process_events_stage ON process_events(stage_instance_id);
CREATE INDEX IF NOT EXISTS idx_process_events_created ON process_events(created_at DESC);


-- ─────────────────────────────────────────────────────────
-- 20260617120000_documents.sql
-- ─────────────────────────────────────────────────────────
-- ── document_categories ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT        NOT NULL UNIQUE,
  name_ru    TEXT        NOT NULL,
  sort_order INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── document_types ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_types (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID        NOT NULL REFERENCES document_categories(id) ON DELETE RESTRICT,
  code        TEXT        NOT NULL UNIQUE,
  name_ru     TEXT        NOT NULL,
  description TEXT,
  is_required BOOLEAN     NOT NULL DEFAULT false,
  sort_order  INT         NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── person_documents ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS person_documents (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id        UUID        NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  document_type_id UUID        NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,
  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','received','verified','rejected','expired')),
  file_url         TEXT,
  notes            TEXT,
  received_at      TIMESTAMPTZ,
  received_by      UUID        REFERENCES persons(id),
  verified_at      TIMESTAMPTZ,
  verified_by      UUID        REFERENCES persons(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (person_id, document_type_id)
);

CREATE INDEX IF NOT EXISTS idx_person_documents_person ON person_documents(person_id);
CREATE INDEX IF NOT EXISTS idx_person_documents_type   ON person_documents(document_type_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_person_documents_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_person_documents_updated_at ON person_documents;
CREATE TRIGGER trg_person_documents_updated_at
  BEFORE UPDATE ON person_documents
  FOR EACH ROW EXECUTE FUNCTION set_person_documents_updated_at();

-- ── Seed data: categories ────────────────────────────────────────────────────
INSERT INTO document_categories (code, name_ru, sort_order) VALUES
  ('general',    'Общие документы',          1),
  ('jewish',     'Еврейские документы',       2),
  ('academic',   'Учебные документы',         3),
  ('dormitory',  'Документы для общежития',   4),
  ('additional', 'Дополнительные документы',  5)
ON CONFLICT (code) DO NOTHING;

-- ── Seed data: document types ─────────────────────────────────────────────────
INSERT INTO document_types (category_id, code, name_ru, is_required, sort_order) VALUES
  -- general
  ((SELECT id FROM document_categories WHERE code = 'general'), 'passport',            'Паспорт',                          true,  1),
  ((SELECT id FROM document_categories WHERE code = 'general'), 'photo',               'Фотография 3×4',                   true,  2),
  -- jewish
  ((SELECT id FROM document_categories WHERE code = 'jewish'), 'birth_certificate',   'Свидетельство о рождении',         false, 1),
  ((SELECT id FROM document_categories WHERE code = 'jewish'), 'jewish_certificate',  'Гиюр / еврейское свидетельство',  false, 2),
  ((SELECT id FROM document_categories WHERE code = 'jewish'), 'ketubah',             'Ктуба',                            false, 3),
  -- academic
  ((SELECT id FROM document_categories WHERE code = 'academic'), 'diploma',           'Диплом / аттестат',               false, 1),
  ((SELECT id FROM document_categories WHERE code = 'academic'), 'transcript',        'Академическая справка',           false, 2),
  -- dormitory
  ((SELECT id FROM document_categories WHERE code = 'dormitory'), 'medical_cert',     'Медицинская справка',             false, 1),
  ((SELECT id FROM document_categories WHERE code = 'dormitory'), 'residence_form',   'Заявление на проживание',         false, 2),
  -- additional
  ((SELECT id FROM document_categories WHERE code = 'additional'), 'recommendation',  'Рекомендательное письмо',         false, 1)
ON CONFLICT (code) DO NOTHING;


-- ─────────────────────────────────────────────────────────
-- 20260702130000_create_application_rpc.sql
-- ─────────────────────────────────────────────────────────
-- Атомарное создание заявки (person + education_journey + lead_interests +
-- person_status_history) внутри одной транзакции Postgres.
--
-- Заменяет ручную последовательность insert-ов в app/api/education/leads/route.ts,
-- где при ошибке на середине пути (например, journey не создался после person)
-- ранее созданные записи оставались в БД без отката.
--
-- Не включает: communities/journey_communities и запуск workflow (startProcess) —
-- они намеренно остаются best-effort шагами в TypeScript после вызова этой функции,
-- как и было задокументировано в исходном коде ("некритичный, ошибка не блокирует
-- создание лида").
--
-- Коды ошибок для маппинга на HTTP-статусы в lib/api/handler.ts:
--   22023 — некорректные входные данные (400)
--   P0002 — person_id не найден (404)
--   P0001 — конфликт состояния (409)

CREATE OR REPLACE FUNCTION create_application(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_person_id uuid;
  v_journey_id uuid;
  v_existing RECORD;
  v_interest jsonb;
  v_today date := CURRENT_DATE;
  v_phones jsonb;
BEGIN
  -- 1. Найти или создать person
  IF (payload->>'person_id') IS NOT NULL THEN
    v_person_id := (payload->>'person_id')::uuid;

    IF NOT EXISTS (SELECT 1 FROM persons WHERE id = v_person_id) THEN
      RAISE EXCEPTION 'Person не найден' USING ERRCODE = 'P0002';
    END IF;

    UPDATE persons SET education_status = 'lead' WHERE id = v_person_id;
  ELSE
    v_phones := COALESCE(
      NULLIF(payload->'phones', 'null'::jsonb),
      CASE WHEN payload->>'phone' IS NOT NULL
        THEN jsonb_build_array(payload->>'phone')
        ELSE '[]'::jsonb
      END
    );

    IF COALESCE(payload->>'first_name', '') = '' THEN
      RAISE EXCEPTION 'ФИО обязательно' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_phones) = 0 THEN
      RAISE EXCEPTION 'Телефон обязателен' USING ERRCODE = '22023';
    END IF;

    INSERT INTO persons (
      last_name, first_name, middle_name, hebrew_name, phones, email, gender,
      birth_date, address, education_status, marital_status, nationality, passport_number
    ) VALUES (
      NULLIF(payload->>'last_name', ''),
      payload->>'first_name',
      NULLIF(payload->>'middle_name', ''),
      NULLIF(payload->>'hebrew_name', ''),
      v_phones,
      NULLIF(payload->>'email', ''),
      NULLIF(payload->>'gender', ''),
      NULLIF(payload->>'birth_date', '')::date,
      NULLIF(payload->'address', 'null'::jsonb),
      'lead',
      NULLIF(payload->>'marital_status', ''),
      NULLIF(payload->>'citizenship', ''),
      NULLIF(payload->>'passport_number', '')
    )
    RETURNING id INTO v_person_id;
  END IF;

  -- 2. Найти открытый journey этого person либо создать новый (статус 'lead')
  SELECT id, education_status INTO v_existing
    FROM education_journeys
    WHERE person_id = v_person_id AND closed_at IS NULL
    LIMIT 1;

  IF FOUND THEN
    IF v_existing.education_status <> 'lead' THEN
      RAISE EXCEPTION 'У этого человека уже есть активный journey с другим статусом' USING ERRCODE = 'P0001';
    END IF;
    v_journey_id := v_existing.id;
  ELSE
    INSERT INTO education_journeys (
      person_id, education_status, opened_at, application_date, referral_source, notes, status
    ) VALUES (
      v_person_id, 'lead', v_today, v_today,
      NULLIF(payload->>'referral_source', ''),
      NULLIF(payload->>'comment', ''),
      'new'
    )
    RETURNING id INTO v_journey_id;
  END IF;

  -- 3. lead_interests (каскад direction_id/level_id либо свободный текст)
  FOR v_interest IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'interests', '[]'::jsonb))
  LOOP
    IF (v_interest->>'direction_id') IS NOT NULL THEN
      INSERT INTO lead_interests (person_id, direction_id, level_id)
      VALUES (
        v_person_id,
        (v_interest->>'direction_id')::uuid,
        NULLIF(v_interest->>'level_id', '')::uuid
      );
    ELSIF COALESCE(v_interest->>'free_text', '') <> '' THEN
      INSERT INTO lead_interests (person_id, free_text)
      VALUES (v_person_id, v_interest->>'free_text');
    END IF;
  END LOOP;

  -- 4. person_status_history
  INSERT INTO person_status_history (person_id, from_status, to_status, changed_by)
  VALUES (v_person_id, NULL, 'lead', NULLIF(payload->>'actor_id', '')::uuid);

  RETURN jsonb_build_object('person_id', v_person_id, 'journey_id', v_journey_id);
END;
$$;


-- ─────────────────────────────────────────────────────────
-- 20260702140000_persons_documents_privileges.sql
-- ─────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────
-- 20260702150000_drop_persons_education_status.sql
-- ─────────────────────────────────────────────────────────
-- persons.education_status было денормализованной копией
-- education_journeys.education_status, которую полагалось держать в синхроне
-- вручную в каждом write-site. Проверка показала:
--   1. Ни один read-site в коде не читает persons.education_status —
--      единственный источник правды в приложении уже был education_journeys.
--   2. lib/workflow/complete-stage.ts и close-process-early.ts, которые меняют
--      education_journeys.education_status при конверсии lead→applicant через
--      воркфлоу-движок, никогда не трогали persons.education_status —
--      то есть поле реально дрейфовало на части путей уже сегодня.
--   3. Комментарий в коде (leads/[id]/convert/route.ts) уже называл его
--      "Legacy... удалим в Part 2 миграции".
-- Решение: не чинить синхронизацию (ещё один write-site, который забудут в
-- следующий раз), а убрать дублирующее поле целиком.
--
-- ВАЖНО: перед применением убедиться, что задеплоен код без записи в
-- persons.education_status (иначе INSERT/UPDATE упадут на несуществующей
-- колонке) — на момент миграции это уже так.

-- 1. Пересоздаём create_application без записи persons.education_status
--    (см. 20260702130000_create_application_rpc.sql)
CREATE OR REPLACE FUNCTION create_application(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_person_id uuid;
  v_journey_id uuid;
  v_existing RECORD;
  v_interest jsonb;
  v_today date := CURRENT_DATE;
  v_phones jsonb;
BEGIN
  -- 1. Найти или создать person
  IF (payload->>'person_id') IS NOT NULL THEN
    v_person_id := (payload->>'person_id')::uuid;

    IF NOT EXISTS (SELECT 1 FROM persons WHERE id = v_person_id) THEN
      RAISE EXCEPTION 'Person не найден' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    v_phones := COALESCE(
      NULLIF(payload->'phones', 'null'::jsonb),
      CASE WHEN payload->>'phone' IS NOT NULL
        THEN jsonb_build_array(payload->>'phone')
        ELSE '[]'::jsonb
      END
    );

    IF COALESCE(payload->>'first_name', '') = '' THEN
      RAISE EXCEPTION 'ФИО обязательно' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_phones) = 0 THEN
      RAISE EXCEPTION 'Телефон обязателен' USING ERRCODE = '22023';
    END IF;

    INSERT INTO persons (
      last_name, first_name, middle_name, hebrew_name, phones, email, gender,
      birth_date, address, marital_status, nationality, passport_number
    ) VALUES (
      NULLIF(payload->>'last_name', ''),
      payload->>'first_name',
      NULLIF(payload->>'middle_name', ''),
      NULLIF(payload->>'hebrew_name', ''),
      v_phones,
      NULLIF(payload->>'email', ''),
      NULLIF(payload->>'gender', ''),
      NULLIF(payload->>'birth_date', '')::date,
      NULLIF(payload->'address', 'null'::jsonb),
      NULLIF(payload->>'marital_status', ''),
      NULLIF(payload->>'citizenship', ''),
      NULLIF(payload->>'passport_number', '')
    )
    RETURNING id INTO v_person_id;
  END IF;

  -- 2. Найти открытый journey этого person либо создать новый (статус 'lead')
  SELECT id, education_status INTO v_existing
    FROM education_journeys
    WHERE person_id = v_person_id AND closed_at IS NULL
    LIMIT 1;

  IF FOUND THEN
    IF v_existing.education_status <> 'lead' THEN
      RAISE EXCEPTION 'У этого человека уже есть активный journey с другим статусом' USING ERRCODE = 'P0001';
    END IF;
    v_journey_id := v_existing.id;
  ELSE
    INSERT INTO education_journeys (
      person_id, education_status, opened_at, application_date, referral_source, notes, status
    ) VALUES (
      v_person_id, 'lead', v_today, v_today,
      NULLIF(payload->>'referral_source', ''),
      NULLIF(payload->>'comment', ''),
      'new'
    )
    RETURNING id INTO v_journey_id;
  END IF;

  -- 3. lead_interests (каскад direction_id/level_id либо свободный текст)
  FOR v_interest IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'interests', '[]'::jsonb))
  LOOP
    IF (v_interest->>'direction_id') IS NOT NULL THEN
      INSERT INTO lead_interests (person_id, direction_id, level_id)
      VALUES (
        v_person_id,
        (v_interest->>'direction_id')::uuid,
        NULLIF(v_interest->>'level_id', '')::uuid
      );
    ELSIF COALESCE(v_interest->>'free_text', '') <> '' THEN
      INSERT INTO lead_interests (person_id, free_text)
      VALUES (v_person_id, v_interest->>'free_text');
    END IF;
  END LOOP;

  -- 4. person_status_history
  INSERT INTO person_status_history (person_id, from_status, to_status, changed_by)
  VALUES (v_person_id, NULL, 'lead', NULLIF(payload->>'actor_id', '')::uuid);

  RETURN jsonb_build_object('person_id', v_person_id, 'journey_id', v_journey_id);
END;
$$;

-- 2. Убираем дублирующее поле
ALTER TABLE persons DROP COLUMN IF EXISTS education_status;


-- ─────────────────────────────────────────────────────────
-- 20260702160000_drop_enrollments_table.sql
-- ─────────────────────────────────────────────────────────
-- Таблица enrollments — остаток раннего варианта схемы (до появления
-- education_journeys + students + class_enrollments). Проверка показала:
-- ни одного упоминания 'enrollments' нигде в app/, lib/, components/, scripts/.
-- Полностью мёртвая таблица.

DROP TABLE IF EXISTS enrollments;


-- ─────────────────────────────────────────────────────────
-- 20260702170000_audit_log.sql
-- ─────────────────────────────────────────────────────────
-- Универсальный audit log — "что изменилось и когда" через триггер на самой
-- таблице (нельзя забыть, работает при любом способе записи — RPC, обычный
-- insert/update через PostgREST, или прямой SQL). "Кто" — опционально:
-- если вызывающий код (RPC-функция) заранее выставил
-- set_config('app.current_actor_id', ..., true) в рамках своей транзакции —
-- триггер его подхватит. Если нет — changed_by остаётся NULL, но сама запись
-- об изменении не теряется.
--
-- Осознанное ограничение: НЕ настраиваем это на уровне PostgREST/заголовков
-- запроса для всех ~90 endpoints — это отдельная, куда более дорогая задача
-- (см. обсуждение). Здесь только: (1) триггер, который сам по себе уже видит
-- каждое изменение на подключённых таблицах, и (2) точка расширения
-- (set_config), которой уже пользуются RPC-функции нового образца.

-- 1. Таблица
CREATE TABLE IF NOT EXISTS audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    TEXT NOT NULL,
  entity_id      UUID NOT NULL,
  action         TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  old_data       JSONB,
  new_data       JSONB,
  changed_fields TEXT[],
  changed_by     UUID REFERENCES persons(id),
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by ON audit_log(changed_by) WHERE changed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON audit_log(changed_at);

-- 2. Универсальная триггерная функция — вешается на любую таблицу с PK "id"
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_changed_fields text[] := ARRAY[]::text[];
  v_actor uuid;
  v_key text;
BEGIN
  v_actor := NULLIF(current_setting('app.current_actor_id', true), '')::uuid;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (entity_type, entity_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'delete', to_jsonb(OLD), NULL, v_actor);
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (entity_type, entity_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'create', NULL, to_jsonb(NEW), v_actor);
    RETURN NEW;
  END IF;

  -- UPDATE: считаем реально изменившиеся поля, кроме updated_at
  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);
  FOR v_key IN SELECT jsonb_object_keys(v_new)
  LOOP
    IF v_key = 'updated_at' THEN CONTINUE; END IF;
    IF v_old -> v_key IS DISTINCT FROM v_new -> v_key THEN
      v_changed_fields := array_append(v_changed_fields, v_key);
    END IF;
  END LOOP;

  IF array_length(v_changed_fields, 1) IS NULL THEN
    RETURN NEW; -- ничего значимого не поменялось (например, только updated_at)
  END IF;

  INSERT INTO audit_log (entity_type, entity_id, action, old_data, new_data, changed_fields, changed_by)
  VALUES (TG_TABLE_NAME, NEW.id, 'update', v_old, v_new, v_changed_fields, v_actor);
  RETURN NEW;
END;
$$;

-- 3. Подключаем к первым двум таблицам — persons и education_journeys
--    (те же таблицы, для которых только что закрыли доступ по привилегиям).
--    Расширение на другие таблицы — отдельными миграциями по мере надобности.
DROP TRIGGER IF EXISTS trg_audit_log ON persons;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON persons
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_log ON education_journeys;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON education_journeys
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- 4. create_application теперь передаёт актёра через set_config — тот же
--    payload->>'actor_id', что уже передавался (использовался только для
--    person_status_history). Пересоздаём функцию с одной добавленной строкой
--    в самом начале.
CREATE OR REPLACE FUNCTION create_application(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_person_id uuid;
  v_journey_id uuid;
  v_existing RECORD;
  v_interest jsonb;
  v_today date := CURRENT_DATE;
  v_phones jsonb;
BEGIN
  PERFORM set_config('app.current_actor_id', NULLIF(payload->>'actor_id', ''), true);

  -- 1. Найти или создать person
  IF (payload->>'person_id') IS NOT NULL THEN
    v_person_id := (payload->>'person_id')::uuid;

    IF NOT EXISTS (SELECT 1 FROM persons WHERE id = v_person_id) THEN
      RAISE EXCEPTION 'Person не найден' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    v_phones := COALESCE(
      NULLIF(payload->'phones', 'null'::jsonb),
      CASE WHEN payload->>'phone' IS NOT NULL
        THEN jsonb_build_array(payload->>'phone')
        ELSE '[]'::jsonb
      END
    );

    IF COALESCE(payload->>'first_name', '') = '' THEN
      RAISE EXCEPTION 'ФИО обязательно' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_phones) = 0 THEN
      RAISE EXCEPTION 'Телефон обязателен' USING ERRCODE = '22023';
    END IF;

    INSERT INTO persons (
      last_name, first_name, middle_name, hebrew_name, phones, email, gender,
      birth_date, address, marital_status, nationality, passport_number
    ) VALUES (
      NULLIF(payload->>'last_name', ''),
      payload->>'first_name',
      NULLIF(payload->>'middle_name', ''),
      NULLIF(payload->>'hebrew_name', ''),
      v_phones,
      NULLIF(payload->>'email', ''),
      NULLIF(payload->>'gender', ''),
      NULLIF(payload->>'birth_date', '')::date,
      NULLIF(payload->'address', 'null'::jsonb),
      NULLIF(payload->>'marital_status', ''),
      NULLIF(payload->>'citizenship', ''),
      NULLIF(payload->>'passport_number', '')
    )
    RETURNING id INTO v_person_id;
  END IF;

  -- 2. Найти открытый journey этого person либо создать новый (статус 'lead')
  SELECT id, education_status INTO v_existing
    FROM education_journeys
    WHERE person_id = v_person_id AND closed_at IS NULL
    LIMIT 1;

  IF FOUND THEN
    IF v_existing.education_status <> 'lead' THEN
      RAISE EXCEPTION 'У этого человека уже есть активный journey с другим статусом' USING ERRCODE = 'P0001';
    END IF;
    v_journey_id := v_existing.id;
  ELSE
    INSERT INTO education_journeys (
      person_id, education_status, opened_at, application_date, referral_source, notes, status
    ) VALUES (
      v_person_id, 'lead', v_today, v_today,
      NULLIF(payload->>'referral_source', ''),
      NULLIF(payload->>'comment', ''),
      'new'
    )
    RETURNING id INTO v_journey_id;
  END IF;

  -- 3. lead_interests (каскад direction_id/level_id либо свободный текст)
  FOR v_interest IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'interests', '[]'::jsonb))
  LOOP
    IF (v_interest->>'direction_id') IS NOT NULL THEN
      INSERT INTO lead_interests (person_id, direction_id, level_id)
      VALUES (
        v_person_id,
        (v_interest->>'direction_id')::uuid,
        NULLIF(v_interest->>'level_id', '')::uuid
      );
    ELSIF COALESCE(v_interest->>'free_text', '') <> '' THEN
      INSERT INTO lead_interests (person_id, free_text)
      VALUES (v_person_id, v_interest->>'free_text');
    END IF;
  END LOOP;

  -- 4. person_status_history
  INSERT INTO person_status_history (person_id, from_status, to_status, changed_by)
  VALUES (v_person_id, NULL, 'lead', NULLIF(payload->>'actor_id', '')::uuid);

  RETURN jsonb_build_object('person_id', v_person_id, 'journey_id', v_journey_id);
END;
$$;


-- ─────────────────────────────────────────────────────────
-- 20260702180000_create_staff_member_rpc.sql
-- ─────────────────────────────────────────────────────────
-- Атомарное создание сотрудника (person + staff_profiles + staff_positions)
-- внутри одной транзакции — тот же класс проблемы, что и в
-- create_application (20260702130000): раньше это были 3 последовательных
-- insert-а в app/api/staff/route.ts без отката при частичном сбое.
--
-- Коды ошибок:
--   22023 — некорректные входные данные (400)
--   P0002 — person_id/position_id не найден (404)

CREATE OR REPLACE FUNCTION create_staff_member(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_person_id uuid;
  v_person_name text;
  v_profile_id uuid;
  v_position_id uuid;
  v_position_name text;
  v_department_id uuid;
BEGIN
  PERFORM set_config('app.current_actor_id', NULLIF(payload->>'actor_id', ''), true);

  v_department_id := NULLIF(payload->>'department_id', '')::uuid;
  IF v_department_id IS NULL THEN
    RAISE EXCEPTION 'Отдел обязателен' USING ERRCODE = '22023';
  END IF;

  -- 1. Найти или создать person
  IF (payload->>'person_id') IS NOT NULL THEN
    v_person_id := (payload->>'person_id')::uuid;
    SELECT full_name INTO v_person_name FROM persons WHERE id = v_person_id;
    IF v_person_name IS NULL THEN
      RAISE EXCEPTION 'Человек не найден' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    IF COALESCE(payload->>'first_name', '') = '' THEN
      RAISE EXCEPTION 'ФИО обязательно' USING ERRCODE = '22023';
    END IF;

    INSERT INTO persons (
      last_name, first_name, middle_name, hebrew_name, gender, birth_date,
      marital_status, nationality, passport_number, phones, email, address
    ) VALUES (
      NULLIF(payload->>'last_name', ''),
      payload->>'first_name',
      NULLIF(payload->>'middle_name', ''),
      NULLIF(payload->>'hebrew_name', ''),
      NULLIF(payload->>'gender', ''),
      NULLIF(payload->>'birth_date', '')::date,
      NULLIF(payload->>'marital_status', ''),
      NULLIF(payload->>'nationality', ''),
      NULLIF(payload->>'passport_number', ''),
      COALESCE(payload->'phones', '[]'::jsonb),
      NULLIF(payload->>'email', ''),
      COALESCE(payload->'address', '{}'::jsonb)
    )
    RETURNING id, full_name INTO v_person_id, v_person_name;
  END IF;

  -- 2. staff_profiles — игнорируем дубль (у человека уже может быть профиль)
  BEGIN
    INSERT INTO staff_profiles (person_id, employment_type, hire_date, fire_date, notes)
    VALUES (
      v_person_id,
      COALESCE(NULLIF(payload->>'employment_type', ''), 'staff'),
      NULLIF(payload->>'hire_date', '')::date,
      NULL,
      NULLIF(payload->>'notes', '')
    )
    RETURNING id INTO v_profile_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_profile_id FROM staff_profiles WHERE person_id = v_person_id;
  END;

  -- 3. Разрешить должность
  v_position_id := NULLIF(payload->>'position_id', '')::uuid;
  IF v_position_id IS NOT NULL THEN
    SELECT name_ru INTO v_position_name FROM reference_positions WHERE id = v_position_id;
    IF v_position_name IS NULL THEN
      RAISE EXCEPTION 'Должность не найдена' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    v_position_name := NULLIF(payload->>'position', '');
    IF v_position_name IS NULL THEN
      RAISE EXCEPTION 'position или position_id обязательны' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 4. staff_positions
  INSERT INTO staff_positions (
    person_id, department_id, position_ru, position_he, position_id,
    is_head, start_date, end_date
  ) VALUES (
    v_person_id, v_department_id, v_position_name, NULL, v_position_id,
    false, NULLIF(payload->>'hire_date', '')::date, NULL
  );

  RETURN jsonb_build_object(
    'profile_id', v_profile_id,
    'person_id', v_person_id,
    'full_name', v_person_name,
    'position', v_position_name,
    'department_id', v_department_id
  );
END;
$$;


-- ─────────────────────────────────────────────────────────
-- 20260702190000_quality_control_feature_privileges.sql
-- ─────────────────────────────────────────────────────────
-- ─────────────────────────────────────────────────────────────────────────────
-- Quality Control — включаем enforcement на feature_privileges.
--
-- feature_privileges существует с 20260510000000_add_feature_privileges.sql,
-- но до сих пор только superadmin имел там гранты, и ни один route handler
-- в app/api/quality-control/* её не проверял — только сессию. Это значило,
-- что любой авторизованный пользователь мог смотреть/редактировать/удалять
-- любую запись оценки урока (включая teacher_feedback, overall_rating).
--
-- Раздаём дефолтные гранты по 'planned' и 'history' (все, кроме 'templates' —
-- это управляется отдельно, здесь не трогаем), чтобы включение проверки в
-- коде не заблокировало тех, кто уже реально этим занимается: то же
-- множество ролей образовательного руководства, что уже используется для
-- education/persons-привилегий (20260702140000, блок 3), плюс curator
-- (педагогический координатор) — согласовано с пользователем явно, т.к.
-- готовой роли "инспектор контроля качества" в системе нет.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO feature_privileges (role_code, module_code, feature_code, can_view, can_create, can_edit, can_delete)
SELECT r.code, m.module_code, m.feature_code, true, true, true, true
FROM roles r
CROSS JOIN (VALUES
  ('quality_control', 'planned'),
  ('quality_control', 'history')
) AS m(module_code, feature_code)
WHERE r.code IN ('school_director', 'rector', 'dean', 'vice_director', 'dept_head', 'program_head', 'curator')
ON CONFLICT (role_code, module_code, feature_code) DO UPDATE SET
  can_view = true, can_create = true, can_edit = true, can_delete = true;


-- ─────────────────────────────────────────────────────────
-- 20260702200000_reactivate_stage_rpc.sql
-- ─────────────────────────────────────────────────────────
-- Атомарная реактивация пропущенного подэтапа (stage_instance) + создание его
-- стартовых задач — одной транзакцией Postgres.
--
-- Заменяет lib/workflow/reactivate-stage.ts::reactivateStage, которая делала
-- то же самое последовательными HTTP-запросами через PostgREST (каждый
-- .update()/.insert() — своя мини-транзакция). Риск (см.
-- docs/workflow-transaction-risk-analysis.md, §1): если создание задачи #2 из
-- 3 падает — подэтап уже помечен 'active', но не все ожидаемые задачи
-- созданы, и это никак не сигнализируется куратору.
--
-- Отличие от TS-версии:
--   - Системное событие (process_events) остаётся best-effort — обёрнуто в
--     BEGIN/EXCEPTION со своим savepoint, точно как в оригинале
--     (void _evErr — ошибка игнорируется, не должна ронять реактивацию).
--   - Создание задач НЕ best-effort — это и есть исправляемый риск: если
--     падает вставка любой задачи, откатывается вся операция целиком
--     (включая UPDATE stage_instances), а не только "хвost".
--   - Не воспроизведена проверка "processInstance IS NULL" из оригинала —
--     она была защитной веткой на случай, если embedded-join вернёт NULL
--     несмотря на NOT NULL FK (stage_instances.process_instance_id →
--     process_instances(id) ON DELETE CASCADE). При INNER JOIN здесь это
--     недостижимо: раз RLS отключён и FK гарантирует существование строки,
--     ветка не может сработать ни в оригинале, ни здесь.
--
-- Сигнатура — два обычных параметра, а не jsonb payload (в отличие от
-- create_application/create_staff_member): здесь всего два скалярных
-- аргумента, а не набор полей формы, обёртка в jsonb не добавляла бы
-- ценности.
--
-- Коды ошибок для маппинга в lib/api/handler.ts (mapPgError):
--   P0002 — подэтап не найден (404)
--   22023 — подэтап не в статусе 'skipped', либо процесс не активен (400)

CREATE OR REPLACE FUNCTION reactivate_stage(p_stage_instance_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_status            text;
  v_stage_template_id uuid;
  v_process_status    text;
  v_journey_id        uuid;
  v_person_id         uuid;
  v_person_full_name  text;
  v_now               timestamptz := NOW();
  v_start_codes       text[];
  v_tt                RECORD;
  v_assignee_type     text;
  v_assignee_id       uuid;
  v_department_id     uuid;
  v_position_id       uuid;
  v_task_status       text;
  v_title             text;
BEGIN
  -- 1. Загрузить stage_instance + контекст процесса
  SELECT si.status, si.stage_template_id, pi.status, pi.journey_id
    INTO v_status, v_stage_template_id, v_process_status, v_journey_id
  FROM stage_instances si
  JOIN process_instances pi ON pi.id = si.process_instance_id
  WHERE si.id = p_stage_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Подэтап не найден' USING ERRCODE = 'P0002';
  END IF;

  IF v_status <> 'skipped' THEN
    RAISE EXCEPTION 'Активировать можно только пропущенный подэтап' USING ERRCODE = '22023';
  END IF;
  IF v_process_status <> 'active' THEN
    RAISE EXCEPTION 'Процесс уже завершён — подэтап нельзя активировать' USING ERRCODE = '22023';
  END IF;

  -- 2. Вернуть подэтап в активное состояние
  UPDATE stage_instances
  SET status = 'active', activated_at = v_now, completed_at = NULL,
      completed_by = NULL, final_code = NULL
  WHERE id = p_stage_instance_id;

  -- 3. ФИО лида — подставляется в title задач
  SELECT person_id INTO v_person_id FROM education_journeys WHERE id = v_journey_id;
  IF v_person_id IS NOT NULL THEN
    SELECT full_name INTO v_person_full_name FROM persons WHERE id = v_person_id;
  END IF;

  -- Системное событие — best-effort, как и в оригинале (void _evErr).
  -- Вложенный BEGIN/EXCEPTION = savepoint: ошибка здесь откатывается сама по
  -- себе и не роняет всю функцию.
  BEGIN
    INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
    VALUES (p_stage_instance_id, 'system', 'Подэтап активирован вручную', p_actor_id, NULL);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 4. Стартовые задачи подэтапа (см. createStartingTasks в start-process.ts).
  -- Пусто в task_transitions (from_task_code IS NULL) для этого подэтапа →
  -- legacy fallback: создаём все шаблоны.
  SELECT COALESCE(array_agg(DISTINCT to_task_code), ARRAY[]::text[])
    INTO v_start_codes
  FROM task_transitions
  WHERE stage_template_id = v_stage_template_id AND from_task_code IS NULL;

  FOR v_tt IN
    SELECT * FROM stage_task_templates
    WHERE stage_template_id = v_stage_template_id
      AND (array_length(v_start_codes, 1) IS NULL OR code = ANY(v_start_codes))
    ORDER BY sort_order
  LOOP
    v_assignee_type := 'unassigned';
    v_assignee_id := NULL;
    v_department_id := NULL;
    v_position_id := NULL;
    v_task_status := 'unassigned';

    IF v_tt.default_assignee_type = 'creator' THEN
      v_assignee_type := 'person';
      v_assignee_id := p_actor_id;
      v_task_status := 'pending';
    ELSIF v_tt.default_assignee_type = 'department' AND v_tt.default_department_id IS NOT NULL THEN
      v_assignee_type := 'department';
      v_department_id := v_tt.default_department_id;
    ELSIF v_tt.default_assignee_type = 'position' AND v_tt.default_position_id IS NOT NULL THEN
      v_assignee_type := 'position';
      v_position_id := v_tt.default_position_id;
    END IF;
    -- role / manual / null / department без отдела / position без должности
    -- → остаётся 'unassigned' (как и в mapTaskTemplate в start-process.ts).

    v_title := CASE WHEN v_person_full_name IS NOT NULL
      THEN v_tt.title || ': ' || v_person_full_name
      ELSE v_tt.title
    END;

    -- Вставка НЕ обёрнута в savepoint: ошибка здесь должна откатить всю
    -- реактивацию, включая уже сделанный UPDATE stage_instances — это и есть
    -- исправляемый риск частичного состояния.
    INSERT INTO tasks (
      title, description, module, metadata, assignee_type, assignee_id,
      department_id, position_id, creator_id, status, priority,
      due_date, due_time, due_all_day, stage_instance_id, stage_task_template_id
    ) VALUES (
      v_title, v_tt.description, 'general', '{}'::jsonb, v_assignee_type, v_assignee_id,
      v_department_id, v_position_id, p_actor_id, v_task_status, v_tt.default_priority,
      NULL, NULL, true, p_stage_instance_id, v_tt.id
    );
  END LOOP;

  RETURN jsonb_build_object('stage_instance_id', p_stage_instance_id);
END;
$$;


-- ─────────────────────────────────────────────────────────
-- 20260702210000_start_process_rpc.sql
-- ─────────────────────────────────────────────────────────
-- Атомарный запуск экземпляра процесса (process_instance + все stage_instances
-- + стартовые задачи начальных этапов) — одной транзакцией Postgres.
--
-- Заменяет lib/workflow/start-process.ts::startProcess (см.
-- docs/workflow-transaction-risk-analysis.md, §2): раньше цикл создания
-- stage_instances делал по одному PostgREST-запросу на этап. Если падал
-- этап #2 из 4 — получался process_instance с физически неполным набором
-- этапов. Хуже: идемпотентность (проверка "уже есть активный instance") не
-- лечит это — повторный вызов найдёт уже сломанный instance и вернёт его
-- как already_existed=true, ничего не почини́в.
--
-- Отличие от TS-версии:
--   - Событие "Процесс запущен" на каждом активном стартовом этапе остаётся
--     best-effort (savepoint), как и в оригинале (void _evErr).
--   - Создание задач для этапов с has_tasks=true — НЕ best-effort: если
--     падает вставка любой задачи, откатывается вся операция целиком
--     (process_instance + все stage_instances), а не только "хвost".
--
-- ВАЖНО про коды ошибок: оба вызывающих места (app/api/applications/route.ts,
-- app/api/education/leads/route.ts) уже сегодня оборачивают вызов startProcess
-- в свой try/catch и трактуют его как best-effort шаг — ошибка НИКОГДА не
-- долетает до общего catch/jsonError, а просто кладётся в поле
-- workflow_error ответа. Поэтому конкретные ERRCODE здесь не влияют на HTTP-
-- статус ни в одном из двух мест; используются те же коды, что и в остальных
-- RPC, для единообразия и на случай будущего вызывающего кода, который
-- перестанет глотать ошибку молча.
--
-- Сигнатура — типизированные параметры, не jsonb payload, как и у
-- reactivate_stage (см. 20260702200000): фиксированный небольшой набор
-- скалярных аргументов, обёртка в jsonb не добавляла бы ценности.

CREATE OR REPLACE FUNCTION start_process(p_process_code text, p_journey_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_template_id         uuid;
  v_template_name       text;
  v_existing_id         uuid;
  v_stage               RECORD;
  v_stage_ids           uuid[] := ARRAY[]::uuid[];
  v_initial_ids         uuid[];
  v_any_initial_tasks   boolean;
  v_person_id           uuid;
  v_person_full_name    text;
  v_now                 timestamptz := NOW();
  v_pi_id               uuid;
  v_si_id               uuid;
  v_is_active           boolean;
  v_stage_instance_ids  uuid[] := ARRAY[]::uuid[];
  v_start_codes         text[];
  v_tt                  RECORD;
  v_assignee_type       text;
  v_assignee_id         uuid;
  v_department_id       uuid;
  v_position_id         uuid;
  v_task_status         text;
  v_title                text;
BEGIN
  -- 1. Шаблон процесса
  SELECT id, name_ru INTO v_template_id, v_template_name
  FROM process_templates WHERE code = p_process_code;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Шаблон процесса «%» не найден', p_process_code USING ERRCODE = 'P0002';
  END IF;

  -- 2. Идемпотентность — уже есть активный экземпляр?
  SELECT id INTO v_existing_id
  FROM process_instances
  WHERE journey_id = p_journey_id AND process_template_id = v_template_id AND status = 'active';

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'process_instance_id', v_existing_id,
      'stage_instance_ids', '[]'::jsonb,
      'already_existed', true
    );
  END IF;

  -- 3. Этапы процесса
  IF NOT EXISTS (SELECT 1 FROM stage_templates WHERE process_template_id = v_template_id) THEN
    RAISE EXCEPTION 'У процесса нет этапов' USING ERRCODE = '22023';
  END IF;

  -- 4. Начальные этапы (from_stage_template_id IS NULL), упорядоченные по sort_order
  SELECT COALESCE(array_agg(st.id ORDER BY st.sort_order), ARRAY[]::uuid[])
    INTO v_initial_ids
  FROM (
    SELECT DISTINCT tr.to_stage_template_id AS id
    FROM stage_transitions tr
    JOIN stage_templates t ON t.id = tr.to_stage_template_id
    WHERE tr.from_stage_template_id IS NULL AND t.process_template_id = v_template_id
  ) x
  JOIN stage_templates st ON st.id = x.id;

  IF array_length(v_initial_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'У процесса нет начальных этапов' USING ERRCODE = '22023';
  END IF;

  -- 5. Проверка автора для этапов с задачами
  SELECT EXISTS (
    SELECT 1 FROM stage_templates WHERE id = ANY(v_initial_ids) AND has_tasks
  ) INTO v_any_initial_tasks;

  IF v_any_initial_tasks AND p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Нельзя запустить процесс с задачами без автора (actorId=null)' USING ERRCODE = '22023';
  END IF;

  -- 5а. ФИО лида — подставляется в title задач
  IF v_any_initial_tasks THEN
    SELECT person_id INTO v_person_id FROM education_journeys WHERE id = p_journey_id;
    IF v_person_id IS NOT NULL THEN
      SELECT full_name INTO v_person_full_name FROM persons WHERE id = v_person_id;
    END IF;
  END IF;

  -- 6. process_instance
  INSERT INTO process_instances (process_template_id, journey_id, status, created_by)
  VALUES (v_template_id, p_journey_id, 'active', p_actor_id)
  RETURNING id INTO v_pi_id;

  -- 7. stage_instances (все подэтапы: активные начальные + waiting) + задачи
  FOR v_stage IN
    SELECT id, has_tasks FROM stage_templates
    WHERE process_template_id = v_template_id
    ORDER BY sort_order
  LOOP
    v_is_active := v_stage.id = ANY(v_initial_ids);

    INSERT INTO stage_instances (process_instance_id, stage_template_id, status, activated_at)
    VALUES (v_pi_id, v_stage.id, CASE WHEN v_is_active THEN 'active' ELSE 'waiting' END,
            CASE WHEN v_is_active THEN v_now ELSE NULL END)
    RETURNING id INTO v_si_id;

    v_stage_instance_ids := array_append(v_stage_instance_ids, v_si_id);

    IF v_is_active THEN
      -- Системное событие — best-effort, как и в оригинале (void _evErr).
      BEGIN
        INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
        VALUES (
          v_si_id, 'system',
          format('Процесс «%s» запущен', COALESCE(v_template_name, p_process_code)),
          p_actor_id,
          jsonb_build_object('process_code', p_process_code)
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    IF NOT v_is_active OR NOT v_stage.has_tasks THEN
      CONTINUE;
    END IF;

    -- Стартовые задачи подэтапа (см. createStartingTasks в start-process.ts).
    -- Вставка НЕ обёрнута в savepoint — ошибка должна откатить весь запуск
    -- процесса, а не оставить его с частью задач.
    SELECT COALESCE(array_agg(DISTINCT to_task_code), ARRAY[]::text[])
      INTO v_start_codes
    FROM task_transitions
    WHERE stage_template_id = v_stage.id AND from_task_code IS NULL;

    FOR v_tt IN
      SELECT * FROM stage_task_templates
      WHERE stage_template_id = v_stage.id
        AND (array_length(v_start_codes, 1) IS NULL OR code = ANY(v_start_codes))
      ORDER BY sort_order
    LOOP
      v_assignee_type := 'unassigned';
      v_assignee_id := NULL;
      v_department_id := NULL;
      v_position_id := NULL;
      v_task_status := 'unassigned';

      IF v_tt.default_assignee_type = 'creator' THEN
        v_assignee_type := 'person';
        v_assignee_id := p_actor_id;
        v_task_status := 'pending';
      ELSIF v_tt.default_assignee_type = 'department' AND v_tt.default_department_id IS NOT NULL THEN
        v_assignee_type := 'department';
        v_department_id := v_tt.default_department_id;
      ELSIF v_tt.default_assignee_type = 'position' AND v_tt.default_position_id IS NOT NULL THEN
        v_assignee_type := 'position';
        v_position_id := v_tt.default_position_id;
      END IF;

      v_title := CASE WHEN v_person_full_name IS NOT NULL
        THEN v_tt.title || ': ' || v_person_full_name
        ELSE v_tt.title
      END;

      INSERT INTO tasks (
        title, description, module, metadata, assignee_type, assignee_id,
        department_id, position_id, creator_id, status, priority,
        due_date, due_time, due_all_day, stage_instance_id, stage_task_template_id
      ) VALUES (
        v_title, v_tt.description, 'general', '{}'::jsonb, v_assignee_type, v_assignee_id,
        v_department_id, v_position_id, p_actor_id, v_task_status, v_tt.default_priority,
        NULL, NULL, true, v_si_id, v_tt.id
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'process_instance_id', v_pi_id,
    'stage_instance_ids', to_jsonb(v_stage_instance_ids),
    'already_existed', false
  );
END;
$$;


-- ─────────────────────────────────────────────────────────
-- 20260702220000_handle_task_completion_rpc.sql
-- ─────────────────────────────────────────────────────────
-- Атомарная обработка завершения задачи: событие + активация следующих задач
-- подэтапа по task_transitions (after_one/after_all) — одной транзакцией.
--
-- Заменяет lib/workflow/handle-task-completion.ts::handleTaskCompletion (см.
-- docs/workflow-transaction-risk-analysis.md, §3): цикл создания задач делал
-- по одному PostgREST-запросу на каждый исходящий переход. Если создание
-- задачи #2 из 3 падает — задача #1 уже создана, #3 нет: асимметричное
-- продвижение веток подэтапа, которое трудно закрыть руками.
--
-- Отличие от TS-версии:
--   - Событие "Задача завершена" остаётся best-effort (savepoint), как и в
--     оригинале (void _evErr).
--   - Создание следующих задач — НЕ best-effort: если падает вставка любой
--     из них, откатывается вся обработка целиком.
--   - "Тихие" ранние выходы (задача не найдена, нет шаблона/stage_instance,
--     нет исходящих переходов) остаются тихими — RETURN без RAISE EXCEPTION,
--     как и в оригинале (`if (!task) return`). Это осознанно отличается от
--     reactivate_stage/start_process, которые в аналогичных ситуациях
--     бросают P0002/22023: там "не найдено" — ошибка вызывающего кода,
--     здесь — штатный путь (например, legacy-задача без привязки к этапу).
--
-- after_all: задача создаётся только когда ВСЕ предшественники (все
-- from_task_code, ведущие к этому to_task_code) имеют задачу со статусом
-- 'completed' в этом же stage_instance. Дедупликация по to_task_code — если
-- несколько исходящих переходов ведут к одному and тому же to_task_code,
-- берётся с наименьшим sort_order (как и `seen`-множество в оригинале при
-- переборе, отсортированном по sort_order).
--
-- Возвращаемое значение — jsonb с массивом id созданных задач. Оригинальная
-- TS-функция возвращала void (вызывающий код игнорирует результат); здесь
-- добавлено чисто для наглядности при отладке/тестировании, поведение не
-- меняет.
--
-- Сигнатура — типизированные параметры, как у reactivate_stage/start_process.

CREATE OR REPLACE FUNCTION handle_task_completion(p_task_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_title               text;
  v_stage_instance_id   uuid;
  v_stage_task_template_id uuid;
  v_from_code           text;
  v_stage_template_id   uuid;
  v_process_instance_id uuid;
  v_journey_id          uuid;
  v_person_id           uuid;
  v_person_full_name    text;
  v_tr                  RECORD;
  v_target              RECORD;
  v_predecessor_ids     uuid[];
  v_pred_count          int;
  v_pred_total          int;
  v_pred_not_done       int;
  v_assignee_type       text;
  v_assignee_id         uuid;
  v_department_id       uuid;
  v_position_id         uuid;
  v_task_status         text;
  v_new_title           text;
  v_new_task_id         uuid;
  v_created_ids         uuid[] := ARRAY[]::uuid[];
BEGIN
  -- 1. Задача + её шаблон
  SELECT t.title, t.stage_instance_id, t.stage_task_template_id, stt.code, stt.stage_template_id
    INTO v_title, v_stage_instance_id, v_stage_task_template_id, v_from_code, v_stage_template_id
  FROM tasks t
  LEFT JOIN stage_task_templates stt ON stt.id = t.stage_task_template_id
  WHERE t.id = p_task_id;

  -- Задача не найдена, либо нет шаблона (legacy), либо не привязана к
  -- подэтапу — тихий no-op, как и в оригинале.
  IF NOT FOUND OR v_stage_task_template_id IS NULL OR v_stage_instance_id IS NULL THEN
    RETURN jsonb_build_object('created_task_ids', '[]'::jsonb);
  END IF;

  -- Системное событие — best-effort, как и в оригинале (void _evErr).
  BEGIN
    INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
    VALUES (
      v_stage_instance_id, 'system',
      format('Задача «%s» завершена', v_title),
      p_actor_id,
      jsonb_build_object('task_id', p_task_id)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- ФИО лида для title следующих задач
  SELECT process_instance_id INTO v_process_instance_id
  FROM stage_instances WHERE id = v_stage_instance_id;
  IF v_process_instance_id IS NOT NULL THEN
    SELECT journey_id INTO v_journey_id FROM process_instances WHERE id = v_process_instance_id;
  END IF;
  IF v_journey_id IS NOT NULL THEN
    SELECT person_id INTO v_person_id FROM education_journeys WHERE id = v_journey_id;
  END IF;
  IF v_person_id IS NOT NULL THEN
    SELECT full_name INTO v_person_full_name FROM persons WHERE id = v_person_id;
  END IF;

  -- 2. Исходящие переходы от завершённой задачи, дедуплицированные по
  -- to_task_code (при нескольких рёбрах в один код — берём с наименьшим
  -- sort_order, как и `seen`-множество в оригинале).
  FOR v_tr IN
    SELECT DISTINCT ON (to_task_code) to_task_code, activation_mode
    FROM task_transitions
    WHERE stage_template_id = v_stage_template_id AND from_task_code = v_from_code
    ORDER BY to_task_code, sort_order
  LOOP
    -- Шаблон задачи под этот code
    SELECT * INTO v_target
    FROM stage_task_templates
    WHERE stage_template_id = v_stage_template_id AND code = v_tr.to_task_code;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- a. Уже есть задача с этим шаблоном в этом stage_instance?
    IF EXISTS (
      SELECT 1 FROM tasks
      WHERE stage_instance_id = v_stage_instance_id AND stage_task_template_id = v_target.id
    ) THEN
      CONTINUE;
    END IF;

    -- b/c. Режим активации
    IF v_tr.activation_mode = 'after_all' THEN
      SELECT COALESCE(array_agg(stt2.id), ARRAY[]::uuid[]) INTO v_predecessor_ids
      FROM task_transitions tt2
      JOIN stage_task_templates stt2
        ON stt2.stage_template_id = v_stage_template_id AND stt2.code = tt2.from_task_code
      WHERE tt2.stage_template_id = v_stage_template_id
        AND tt2.to_task_code = v_tr.to_task_code
        AND tt2.from_task_code IS NOT NULL;

      v_pred_count := COALESCE(array_length(v_predecessor_ids, 1), 0);

      IF v_pred_count > 0 THEN
        SELECT COUNT(*), COUNT(*) FILTER (WHERE status <> 'completed')
          INTO v_pred_total, v_pred_not_done
        FROM tasks
        WHERE stage_instance_id = v_stage_instance_id
          AND stage_task_template_id = ANY(v_predecessor_ids);

        -- Точное соответствие оригиналу: predTasks.length >= predecessorIds.length
        -- И все найденные строки — 'completed' (а не «столько же completed,
        -- сколько предшественников» — это разные условия при дублях задач).
        IF v_pred_total < v_pred_count OR v_pred_not_done > 0 THEN
          CONTINUE;
        END IF;
      END IF;
      -- v_pred_count = 0 (нет предшественников с непустым from_task_code) →
      -- как и в оригинале, создаём безусловно (тот же пограничный случай).
    END IF;

    -- Создать задачу (см. mapTaskTemplate в start-process.ts)
    v_assignee_type := 'unassigned';
    v_assignee_id := NULL;
    v_department_id := NULL;
    v_position_id := NULL;
    v_task_status := 'unassigned';

    IF v_target.default_assignee_type = 'creator' THEN
      v_assignee_type := 'person';
      v_assignee_id := p_actor_id;
      v_task_status := 'pending';
    ELSIF v_target.default_assignee_type = 'department' AND v_target.default_department_id IS NOT NULL THEN
      v_assignee_type := 'department';
      v_department_id := v_target.default_department_id;
    ELSIF v_target.default_assignee_type = 'position' AND v_target.default_position_id IS NOT NULL THEN
      v_assignee_type := 'position';
      v_position_id := v_target.default_position_id;
    END IF;

    v_new_title := CASE WHEN v_person_full_name IS NOT NULL
      THEN v_target.title || ': ' || v_person_full_name
      ELSE v_target.title
    END;

    INSERT INTO tasks (
      title, description, module, metadata, assignee_type, assignee_id,
      department_id, position_id, creator_id, status, priority,
      due_date, due_time, due_all_day, stage_instance_id, stage_task_template_id
    ) VALUES (
      v_new_title, v_target.description, 'general', '{}'::jsonb, v_assignee_type, v_assignee_id,
      v_department_id, v_position_id, p_actor_id, v_task_status, v_target.default_priority,
      NULL, NULL, true, v_stage_instance_id, v_target.id
    )
    RETURNING id INTO v_new_task_id;

    v_created_ids := array_append(v_created_ids, v_new_task_id);
  END LOOP;

  RETURN jsonb_build_object('created_task_ids', to_jsonb(v_created_ids));
END;
$$;


-- ─────────────────────────────────────────────────────────
-- 20260702230000_close_process_early_rpc.sql
-- ─────────────────────────────────────────────────────────
-- Атомарное досрочное закрытие процесса (skip подэтапов + cancel задач +
-- завершение процесса + опциональная конверсия лида) — одной транзакцией.
--
-- Заменяет lib/workflow/close-process-early.ts::closeProcessEarly (см.
-- docs/workflow-transaction-risk-analysis.md, §4): ~8 последовательных шагов
-- через PostgREST. Опасный failure mode — "зомби-задачи": если шаг отмены
-- задач падает ПОСЛЕ того, как подэтапы уже помечены skipped / процесс уже
-- completed, задачи остаются pending, но принадлежат мёртвому процессу.
--
-- Отличие от TS-версии:
--   - Событие "Подэтап отменён" на каждом отменённом подэтапе остаётся
--     best-effort (savepoint), как и в оригинале (void _evErr).
--   - Всё остальное (skip подэтапов, cancel задач, завершение процесса,
--     конверсия journey) — атомарно: если что-то падает, откатывается всё.
--
-- Коды ошибок для маппинга в lib/api/handler.ts (mapPgError):
--   P0002 — процесс не найден (404)
--   22023 — процесс уже завершён / нет этапов / недопустимый финал (400)
--
-- Сигнатура — типизированные параметры, как у остальных workflow-RPC.

CREATE OR REPLACE FUNCTION close_process_early(
  p_process_instance_id uuid,
  p_final_code text,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_status              text;
  v_process_template_id uuid;
  v_journey_id          uuid;
  v_final_stage_id      uuid;
  v_finish_reason       text;
  v_now                 timestamptz := NOW();
  v_stage               RECORD;
  v_journey_converted   boolean := false;
BEGIN
  -- 1. Загрузить process_instance
  SELECT status, process_template_id, journey_id
    INTO v_status, v_process_template_id, v_journey_id
  FROM process_instances
  WHERE id = p_process_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Процесс не найден' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Процесс должен быть активным
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Процесс уже завершён' USING ERRCODE = '22023';
  END IF;

  -- 3. Финальный stage_template (MAX sort_order для этого process_template)
  SELECT id INTO v_final_stage_id
  FROM stage_templates
  WHERE process_template_id = v_process_template_id
  ORDER BY sort_order DESC
  LIMIT 1;

  IF v_final_stage_id IS NULL THEN
    RAISE EXCEPTION 'У процесса нет этапов' USING ERRCODE = '22023';
  END IF;

  -- 4. finalCode должен быть среди финалов последнего подэтапа
  IF NOT EXISTS (
    SELECT 1 FROM stage_finals
    WHERE stage_template_id = v_final_stage_id AND code = p_final_code
  ) THEN
    RAISE EXCEPTION 'Недопустимый финал' USING ERRCODE = '22023';
  END IF;

  -- Маппинг финала → причина завершения (см. mapFinishReason в оригинале
  -- и логику completeStage: convert_to_applicant→converted и т.д.).
  v_finish_reason := CASE p_final_code
    WHEN 'convert_to_applicant' THEN 'converted'
    WHEN 'rejected'             THEN 'rejected'
    WHEN 'postponed'            THEN 'postponed'
    ELSE 'cancelled'
  END;

  -- 5. Отменить (skip) незавершённые подэтапы + событие на каждый (best-effort).
  -- UPDATE ... RETURNING в FOR-цикле: обрабатываем ровно те строки, что были
  -- active|waiting и потому обновлены — как и pre-collect в оригинале.
  FOR v_stage IN
    UPDATE stage_instances
    SET status = 'skipped', completed_at = v_now, completed_by = p_actor_id
    WHERE process_instance_id = p_process_instance_id
      AND status IN ('active', 'waiting')
    RETURNING id
  LOOP
    BEGIN
      INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
      VALUES (
        v_stage.id, 'system', 'Подэтап отменён', p_actor_id,
        jsonb_build_object('reason', 'close_early', 'final_code', p_final_code)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  -- 6. Отменить незавершённые задачи всех подэтапов процесса
  UPDATE tasks
  SET status = 'cancelled', completed_at = v_now
  WHERE stage_instance_id IN (
    SELECT id FROM stage_instances WHERE process_instance_id = p_process_instance_id
  )
  AND status IN ('unassigned', 'pending', 'in_progress', 'review');

  -- 7. Завершить процесс
  UPDATE process_instances
  SET status = 'completed', finish_reason = v_finish_reason, finished_at = v_now
  WHERE id = p_process_instance_id;

  -- 8. Конверсия лида в абитуриента
  IF p_final_code = 'convert_to_applicant' THEN
    UPDATE education_journeys
    SET education_status = 'applicant', application_date = v_now
    WHERE id = v_journey_id;
    v_journey_converted := true;
  END IF;

  RETURN jsonb_build_object(
    'process_instance_id', p_process_instance_id,
    'final_code', p_final_code,
    'finish_reason', v_finish_reason,
    'journey_converted', v_journey_converted
  );
END;
$$;


-- ─────────────────────────────────────────────────────────
-- 20260703120000_complete_stage_rpc.sql
-- ─────────────────────────────────────────────────────────
-- Атомарное завершение подэтапа + продвижение процесса — одной транзакцией.
--
-- Заменяет lib/workflow/complete-stage.ts::completeStage — самую сложную и
-- рискованную функцию движка (см. docs/workflow-transaction-risk-analysis.md
-- §5, разбор веток в docs/complete-stage-conversion-prep.md, эталон поведения
-- в docs/complete-stage-baseline.md). 15+ последовательных операций, 2 крупные
-- ветки (closes_process / обычный поток), after_one/after_all, каскадный skip
-- недостижимых подэтапов.
--
-- ПЕРЕНОС ОДИН-В-ОДИН. Сознательно сохранены (не «исправлены») тонкости,
-- зафиксированные в prep-доке §3 и подтверждённые эталоном:
--   • Конверсия лида закодирована в ДВУХ местах (ветка A и авто-закрытие) с
--     разным статусом процесса: ветка A → 'cancelled', авто-закрытие →
--     'completed'. Для recruitment все closes_process-финалы идут веткой A →
--     процесс 'cancelled' даже при успешной конверсии.
--   • application_date НЕ трогается ни в одной из веток (в отличие от
--     close_process_early) — оставлено как в оригинале.
--   • Проверка after_all в шаге 5 (активация) — БЕЗ проверки «предшественников
--     найдено >= ожидалось»; в шаге 5b (skip) — С проверкой. Асимметрия
--     сохранена дословно.
--   • Skip недостижимых (5b) — best-effort (savepoint): сбой skip не
--     откатывает уже сделанные активации (в оригинале — console.error без
--     throw). Все события (process_events) — тоже best-effort.
--
-- Логика создания стартовых задач подэтапа инлайнится (как в reactivate_stage
-- и start_process) — сознательно не выносится в общую функцию, чтобы не
-- трогать уже проверенные RPC.
--
-- Коды ошибок для jsonError (mapPgError): P0002 — подэтап не найден (404);
-- 22023 — подэтап не активен (400).

CREATE OR REPLACE FUNCTION complete_stage(
  p_stage_instance_id uuid,
  p_final_code text,
  p_actor_id uuid,
  p_result_data jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_status              text;
  v_stage_template_id   uuid;
  v_process_instance_id uuid;
  v_journey_id          uuid;
  v_now                 timestamptz := NOW();
  v_closes_process      boolean;
  v_process_finish      text;
  v_stage               RECORD;
  v_person_id           uuid;
  v_person_full_name    text;
  v_tr                  RECORD;
  v_target_si_id        uuid;
  v_target_has_tasks    boolean;
  v_should_activate     boolean;
  v_pred_ids            uuid[];
  v_pred_total          int;
  v_pred_not_term       int;
  v_activated_ids       uuid[] := ARRAY[]::uuid[];
  v_seen_targets        uuid[] := ARRAY[]::uuid[];
  v_wi                  RECORD;
  v_pred_tmpl_ids       uuid[];
  v_remaining_active    int;
  v_finish_reason       text;
  v_process_completed   boolean := false;
  -- task creation locals
  v_start_codes         text[];
  v_tt                  RECORD;
  v_assignee_type       text;
  v_assignee_id         uuid;
  v_department_id       uuid;
  v_position_id         uuid;
  v_task_status         text;
  v_title               text;
BEGIN
  -- 1. Загрузка + валидация
  SELECT si.status, si.stage_template_id, si.process_instance_id, pi.journey_id
    INTO v_status, v_stage_template_id, v_process_instance_id, v_journey_id
  FROM stage_instances si
  JOIN process_instances pi ON pi.id = si.process_instance_id
  WHERE si.id = p_stage_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Подэтап не найден' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Подэтап не активен' USING ERRCODE = '22023';
  END IF;

  -- 2. Завершить текущий подэтап
  UPDATE stage_instances
  SET status = 'completed', final_code = p_final_code,
      completed_at = v_now, completed_by = p_actor_id,
      result_data = COALESCE(p_result_data, '{}'::jsonb)
  WHERE id = p_stage_instance_id;

  BEGIN
    INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
    VALUES (p_stage_instance_id, 'system', 'Подэтап завершён: ' || p_final_code,
            p_actor_id, jsonb_build_object('final_code', p_final_code));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 3. Завершить задачи этого подэтапа
  UPDATE tasks SET status = 'completed', completed_at = v_now
  WHERE stage_instance_id = p_stage_instance_id
    AND status <> 'completed' AND status <> 'cancelled';

  -- 3b. Финал закрывает процесс?
  SELECT closes_process, process_finish_reason INTO v_closes_process, v_process_finish
  FROM stage_finals
  WHERE stage_template_id = v_stage_template_id AND code = p_final_code;

  IF COALESCE(v_closes_process, false) THEN
    v_process_finish := COALESCE(v_process_finish, p_final_code);

    -- а. Отменить оставшиеся active/waiting подэтапы (+ события best-effort)
    FOR v_stage IN
      UPDATE stage_instances
      SET status = 'cancelled', completed_at = v_now, completed_by = p_actor_id
      WHERE process_instance_id = v_process_instance_id
        AND status IN ('active', 'waiting')
      RETURNING id
    LOOP
      BEGIN
        INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
        VALUES (v_stage.id, 'system', 'Подэтап отменён', p_actor_id,
                jsonb_build_object('reason', 'closes_process', 'final_code', p_final_code));
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP;

    -- б. Отменить незавершённые задачи всех подэтапов процесса
    UPDATE tasks SET status = 'cancelled', completed_at = v_now
    WHERE stage_instance_id IN (
      SELECT id FROM stage_instances WHERE process_instance_id = v_process_instance_id
    )
    AND status IN ('unassigned', 'pending', 'in_progress', 'review');

    -- в. Закрыть процесс (статус 'cancelled' — как в оригинале)
    UPDATE process_instances
    SET status = 'cancelled', finish_reason = v_process_finish, finished_at = v_now
    WHERE id = v_process_instance_id;

    -- г. Конверсия (без application_date)
    IF v_process_finish = 'converted' THEN
      UPDATE education_journeys SET education_status = 'applicant' WHERE id = v_journey_id;
    END IF;

    RETURN jsonb_build_object(
      'stage_instance_id', p_stage_instance_id,
      'activated_stage_ids', '[]'::jsonb,
      'process_completed', true,
      'finish_reason', v_process_finish
    );
  END IF;

  -- 4b. ФИО лида для title создаваемых задач
  SELECT person_id INTO v_person_id FROM education_journeys WHERE id = v_journey_id;
  IF v_person_id IS NOT NULL THEN
    SELECT full_name INTO v_person_full_name FROM persons WHERE id = v_person_id;
  END IF;

  -- 4/5. Исходящие переходы + активация целевых подэтапов
  FOR v_tr IN
    SELECT to_stage_template_id, activation_mode
    FROM stage_transitions
    WHERE from_stage_template_id = v_stage_template_id AND trigger_final_code = p_final_code
    ORDER BY sort_order
  LOOP
    IF v_tr.to_stage_template_id = ANY(v_seen_targets) THEN
      CONTINUE;
    END IF;
    v_seen_targets := array_append(v_seen_targets, v_tr.to_stage_template_id);

    IF v_tr.activation_mode = 'after_one' THEN
      v_should_activate := true;
    ELSE
      -- after_all: все предшественники completed|skipped (БЕЗ проверки количества)
      SELECT COALESCE(array_agg(DISTINCT from_stage_template_id), ARRAY[]::uuid[])
        INTO v_pred_ids
      FROM stage_transitions
      WHERE to_stage_template_id = v_tr.to_stage_template_id
        AND from_stage_template_id IS NOT NULL;

      IF COALESCE(array_length(v_pred_ids, 1), 0) > 0 THEN
        SELECT COUNT(*) FILTER (WHERE status NOT IN ('completed', 'skipped'))
          INTO v_pred_not_term
        FROM stage_instances
        WHERE process_instance_id = v_process_instance_id
          AND stage_template_id = ANY(v_pred_ids);
        v_should_activate := (v_pred_not_term = 0);
      ELSE
        v_should_activate := true;
      END IF;
    END IF;

    IF NOT v_should_activate THEN
      CONTINUE;
    END IF;

    -- Найти waiting-инстанс цели
    SELECT id INTO v_target_si_id
    FROM stage_instances
    WHERE process_instance_id = v_process_instance_id
      AND stage_template_id = v_tr.to_stage_template_id
      AND status = 'waiting'
    LIMIT 1;

    IF v_target_si_id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE stage_instances SET status = 'active', activated_at = v_now
    WHERE id = v_target_si_id;
    v_activated_ids := array_append(v_activated_ids, v_target_si_id);

    BEGIN
      INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
      VALUES (v_target_si_id, 'system', 'Подэтап активирован', p_actor_id, NULL);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Создать стартовые задачи, если у цели has_tasks и есть автор
    SELECT has_tasks INTO v_target_has_tasks FROM stage_templates WHERE id = v_tr.to_stage_template_id;

    IF COALESCE(v_target_has_tasks, false) AND p_actor_id IS NOT NULL THEN
      SELECT COALESCE(array_agg(DISTINCT to_task_code), ARRAY[]::text[]) INTO v_start_codes
      FROM task_transitions
      WHERE stage_template_id = v_tr.to_stage_template_id AND from_task_code IS NULL;

      FOR v_tt IN
        SELECT * FROM stage_task_templates
        WHERE stage_template_id = v_tr.to_stage_template_id
          AND (array_length(v_start_codes, 1) IS NULL OR code = ANY(v_start_codes))
        ORDER BY sort_order
      LOOP
        v_assignee_type := 'unassigned'; v_assignee_id := NULL;
        v_department_id := NULL; v_position_id := NULL; v_task_status := 'unassigned';

        IF v_tt.default_assignee_type = 'creator' THEN
          v_assignee_type := 'person'; v_assignee_id := p_actor_id; v_task_status := 'pending';
        ELSIF v_tt.default_assignee_type = 'department' AND v_tt.default_department_id IS NOT NULL THEN
          v_assignee_type := 'department'; v_department_id := v_tt.default_department_id;
        ELSIF v_tt.default_assignee_type = 'position' AND v_tt.default_position_id IS NOT NULL THEN
          v_assignee_type := 'position'; v_position_id := v_tt.default_position_id;
        END IF;

        v_title := CASE WHEN v_person_full_name IS NOT NULL
          THEN v_tt.title || ': ' || v_person_full_name ELSE v_tt.title END;

        INSERT INTO tasks (
          title, description, module, metadata, assignee_type, assignee_id,
          department_id, position_id, creator_id, status, priority,
          due_date, due_time, due_all_day, stage_instance_id, stage_task_template_id
        ) VALUES (
          v_title, v_tt.description, 'general', '{}'::jsonb, v_assignee_type, v_assignee_id,
          v_department_id, v_position_id, p_actor_id, v_task_status, v_tt.default_priority,
          NULL, NULL, true, v_target_si_id, v_tt.id
        );
      END LOOP;
    END IF;
  END LOOP;

  -- 5b. Skip недостижимых waiting-подэтапов (best-effort: сбой не откатывает).
  --     Проверка С учётом количества предшественников (в отличие от шага 5).
  FOR v_wi IN
    SELECT id, stage_template_id FROM stage_instances
    WHERE process_instance_id = v_process_instance_id AND status = 'waiting'
  LOOP
    SELECT COALESCE(array_agg(DISTINCT from_stage_template_id), ARRAY[]::uuid[])
      INTO v_pred_tmpl_ids
    FROM stage_transitions
    WHERE to_stage_template_id = v_wi.stage_template_id
      AND from_stage_template_id IS NOT NULL;

    IF COALESCE(array_length(v_pred_tmpl_ids, 1), 0) = 0 THEN
      CONTINUE;
    END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE status NOT IN ('completed', 'skipped'))
      INTO v_pred_total, v_pred_not_term
    FROM stage_instances
    WHERE process_instance_id = v_process_instance_id
      AND stage_template_id = ANY(v_pred_tmpl_ids);

    IF v_pred_total >= array_length(v_pred_tmpl_ids, 1) AND v_pred_not_term = 0 THEN
      BEGIN
        UPDATE stage_instances SET status = 'skipped' WHERE id = v_wi.id;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;

  -- 6. Авто-закрытие процесса, если не осталось active подэтапов
  SELECT COUNT(*) INTO v_remaining_active
  FROM stage_instances
  WHERE process_instance_id = v_process_instance_id AND status = 'active';

  IF v_remaining_active = 0 THEN
    v_finish_reason := CASE p_final_code
      WHEN 'convert_to_applicant' THEN 'converted'
      WHEN 'rejected'             THEN 'rejected'
      WHEN 'postponed'            THEN 'postponed'
      ELSE NULL
    END;

    UPDATE process_instances
    SET status = 'completed', finish_reason = v_finish_reason, finished_at = v_now
    WHERE id = v_process_instance_id;
    v_process_completed := true;

    IF p_final_code = 'convert_to_applicant' THEN
      UPDATE education_journeys SET education_status = 'applicant' WHERE id = v_journey_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'stage_instance_id', p_stage_instance_id,
    'activated_stage_ids', to_jsonb(v_activated_ids),
    'process_completed', v_process_completed,
    'finish_reason', v_finish_reason
  );
END;
$$;


-- ─────────────────────────────────────────────────────────
-- 20260703130000_fix_close_process_early_application_date.sql
-- ─────────────────────────────────────────────────────────
-- Fix: close_process_early больше НЕ перезаписывает application_date при
-- конверсии лида в абитуриента.
--
-- application_date («Дата подачи» / "תאריך הגשה") — дата ПОДАЧИ заявки,
-- проставляется один раз при создании лида (create_application) и показывается
-- в списках и лидов, и абитуриентов (сортировка лидов идёт по ней). Это НЕ
-- «дата конверсии в абитуриента».
--
-- Прежняя версия close_process_early (20260702230000) при
-- final_code='convert_to_applicant' делала
-- `SET education_status='applicant', application_date=NOW()` — то есть
-- затирала исходную дату подачи датой конверсии. Пример бага: лид подал заявку
-- 01.06, конвертирован 03.07 → дата подачи ошибочно менялась на 03.07.
--
-- complete_stage (основной путь конверсии) application_date не трогает и
-- всегда был прав. Этот патч выравнивает close_process_early по нему: убрана
-- только строка `application_date = v_now`. Остальное тело функции идентично
-- 20260702230000.

CREATE OR REPLACE FUNCTION close_process_early(
  p_process_instance_id uuid,
  p_final_code text,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_status              text;
  v_process_template_id uuid;
  v_journey_id          uuid;
  v_final_stage_id      uuid;
  v_finish_reason       text;
  v_now                 timestamptz := NOW();
  v_stage               RECORD;
  v_journey_converted   boolean := false;
BEGIN
  -- 1. Загрузить process_instance
  SELECT status, process_template_id, journey_id
    INTO v_status, v_process_template_id, v_journey_id
  FROM process_instances
  WHERE id = p_process_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Процесс не найден' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Процесс должен быть активным
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Процесс уже завершён' USING ERRCODE = '22023';
  END IF;

  -- 3. Финальный stage_template (MAX sort_order для этого process_template)
  SELECT id INTO v_final_stage_id
  FROM stage_templates
  WHERE process_template_id = v_process_template_id
  ORDER BY sort_order DESC
  LIMIT 1;

  IF v_final_stage_id IS NULL THEN
    RAISE EXCEPTION 'У процесса нет этапов' USING ERRCODE = '22023';
  END IF;

  -- 4. finalCode должен быть среди финалов последнего подэтапа
  IF NOT EXISTS (
    SELECT 1 FROM stage_finals
    WHERE stage_template_id = v_final_stage_id AND code = p_final_code
  ) THEN
    RAISE EXCEPTION 'Недопустимый финал' USING ERRCODE = '22023';
  END IF;

  v_finish_reason := CASE p_final_code
    WHEN 'convert_to_applicant' THEN 'converted'
    WHEN 'rejected'             THEN 'rejected'
    WHEN 'postponed'            THEN 'postponed'
    ELSE 'cancelled'
  END;

  -- 5. Отменить (skip) незавершённые подэтапы + событие на каждый (best-effort)
  FOR v_stage IN
    UPDATE stage_instances
    SET status = 'skipped', completed_at = v_now, completed_by = p_actor_id
    WHERE process_instance_id = p_process_instance_id
      AND status IN ('active', 'waiting')
    RETURNING id
  LOOP
    BEGIN
      INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
      VALUES (
        v_stage.id, 'system', 'Подэтап отменён', p_actor_id,
        jsonb_build_object('reason', 'close_early', 'final_code', p_final_code)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  -- 6. Отменить незавершённые задачи всех подэтапов процесса
  UPDATE tasks
  SET status = 'cancelled', completed_at = v_now
  WHERE stage_instance_id IN (
    SELECT id FROM stage_instances WHERE process_instance_id = p_process_instance_id
  )
  AND status IN ('unassigned', 'pending', 'in_progress', 'review');

  -- 7. Завершить процесс
  UPDATE process_instances
  SET status = 'completed', finish_reason = v_finish_reason, finished_at = v_now
  WHERE id = p_process_instance_id;

  -- 8. Конверсия лида в абитуриента — БЕЗ перезаписи application_date
  --    (исходная дата подачи сохраняется; см. шапку миграции).
  IF p_final_code = 'convert_to_applicant' THEN
    UPDATE education_journeys
    SET education_status = 'applicant'
    WHERE id = v_journey_id;
    v_journey_converted := true;
  END IF;

  RETURN jsonb_build_object(
    'process_instance_id', p_process_instance_id,
    'final_code', p_final_code,
    'finish_reason', v_finish_reason,
    'journey_converted', v_journey_converted
  );
END;
$$;


-- ─────────────────────────────────────────────────────────
-- 20260703140000_audit_log_expand_privileges_staff_workflow.sql
-- ─────────────────────────────────────────────────────────
-- Расширение audit_log на таблицы модулей, затронутых в этой сессии
-- (привилегии, персонал, workflow). Инкрементально, как договорено — не
-- блэнкет-подключение ко всем таблицам сразу.
--
-- Триггерная функция audit_log_trigger() уже создана в 20260702170000 и
-- универсальна (любая таблица с PK "id"). Здесь только вешаем её на новые
-- таблицы. "Что/когда" фиксируется всегда; "кто" (changed_by) — только если
-- пишущий код выставил app.current_actor_id:
--   • staff_positions/staff_profiles: заполняется при создании через RPC
--     create_staff_member (там есть set_config), но НЕ при увольнении
--     (DELETE /api/staff/[profileId] — обычный PostgREST-update) и не при
--     прочих прямых правках. Тогда changed_by = NULL, запись не теряется.
--   • role_privileges/person_privileges: пишутся из settings-эндпоинтов
--     обычным PostgREST (superadmin) → changed_by = NULL. Всё равно ценно:
--     видно, КАКОЙ доступ и КОГДА менялся.
--   • process_instances/stage_instances: пишутся workflow-RPC, которые пока
--     не вызывают set_config → changed_by = NULL. Полная атрибуция «кто» для
--     workflow — отдельный follow-up (добавить одну строку set_config в 5
--     RPC).
--
-- tasks сознательно НЕ подключаем сейчас: высокий объём изменений статусов,
-- аудит задач менее приоритетен, чем безопасность/HR/жизненный цикл процесса.

-- ── Привилегии (изменения доступа — security-critical) ──────────────────────
DROP TRIGGER IF EXISTS trg_audit_log ON role_privileges;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON role_privileges
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_log ON person_privileges;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON person_privileges
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- ── Персонал (приём/увольнение/должности) ───────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_log ON staff_positions;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON staff_positions
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_log ON staff_profiles;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON staff_profiles
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- ── Workflow (жизненный цикл процесса и подэтапов) ──────────────────────────
DROP TRIGGER IF EXISTS trg_audit_log ON process_instances;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON process_instances
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_log ON stage_instances;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON stage_instances
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();


-- ─────────────────────────────────────────────────────────
-- 20260703150000_system_person_for_public_form.sql
-- ─────────────────────────────────────────────────────────
-- Служебная запись-«актёр» для публичных заявок с сайта.
--
-- У публичной формы заявок нет сессии/пользователя, но create_application и
-- start_process требуют actor_id (start_process — потому что стартовый подэтап
-- «Контакт» имеет задачи, а tasks.creator_id NOT NULL). Эта запись служит
-- таким actor_id и creator_id автосоздаваемых задач для публичных заявок.
--
-- Фиксированный id, чтобы код (app/api/public/applications) мог на него
-- ссылаться. Идемпотентно. full_name — GENERATED из first_name/last_name.
INSERT INTO persons (id, first_name, last_name, notes)
VALUES (
  'ffffffff-0000-4000-8000-000000000001',
  'Система',
  '(публичная заявка)',
  'Служебная запись: актёр публичной формы заявок с сайта. Не удалять.'
)
ON CONFLICT (id) DO NOTHING;


-- ─────────────────────────────────────────────────────────
-- 20260703160000_system_person_account.sql
-- ─────────────────────────────────────────────────────────
-- Активный, но НЕвходной аккаунт для служебной записи публичной формы
-- (20260703150000). Нужен, потому что триггер tasks_validate_account
-- (20260511000343) требует, чтобы creator_id задачи имел АКТИВНЫЙ
-- person_account. Публичная форма создаёт задачу-уведомление от имени этой
-- служебной записи, значит у неё должен быть активный аккаунт.
--
-- Вход невозможен: /api/auth/login явно отклоняет аккаунт с password_hash IS
-- NULL (возвращает 401 до сверки пароля). is_active=TRUE нужно только для
-- прохождения триггера задач. У записи нет person_roles → прав нет в любом
-- случае.
INSERT INTO person_accounts (person_id, login_email, password_hash, is_active)
VALUES (
  'ffffffff-0000-4000-8000-000000000001',
  'system+public-form@campus.internal',
  NULL,
  TRUE
)
ON CONFLICT (login_email) DO NOTHING;


-- ─────────────────────────────────────────────────────────
-- 20260703170000_admission_student_conversion.sql
-- ─────────────────────────────────────────────────────────
-- Расширение конверсии journey в движке: поддержка applicant → student
-- (процесс «Приём»), в дополнение к существующей lead → applicant («Набор»).
--
-- Изменение ХИРУРГИЧЕСКОЕ: тронуты только блоки конверсии в complete_stage
-- (ветка A, closes_process) и close_process_early. Вся остальная логика
-- (переходы, after_one/after_all, skip недостижимых) — байт-в-байт как в
-- 20260703120000 / 20260703130000. Маппинг причины завершения:
--   'converted'                        → applicant  (как было)
--   'admitted' / 'admitted_conditional'→ student    (новое)
-- Условное зачисление помечается флагом education_journeys.is_conditional_admission.
--
-- Ветка 6 (авто-закрытие) complete_stage НЕ трогается: закрывающие финалы
-- приёма (admitted/rejected/conditional) имеют closes_process=true и идут
-- веткой A, а не веткой 6.

-- 1. Флаг условного зачисления
ALTER TABLE education_journeys
  ADD COLUMN IF NOT EXISTS is_conditional_admission BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. complete_stage — расширенная конверсия в ветке A
CREATE OR REPLACE FUNCTION complete_stage(
  p_stage_instance_id uuid,
  p_final_code text,
  p_actor_id uuid,
  p_result_data jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_status              text;
  v_stage_template_id   uuid;
  v_process_instance_id uuid;
  v_journey_id          uuid;
  v_now                 timestamptz := NOW();
  v_closes_process      boolean;
  v_process_finish      text;
  v_stage               RECORD;
  v_person_id           uuid;
  v_person_full_name    text;
  v_tr                  RECORD;
  v_target_si_id        uuid;
  v_target_has_tasks    boolean;
  v_should_activate     boolean;
  v_pred_ids            uuid[];
  v_pred_total          int;
  v_pred_not_term       int;
  v_activated_ids       uuid[] := ARRAY[]::uuid[];
  v_seen_targets        uuid[] := ARRAY[]::uuid[];
  v_wi                  RECORD;
  v_pred_tmpl_ids       uuid[];
  v_remaining_active    int;
  v_finish_reason       text;
  v_process_completed   boolean := false;
  v_start_codes         text[];
  v_tt                  RECORD;
  v_assignee_type       text;
  v_assignee_id         uuid;
  v_department_id       uuid;
  v_position_id         uuid;
  v_task_status         text;
  v_title               text;
BEGIN
  SELECT si.status, si.stage_template_id, si.process_instance_id, pi.journey_id
    INTO v_status, v_stage_template_id, v_process_instance_id, v_journey_id
  FROM stage_instances si
  JOIN process_instances pi ON pi.id = si.process_instance_id
  WHERE si.id = p_stage_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Подэтап не найден' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Подэтап не активен' USING ERRCODE = '22023';
  END IF;

  UPDATE stage_instances
  SET status = 'completed', final_code = p_final_code,
      completed_at = v_now, completed_by = p_actor_id,
      result_data = COALESCE(p_result_data, '{}'::jsonb)
  WHERE id = p_stage_instance_id;

  BEGIN
    INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
    VALUES (p_stage_instance_id, 'system', 'Подэтап завершён: ' || p_final_code,
            p_actor_id, jsonb_build_object('final_code', p_final_code));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  UPDATE tasks SET status = 'completed', completed_at = v_now
  WHERE stage_instance_id = p_stage_instance_id
    AND status <> 'completed' AND status <> 'cancelled';

  SELECT closes_process, process_finish_reason INTO v_closes_process, v_process_finish
  FROM stage_finals
  WHERE stage_template_id = v_stage_template_id AND code = p_final_code;

  IF COALESCE(v_closes_process, false) THEN
    v_process_finish := COALESCE(v_process_finish, p_final_code);

    FOR v_stage IN
      UPDATE stage_instances
      SET status = 'cancelled', completed_at = v_now, completed_by = p_actor_id
      WHERE process_instance_id = v_process_instance_id
        AND status IN ('active', 'waiting')
      RETURNING id
    LOOP
      BEGIN
        INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
        VALUES (v_stage.id, 'system', 'Подэтап отменён', p_actor_id,
                jsonb_build_object('reason', 'closes_process', 'final_code', p_final_code));
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP;

    UPDATE tasks SET status = 'cancelled', completed_at = v_now
    WHERE stage_instance_id IN (
      SELECT id FROM stage_instances WHERE process_instance_id = v_process_instance_id
    )
    AND status IN ('unassigned', 'pending', 'in_progress', 'review');

    UPDATE process_instances
    SET status = 'cancelled', finish_reason = v_process_finish, finished_at = v_now
    WHERE id = v_process_instance_id;

    -- Конверсия journey по причине завершения (без application_date).
    --   'converted'                         → applicant («Набор»)
    --   'admitted' / 'admitted_conditional' → student  («Приём»)
    IF v_process_finish = 'converted' THEN
      UPDATE education_journeys SET education_status = 'applicant' WHERE id = v_journey_id;
    ELSIF v_process_finish IN ('admitted', 'admitted_conditional') THEN
      UPDATE education_journeys
      SET education_status = 'student',
          is_conditional_admission = (v_process_finish = 'admitted_conditional')
      WHERE id = v_journey_id;
    END IF;

    RETURN jsonb_build_object(
      'stage_instance_id', p_stage_instance_id,
      'activated_stage_ids', '[]'::jsonb,
      'process_completed', true,
      'finish_reason', v_process_finish
    );
  END IF;

  SELECT person_id INTO v_person_id FROM education_journeys WHERE id = v_journey_id;
  IF v_person_id IS NOT NULL THEN
    SELECT full_name INTO v_person_full_name FROM persons WHERE id = v_person_id;
  END IF;

  FOR v_tr IN
    SELECT to_stage_template_id, activation_mode
    FROM stage_transitions
    WHERE from_stage_template_id = v_stage_template_id AND trigger_final_code = p_final_code
    ORDER BY sort_order
  LOOP
    IF v_tr.to_stage_template_id = ANY(v_seen_targets) THEN
      CONTINUE;
    END IF;
    v_seen_targets := array_append(v_seen_targets, v_tr.to_stage_template_id);

    IF v_tr.activation_mode = 'after_one' THEN
      v_should_activate := true;
    ELSE
      SELECT COALESCE(array_agg(DISTINCT from_stage_template_id), ARRAY[]::uuid[])
        INTO v_pred_ids
      FROM stage_transitions
      WHERE to_stage_template_id = v_tr.to_stage_template_id
        AND from_stage_template_id IS NOT NULL;

      IF COALESCE(array_length(v_pred_ids, 1), 0) > 0 THEN
        SELECT COUNT(*) FILTER (WHERE status NOT IN ('completed', 'skipped'))
          INTO v_pred_not_term
        FROM stage_instances
        WHERE process_instance_id = v_process_instance_id
          AND stage_template_id = ANY(v_pred_ids);
        v_should_activate := (v_pred_not_term = 0);
      ELSE
        v_should_activate := true;
      END IF;
    END IF;

    IF NOT v_should_activate THEN
      CONTINUE;
    END IF;

    SELECT id INTO v_target_si_id
    FROM stage_instances
    WHERE process_instance_id = v_process_instance_id
      AND stage_template_id = v_tr.to_stage_template_id
      AND status = 'waiting'
    LIMIT 1;

    IF v_target_si_id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE stage_instances SET status = 'active', activated_at = v_now
    WHERE id = v_target_si_id;
    v_activated_ids := array_append(v_activated_ids, v_target_si_id);

    BEGIN
      INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
      VALUES (v_target_si_id, 'system', 'Подэтап активирован', p_actor_id, NULL);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    SELECT has_tasks INTO v_target_has_tasks FROM stage_templates WHERE id = v_tr.to_stage_template_id;

    IF COALESCE(v_target_has_tasks, false) AND p_actor_id IS NOT NULL THEN
      SELECT COALESCE(array_agg(DISTINCT to_task_code), ARRAY[]::text[]) INTO v_start_codes
      FROM task_transitions
      WHERE stage_template_id = v_tr.to_stage_template_id AND from_task_code IS NULL;

      FOR v_tt IN
        SELECT * FROM stage_task_templates
        WHERE stage_template_id = v_tr.to_stage_template_id
          AND (array_length(v_start_codes, 1) IS NULL OR code = ANY(v_start_codes))
        ORDER BY sort_order
      LOOP
        v_assignee_type := 'unassigned'; v_assignee_id := NULL;
        v_department_id := NULL; v_position_id := NULL; v_task_status := 'unassigned';

        IF v_tt.default_assignee_type = 'creator' THEN
          v_assignee_type := 'person'; v_assignee_id := p_actor_id; v_task_status := 'pending';
        ELSIF v_tt.default_assignee_type = 'department' AND v_tt.default_department_id IS NOT NULL THEN
          v_assignee_type := 'department'; v_department_id := v_tt.default_department_id;
        ELSIF v_tt.default_assignee_type = 'position' AND v_tt.default_position_id IS NOT NULL THEN
          v_assignee_type := 'position'; v_position_id := v_tt.default_position_id;
        END IF;

        v_title := CASE WHEN v_person_full_name IS NOT NULL
          THEN v_tt.title || ': ' || v_person_full_name ELSE v_tt.title END;

        INSERT INTO tasks (
          title, description, module, metadata, assignee_type, assignee_id,
          department_id, position_id, creator_id, status, priority,
          due_date, due_time, due_all_day, stage_instance_id, stage_task_template_id
        ) VALUES (
          v_title, v_tt.description, 'general', '{}'::jsonb, v_assignee_type, v_assignee_id,
          v_department_id, v_position_id, p_actor_id, v_task_status, v_tt.default_priority,
          NULL, NULL, true, v_target_si_id, v_tt.id
        );
      END LOOP;
    END IF;
  END LOOP;

  FOR v_wi IN
    SELECT id, stage_template_id FROM stage_instances
    WHERE process_instance_id = v_process_instance_id AND status = 'waiting'
  LOOP
    SELECT COALESCE(array_agg(DISTINCT from_stage_template_id), ARRAY[]::uuid[])
      INTO v_pred_tmpl_ids
    FROM stage_transitions
    WHERE to_stage_template_id = v_wi.stage_template_id
      AND from_stage_template_id IS NOT NULL;

    IF COALESCE(array_length(v_pred_tmpl_ids, 1), 0) = 0 THEN
      CONTINUE;
    END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE status NOT IN ('completed', 'skipped'))
      INTO v_pred_total, v_pred_not_term
    FROM stage_instances
    WHERE process_instance_id = v_process_instance_id
      AND stage_template_id = ANY(v_pred_tmpl_ids);

    IF v_pred_total >= array_length(v_pred_tmpl_ids, 1) AND v_pred_not_term = 0 THEN
      BEGIN
        UPDATE stage_instances SET status = 'skipped' WHERE id = v_wi.id;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;

  SELECT COUNT(*) INTO v_remaining_active
  FROM stage_instances
  WHERE process_instance_id = v_process_instance_id AND status = 'active';

  IF v_remaining_active = 0 THEN
    v_finish_reason := CASE p_final_code
      WHEN 'convert_to_applicant' THEN 'converted'
      WHEN 'rejected'             THEN 'rejected'
      WHEN 'postponed'            THEN 'postponed'
      ELSE NULL
    END;

    UPDATE process_instances
    SET status = 'completed', finish_reason = v_finish_reason, finished_at = v_now
    WHERE id = v_process_instance_id;
    v_process_completed := true;

    IF p_final_code = 'convert_to_applicant' THEN
      UPDATE education_journeys SET education_status = 'applicant' WHERE id = v_journey_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'stage_instance_id', p_stage_instance_id,
    'activated_stage_ids', to_jsonb(v_activated_ids),
    'process_completed', v_process_completed,
    'finish_reason', v_finish_reason
  );
END;
$$;

-- 3. close_process_early — расширенная конверсия
CREATE OR REPLACE FUNCTION close_process_early(
  p_process_instance_id uuid,
  p_final_code text,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_status              text;
  v_process_template_id uuid;
  v_journey_id          uuid;
  v_final_stage_id      uuid;
  v_finish_reason       text;
  v_now                 timestamptz := NOW();
  v_stage               RECORD;
  v_journey_converted   boolean := false;
BEGIN
  SELECT status, process_template_id, journey_id
    INTO v_status, v_process_template_id, v_journey_id
  FROM process_instances
  WHERE id = p_process_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Процесс не найден' USING ERRCODE = 'P0002';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Процесс уже завершён' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_final_stage_id
  FROM stage_templates
  WHERE process_template_id = v_process_template_id
  ORDER BY sort_order DESC
  LIMIT 1;

  IF v_final_stage_id IS NULL THEN
    RAISE EXCEPTION 'У процесса нет этапов' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM stage_finals
    WHERE stage_template_id = v_final_stage_id AND code = p_final_code
  ) THEN
    RAISE EXCEPTION 'Недопустимый финал' USING ERRCODE = '22023';
  END IF;

  v_finish_reason := CASE p_final_code
    WHEN 'convert_to_applicant' THEN 'converted'
    WHEN 'admitted'             THEN 'admitted'
    WHEN 'admitted_conditional' THEN 'admitted_conditional'
    WHEN 'rejected'             THEN 'rejected'
    WHEN 'postponed'            THEN 'postponed'
    ELSE 'cancelled'
  END;

  FOR v_stage IN
    UPDATE stage_instances
    SET status = 'skipped', completed_at = v_now, completed_by = p_actor_id
    WHERE process_instance_id = p_process_instance_id
      AND status IN ('active', 'waiting')
    RETURNING id
  LOOP
    BEGIN
      INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
      VALUES (
        v_stage.id, 'system', 'Подэтап отменён', p_actor_id,
        jsonb_build_object('reason', 'close_early', 'final_code', p_final_code)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  UPDATE tasks
  SET status = 'cancelled', completed_at = v_now
  WHERE stage_instance_id IN (
    SELECT id FROM stage_instances WHERE process_instance_id = p_process_instance_id
  )
  AND status IN ('unassigned', 'pending', 'in_progress', 'review');

  UPDATE process_instances
  SET status = 'completed', finish_reason = v_finish_reason, finished_at = v_now
  WHERE id = p_process_instance_id;

  -- Конверсия journey (без application_date):
  --   convert_to_applicant → applicant; admitted[/_conditional] → student
  IF p_final_code = 'convert_to_applicant' THEN
    UPDATE education_journeys SET education_status = 'applicant' WHERE id = v_journey_id;
    v_journey_converted := true;
  ELSIF p_final_code IN ('admitted', 'admitted_conditional') THEN
    UPDATE education_journeys
    SET education_status = 'student',
        is_conditional_admission = (p_final_code = 'admitted_conditional')
    WHERE id = v_journey_id;
    v_journey_converted := true;
  END IF;

  RETURN jsonb_build_object(
    'process_instance_id', p_process_instance_id,
    'final_code', p_final_code,
    'finish_reason', v_finish_reason,
    'journey_converted', v_journey_converted
  );
END;
$$;


-- ─────────────────────────────────────────────────────────
-- 20260703180000_admission_process_template.sql
-- ─────────────────────────────────────────────────────────
-- Шаблон процесса «Приём» (admission): абитуриент → студент.
-- Запускается автоматически при переходе journey в статус 'applicant'
-- (хук в route-ах complete / close-early — см. код). Единоличное решение
-- (v1): один сотрудник рассматривает заявку и выбирает исход.
--
-- Этапы:
--   1. Приёмное решение (admission_decision) — задача сотруднику, финалы:
--        admitted             → студент (closes)
--        admitted_conditional → студент + флаг is_conditional_admission (closes)
--        rejected             → закрыть, остаётся applicant (closes)
--        waitlisted           → переход в «Список ожидания» (НЕ closes)
--   2. Список ожидания (waitlist) — процесс остаётся открытым; финалы:
--        admitted → студент (closes),  rejected → закрыть (closes)
--
-- Конверсию в 'student' по process_finish_reason 'admitted'/'admitted_conditional'
-- выполняет движок (complete_stage / close_process_early, см. 20260703170000).
-- Фиксированные UUID + ON CONFLICT DO NOTHING — идемпотентно.

-- 1. Шаблон процесса
INSERT INTO process_templates (id, code, name_ru, description, is_active) VALUES
('ad000000-0000-4000-8000-000000000001', 'admission', 'Приём',
 'Процесс приёмной комиссии: абитуриент → студент', true)
ON CONFLICT (code) DO NOTHING;

-- 2. Этапы
INSERT INTO stage_templates (id, process_template_id, code, name_ru, has_tasks, sort_order) VALUES
('ad000000-0000-4000-8000-000000000010', 'ad000000-0000-4000-8000-000000000001',
 'admission_decision', 'Приёмное решение', true, 10),
('ad000000-0000-4000-8000-000000000020', 'ad000000-0000-4000-8000-000000000001',
 'waitlist', 'Список ожидания', true, 20)
ON CONFLICT (process_template_id, code) DO NOTHING;

-- 3. Финалы
INSERT INTO stage_finals (id, stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order) VALUES
-- Приёмное решение
('ad000000-0000-4000-8000-000000000101', 'ad000000-0000-4000-8000-000000000010',
 'admitted',             'Принят',            true,  true,  'admitted',             10),
('ad000000-0000-4000-8000-000000000102', 'ad000000-0000-4000-8000-000000000010',
 'admitted_conditional', 'Условно принят',    true,  true,  'admitted_conditional', 20),
('ad000000-0000-4000-8000-000000000103', 'ad000000-0000-4000-8000-000000000010',
 'waitlisted',           'В список ожидания', false, false, NULL,                   30),
('ad000000-0000-4000-8000-000000000104', 'ad000000-0000-4000-8000-000000000010',
 'rejected',             'Отклонён',          false, true,  'rejected',             40),
-- Список ожидания
('ad000000-0000-4000-8000-000000000201', 'ad000000-0000-4000-8000-000000000020',
 'admitted',             'Принят из списка',  true,  true,  'admitted',             10),
('ad000000-0000-4000-8000-000000000202', 'ad000000-0000-4000-8000-000000000020',
 'rejected',             'Отклонён из списка',false, true,  'rejected',             20)
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- 4. Переходы: начальный → decision; decision --waitlisted--> waitlist
INSERT INTO stage_transitions (id, from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order) VALUES
('ad000000-0000-4000-8000-000000000301', NULL,
 'ad000000-0000-4000-8000-000000000010', NULL, 'after_one', 10),
('ad000000-0000-4000-8000-000000000302', 'ad000000-0000-4000-8000-000000000010',
 'ad000000-0000-4000-8000-000000000020', 'waitlisted', 'after_one', 20)
ON CONFLICT (id) DO NOTHING;

-- 5. Задачи этапов (default_assignee_type='creator' → назначается на того, кто
--    запустил процесс: сотрудник, конвертировавший лида в абитуриента). Нет
--    task_transitions → движок создаёт все задачи этапа (по одной на этап).
INSERT INTO stage_task_templates (id, stage_template_id, code, title, description, default_assignee_type, default_priority, sort_order) VALUES
('ad000000-0000-4000-8000-000000000401', 'ad000000-0000-4000-8000-000000000010',
 'make_decision', 'Рассмотреть заявку и принять решение',
 'Рассмотреть абитуриента и вынести приёмное решение.', 'creator', 'high', 10),
('ad000000-0000-4000-8000-000000000402', 'ad000000-0000-4000-8000-000000000020',
 'waitlist_review', 'Решение по списку ожидания',
 'Пересмотреть заявку из списка ожидания.', 'creator', 'normal', 10)
ON CONFLICT (stage_template_id, code) DO NOTHING;


-- ─────────────────────────────────────────────────────────
-- 20260705120000_extend_education_status_enum.sql
-- ─────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════════════
-- Расширение enum person_education_status значениями учебного цикла.
--
-- До этой миграции enum содержал только:
--   lead | applicant | student | alumni
-- а TS-тип JourneyStatus (types/database.ts) уже перечислял
--   lead | applicant | student | graduated | expelled | lost | on_leave
-- — то есть код был написан «на вырост», но БД-enum не был расширен, и
-- любая запись education_status='on_leave'/'graduated'/'expelled' падала
-- с ошибкой инварианта enum (22P02).
--
-- Эта миграция приводит БД в соответствие с TS-типом: добавляет значения
-- жизненного цикла студента (учёба → отпуск/выпуск/отчисление).
--
-- ВАЖНО:
--   * Применять ВРУЧНУЮ через Supabase Dashboard → SQL Editor (как и все
--     миграции проекта — см. docs/conventions.md).
--   * ALTER TYPE ... ADD VALUE в PostgreSQL нельзя ИСПОЛЬЗОВАТЬ в той же
--     транзакции, где значение добавлено. Здесь мы только ДОБАВЛЯЕМ (не
--     используем) — это безопасно в одном скрипте. RPC, который использует
--     новые значения (20260705120100_*), применяется отдельным запуском
--     ПОСЛЕ этого файла.
--   * IF NOT EXISTS делает миграцию идемпотентной (PostgreSQL 12+).
--
-- Значение 'alumni' оставлено как есть (историческое, не используется в
-- новом коде — выпуск помечается как 'graduated').
-- ═════════════════════════════════════════════════════════════════════

ALTER TYPE person_education_status ADD VALUE IF NOT EXISTS 'on_leave';
ALTER TYPE person_education_status ADD VALUE IF NOT EXISTS 'graduated';
ALTER TYPE person_education_status ADD VALUE IF NOT EXISTS 'expelled';
ALTER TYPE person_education_status ADD VALUE IF NOT EXISTS 'lost';


-- ─────────────────────────────────────────────────────────
-- 20260705120100_transition_education_status_rpc.sql
-- ─────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════════════
-- RPC: transition_education_status — атомарный переход education_status
-- студента по учебному циклу + запись в person_status_history.
--
-- Тот же паттерн, что у конверсий движка (complete_stage): смена статуса
-- journey и запись истории выполняются ОДНОЙ транзакцией — частичных
-- состояний нет. Route-хендлер (app/api/education/journeys/[id]/transition)
-- отвечает только за аутентификацию и проверку привилегии manage_students,
-- затем вызывает эту функцию.
--
-- Требует применённой миграции 20260705120000_extend_education_status_enum
-- (значения on_leave/graduated/expelled должны существовать в enum).
--
-- Разрешённые переходы (валидируются внутри функции):
--   student   → on_leave    (академический отпуск)  — нужны reason + date
--   on_leave  → student     (возврат из отпуска)     — без reason/date
--   student   → graduated   (выпуск)                 — нужны reason + date
--   student   → expelled    (отчисление)             — нужны reason + date
-- Любой другой переход → ошибка 22023 (→ HTTP 400).
--
-- reason пишется в person_status_history.comment, date — в changed_at
-- (переопределяет DEFAULT now()). Существующие колонки, новых полей нет.
--
-- Коды ошибок для маппинга в lib/api (см. route):
--   P0002 — journey не найден (→ 404)
--   22023 — недопустимый переход / нет reason / нет date (→ 400)
-- ═════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION transition_education_status(
  p_journey_id     uuid,
  p_to_status      text,
  p_actor_id       uuid,
  p_reason         text DEFAULT NULL,
  p_effective_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_person_id uuid;
  v_from      text;
  v_allowed   boolean := false;
  v_needs_details boolean;
BEGIN
  SELECT person_id, education_status::text
    INTO v_person_id, v_from
    FROM education_journeys
   WHERE id = p_journey_id;

  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'journey % not found', p_journey_id USING ERRCODE = 'P0002';
  END IF;

  -- Валидация допустимых переходов
  IF (v_from = 'student'  AND p_to_status IN ('on_leave', 'graduated', 'expelled'))
     OR (v_from = 'on_leave' AND p_to_status = 'student') THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'illegal education_status transition % -> %', v_from, p_to_status
      USING ERRCODE = '22023';
  END IF;

  -- Отрицательные/финальные переходы требуют причину и дату
  v_needs_details := p_to_status IN ('on_leave', 'graduated', 'expelled');
  IF v_needs_details THEN
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
      RAISE EXCEPTION 'reason is required for transition to %', p_to_status
        USING ERRCODE = '22023';
    END IF;
    IF p_effective_date IS NULL THEN
      RAISE EXCEPTION 'effective_date is required for transition to %', p_to_status
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE education_journeys
     SET education_status = p_to_status::person_education_status
   WHERE id = p_journey_id;

  INSERT INTO person_status_history (person_id, from_status, to_status, changed_by, comment, changed_at)
  VALUES (
    v_person_id,
    v_from::person_education_status,
    p_to_status::person_education_status,
    p_actor_id,
    NULLIF(btrim(COALESCE(p_reason, '')), ''),
    COALESCE(p_effective_date::timestamptz, now())
  );

  RETURN jsonb_build_object(
    'journey_id', p_journey_id,
    'from_status', v_from,
    'to_status', p_to_status
  );
END;
$$;

COMMENT ON FUNCTION transition_education_status(uuid, text, uuid, text, date) IS
  'Атомарный переход education_status студента (учёба ↔ отпуск / выпуск / отчисление) + запись person_status_history. Валидирует допустимость перехода и обязательность reason+date для on_leave/graduated/expelled.';


-- ─────────────────────────────────────────────────────────
-- 20260705130000_alumni_graduation.sql
-- ─────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════════════
-- Alumni — Milestone 3, Part 1: наполнение alumni_profiles при выпуске.
--
-- Расширяет RPC transition_education_status (см. 20260705120100): при
-- переходе студента в статус 'graduated' одной транзакцией UPSERT-ит запись
-- в alumni_profiles, ключ — person_id. Идемпотентно: повторный выпуск НЕ
-- создаёт дубликат (ON CONFLICT (person_id) DO UPDATE).
--
-- Эта миграция:
--   1) добавляет UNIQUE INDEX на alumni_profiles(person_id) — его не было в
--      001_initial_schema.sql, без него ON CONFLICT (person_id) не работает;
--   2) CREATE OR REPLACE FUNCTION transition_education_status с ПОЛНЫМ телом
--      предыдущей версии + блок наполнения alumni_profiles для 'graduated'
--      (миграция 20260705120100 НЕ редактируется на месте);
--   3) выдаёт role_privileges модуля 'alumni' (view/manage, scope='all')
--      системным ролям — по образцу 20260511175354_education_privileges.sql.
--
-- ВАЖНО (применять вручную через Supabase Dashboard SQL Editor):
--   Перед созданием UNIQUE INDEX убедитесь, что в alumni_profiles нет
--   дублей по person_id. Проверка (ожидается 0 строк):
--     SELECT person_id, count(*) FROM alumni_profiles
--     GROUP BY person_id HAVING count(*) > 1;
--   Если строки есть — сначала устраните дубли, иначе CREATE UNIQUE INDEX
--   упадёт.
-- ═════════════════════════════════════════════════════════════════════

-- ── 1. UNIQUE INDEX для ON CONFLICT (person_id) ───────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS alumni_profiles_person_id_key
  ON alumni_profiles(person_id);

-- ── 2. Расширенный RPC transition_education_status ────────────────────────────
CREATE OR REPLACE FUNCTION transition_education_status(
  p_journey_id     uuid,
  p_to_status      text,
  p_actor_id       uuid,
  p_reason         text DEFAULT NULL,
  p_effective_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_person_id uuid;
  v_from      text;
  v_allowed   boolean := false;
  v_needs_details boolean;
  v_primary_department_id uuid;
  v_specialty_id uuid;
  v_institution text;
  v_direction   text;
  v_grad_year   integer;
BEGIN
  SELECT person_id, education_status::text, primary_department_id, specialty_id
    INTO v_person_id, v_from, v_primary_department_id, v_specialty_id
    FROM education_journeys
   WHERE id = p_journey_id;

  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'journey % not found', p_journey_id USING ERRCODE = 'P0002';
  END IF;

  -- Валидация допустимых переходов
  IF (v_from = 'student'  AND p_to_status IN ('on_leave', 'graduated', 'expelled'))
     OR (v_from = 'on_leave' AND p_to_status = 'student') THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'illegal education_status transition % -> %', v_from, p_to_status
      USING ERRCODE = '22023';
  END IF;

  -- Отрицательные/финальные переходы требуют причину и дату
  v_needs_details := p_to_status IN ('on_leave', 'graduated', 'expelled');
  IF v_needs_details THEN
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
      RAISE EXCEPTION 'reason is required for transition to %', p_to_status
        USING ERRCODE = '22023';
    END IF;
    IF p_effective_date IS NULL THEN
      RAISE EXCEPTION 'effective_date is required for transition to %', p_to_status
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE education_journeys
     SET education_status = p_to_status::person_education_status
   WHERE id = p_journey_id;

  INSERT INTO person_status_history (person_id, from_status, to_status, changed_by, comment, changed_at)
  VALUES (
    v_person_id,
    v_from::person_education_status,
    p_to_status::person_education_status,
    p_actor_id,
    NULLIF(btrim(COALESCE(p_reason, '')), ''),
    COALESCE(p_effective_date::timestamptz, now())
  );

  -- ─── Наполнение alumni_profiles при выпуске ──────────────────────────────────
  -- Только при переходе в 'graduated'. p_effective_date для этого перехода
  -- уже обязателен (проверено выше), поэтому EXTRACT корректен.
  --   graduation_year = год из даты выпуска
  --   institution     = departments.name primary_department_id journey (NULL если нет)
  --   direction       = specialties.name specialty_id journey (NULL если нет)
  -- UPSERT по person_id: на конфликте обновляем ТОЛЬКО graduation_year/
  -- institution/direction. Поля current_location/current_occupation/notes —
  -- редактируются пользователем и НЕ перезаписываются.
  IF p_to_status = 'graduated' THEN
    v_grad_year := EXTRACT(YEAR FROM p_effective_date)::integer;

    SELECT name INTO v_institution
      FROM departments WHERE id = v_primary_department_id;

    SELECT name INTO v_direction
      FROM specialties WHERE id = v_specialty_id;

    INSERT INTO alumni_profiles (person_id, graduation_year, institution, direction)
    VALUES (v_person_id, v_grad_year, v_institution, v_direction)
    ON CONFLICT (person_id) DO UPDATE
      SET graduation_year = EXCLUDED.graduation_year,
          institution     = EXCLUDED.institution,
          direction       = EXCLUDED.direction;
  END IF;

  RETURN jsonb_build_object(
    'journey_id', p_journey_id,
    'from_status', v_from,
    'to_status', p_to_status
  );
END;
$$;

COMMENT ON FUNCTION transition_education_status(uuid, text, uuid, text, date) IS
  'Атомарный переход education_status студента (учёба ↔ отпуск / выпуск / отчисление) + запись person_status_history. При выпуске (graduated) UPSERT-ит alumni_profiles по person_id (идемпотентно). Валидирует допустимость перехода и обязательность reason+date для on_leave/graduated/expelled.';

-- ── 3. Права модуля 'alumni' системным ролям ─────────────────────────────────
-- По образцу 20260511175354_education_privileges.sql (блок 4.1). Без этого
-- гранта НИ ОДИН пользователь (включая superadmin) не проходит проверку
-- requireAlumniPrivilege — модуль недоступен. module_privileges для
-- ('alumni','view'/'manage') объявлены в 002_roles_and_privileges.sql, но
-- на проверке выяснилось, что этот сид не был применён к целевой БД —
-- каталог там пуст. Поэтому 3a досеивает его здесь же, идемпотентно.

-- 3a. Каталог привилегий модуля 'alumni' — на случай, если сид 002
-- не был применён к целевой БД (иначе цикл ниже находит 0 строк и не выдаёт прав).
INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('alumni', 'view',   'Просмотр',   1),
  ('alumni', 'manage', 'Управление', 2)
ON CONFLICT (module, privilege_code) DO NOTHING;

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
    FOR pcode IN SELECT privilege_code FROM module_privileges WHERE module = 'alumni'
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'alumni', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────
-- 20260705140000_reseed_module_privileges_catalogue.sql
-- ─────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════════════
-- Reseed каталога module_privileges — компенсация дрейфа сида 002.
--
-- Обнаружено (GitHub #1): на целевой БД сид module_privileges из
-- 002_roles_and_privileges.sql применён НЕ полностью. Фактически в каталоге
-- присутствуют только education (17 кодов из 20260511175354), tasks.delete и
-- alumni (view/manage из 20260705130000) — итого 20 строк вместо 52.
-- Из-за этого миграции, выдающие права циклом по module_privileges нужного
-- модуля (FOR ... IN SELECT ... WHERE module = '<mod>'), находят 0 строк и
-- молча ничего не выдают (тихий сбой прав, 403 для всех).
--
-- Эта миграция:
-- 1. Засевает каталог из 002 — 48 туплей (все коды кроме 4 legacy задач);
--    education 5 кодов (view/manage_groups/manage_schedule/manage_grades/view_own_only)
--    СОХРАНЕНЫ как канонические в 20260511175354 (не удаляются).
-- 2. ЗАТЕМ удаляет 4 legacy tasks кода, которые были намеренно удалены в
--    20260511000343: view_own / view_all / create / assign.
--    Оставляет tasks.delete (который был в 002 и остаётся канонически).
-- 3. Удаление — только из module_privileges каталога, role_privileges остаются нетронутыми
--    (например, hr_director|tasks|create из 20260503203944 сохраняется намеренно,
--    это не ошибка, это canonical state).
-- С ON CONFLICT (module, privilege_code) DO NOTHING на INSERT — идемпотентно.
-- ═════════════════════════════════════════════════════════════════════

INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
-- Persons
('persons',      'view',              'Просмотр',                    1),
('persons',      'create',            'Создание',                    2),
('persons',      'edit',              'Редактирование',              3),
('persons',      'delete',            'Удаление',                    4),
-- Приёмная комиссия
('applicants',   'view',              'Просмотр заявок',             1),
('applicants',   'create',            'Создание заявок',             2),
('applicants',   'edit',              'Редактирование заявок',       3),
('applicants',   'change_status',     'Изменение статуса',           4),
('applicants',   'delete',            'Удаление заявок',             5),
-- Финансы
('finance',      'view',              'Просмотр',                    1),
('finance',      'create_invoice',    'Создание счетов',             2),
('finance',      'approve_payment',   'Подтверждение платежей',      3),
('finance',      'manage_budget',     'Управление бюджетом',         4),
('finance',      'export_reports',    'Экспорт отчётов',             5),
-- Общежитие
('dormitory',    'view',              'Просмотр',                    1),
('dormitory',    'manage_rooms',      'Управление комнатами',        2),
('dormitory',    'manage_residents',  'Управление жильцами',         3),
-- Питание
('food',         'view_menu',         'Просмотр меню',               1),
('food',         'manage_menu',       'Управление меню',             2),
('food',         'manage_orders',     'Управление заказами',         3),
-- Безопасность
('security',     'view',              'Просмотр',                    1),
('security',     'manage_access',     'Управление пропусками',       2),
('security',     'view_logs',         'Просмотр журнала',            3),
-- Медицина
('doctor',       'view',              'Просмотр записей',            1),
('doctor',       'create',            'Создание записей',            2),
('doctor',       'edit',              'Редактирование',              3),
('psychologist', 'view',              'Просмотр записей',            1),
('psychologist', 'create',            'Создание записей',            2),
('psychologist', 'edit',              'Редактирование',              3),
-- Выпускники
('alumni',       'view',              'Просмотр',                    1),
('alumni',       'manage',            'Управление',                  2),
-- Спонсоры
('sponsors',     'view',              'Просмотр',                    1),
('sponsors',     'manage',            'Управление',                  2),
-- Задачи
('tasks',        'delete',            'Удаление задач',              5),
-- Документы
('documents',    'view',              'Просмотр',                    1),
('documents',    'create',            'Создание',                    2),
('documents',    'manage_templates',  'Управление шаблонами',        3),
-- Отчёты
('reports',      'view',              'Просмотр отчётов',            1),
('reports',      'export',            'Экспорт отчётов',             2),
-- Настройки
('settings',     'view',              'Просмотр',                    1),
('settings',     'manage_roles',      'Управление ролями',           2),
('settings',     'manage_departments','Управление отделами',         3),
('settings',     'manage_system',     'Системные настройки',         4)
ON CONFLICT (module, privilege_code) DO NOTHING;

-- Удалить 4 legacy tasks кода, которые были намеренно удалены в 20260511000343.
-- Если была применена полная reseed (002 вербатим) — они могли быть добавлены обратно.
-- Это удаление чистит каталог; role_privileges НЕ трогаются (canonical grant сохраняется).
DELETE FROM module_privileges
WHERE (module, privilege_code) IN (
  ('tasks', 'view_own'),
  ('tasks', 'view_all'),
  ('tasks', 'create'),
  ('tasks', 'assign')
);


-- ─────────────────────────────────────────────────────────
-- 20260705150000_lessons_attendance.sql
-- ─────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════════════
-- Основа управления учёбой: уроки (lessons) + посещаемость (attendance).
--
-- Это ПЕРВЫЙ шаг: уроки конкретной учебной группы (class_groups) с темой
-- и посещаемостью студентов (education_journeys). Оценки (grades) —
-- отдельный этап в будущем, в эту миграцию НЕ входят.
--
-- Привилегии mark_attendance и set_lesson_topics уже есть в каталоге
-- module_privileges (см. 20260511175354_education_privileges.sql).
-- Эта миграция лишь убеждается, что системные роли (superadmin,
-- tech_admin, campus_president) имеют role_privileges на них
-- (scope='all') — идемпотентно, не трогая остальные привилегии/роли.
-- ═════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 0. set_updated_at() — на случай если функции ещё нет в целевой БД
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
$$;


-- ─────────────────────────────────────────────
-- 1. LESSONS (уроки учебной группы)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lessons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_group_id  UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  scheduled_date  DATE NOT NULL,
  scheduled_time  TIME,
  topic           TEXT,
  description     TEXT,
  location        TEXT,
  is_cancelled    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES persons(id) ON DELETE SET NULL,

  CONSTRAINT lessons_class_group_date_time_unique
    UNIQUE (class_group_id, scheduled_date, scheduled_time)
);

CREATE INDEX IF NOT EXISTS idx_lessons_class_group_date
  ON lessons(class_group_id, scheduled_date DESC);

DROP TRIGGER IF EXISTS set_updated_at_lessons ON lessons;
CREATE TRIGGER set_updated_at_lessons
  BEFORE UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 2. ATTENDANCE (посещаемость, без оценок на этом этапе)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  journey_id  UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('present', 'absent', 'excused', 'late')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  marked_by   UUID REFERENCES persons(id) ON DELETE SET NULL,
  marked_at   TIMESTAMPTZ,

  CONSTRAINT attendance_lesson_journey_unique
    UNIQUE (lesson_id, journey_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_lesson ON attendance(lesson_id);
CREATE INDEX IF NOT EXISTS idx_attendance_journey ON attendance(journey_id);

DROP TRIGGER IF EXISTS set_updated_at_attendance ON attendance;
CREATE TRIGGER set_updated_at_attendance
  BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 3. ПРИВИЛЕГИИ — гарантируем role_privileges для системных ролей
--
-- Только 2 конкретных кода (mark_attendance, set_lesson_topics),
-- scope='all'. Остальные привилегии модуля education не трогаем.
-- Паттерн идентичен использованному в 20260511175354_education_privileges.sql
-- и 20260705130000_alumni_graduation.sql.
-- ─────────────────────────────────────────────

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

    FOREACH pcode IN ARRAY ARRAY['mark_attendance', 'set_lesson_topics']
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'education', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────
-- 20260705160000_fix_missing_updated_at_triggers.sql
-- ─────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════════════════════
-- משלום טריגרים חסרים של set_updated_at ל-20260608190000_add_updated_at_remaining
--
-- רקע: מיגרציה 20260608190000 הוסיפה עמודת updated_at ל-9 טבלאות, אך הטריגרים
-- לא נוצרו כי הפונקציה set_updated_at() לא הייתה קיימת בזמן ריצת המיגרציה.
-- עכשיו הפונקציה קיימת (הוגדרה במיגרציות מאוחרות יותר), ולכן משלימים את הטריגרים.
--
-- אידמפוטנטי: DROP TRIGGER IF EXISTS + CREATE TRIGGER.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─── הפונקציה (הגנה מפני עוד הגדרה חוזרת)
CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
$$;


-- ─── 9 הטריגרים החסרים

-- alumni_profiles
DROP TRIGGER IF EXISTS set_updated_at_alumni_profiles ON alumni_profiles;
CREATE TRIGGER set_updated_at_alumni_profiles
  BEFORE UPDATE ON alumni_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- module_privileges
DROP TRIGGER IF EXISTS set_updated_at_module_privileges ON module_privileges;
CREATE TRIGGER set_updated_at_module_privileges
  BEFORE UPDATE ON module_privileges FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- quality_checks
DROP TRIGGER IF EXISTS set_updated_at_quality_checks ON quality_checks;
CREATE TRIGGER set_updated_at_quality_checks
  BEFORE UPDATE ON quality_checks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- reference_cities
DROP TRIGGER IF EXISTS set_updated_at_reference_cities ON reference_cities;
CREATE TRIGGER set_updated_at_reference_cities
  BEFORE UPDATE ON reference_cities FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- sponsor_profiles
DROP TRIGGER IF EXISTS set_updated_at_sponsor_profiles ON sponsor_profiles;
CREATE TRIGGER set_updated_at_sponsor_profiles
  BEFORE UPDATE ON sponsor_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- staff_positions
DROP TRIGGER IF EXISTS set_updated_at_staff_positions ON staff_positions;
CREATE TRIGGER set_updated_at_staff_positions
  BEFORE UPDATE ON staff_positions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- staff_profiles
DROP TRIGGER IF EXISTS set_updated_at_staff_profiles ON staff_profiles;
CREATE TRIGGER set_updated_at_staff_profiles
  BEFORE UPDATE ON staff_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- stage_actions
DROP TRIGGER IF EXISTS set_updated_at_stage_actions ON stage_actions;
CREATE TRIGGER set_updated_at_stage_actions
  BEFORE UPDATE ON stage_actions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- task_comments
DROP TRIGGER IF EXISTS set_updated_at_task_comments ON task_comments;
CREATE TRIGGER set_updated_at_task_comments
  BEFORE UPDATE ON task_comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────────────────
-- 20260705170000_grades.sql
-- ─────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════════════
-- Основа оценок (grades) для управления учёбой — Этап 3.
--
-- Базис: задания/работы (assessments) конкретной учебной группы и оценки
-- студентов (grades) за них. Оценка привязана к journey (education_journeys),
-- как и посещаемость, — НЕ к person напрямую.
--
-- В ЭТУ миграцию НЕ входят (отложено на будущее):
--   - вес задания (weight) для взвешенного итога;
--   - тип задания (экзамен / домашняя / проект);
--   - вычисляемая итоговая оценка.
--
-- Привилегия set_grades уже есть в каталоге module_privileges
-- (см. 20260511175354_education_privileges.sql, sort_order 61). Эта миграция
-- лишь гарантирует role_privileges на неё для системных ролей (superadmin,
-- tech_admin, campus_president), scope='all' — идемпотентно, не трогая
-- остальные привилегии/роли. Паттерн идентичен секции 3 в
-- 20260705150000_lessons_attendance.sql.
-- ═════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 0. set_updated_at() — на случай если функции ещё нет в целевой БД
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
$$;


-- ─────────────────────────────────────────────
-- 1. ASSESSMENTS (задания/работы учебной группы)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assessments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_group_id   UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  max_score        NUMERIC(6,2) NOT NULL DEFAULT 100 CHECK (max_score > 0),
  assessment_date  DATE,
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       UUID REFERENCES persons(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_assessments_class_group_date
  ON assessments(class_group_id, assessment_date DESC NULLS LAST);

DROP TRIGGER IF EXISTS set_updated_at_assessments ON assessments;
CREATE TRIGGER set_updated_at_assessments
  BEFORE UPDATE ON assessments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 2. GRADES (оценки студентов за задания)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS grades (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id  UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  journey_id     UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  score          NUMERIC(6,2) NOT NULL CHECK (score >= 0),
  comment        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  graded_by      UUID REFERENCES persons(id) ON DELETE SET NULL,
  graded_at      TIMESTAMPTZ,

  CONSTRAINT grades_assessment_journey_unique
    UNIQUE (assessment_id, journey_id)
);

CREATE INDEX IF NOT EXISTS idx_grades_assessment ON grades(assessment_id);
CREATE INDEX IF NOT EXISTS idx_grades_journey    ON grades(journey_id);

DROP TRIGGER IF EXISTS set_updated_at_grades ON grades;
CREATE TRIGGER set_updated_at_grades
  BEFORE UPDATE ON grades
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 3. ПРИВИЛЕГИИ — гарантируем role_privileges.set_grades для системных ролей
--
-- Только код set_grades, scope='all'. Остальные привилегии/роли не трогаем.
-- ON CONFLICT (role_id, module, privilege_code) DO UPDATE — идемпотентно.
-- ─────────────────────────────────────────────

DO $$
DECLARE
  rcode TEXT;
  rid   UUID;
BEGIN
  FOREACH rcode IN ARRAY ARRAY['superadmin', 'tech_admin', 'campus_president']
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;

    INSERT INTO role_privileges (role_id, module, privilege_code, scope)
    VALUES (rid, 'education', 'set_grades', 'all')
    ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────
-- 20260705180000_class_schedule_slots.sql
-- ─────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════════════
-- Расписание учебной группы: повторяющиеся недельные слоты
-- (class_schedule_slots).
--
-- СЛОТ — это ПОВТОРЯЮЩЕЕСЯ ПРАВИЛО ("каждый понедельник 10:00–11:30,
-- ауд. A"): день недели + время начала/конца + (опционально) аудитория.
-- У слота НЕТ даты. Это НЕ урок.
--
-- УРОК (lessons) — это ДАТИРОВАННЫЙ ЭКЗЕМПЛЯР ("понедельник 2026-03-02,
-- 10:00"). Уроки НЕ хранятся здесь и НЕ ссылаются на слоты: слот — лишь
-- шаблон. Конкретные строки lessons ПОРОЖДАЮТСЯ из слотов отдельным
-- действием API ("сгенерировать уроки за период"):
--   • строго ДОБАВЛЯЮЩЕЕ — только INSERT, никогда не UPDATE/DELETE уроков;
--   • ИДЕМПОТЕНТНОЕ — опирается на существующий UNIQUE
--     (class_group_id, scheduled_date, scheduled_time) таблицы lessons:
--     повтор за тот же период не создаёт дублей;
--   • не воскрешает и не трогает вручную созданные / отменённые уроки.
-- Поэтому FK lessons → slots сознательно НЕ вводится (уроки автономны,
-- слот можно удалить, не затрагивая прошлые уроки).
--
-- ПРАВА: новой привилегии НЕ вводим. Управление слотами и генерация
-- уроков переиспользуют education.set_lesson_topics (тот же код, что уже
-- гейтит создание/правку уроков) — он уже выдан системным ролям
-- (scope='all') и роли teacher (scope='own'), см. блок ниже.
--
-- Сознательно отложено (не входит в эту миграцию):
--   • общая (по всему кампусу) сетка расписания;
--   • детект конфликтов двойного бронирования (аудитория / преподаватель);
--   • праздники и исключения учебного календаря;
--   • переопределения на отдельную неделю / разовые сдвиги.
-- ═════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 0. set_updated_at() — на случай если функции ещё нет в целевой БД
--    (идентична версии проекта, как в lessons/grades миграциях)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
$$;


-- ─────────────────────────────────────────────
-- 1. CLASS_SCHEDULE_SLOTS (недельные слоты расписания группы)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS class_schedule_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_group_id  UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),  -- ISO: 1=Пн .. 7=Вс
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL CHECK (end_time > start_time),
  room            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES persons(id) ON DELETE SET NULL,

  CONSTRAINT class_schedule_slots_group_day_start_unique
    UNIQUE (class_group_id, day_of_week, start_time)
);

CREATE INDEX IF NOT EXISTS idx_class_schedule_slots_class_group
  ON class_schedule_slots(class_group_id);

DROP TRIGGER IF EXISTS set_updated_at_class_schedule_slots ON class_schedule_slots;
CREATE TRIGGER set_updated_at_class_schedule_slots
  BEFORE UPDATE ON class_schedule_slots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 2. ПРАВА — блока role_privileges нет намеренно.
--    Расписание переиспользует education.set_lesson_topics, который уже
--    выдан (системным ролям scope='all' — 20260511175354 и 20260705150000;
--    роли teacher scope='own' — 20260511175354, блок 4.8). Новых кодов и
--    грантов не требуется.
-- ─────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────
-- 20260705190000_finance_billing.sql
-- ─────────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════════════
-- Финансы: биллинг обучения студентов (MVP).
--
-- Две таблицы:
--   • finance_charges  — начисления (что студент ДОЛЖЕН): сумма, описание,
--     период, срок, статус (active/cancelled).
--   • finance_payments — платежи (что ПОЛУЧЕНО): сумма, дата, способ,
--     статус (pending/approved/cancelled) + кто внёс/подтвердил.
--
-- Модель — РАСЧЁТНЫЙ ПНК (running ledger): платежи НЕ привязаны к
-- конкретному начислению. Обе таблицы висят на education_journeys(id)
-- (journey студента). Баланс НЕ хранится — считается при чтении:
--     balance = Σ(charges.amount WHERE status='active')
--             − Σ(payments.amount WHERE status='approved')
--
-- Деньги — NUMERIC(12,2), одна подразумеваемая валюта (базовая валюта
-- учреждения); мультивалютность не вводится.
--
-- Права: новых привилегий НЕ создаём — переиспользуем каталог модуля
-- 'finance' (view / create_invoice / approve_payment / manage_budget /
-- export_reports), объявленный в 002_roles_and_privileges.sql. Он ниже
-- добавляется идемпотентно (на случай дрейфа сида 002 на боевой БД) и
-- выдаётся системным ролям со scope='all' — тот же паттерн, что в
-- 20260705130000_alumni_graduation.sql (иначе НИ ОДИН пользователь,
-- включая superadmin, не проходит requireFinancePrivilege).
--
-- Сознательно отложено (не входит в этот MVP):
--   • бюджеты (manage_budget), пожертвования/спонсоры, зарплаты (payroll);
--   • генерация PDF счёта/квитанции; возвраты/зачёты (refunds);
--   • мультивалютность; экспорт отчётов (export_reports);
--   • привязка платежа к конкретному начислению (per-charge allocation).
-- ═════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 0. set_updated_at() — на случай если функции ещё нет в целевой БД
--    (идентична версии проекта)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
$$;


-- ─────────────────────────────────────────────
-- 1. FINANCE_CHARGES (начисления студенту)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance_charges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id    UUID NOT NULL REFERENCES education_journeys(id) ON DELETE RESTRICT,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  description   TEXT NOT NULL,
  period_label  TEXT,
  due_date      DATE,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_by    UUID REFERENCES persons(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_charges_journey ON finance_charges(journey_id);

DROP TRIGGER IF EXISTS set_updated_at_finance_charges ON finance_charges;
CREATE TRIGGER set_updated_at_finance_charges
  BEFORE UPDATE ON finance_charges
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 2. FINANCE_PAYMENTS (платежи студента)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance_payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id    UUID NOT NULL REFERENCES education_journeys(id) ON DELETE RESTRICT,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  paid_at       DATE NOT NULL,
  method        TEXT,
  reference     TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'cancelled')),
  recorded_by   UUID REFERENCES persons(id) ON DELETE SET NULL,
  approved_by   UUID REFERENCES persons(id) ON DELETE SET NULL,
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_payments_journey ON finance_payments(journey_id);

DROP TRIGGER IF EXISTS set_updated_at_finance_payments ON finance_payments;
CREATE TRIGGER set_updated_at_finance_payments
  BEFORE UPDATE ON finance_payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 3. Каталог привилегий модуля 'finance' — идемпотентно.
--    Точные строки из 002_roles_and_privileges.sql (блок «Финансы»),
--    на случай, если сид 002 не был применён к боевой БД.
-- ─────────────────────────────────────────────

INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('finance', 'view',            'Просмотр',                1),
  ('finance', 'create_invoice',  'Создание счетов',         2),
  ('finance', 'approve_payment', 'Подтверждение платежей',  3),
  ('finance', 'manage_budget',   'Управление бюджетом',     4),
  ('finance', 'export_reports',  'Экспорт отчётов',         5)
ON CONFLICT (module, privilege_code) DO NOTHING;


-- ─────────────────────────────────────────────
-- 4. Выдача привилегий 'finance' системным ролям (scope='all').
--    Паттерн идентичен 20260705130000_alumni_graduation.sql.
-- ─────────────────────────────────────────────

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

    FOR pcode IN SELECT privilege_code FROM module_privileges WHERE module = 'finance'
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'finance', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;

