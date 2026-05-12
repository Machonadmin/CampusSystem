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
