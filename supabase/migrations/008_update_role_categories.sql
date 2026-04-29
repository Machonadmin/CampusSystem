-- Update role categories
UPDATE roles SET category = 'system' WHERE code IN ('superadmin', 'tech_admin');
UPDATE roles SET category = 'campus_management' WHERE code IN ('campus_president', 'president_secretary');
UPDATE roles SET category = 'finance' WHERE code IN ('finance_director', 'accountant');
UPDATE roles SET category = 'legal' WHERE code = 'lawyer';
UPDATE roles SET category = 'education' WHERE code IN (
  'rector', 'dean', 'school_director', 'vice_director',
  'dept_head', 'program_head', 'teacher', 'curator',
  'student', 'pupil', 'applicant', 'alumni'
);
UPDATE roles SET category = 'dormitory' WHERE code IN ('dorm_director', 'embait', 'mashgiach');
UPDATE roles SET category = 'medical' WHERE code IN ('doctor', 'psychologist');
UPDATE roles SET category = 'security' WHERE code IN ('security_head', 'security_guard');
UPDATE roles SET category = 'maintenance' WHERE code IN ('maintenance_head', 'maintenance_staff');
UPDATE roles SET category = 'food' WHERE code IN ('kitchen_head', 'kitchen_staff');
UPDATE roles SET category = 'technical' WHERE code = 'technical_staff';
UPDATE roles SET category = 'external' WHERE code IN ('sponsor', 'guest');
