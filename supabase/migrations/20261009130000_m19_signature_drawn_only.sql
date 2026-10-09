-- M19 (owner decision 2026-10-08): signing = drawing only, everywhere.
--
-- The code no longer reads app_settings.signature_method (there is no
-- "typed name" option anywhere). This row is set to 'drawn' so that, if this
-- migration runs before the new code is deployed, the old code also shows only
-- the drawing pad. Idempotent; data-only; no schema change.
--
-- Existing signatures (stage_signatures / finance_payments / finance_discounts)
-- are NOT touched: stage_signatures is append-only by design, and old typed
-- signatures stay as historical records (shown with the signer's name).

INSERT INTO app_settings (key, value)
VALUES ('signature_method', '"drawn"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = '"drawn"'::jsonb, updated_at = NOW();
