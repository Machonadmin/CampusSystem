-- Migration: 006_disable_rls_auth_tables
-- The login API uses the Supabase service role key which bypasses RLS.
-- However, if RLS was enabled by default on these tables, queries with
-- the anon key (or before the service role key is configured) would fail.
-- This migration disables RLS on the core tables so the app works even
-- if SUPABASE_SECRET_KEY falls back to the anon key temporarily.
--
-- NOTE: Once proper RLS policies are designed per role, re-enable RLS
-- and replace this migration with granular policies.

ALTER TABLE persons           DISABLE ROW LEVEL SECURITY;
ALTER TABLE person_accounts   DISABLE ROW LEVEL SECURITY;
ALTER TABLE person_family     DISABLE ROW LEVEL SECURITY;
ALTER TABLE person_roles      DISABLE ROW LEVEL SECURITY;
ALTER TABLE roles             DISABLE ROW LEVEL SECURITY;
ALTER TABLE role_privileges   DISABLE ROW LEVEL SECURITY;
ALTER TABLE module_privileges DISABLE ROW LEVEL SECURITY;
ALTER TABLE person_privileges DISABLE ROW LEVEL SECURITY;
ALTER TABLE departments       DISABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles    DISABLE ROW LEVEL SECURITY;
ALTER TABLE staff_positions   DISABLE ROW LEVEL SECURITY;
ALTER TABLE applicant_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments       DISABLE ROW LEVEL SECURITY;
ALTER TABLE alumni_profiles   DISABLE ROW LEVEL SECURITY;
ALTER TABLE sponsor_profiles  DISABLE ROW LEVEL SECURITY;
