-- ═════════════════════════════════════════════════════════════════════
-- Reseed каталога module_privileges — компенсация дрейфа сида 002.
--
-- Обнаружено (GitHub #1): на целевой БД сид module_privileges из
-- 002_roles_and_privileges.sql применён НЕ полностью. Фактически в каталоге
-- присутствуют только education (17 кодов из 20260511175354), tasks.delete и
-- alumni (view/manage из 20260705130000) — итого 20 строк вместо 52.
-- Из-за этого миграции, выдающие права циклом по module_privileges нужного
-- модуля (FOR ... IN SELECT ... WHERE module = '<mod>'), находят 0 строк и
-- молча ничего не выдают (тихий сбой прав, 403 для всех).
--
-- Эта миграция:
-- 1. Засевает каталог из 002 — 48 туплей (все коды кроме 4 legacy задач);
--    education 5 кодов (view/manage_groups/manage_schedule/manage_grades/view_own_only)
--    СОХРАНЕНЫ как канонические в 20260511175354 (не удаляются).
-- 2. ЗАТЕМ удаляет 4 legacy tasks кода, которые были намеренно удалены в
--    20260511000343: view_own / view_all / create / assign.
--    Оставляет tasks.delete (который был в 002 и остаётся канонически).
-- 3. Удаление — только из module_privileges каталога, role_privileges остаются нетронутыми
--    (например, hr_director|tasks|create из 20260503203944 сохраняется намеренно,
--    это не ошибка, это canonical state).
-- С ON CONFLICT (module, privilege_code) DO NOTHING на INSERT — идемпотентно.
-- ═════════════════════════════════════════════════════════════════════

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
('settings',     'manage_system',     'Системные настройки',         4)
ON CONFLICT (module, privilege_code) DO NOTHING;

-- Удалить 4 legacy tasks кода, которые были намеренно удалены в 20260511000343.
-- Если была применена полная reseed (002 вербатим) — они могли быть добавлены обратно.
-- Это удаление чистит каталог; role_privileges НЕ трогаются (canonical grant сохраняется).
DELETE FROM module_privileges
WHERE (module, privilege_code) IN (
  ('tasks', 'view_own'),
  ('tasks', 'view_all'),
  ('tasks', 'create'),
  ('tasks', 'assign')
);
