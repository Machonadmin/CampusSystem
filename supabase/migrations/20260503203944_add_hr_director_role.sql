-- Add HR Director role (Начальник отдела кадров)

INSERT INTO roles (role_code, role_name, category, description, level, is_system)
VALUES (
  'hr_director',
  'Начальник отдела кадров',
  'campus_management',
  'Управляет персоналом, структурой организации, кадровым учётом',
  3,
  false
);

INSERT INTO module_privileges (role_code, module_code, can_view, can_create, can_edit, can_delete)
VALUES
  ('hr_director', 'staff',      true, true,  true,  true),
  ('hr_director', 'persons',    true, false, false, false),
  ('hr_director', 'tasks',      true, true,  true,  true),
  ('hr_director', 'documents',  true, true,  true,  false),
  ('hr_director', 'reports',    true, false, false, false);
