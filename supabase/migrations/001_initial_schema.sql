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
  category TEXT CHECK (category IN ('system','campus','education','medical','custom','external')),
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
