-- ============================================================================
-- Judaism module (Phase 2, spec §2.1): role «רב לימודי יהדות» (jewish_studies_rav)
-- for Rav Moshe Rochlin. He gets an ACTIVE account and, unlike Chana, is NOT the
-- unit head. His authority (spec §2.1): create kodesh courses + set their hours,
-- approve/reject teachers for courses, set teacher hour-quotas, and the initial
-- jewishness check.
--
-- The four new privilege codes are kodesh-specific by nature, so they are granted
-- at scope='all' (there is no other department with kodesh courses) — this means
-- Moshe works with just the ROLE assignment, no staff_position seat required.
--
-- ⚠ OWNER ACTION (manual, via the roles UI — this migration does NOT touch a
-- specific person): assign the role 'jewish_studies_rav' to Rav Moshe's account.
-- Mirrors how 'jewish_studies_manager' (Chana) is assigned.
--
-- Chana's side (spec §2.2): "propose a teacher" reuses her existing
-- manage_class_teachers (department) grant — no new code is added for it, per the
-- established "extend, don't duplicate" approach (spec §5.1).
--
-- Idempotent (ON CONFLICT). Apply MANUALLY via Supabase Dashboard SQL Editor.
-- ============================================================================

-- 1) Role.
INSERT INTO roles (code, name, category, description, is_system)
VALUES ('jewish_studies_rav', 'רב לימודי יהדות', 'education',
        'יוצר קורסי יהדות וקובע שעות, מאשר/דוחה מורות לקורסים, קובע מכסת שעות למורה, ובדיקת יהדות ראשונית.',
        false)
ON CONFLICT (code) DO NOTHING;

-- 2) Privilege catalog rows (module 'studies' — the education privilege catalog).
INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('studies', 'create_kodesh_course',    'Создание курсов кодеша',        20),
  ('studies', 'approve_kodesh_teacher',  'Утверждение преподавателей',    21),
  ('studies', 'set_teacher_quota',       'Установка часовой квоты',       22),
  ('studies', 'jewishness_initial_check','Первичная проверка еврейства',  23)
ON CONFLICT (module, privilege_code) DO NOTHING;

-- 3) Grants for jewish_studies_rav.
--    Module tile + read of students/lists (view_students='all' opens the study
--    lists for reading, like Chana), persons/contacts read, and jewishness access.
INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'education', 'access', 'all' FROM roles r WHERE r.code = 'jewish_studies_rav'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;

INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'education', 'view_students', 'all' FROM roles r WHERE r.code = 'jewish_studies_rav'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;

-- The four kodesh-specific capabilities (scope='all' — kodesh-only by nature).
INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'education', p.code, 'all'
FROM roles r CROSS JOIN (VALUES
  ('create_kodesh_course'), ('approve_kodesh_teacher'), ('set_teacher_quota'), ('jewishness_initial_check')
) AS p(code)
WHERE r.code = 'jewish_studies_rav'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;

-- בירור יהדות — доступ (initial check lives here).
INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'jewishness', p.code, 'all'
FROM roles r CROSS JOIN (VALUES ('access'), ('view'), ('create'), ('edit')) AS p(code)
WHERE r.code = 'jewish_studies_rav'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;

-- מאגר אנשים + אנשי קשר — просмотр (для карточек преподавателей/студенток).
INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, m.module, p.code, 'all'
FROM roles r
CROSS JOIN (VALUES ('persons'), ('contacts')) AS m(module)
CROSS JOIN (VALUES ('access'), ('view')) AS p(code)
WHERE r.code = 'jewish_studies_rav'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;

-- 4) Position label in the catalog (if missing).
INSERT INTO reference_positions (name_ru, name_he, category, is_teaching, sort_order)
VALUES ('Рав по иудаике', 'רב לימודי יהדות', 'administrative', false, 37)
ON CONFLICT (name_ru) DO NOTHING;
