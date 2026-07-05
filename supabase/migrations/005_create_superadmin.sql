-- Migration: 005_create_superadmin
-- One-time bootstrap migration that creates the first superadmin user.
-- Already applied against production — this file is kept for reference and
-- for reproducing the schema on fresh environments.
--
-- To use on a fresh environment: replace the placeholders below with a real
-- email and a bcrypt hash (12 rounds), or prefer running
-- scripts/create-admin.ts, which reads ADMIN_EMAIL / ADMIN_PASSWORD from env vars.

DO $$
DECLARE
  v_person_id     UUID;
  v_role_id       UUID;
  v_email         TEXT := 'REPLACE_WITH_ADMIN_EMAIL';
  v_password_hash TEXT := 'REPLACE_WITH_BCRYPT_HASH';
BEGIN

  -- Skip if account already exists
  IF EXISTS (
    SELECT 1 FROM person_accounts WHERE login_email = v_email
  ) THEN
    RAISE NOTICE 'Superadmin already exists — skipping.';
    RETURN;
  END IF;

  -- 1. Create person record
  INSERT INTO persons (full_name, email)
  VALUES ('Суперадминистратор', v_email)
  RETURNING id INTO v_person_id;

  -- 2. Create login account with pre-hashed password
  INSERT INTO person_accounts (person_id, login_email, password_hash, is_active)
  VALUES (
    v_person_id,
    v_email,
    v_password_hash,
    TRUE
  );

  -- 3. Assign superadmin role
  SELECT id INTO v_role_id FROM roles WHERE code = 'superadmin';

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role "superadmin" not found — run migration 002 first.';
  END IF;

  INSERT INTO person_roles (person_id, role_id)
  VALUES (v_person_id, v_role_id);

  RAISE NOTICE 'Superadmin created: % (person_id: %)', v_email, v_person_id;

END $$;
