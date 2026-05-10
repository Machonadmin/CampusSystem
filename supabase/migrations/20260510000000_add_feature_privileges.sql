-- Feature-level permissions for granular access control within modules

CREATE TABLE IF NOT EXISTS feature_privileges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code   TEXT NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  module_code TEXT NOT NULL,
  feature_code TEXT NOT NULL,
  can_view    BOOLEAN DEFAULT false,
  can_create  BOOLEAN DEFAULT false,
  can_edit    BOOLEAN DEFAULT false,
  can_delete  BOOLEAN DEFAULT false,
  UNIQUE(role_code, module_code, feature_code)
);

CREATE INDEX IF NOT EXISTS idx_feature_privileges_role   ON feature_privileges(role_code);
CREATE INDEX IF NOT EXISTS idx_feature_privileges_module ON feature_privileges(module_code, feature_code);

-- Default superadmin grants for quality_control features
INSERT INTO feature_privileges (role_code, module_code, feature_code, can_view, can_create, can_edit, can_delete)
VALUES
  ('superadmin', 'quality_control', 'planned',   true, true, true, true),
  ('superadmin', 'quality_control', 'history',   true, true, true, true),
  ('superadmin', 'quality_control', 'templates', true, true, true, true)
ON CONFLICT (role_code, module_code, feature_code) DO NOTHING;
