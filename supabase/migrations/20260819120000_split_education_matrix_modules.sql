-- ============================================================================
-- Разделение матрицы прав «Учёбы» на три модуля: recruitment (גיוס) /
-- admission (קבלה) / studies (לимудим). Запрос владельца: три раздельных модуля,
-- «чтобы не было התנגשויות».
--
-- БЕЗОПАСНОСТЬ (авторизация НЕ меняется):
--   • Значения privilege_code не трогаем — меняется только ярлык module.
--   • Приложение читает права из ВСЕХ четырёх модулей
--     ('education','recruitment','admission','studies'), поэтому ни один грант
--     не может «потеряться» — даже если что-то осталось под 'education'.
--   • Зонтичный модуль 'education' сохраняет 'access' (гейт навигации) и
--     'delegate_privileges' (делегирование в единицах). Делегирование
--     (person_privileges) НЕ трогаем — оно продолжает жить под 'education'.
--
-- Идемпотентно: можно выполнить повторно без вреда.
-- ============================================================================

-- 1) Каталог: строки прав трёх новых модулей (для матрицы ролей).
INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('recruitment', 'view_leads',            'Просмотр лидов',                       1),
  ('recruitment', 'manage_leads',          'Управление лидами',                    2),
  ('recruitment', 'convert_lead',          'Конвертация лида в абитуриенты',       3),
  ('admission',   'view_applicants',       'Просмотр абитуриентов',                1),
  ('admission',   'manage_applicants',     'Управление абитуриентами',             2),
  ('admission',   'enroll_applicant',      'Зачисление абитуриента',               3),
  ('studies',     'view_students',         'Просмотр студентов',                    1),
  ('studies',     'manage_students',       'Управление студентами',                2),
  ('studies',     'manage_enrollments',    'Управление записями в группы',         3),
  ('studies',     'manage_class_groups',   'Управление учебными группами',         4),
  ('studies',     'manage_class_teachers', 'Управление преподавателями групп',     5),
  ('studies',     'mark_attendance',       'Отметка посещаемости',                 6),
  ('studies',     'set_grades',            'Выставление оценок',                    7),
  ('studies',     'set_lesson_topics',     'Заполнение тем уроков',                 8),
  ('studies',     'manage_communities',    'Управление общинами',                  9),
  ('studies',     'write_evaluation',      'Оценка преподавания',                 10),
  ('studies',     'manage_subjects',       'Управление предметами',               11),
  ('studies',     'manage_specialties',    'Управление специальностями',          12),
  ('studies',     'manage_study_groups',   'Управление базовыми группами',        13)
ON CONFLICT (module, privilege_code) DO NOTHING;

-- 2) Переносим существующие гранты ролей под новые модули (сохраняя privilege_code
--    и scope — авторизация не меняется, только ярлык модуля в матрице).
UPDATE role_privileges SET module = 'recruitment'
  WHERE module = 'education'
    AND privilege_code IN ('view_leads', 'manage_leads', 'convert_lead');

UPDATE role_privileges SET module = 'admission'
  WHERE module = 'education'
    AND privilege_code IN ('view_applicants', 'manage_applicants', 'enroll_applicant');

UPDATE role_privileges SET module = 'studies'
  WHERE module = 'education'
    AND privilege_code IN (
      'view_students', 'manage_students', 'manage_enrollments', 'manage_class_groups',
      'manage_class_teachers', 'mark_attendance', 'set_grades', 'set_lesson_topics',
      'manage_communities', 'write_evaluation', 'manage_subjects', 'manage_specialties',
      'manage_study_groups',
      -- легаси-коды старой матрицы (на всякий случай, чтобы не остались под education):
      'manage_grades', 'manage_schedule', 'manage_groups', 'view_own_only',
      'manage_education_data', 'view'
    );

-- 3) Убираем из каталога перенесённые «тонкие» права модуля education, чтобы
--    матрица показывала их ТОЛЬКО под тремя новыми модулями. Зонтичный education
--    сохраняет 'access' и 'delegate_privileges'.
DELETE FROM module_privileges
  WHERE module = 'education'
    AND privilege_code NOT IN ('access', 'delegate_privileges');
