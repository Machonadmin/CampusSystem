-- ============================================================================
-- Judaism module (Phase 3, spec §3.8 / §4.4): per-student alerts (התראות
-- פר-תלמידה) with an EDITABLE reference table of alert types (not a hard enum —
-- the owner can add types) and granular sensitive-info gating.
--
--   • student_alert_types — reference (code + trilingual name + default_sensitive +
--     is_active + sort). Seeded with defaults that are immediately editable/
--     extensible from the UI.
--   • student_alerts — an alert on a student (person). state new/in_progress/
--     waiting/closed; the per-student counter = alerts where state <> 'closed'.
--     is_sensitive rows are visible only with the granular privilege
--     view_sensitive_alerts (NOT the old "doctor sees everything" model).
--
-- New privileges (registered here; granted below): manage_alerts (create/handle +
-- manage types — granted to Chana + superadmin) and view_sensitive_alerts
-- (granular; NOT auto-granted — owner assigns to specific roles as needed).
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

-- 1) Reference: alert types (editable).
CREATE TABLE IF NOT EXISTS student_alert_types (
  code              TEXT PRIMARY KEY,
  name_he           TEXT,
  name_ru           TEXT,
  name_en           TEXT,
  default_sensitive BOOLEAN NOT NULL DEFAULT false,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at_student_alert_types ON student_alert_types;
CREATE TRIGGER set_updated_at_student_alert_types
  BEFORE UPDATE ON student_alert_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO student_alert_types (code, name_he, name_ru, name_en, default_sensitive, sort_order) VALUES
  ('discipline',     'משמעת',        'Дисциплина',        'Discipline',      false, 10),
  ('attendance',     'נוכחות',       'Посещаемость',      'Attendance',      false, 20),
  ('academic_debt',  'חוב אקדמי',    'Академ. задолж.',   'Academic debt',   false, 30),
  ('financial_debt', 'חוב כספי',     'Фин. задолженность','Financial debt',  false, 40),
  ('message',        'הודעה',        'Сообщение',         'Message',         false, 50),
  ('medical',        'רפואי',        'Медицинское',       'Medical',         true,  60)
ON CONFLICT (code) DO NOTHING;

-- 2) The alerts themselves.
CREATE TABLE IF NOT EXISTS student_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  type_code     TEXT REFERENCES student_alert_types(code),  -- soft ref (not a hard CHECK)
  source_module TEXT,
  severity      TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  title         TEXT,
  body          TEXT,
  reported_by   UUID REFERENCES persons(id),
  state         TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new','in_progress','waiting','closed')),
  handled_by    UUID REFERENCES persons(id),
  handled_at    TIMESTAMPTZ,
  is_sensitive  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at_student_alerts ON student_alerts;
CREATE TRIGGER set_updated_at_student_alerts
  BEFORE UPDATE ON student_alerts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_student_alerts_student ON student_alerts (student_id);
CREATE INDEX IF NOT EXISTS idx_student_alerts_state ON student_alerts (state);
CREATE INDEX IF NOT EXISTS idx_student_alerts_open ON student_alerts (student_id) WHERE state <> 'closed';

-- 3) Privileges.
INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('studies', 'manage_alerts',          'Управление оповещениями',        24),
  ('studies', 'view_sensitive_alerts',  'Просмотр чувствительных оповещений', 25)
ON CONFLICT (module, privilege_code) DO NOTHING;

-- manage_alerts → Chana + superadmin (create/handle + manage types).
DO $$
DECLARE rid UUID; rcode TEXT;
BEGIN
  FOREACH rcode IN ARRAY ARRAY['jewish_studies_manager','superadmin','tech_admin'] LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;
    INSERT INTO role_privileges (role_id, module, privilege_code, scope)
    VALUES (rid, 'education', 'manage_alerts', 'all')
    ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
  END LOOP;
END $$;
-- view_sensitive_alerts is intentionally NOT auto-granted (superadmin bypasses in
-- code). The owner grants it to specific roles (e.g. doctor/psychologist) as needed.
