-- Migration: 005_create_superadmin
-- Creates the first superadmin user with a pre-hashed password.
-- Email:    oficepresident@gmail.com
-- Password: Campus2026!  (bcrypt, 12 rounds)

DO $$
DECLARE
  v_person_id  UUID;
  v_role_id    UUID;
BEGIN

  -- Skip if account already exists
  IF EXISTS (
    SELECT 1 FROM person_accounts WHERE login_email = 'oficepresident@gmail.com'
  ) THEN
    RAISE NOTICE 'Superadmin already exists — skipping.';
    RETURN;
  END IF;

  -- 1. Create person record
  INSERT INTO persons (full_name, email)
  VALUES ('Суперадминистратор', 'oficepresident@gmail.com')
  RETURNING id INTO v_person_id;

  -- 2. Create login account with pre-hashed password
  INSERT INTO person_accounts (person_id, login_email, password_hash, is_active)
  VALUES (
    v_person_id,
    'oficepresident@gmail.com',
    '$2b$12$mLfECM1txb1cvHQ4Wf93Kea0q.RoGHR1imcmFSiazwUEgqgItBtUK',
    TRUE
  );

  -- 3. Assign superadmin role
  SELECT id INTO v_role_id FROM roles WHERE code = 'superadmin';

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role "superadmin" not found — run migration 002 first.';
  END IF;

  INSERT INTO person_roles (person_id, role_id)
  VALUES (v_person_id, v_role_id);

  RAISE NOTICE 'Superadmin created: % (person_id: %)', 'oficepresident@gmail.com', v_person_id;

END $$;
