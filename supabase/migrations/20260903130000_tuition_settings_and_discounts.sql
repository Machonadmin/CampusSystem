-- ============================================================================
-- Judaism module (Phase 3, spec §3.9): tuition defaults + discount approval
-- governance. EXTENDS the existing finance model (finance_charges / finance_
-- payments / finance_discounts) — does NOT rebuild or alter it.
--
--   • finance_settings — editable institute defaults (full price 520000₽/year =
--     260000₽/semester; currency). Values are a SUGGESTION, fully editable (spec
--     §0.3) — nothing is hard-coded in application code.
--   • tuition_discount_approvals — the 90% discount is a DEFAULT SUGGESTION that
--     requires MANUAL approval per student by a FINANCE role (NOT Chana). This
--     table is the approval GOVERNANCE record (request → approve/reject). It is
--     DECOUPLED from live billing: applying an approved discount to
--     finance_discounts stays a finance-module action (owner decides the exact
--     integration once §6.2 — who the approver is — is resolved).
--   • privileges approve_discount / confirm_payment — registered but NOT granted
--     to anyone (spec §2.3 / §6.2 OPEN: the owner assigns the finance role later).
--
-- Idempotent. Apply MANUALLY via Supabase Dashboard SQL Editor.
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 1) Editable tuition defaults (singleton).
CREATE TABLE IF NOT EXISTS finance_settings (
  id                       BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  default_year_tuition     NUMERIC(12,2) NOT NULL DEFAULT 520000 CHECK (default_year_tuition >= 0),
  default_semester_tuition NUMERIC(12,2) NOT NULL DEFAULT 260000 CHECK (default_semester_tuition >= 0),
  currency                 TEXT NOT NULL DEFAULT 'RUB',
  default_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 90 CHECK (default_discount_percent BETWEEN 0 AND 100),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO finance_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS set_updated_at_finance_settings ON finance_settings;
CREATE TRIGGER set_updated_at_finance_settings
  BEFORE UPDATE ON finance_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2) Discount approval governance.
CREATE TABLE IF NOT EXISTS tuition_discount_approvals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id        UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  requested_percent NUMERIC(5,2) NOT NULL DEFAULT 90 CHECK (requested_percent BETWEEN 0 AND 100),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by      UUID REFERENCES persons(id),
  decided_by        UUID REFERENCES persons(id),   -- a finance-role holder (approve_discount)
  decided_at        TIMESTAMPTZ,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at_tuition_discount_approvals ON tuition_discount_approvals;
CREATE TRIGGER set_updated_at_tuition_discount_approvals
  BEFORE UPDATE ON tuition_discount_approvals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_tuition_discount_approvals_journey ON tuition_discount_approvals (journey_id);
-- At most one PENDING request per journey.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tuition_discount_approvals_pending
  ON tuition_discount_approvals (journey_id) WHERE status = 'pending';

-- 3) Finance privileges (registered only — owner assigns the finance role, §6.2).
INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('finance', 'approve_discount', 'Утверждение скидок',       70),
  ('finance', 'confirm_payment',  'Подтверждение оплаты',     71)
ON CONFLICT (module, privilege_code) DO NOTHING;
