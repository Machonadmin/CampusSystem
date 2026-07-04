-- Шаблон процесса «Приём» (admission): абитуриент → студент.
-- Запускается автоматически при переходе journey в статус 'applicant'
-- (хук в route-ах complete / close-early — см. код). Единоличное решение
-- (v1): один сотрудник рассматривает заявку и выбирает исход.
--
-- Этапы:
--   1. Приёмное решение (admission_decision) — задача сотруднику, финалы:
--        admitted             → студент (closes)
--        admitted_conditional → студент + флаг is_conditional_admission (closes)
--        rejected             → закрыть, остаётся applicant (closes)
--        waitlisted           → переход в «Список ожидания» (НЕ closes)
--   2. Список ожидания (waitlist) — процесс остаётся открытым; финалы:
--        admitted → студент (closes),  rejected → закрыть (closes)
--
-- Конверсию в 'student' по process_finish_reason 'admitted'/'admitted_conditional'
-- выполняет движок (complete_stage / close_process_early, см. 20260703170000).
-- Фиксированные UUID + ON CONFLICT DO NOTHING — идемпотентно.

-- 1. Шаблон процесса
INSERT INTO process_templates (id, code, name_ru, description, is_active) VALUES
('ad000000-0000-4000-8000-000000000001', 'admission', 'Приём',
 'Процесс приёмной комиссии: абитуриент → студент', true)
ON CONFLICT (code) DO NOTHING;

-- 2. Этапы
INSERT INTO stage_templates (id, process_template_id, code, name_ru, has_tasks, sort_order) VALUES
('ad000000-0000-4000-8000-000000000010', 'ad000000-0000-4000-8000-000000000001',
 'admission_decision', 'Приёмное решение', true, 10),
('ad000000-0000-4000-8000-000000000020', 'ad000000-0000-4000-8000-000000000001',
 'waitlist', 'Список ожидания', true, 20)
ON CONFLICT (process_template_id, code) DO NOTHING;

-- 3. Финалы
INSERT INTO stage_finals (id, stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order) VALUES
-- Приёмное решение
('ad000000-0000-4000-8000-000000000101', 'ad000000-0000-4000-8000-000000000010',
 'admitted',             'Принят',            true,  true,  'admitted',             10),
('ad000000-0000-4000-8000-000000000102', 'ad000000-0000-4000-8000-000000000010',
 'admitted_conditional', 'Условно принят',    true,  true,  'admitted_conditional', 20),
('ad000000-0000-4000-8000-000000000103', 'ad000000-0000-4000-8000-000000000010',
 'waitlisted',           'В список ожидания', false, false, NULL,                   30),
('ad000000-0000-4000-8000-000000000104', 'ad000000-0000-4000-8000-000000000010',
 'rejected',             'Отклонён',          false, true,  'rejected',             40),
-- Список ожидания
('ad000000-0000-4000-8000-000000000201', 'ad000000-0000-4000-8000-000000000020',
 'admitted',             'Принят из списка',  true,  true,  'admitted',             10),
('ad000000-0000-4000-8000-000000000202', 'ad000000-0000-4000-8000-000000000020',
 'rejected',             'Отклонён из списка',false, true,  'rejected',             20)
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- 4. Переходы: начальный → decision; decision --waitlisted--> waitlist
INSERT INTO stage_transitions (id, from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order) VALUES
('ad000000-0000-4000-8000-000000000301', NULL,
 'ad000000-0000-4000-8000-000000000010', NULL, 'after_one', 10),
('ad000000-0000-4000-8000-000000000302', 'ad000000-0000-4000-8000-000000000010',
 'ad000000-0000-4000-8000-000000000020', 'waitlisted', 'after_one', 20)
ON CONFLICT (id) DO NOTHING;

-- 5. Задачи этапов (default_assignee_type='creator' → назначается на того, кто
--    запустил процесс: сотрудник, конвертировавший лида в абитуриента). Нет
--    task_transitions → движок создаёт все задачи этапа (по одной на этап).
INSERT INTO stage_task_templates (id, stage_template_id, code, title, description, default_assignee_type, default_priority, sort_order) VALUES
('ad000000-0000-4000-8000-000000000401', 'ad000000-0000-4000-8000-000000000010',
 'make_decision', 'Рассмотреть заявку и принять решение',
 'Рассмотреть абитуриента и вынести приёмное решение.', 'creator', 'high', 10),
('ad000000-0000-4000-8000-000000000402', 'ad000000-0000-4000-8000-000000000020',
 'waitlist_review', 'Решение по списку ожидания',
 'Пересмотреть заявку из списка ожидания.', 'creator', 'normal', 10)
ON CONFLICT (stage_template_id, code) DO NOTHING;
