-- Migration: 002_roles_and_privileges
-- Replaces initial roles seed, restructures role_privileges to a
-- code-based system, and adds module_privileges + person_privileges tables.

-- ─────────────────────────────────────────────
-- 1. Clear existing roles and re-seed
-- ─────────────────────────────────────────────
TRUNCATE TABLE person_roles, role_privileges, roles CASCADE;

INSERT INTO roles (name, code, category, is_system, description) VALUES
-- Системные
('Суперадминистратор',       'superadmin',          'system',    TRUE,  'Полный доступ ко всей системе'),
('Технический администратор','tech_admin',           'system',    TRUE,  'Техническое администрирование'),
-- Управление кампусом
('Президент кампуса',        'campus_president',     'campus',    TRUE,  'Руководство кампусом'),
('Секретарь президента',     'president_secretary',  'campus',    FALSE, 'Секретарь президента кампуса'),
-- Финансы и юридический
('Финансовый директор',      'finance_director',     'campus',    FALSE, 'Управление финансами'),
('Бухгалтер',                'accountant',           'campus',    FALSE, 'Бухгалтерия'),
('Юрист',                    'lawyer',               'campus',    FALSE, 'Юридический отдел'),
-- Образование — руководство
('Ректор',                   'rector',               'education', FALSE, 'Ректор университета'),
('Декан',                    'dean',                 'education', FALSE, 'Декан факультета'),
('Директор учебного заведения','school_director',    'education', FALSE, 'Директор колледжа или школы'),
('Заместитель директора',    'vice_director',        'education', FALSE, 'Заместитель директора'),
('Заведующий кафедрой',      'dept_head',            'education', FALSE, 'Заведующий кафедрой'),
('Руководитель программы',   'program_head',         'education', FALSE, 'Руководитель образовательной программы'),
-- Образование — преподаватели
('Преподаватель',            'teacher',              'education', FALSE, 'Преподаватель или учитель'),
('Куратор',                  'curator',              'education', FALSE, 'Куратор или завуч'),
-- Образование — учащиеся
('Студент',                  'student',              'education', FALSE, 'Студент университета или колледжа'),
('Ученик',                   'pupil',                'education', FALSE, 'Ученик школы'),
-- Общежитие
('Директор общежития',       'dorm_director',        'campus',    FALSE, 'Директор общежития'),
('Эмбайт',                   'embait',               'campus',    FALSE, 'Эмбайт общежития'),
('Машгиах',                  'mashgiach',            'campus',    FALSE, 'Машгиах'),
-- Медицина
('Врач',                     'doctor',               'medical',   FALSE, 'Врач кампуса'),
('Психолог',                 'psychologist',         'medical',   FALSE, 'Психолог кампуса'),
-- Безопасность
('Начальник охраны',         'security_head',        'campus',    FALSE, 'Начальник отдела безопасности'),
('Охранник',                 'security_guard',       'campus',    FALSE, 'Сотрудник охраны'),
-- Эксплуатация
('Руководитель эксплуатации','maintenance_head',     'campus',    FALSE, 'Начальник отдела эксплуатации'),
('Сотрудник эксплуатации',   'maintenance_staff',    'campus',    FALSE, 'Инженер или мастер'),
-- Питание
('Руководитель кухни',       'kitchen_head',         'campus',    FALSE, 'Директор кухни или шеф-повар'),
('Сотрудник кухни',          'kitchen_staff',        'campus',    FALSE, 'Повар или сотрудник кухни'),
-- Технический персонал
('Технический персонал',     'technical_staff',      'campus',    FALSE, 'Уборщица и технический персонал'),
-- Внешние участники
('Абитуриент',               'applicant',            'external',  FALSE, 'Абитуриент кампуса'),
('Выпускник',                'alumni',               'external',  FALSE, 'Выпускник кампуса'),
('Спонсор',                  'sponsor',              'external',  FALSE, 'Спонсор кампуса');

-- ─────────────────────────────────────────────
-- 2. Module privileges catalogue
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS module_privileges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module         TEXT NOT NULL,
  privilege_code TEXT NOT NULL,
  privilege_name TEXT NOT NULL,
  description    TEXT,
  sort_order     INTEGER DEFAULT 0,
  UNIQUE(module, privilege_code)
);

-- ─────────────────────────────────────────────
-- 3. Replace role_privileges with code-based table
-- ─────────────────────────────────────────────
DROP TABLE IF EXISTS role_privileges CASCADE;

