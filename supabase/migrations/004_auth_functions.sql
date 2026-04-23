-- Migration: 004_auth_functions
-- Database-side helpers for authentication.

-- ─────────────────────────────────────────────
-- verify_login
-- Returns account + person info + role codes for a given email.
-- Called from the login API route; password check happens in app layer.
-- SECURITY DEFINER allows the anon key to read password_hash safely.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION verify_login(p_email TEXT)
RETURNS TABLE (
  person_id    UUID,
  login_email  TEXT,
  password_hash TEXT,
  is_active    BOOLEAN,
  full_name    TEXT,
  roles        TEXT[]
) AS $$
  SELECT
    pa.person_id,
    pa.login_email,
    pa.password_hash,
    pa.is_active,
    p.full_name,
    COALESCE(ARRAY_AGG(r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
  FROM person_accounts pa
  JOIN persons p ON p.id = pa.person_id
  LEFT JOIN person_roles pr ON pr.person_id = pa.person_id
  LEFT JOIN roles r ON r.id = pr.role_id
  WHERE pa.login_email = lower(trim(p_email))
  GROUP BY pa.person_id, pa.login_email, pa.password_hash, pa.is_active, p.full_name;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ─────────────────────────────────────────────
-- update_last_login
-- Called after a successful login to record the timestamp.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_last_login(p_person_id UUID)
RETURNS VOID AS $$
  UPDATE person_accounts
  SET last_login = NOW()
  WHERE person_id = p_person_id;
$$ LANGUAGE SQL SECURITY DEFINER;
