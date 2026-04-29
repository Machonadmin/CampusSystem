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