CREATE TABLE role_privileges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id        UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module         TEXT NOT NULL,
  privilege_code TEXT NOT NULL,
  granted_at     TIMESTAMPTZ DEFAULT NOW(),
  granted_by     UUID REFERENCES persons(id),
  UNIQUE(role_id, module, privilege_code)
);

-- ─────────────────────────────────────────────
-- 4. Per-person privilege overrides
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS person_privileges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id      UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  module         TEXT NOT NULL,
  privilege_code TEXT NOT NULL,
  is_granted     BOOLEAN NOT NULL DEFAULT TRUE,
  reason         TEXT,
  expires_at     TIMESTAMPTZ,
  granted_at     TIMESTAMPTZ DEFAULT NOW(),
  granted_by     UUID REFERENCES persons(id),
  UNIQUE(person_id, module, privilege_code)
);

-- ─────────────────────────────────────────────
-- 5. Seed module_privileges catalogue
-- ─────────────────────────────────────────────
INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
-- Persons
('persons',      'view',              'Просмотр',                    1),
('persons',      'create',            'Создание',                    2),
('persons',      'edit',              'Редактирование',              3),
('persons',      'delete',            'Удаление',                    4),
-- Приёмная комиссия
('applicants',   'view',              'Просмотр заявок',             1),
('applicants',   'create',            'Создание заявок',             2),
('applicants',   'edit',              'Редактирование заявок',       3),
('applicants',   'change_status',     'Изменение статуса',           4),
('applicants',   'delete',            'Удаление заявок',             5),
-- Образование
('education',    'view',              'Просмотр',                    1),
('education',    'manage_groups',     'Управление группами',         2),
('education',    'manage_schedule',   'Управление расписанием',      3),
('education',    'manage_grades',     'Выставление оценок',          4),
('education',    'view_own_only',     'Только свои данные',          5),
-- Финансы
('finance',      'view',              'Просмотр',                    1),
('finance',      'create_invoice',    'Создание счетов',             2),
('finance',      'approve_payment',   'Подтверждение платежей',      3),
('finance',      'manage_budget',     'Управление бюджетом',         4),
('finance',      'export_reports',    'Экспорт отчётов',             5),
-- Общежитие
('dormitory',    'view',              'Просмотр',                    1),
('dormitory',    'manage_rooms',      'Управление комнатами',        2),
('dormitory',    'manage_residents',  'Управление жильцами',         3),
-- Питание
('food',         'view_menu',         'Просмотр меню',               1),
('food',         'manage_menu',       'Управление меню',             2),
('food',         'manage_orders',     'Управление заказами',         3),
-- Безопасность
('security',     'view',              'Просмотр',                    1),
('security',     'manage_access',     'Управление пропусками',       2),
('security',     'view_logs',         'Просмотр журнала',            3),
-- Медицина
('doctor',       'view',              'Просмотр записей',            1),
('doctor',       'create',            'Создание записей',            2),
('doctor',       'edit',              'Редактирование',              3),
('psychologist', 'view',              'Просмотр записей',            1),
('psychologist', 'create',            'Создание записей',            2),
('psychologist', 'edit',              'Редактирование',              3),
-- Выпускники
('alumni',       'view',              'Просмотр',                    1),
('alumni',       'manage',            'Управление',                  2),
-- Спонсоры
('sponsors',     'view',              'Просмотр',                    1),
('sponsors',     'manage',            'Управление',                  2),
-- Задачи
('tasks',        'view_own',          'Свои задачи',                 1),
('tasks',        'view_all',          'Все задачи',                  2),
('tasks',        'create',            'Создание задач',              3),
('tasks',        'assign',            'Назначение задач',            4),
('tasks',        'delete',            'Удаление задач',              5),
-- Документы
('documents',    'view',              'Просмотр',                    1),
('documents',    'create',            'Создание',                    2),
('documents',    'manage_templates',  'Управление шаблонами',        3),
-- Отчёты
('reports',      'view',              'Просмотр отчётов',            1),
('reports',      'export',            'Экспорт отчётов',             2),
-- Настройки
('settings',     'view',              'Просмотр',                    1),
('settings',     'manage_roles',      'Управление ролями',           2),
('settings',     'manage_departments','Управление отделами',         3),
('settings',     'manage_system',     'Системные настройки',         4);
