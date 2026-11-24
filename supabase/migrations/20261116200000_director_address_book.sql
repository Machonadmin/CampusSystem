-- ─── ספר אנשי הקשר של המנהל (запрос клиента 16.11.2026) ─────────────────────
--
-- Основные группы (студенты, сотрудники, выпускники, תורמים) берутся из уже
-- существующих таблиц (education_journeys, staff_positions, alumni_profiles,
-- sponsors). Здесь только новое:
--   • private_contacts        — личные контакты владельца (не в системе);
--   • private_contact_shares  — с кем владелец поделился личным контактом;
--   • address_book_photos     — фото контакта для экрана «אנשי קשר»
--     (любого вида: человек из системы, תורם или личный контакт).
-- Доступ только через сервер (RLS включён, политик нет — как у всех таблиц
-- экрана «פגישות»).

CREATE TABLE IF NOT EXISTS private_contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 200),
  phone         TEXT,
  email         TEXT,
  city          TEXT,
  organization  TEXT,
  role_title    TEXT,
  category      TEXT,
  notes         TEXT,
  created_by    UUID REFERENCES persons(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS private_contacts_owner_idx ON private_contacts(owner_id);

DROP TRIGGER IF EXISTS set_updated_at_private_contacts ON private_contacts;
CREATE TRIGGER set_updated_at_private_contacts
  BEFORE UPDATE ON private_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS private_contact_shares (
  contact_id  UUID NOT NULL REFERENCES private_contacts(id) ON DELETE CASCADE,
  person_id   UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, person_id)
);
CREATE INDEX IF NOT EXISTS private_contact_shares_person_idx ON private_contact_shares(person_id);

CREATE TABLE IF NOT EXISTS address_book_photos (
  kind          TEXT NOT NULL CHECK (kind IN ('person', 'sponsor', 'private')),
  ref_id        UUID NOT NULL,
  storage_path  TEXT NOT NULL,
  mime_type     TEXT,
  updated_by    UUID REFERENCES persons(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, ref_id)
);

ALTER TABLE private_contacts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_contact_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE address_book_photos    ENABLE ROW LEVEL SECURITY;
