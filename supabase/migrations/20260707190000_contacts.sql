-- ═════════════════════════════════════════════════════════════════════
-- Контакты (Contacts / אנשי קשר) — MVP: справочник внешних контактов и
-- организаций (поставщики, партнёры, госорганы, экстренные, медицина, финансы,
-- образование, прочее).
--
-- Одна таблица:
--   • contacts — имя, тип (organization/person), категория, email, телефон,
--     адрес, сайт, контактное лицо, заметки, флаг is_active.
--
-- САМОСТОЯТЕЛЬНЫЙ справочник — НЕ привязан к студентам: нет journey_id и вообще
-- никаких FK на учебные таблицы (в отличие от food/doctor/documents).
--
-- Поиск (matchesSearch), валидация email (isValidEmail) и агрегаты
-- (contactStats) — чистая логика в lib/contacts/directory.ts (покрыта vitest),
-- НЕ в БД.
--
-- Права: НОВЫХ привилегий не изобретаем — модуль 'contacts' с привилегиями
-- 'view' / 'manage'. Каталог module_privileges досеивается идемпотентно и
-- выдаётся системным ролям scope='all' — тот же паттерн, что
-- 20260707180000_documents.sql (иначе НИ ОДИН пользователь, включая superadmin,
-- не проходит requireContactsPrivilege).
-- NB: сид 002 НЕ содержит ни одной привилегии 'contacts' — sort_order 1/2
-- свободны; ON CONFLICT DO NOTHING оставляет блок идемпотентным и безопасным,
-- если каталог когда-либо досеют иначе.
--
-- Страницы /dashboard/contacts защищены middleware (PROTECTED_MODULES уже
-- содержит 'contacts').
--
-- Идемпотентно: CREATE TABLE IF NOT EXISTS; DROP TRIGGER IF EXISTS + CREATE;
-- set_updated_at() определяется здесь же через CREATE OR REPLACE.
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
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
-- 1. CONTACTS (справочник внешних контактов и организаций)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  contact_type    TEXT NOT NULL CHECK (contact_type IN ('organization', 'person')) DEFAULT 'organization',
  category        TEXT NOT NULL CHECK (category IN (
                    'supplier', 'government', 'partner', 'emergency',
                    'medical', 'financial', 'education', 'other'
                  )) DEFAULT 'other',
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  website         TEXT,
  contact_person  TEXT,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_category ON contacts(category);
CREATE INDEX IF NOT EXISTS idx_contacts_type     ON contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_contacts_active   ON contacts(is_active);

DROP TRIGGER IF EXISTS set_updated_at_contacts ON contacts;
CREATE TRIGGER set_updated_at_contacts
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 3. Права модуля 'contacts' — issue #1 grant block.
--    Каталог module_privileges ('contacts','view'/'manage') досеивается
--    идемпотентно, затем выдаётся системным ролям scope='all'. Паттерн
--    идентичен 20260707180000_documents.sql.
--    NB: сид 002 НЕ содержит привилегий 'contacts' вовсе — sort_order 1/2
--    свободны; ON CONFLICT DO NOTHING сохраняет идемпотентность.
-- ─────────────────────────────────────────────

INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('contacts', 'view',   'Просмотр',   1),
  ('contacts', 'manage', 'Управление', 2)
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
      VALUES (rid, 'contacts', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;
