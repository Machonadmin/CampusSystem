-- Digital signatures for workflow stage completion (admission acceptance & beyond).
--
-- Three additive pieces, all idempotent (manual apply via Supabase SQL Editor):
--   1. stage_signatures  — append-only attestation attached to a stage_instance.
--   2. app_settings       — global key/value config (single-org app), seeds signature_method.
--   3. stage_templates.{required_role_code, requires_signature} — per-stage gates,
--      NULL/FALSE for all existing stages so recruitment/admission-v1 are unaffected.
--
-- Security notes baked in per the design review:
--   * signer identity is ALWAYS server-derived (signed_by = the RPC actor), never client input.
--   * drawn images live in the private 'documents' bucket under signatures/<stage>/… ;
--     only the storage_path is stored here.
--   * CHECK constraint rejects blank typed_name / malformed drawing_path (defense in depth).
--   * an append-only trigger blocks UPDATE/DELETE so the audit trail cannot be rewritten.

-- ─────────────────────────────────────────────────────────────
-- 1. stage_signatures
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stage_signatures (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_instance_id UUID NOT NULL REFERENCES stage_instances(id) ON DELETE CASCADE,
  signed_by         UUID NOT NULL REFERENCES persons(id),      -- SERVER-SET = the actor
  signer_name       TEXT NOT NULL,                             -- snapshot of signer's full_name
  signer_role_code  TEXT,                                      -- the stage's required role (capacity)
  signed_via        TEXT NOT NULL DEFAULT 'role'               -- 'role' | 'override' (admin bypass)
                      CHECK (signed_via IN ('role', 'override')),
  signature_kind    TEXT NOT NULL CHECK (signature_kind IN ('typed', 'drawn')),
  typed_name        TEXT,                                      -- required when kind='typed'
  drawing_path      TEXT,                                      -- storage_path in 'documents' bucket; required when kind='drawn'
  final_code        TEXT,                                      -- outcome this signature attests
  signed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stage_signatures_payload_ck CHECK (
    (signature_kind = 'typed' AND typed_name IS NOT NULL AND length(btrim(typed_name)) > 0) OR
    (signature_kind = 'drawn' AND drawing_path IS NOT NULL AND drawing_path ~ '^signatures/')
  )
);

CREATE INDEX IF NOT EXISTS idx_stage_signatures_stage    ON stage_signatures (stage_instance_id);
CREATE INDEX IF NOT EXISTS idx_stage_signatures_signed_by ON stage_signatures (signed_by);

-- Append-only: block any UPDATE/DELETE so a recorded signature cannot be altered.
CREATE OR REPLACE FUNCTION stage_signatures_no_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stage_signatures is append-only (% blocked)', TG_OP
    USING ERRCODE = '2F002';
END;
$$;

DROP TRIGGER IF EXISTS stage_signatures_append_only ON stage_signatures;
CREATE TRIGGER stage_signatures_append_only
  BEFORE UPDATE OR DELETE ON stage_signatures
  FOR EACH ROW EXECUTE FUNCTION stage_signatures_no_mutation();

-- ─────────────────────────────────────────────────────────────
-- 2. app_settings (global key/value)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES persons(id)
);

-- Signature method: 'typed' | 'drawn' | 'both'. Default 'both'.
INSERT INTO app_settings (key, value)
VALUES ('signature_method', '"both"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 3. Per-stage gates (additive; NULL/FALSE = unchanged behavior)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE stage_templates ADD COLUMN IF NOT EXISTS required_role_code TEXT;
ALTER TABLE stage_templates ADD COLUMN IF NOT EXISTS requires_signature BOOLEAN NOT NULL DEFAULT FALSE;
