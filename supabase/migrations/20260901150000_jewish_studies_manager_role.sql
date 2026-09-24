-- ============================================================================
-- Роль «אחראית יהדות» (jewish_studies_manager) — готовый шаблон по точной
-- спецификации владельца (кейс Chana Rochlin):
--
--   • ВИДИТ всех активных студенток института (в одной группе иудаики учатся
--     студентки разных маршрутов и лет) → view_students scope='all'.
--     Благодаря этому же все списки «Учёбы» (заведения/направления/предметы/
--     группы/расписание) открыты ей ДЛЯ ЧТЕНИЯ — фильтр видимости срабатывает
--     только при scope='department'.
--   • РЕДАКТИРУЕТ только лимудей-кодеш: группы иудаики, курсы, преподавателей,
--     часы/классы, зачисления → manage_* scope='department' (реальную границу
--     задаёт её ПОСАДКА в подразделение «לימודי קודש»). Основной маршрут,
--     светские курсы и общая сетка — только просмотр (manage там вернёт 403).
--   • גיוס — нет (нет view_leads → раздел скрыт).
--   • קבלה — ограниченно: видит статусы приёма (view_applicants), НЕ управляет
--     (нет manage_applicants/enroll_applicant). Правка «своей» части приёма —
--     через модуль בירור יהדות.
--   • בירור יהדות — полный доступ (её зона ответственности).
--   • בוגרות — доступ + просмотр (детали роли — отдельно, по слову владельца).
--   • מאגר אנשים + אנשי קשר — просмотр (студентки/преподаватели/родители/
--     персонал), БЕЗ права менять (нет edit/create/delete).
--   • דוחות и финансы НЕ включены: отчёты пока не фильтруются по роли, а
--     «видеть у студентки только начислено/оплачено/долг» требует отдельной
--     фичи — оба пункта ждут решения владельца (см. отчёт в чате).
--
-- Идемпотентно (ON CONFLICT). Права пишем под модулем 'education' — читатели
-- прав «Учёбы» собирают все четыре ярлыка (education/recruitment/admission/
-- studies), как в 20260818190000.
-- ============================================================================

INSERT INTO roles (code, name, category, description, is_system)
VALUES ('jewish_studies_manager', 'אחראית יהדות', 'education',
        'רואה את כל התלמידות הפעילות; עורכת רק את לימודי הקודש (קבוצות, קורסים, מורות, שעות). קבלה לצפייה, בירור יהדות מלא, מאגר אנשים לצפייה.',
        false)
ON CONFLICT (code) DO NOTHING;

-- ─── «Учёба» ──────────────────────────────────────────────────────────────────
-- Гейт модуля.
INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'education', 'access', 'all' FROM roles r WHERE r.code = 'jewish_studies_manager'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;

-- Видит ВСЁ (студентки + все списки для чтения).
INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'education', 'view_students', 'all' FROM roles r WHERE r.code = 'jewish_studies_manager'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;

-- Приём — только просмотр статусов (раздел קבלה виден, управлять нельзя).
INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'education', 'view_applicants', 'all' FROM roles r WHERE r.code = 'jewish_studies_manager'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;

-- Правка ТОЛЬКО своего подразделения (посадка в «לימודי קודש» задаёт границу):
-- группы, курсы, преподаватели, зачисления, расписание (часы/классы).
INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'education', p.code, 'department'
FROM roles r CROSS JOIN (VALUES
  ('manage_class_groups'), ('manage_class_teachers'), ('manage_subjects'),
  ('manage_enrollments'), ('manage_schedule')
) AS p(code)
WHERE r.code = 'jewish_studies_manager'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;

-- ─── בירור יהדות — полный доступ ──────────────────────────────────────────────
INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'jewishness', p.code, 'all'
FROM roles r CROSS JOIN (VALUES ('access'), ('view'), ('create'), ('edit')) AS p(code)
WHERE r.code = 'jewish_studies_manager'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;

-- ─── מאגר אנשים — только просмотр ─────────────────────────────────────────────
INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'persons', p.code, 'all'
FROM roles r CROSS JOIN (VALUES ('access'), ('view')) AS p(code)
WHERE r.code = 'jewish_studies_manager'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;

-- ─── אנשי קשר — только просмотр ───────────────────────────────────────────────
INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'contacts', p.code, 'all'
FROM roles r CROSS JOIN (VALUES ('access'), ('view')) AS p(code)
WHERE r.code = 'jewish_studies_manager'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;

-- ─── בוגרות — доступ + просмотр (детали роли определим отдельно) ──────────────
INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'alumni', p.code, 'all'
FROM roles r CROSS JOIN (VALUES ('access'), ('view')) AS p(code)
WHERE r.code = 'jewish_studies_manager'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;

-- ─── Ярлык-должность «אחראית יהדות» в каталоге (если её ещё нет) ──────────────
INSERT INTO reference_positions (name_ru, name_he, category, is_teaching, sort_order)
VALUES ('Ответственная за иудаику', 'אחראית יהדות', 'administrative', false, 36)
ON CONFLICT (name_ru) DO NOTHING;
