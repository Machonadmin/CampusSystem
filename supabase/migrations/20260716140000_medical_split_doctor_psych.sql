-- Разделение мед. этапа приёма на ВРАЧА и ПСИХОЛОГА (по просьбе владельца):
-- раньше был один этап `medical` (роль 'doctor,psychologist'), на который
-- направляли одним финалом `refer_to_doctor`. Теперь у учебной проверки и
-- общежития ДВЕ опции направления — к врачу ИЛИ к психологу — и каждый
-- профессионал получает свой этап и подписывает только его.
--
-- • `medical`  → только ВРАЧ  (required_role_code='doctor').
-- • `medical_psych` (новый, sort 45) → ПСИХОЛОГ (required_role_code='psychologist').
-- • academic/dormitory получают финал `refer_to_psychologist` + переходы к
--   medical_psych (after_one) и к final_approval (after_all) — зеркально
--   существующему refer_to_doctor, чтобы финальное утверждение не зависало.
--
-- medical/medical_psych остаются параллельными информационными этапами (как и
-- раньше, не предки final_approval): директор видит их статус в сводке подписей.
-- Уже запущенные инстансы не получают medical_psych (start_process уже отработал)
-- — согласовано с владельцем: старые абитуриентки идут по-старому, новые — с
-- двумя опциями. Идемпотентно (фикс. UUID + ON CONFLICT).

-- 1. medical → только врач
UPDATE stage_templates
  SET required_role_code = 'doctor', name_ru = 'Заключение врача'
  WHERE id = 'ac000000-0000-4000-8000-000000000040';

-- 2. Новый этап — психолог
INSERT INTO stage_templates (id, process_template_id, code, name_ru, has_tasks, sort_order, required_role_code, requires_signature) VALUES
('ac000000-0000-4000-8000-000000000045', 'ac000000-0000-4000-8000-000000000001', 'medical_psych', 'Заключение психолога', false, 45, 'psychologist', true)
ON CONFLICT (process_template_id, code) DO NOTHING;

-- 3. Финалы этапа психолога
INSERT INTO stage_finals (id, stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order) VALUES
('ac000000-0000-4000-8000-000000000451', 'ac000000-0000-4000-8000-000000000045', 'approved', 'Пригодна',    true,  false, NULL, 10),
('ac000000-0000-4000-8000-000000000452', 'ac000000-0000-4000-8000-000000000045', 'rejected', 'Не пригодна', false, false, NULL, 20)
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- 4. Новый финал «направить к психологу» на учебной проверке и общежитии
INSERT INTO stage_finals (id, stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order) VALUES
('ac000000-0000-4000-8000-000000000104', 'ac000000-0000-4000-8000-000000000010', 'refer_to_psychologist', 'Направить к психологу', false, false, NULL, 25),
('ac000000-0000-4000-8000-000000000204', 'ac000000-0000-4000-8000-000000000020', 'refer_to_psychologist', 'Направить к психологу', false, false, NULL, 25)
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- 5. Переходы для refer_to_psychologist (зеркало refer_to_doctor)
INSERT INTO stage_transitions (id, from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order) VALUES
-- условная активация этапа психолога
('ac000000-0000-4000-8000-000000000612', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000045', 'refer_to_psychologist', 'after_one', 12),
('ac000000-0000-4000-8000-000000000613', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000045', 'refer_to_psychologist', 'after_one', 22),
-- after_all join к финалу (чтобы final_approval активировался и при этом финале)
('ac000000-0000-4000-8000-000000000650', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000050', 'refer_to_psychologist', 'after_all', 38),
('ac000000-0000-4000-8000-000000000651', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000050', 'refer_to_psychologist', 'after_all', 39)
ON CONFLICT (id) DO NOTHING;
