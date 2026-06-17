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
