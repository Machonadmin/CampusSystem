-- ─────────────────────────────────────────────────────────────────────────────
-- Quality Control — включаем enforcement на feature_privileges.
--
-- feature_privileges существует с 20260510000000_add_feature_privileges.sql,
-- но до сих пор только superadmin имел там гранты, и ни один route handler
-- в app/api/quality-control/* её не проверял — только сессию. Это значило,
-- что любой авторизованный пользователь мог смотреть/редактировать/удалять
-- любую запись оценки урока (включая teacher_feedback, overall_rating).
--
-- Раздаём дефолтные гранты по 'planned' и 'history' (все, кроме 'templates' —
-- это управляется отдельно, здесь не трогаем), чтобы включение проверки в
-- коде не заблокировало тех, кто уже реально этим занимается: то же
-- множество ролей образовательного руководства, что уже используется для
-- education/persons-привилегий (20260702140000, блок 3), плюс curator
-- (педагогический координатор) — согласовано с пользователем явно, т.к.
-- готовой роли "инспектор контроля качества" в системе нет.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO feature_privileges (role_code, module_code, feature_code, can_view, can_create, can_edit, can_delete)
SELECT r.code, m.module_code, m.feature_code, true, true, true, true
FROM roles r
CROSS JOIN (VALUES
  ('quality_control', 'planned'),
  ('quality_control', 'history')
) AS m(module_code, feature_code)
WHERE r.code IN ('school_director', 'rector', 'dean', 'vice_director', 'dept_head', 'program_head', 'curator')
ON CONFLICT (role_code, module_code, feature_code) DO UPDATE SET
  can_view = true, can_create = true, can_edit = true, can_delete = true;
