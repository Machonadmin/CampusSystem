-- Add HR Director role (Начальник отдела кадров)

-- Relax category constraint to allow 'campus_management' if not already done
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_category_check;
ALTER TABLE roles ADD CONSTRAINT roles_category_check
  CHECK (category IN (
    'system','campus','campus_management','education','medical',
    'finance','legal','dormitory','security','maintenance',
    'food','technical','custom','external'
  ));

INSERT INTO roles (name, code, category, description, is_system)
VALUES (
  'Начальник отдела кадров',
  'hr_director',
  'campus_management',
  'Управляет персоналом, структурой организации, кадровым учётом',
  false
);

INSERT INTO role_privileges (role_id, module, privilege_code)
SELECT r.id, m.module, m.privilege_code
FROM roles r
CROSS JOIN (VALUES
  ('staff',     'view'),
  ('staff',     'create'),
  ('staff',     'edit'),
  ('staff',     'delete'),
  ('persons',   'view'),
  ('tasks',     'view'),
  ('tasks',     'create'),
  ('tasks',     'edit'),
  ('tasks',     'delete'),
  ('documents', 'view'),
  ('documents', 'create'),
  ('documents', 'edit'),
  ('reports',   'view')
) AS m(module, privilege_code)
WHERE r.code = 'hr_director';
