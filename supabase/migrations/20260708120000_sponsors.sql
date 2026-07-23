-- ═════════════════════════════════════════════════════════════════════
-- Спонсоры / Доноры (Sponsors / תורמים) — MVP: справочник доноров и
-- реестр (ledger) их пожертвований.
--
-- Две НОВЫЕ чистые таблицы:
--   • sponsors  — донор: имя, тип (individual/organization/foundation),
--     email, телефон, адрес, контактное лицо, заметки, флаг is_active.
--   • donations — пожертвование донора: сумма, дата, назначение (purpose),
--     кампания (campaign), способ (method), статус
--     (pledged/received/cancelled), заметки.
--
-- ВАЖНО — legacy: в БД есть СТАРАЯ таблица `sponsor_profiles` от прежнего
-- дизайна. Этот модуль её НЕ использует и НЕ трогает. Новые чистые таблицы —
-- `sponsors` и `donations`. FK: donations.sponsor_id → sponsors(id) ON DELETE
-- CASCADE (удаление донора уносит его пожертвования).
--
-- Денежная арифметика (суммы «получено»/«обещано» по донору и по кампании)
-- считается в целых КОПЕЙКАХ через lib/finance/money.ts (toCents/sumCents/
-- centsToNumber), чтобы избежать дрейфа float (0.1 + 0.2 ≠ 0.3), и покрыта
-- vitest (lib/sponsors/donations.test.ts) — НЕ в БД.
--
-- Права: НОВЫХ привилегий не изобретаем — модуль 'sponsors' с привилегиями
-- 'view' / 'manage'. Каталог module_privileges досеивается идемпотентно и
-- выдаётся системным ролям scope='all' — тот же паттерн, что
-- 20260707190000_contacts.sql (иначе НИ ОДИН пользователь, включая superadmin,
-- не проходит requireSponsorsPrivilege).
-- NB: сиды 002 и reseed ОПРЕДЕЛЯЮТ 'sponsors','view'/'manage' на sort_order
-- 1/2, но живой каталог мог «дрейфануть» и потерять эти строки — поэтому
-- INSERT ... ON CONFLICT DO NOTHING на тех же sort_order 1/2 безопасно
-- пере-добавляет их, ничего не ломая, если они уже есть.
--
-- Страницы /dashboard/sponsors защищены middleware (PROTECTED_MODULES уже
-- содержит 'sponsors').
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
-- 1. SPONSORS (справочник доноров)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sponsors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  sponsor_type    TEXT NOT NULL CHECK (sponsor_type IN ('individual', 'organization', 'foundation')) DEFAULT 'individual',
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  contact_person  TEXT,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsors_type   ON sponsors(sponsor_type);
CREATE INDEX IF NOT EXISTS idx_sponsors_active ON sponsors(is_active);

DROP TRIGGER IF EXISTS set_updated_at_sponsors ON sponsors;
CREATE TRIGGER set_updated_at_sponsors
  BEFORE UPDATE ON sponsors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 2. DONATIONS (реестр пожертвований)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS donations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id      UUID NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  donation_date   DATE NOT NULL,
  purpose         TEXT,
  campaign        TEXT,
  method          TEXT,
  status          TEXT NOT NULL CHECK (status IN ('pledged', 'received', 'cancelled')) DEFAULT 'pledged',
  notes           TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_donations_sponsor  ON donations(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_donations_status   ON donations(status);
CREATE INDEX IF NOT EXISTS idx_donations_campaign ON donations(campaign);

DROP TRIGGER IF EXISTS set_updated_at_donations ON donations;
CREATE TRIGGER set_updated_at_donations
  BEFORE UPDATE ON donations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 3. Права модуля 'sponsors' — issue #1 grant block.
--    Каталог module_privileges ('sponsors','view'/'manage') досеивается
--    идемпотентно, затем выдаётся системным ролям scope='all'. Паттерн
--    идентичен 20260707190000_contacts.sql.
--    NB: сиды 002/reseed определяют 'sponsors','view'/'manage' на sort_order
--    1/2 — те же значения используем здесь; ON CONFLICT DO NOTHING сохраняет
--    идемпотентность и пере-добавляет строки, если каталог их потерял.
-- ─────────────────────────────────────────────

INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('sponsors', 'view',   'Просмотр',   1),
  ('sponsors', 'manage', 'Управление', 2)
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
      VALUES (rid, 'sponsors', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;
