-- ============================================================================
-- Две доводки роли «אחראית יהדות» по решениям владельца:
--
-- 1) ДОХОТЫ ПО РОЛИ. Отчёты теперь фильтруются по модулям, доступным
--    пользователю (см. requireReportModule + фильтр карточек в ReportsClient).
--    Даём роли reports.access + reports.view → она увидит ТОЛЬКО отчёты
--    модулей, к которым у неё есть доступ («Учёба»: воронка приёма и сводка
--    студенток) — без отчётов финансов/руководства.
--
-- 2) «ИТОГИ СТУДЕНТКИ» (נדרש/שולם/חוב) — только для держателей специального
--    права. Новая узкая привилегия finance.view_student_balance: открывает в
--    карточке студентки блок «начислено/оплачено/долг» БЕЗ доступа к
--    финансовому модулю (canViewStudentFinance это учитывает; ссылка на полную
--    финкарточку держателю не показывается). Регистрируем в каталоге и даём роли.
--
-- Идемпотентно (ON CONFLICT).
-- ============================================================================

-- ─── Каталог: новая узкая привилегия финансов ────────────────────────────────
INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order)
VALUES ('finance', 'view_student_balance', 'Итоги студентки (начислено/оплачено/долг)', 60)
ON CONFLICT (module, privilege_code) DO NOTHING;

-- ─── Гранты роли «אחראית יהדות» ──────────────────────────────────────────────
-- Отчёты (модульный фильтр покажет ей только «учебные» карточки).
INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'reports', p.code, 'all'
FROM roles r CROSS JOIN (VALUES ('access'), ('view')) AS p(code)
WHERE r.code = 'jewish_studies_manager'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;

-- Итоги студентки (без финансового модуля).
INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT r.id, 'finance', 'view_student_balance', 'all'
FROM roles r WHERE r.code = 'jewish_studies_manager'
ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = EXCLUDED.scope;
