-- Процесс «Приёмная комиссия» (acceptance): многоэтапный приём абитуриент → студент.
-- Заменяет одноэтапный admission-v1 как авто-стартуемый процесс (см. смену
-- p_process_code в route-ах complete/close-early). Идемпотентно (фикс. UUID + ON CONFLICT).
--
-- Зависит от 20260713150000 (stage_templates.required_role_code / requires_signature).
--
-- Этапы (3 обязательных параллельных + условный врач + финал директора):
--   academic       (head_of_studies)      подпись — approved / rejected / refer_to_doctor
--   dormitory      (dorm_director)         подпись — approved / rejected / refer_to_doctor
--   jewishness     (jewishness_officer)    подпись — approved / rejected
--   medical        (doctor,psychologist)   подпись — approved / rejected   [активируется только refer_to_doctor]
--   final_approval (school_director)       подпись — admitted / admitted_conditional / rejected  (closes → student)
--
-- Все 3 обязательных стартуют сразу; final_approval активируется, когда ВСЕ ТРИ
-- достигли терминального статуса (after_all). medical — параллельный
-- информационный этап (директор видит его перед решением); он НЕ предок
-- final_approval, поэтому не влияет на join.

-- 1. Процесс
INSERT INTO process_templates (id, code, name_ru, description, is_active) VALUES
('ac000000-0000-4000-8000-000000000001', 'acceptance', 'Приёмная комиссия',
 'Многоэтапный приём: учёба, общежитие, еврейство, (врач), финальное утверждение', true)
ON CONFLICT (code) DO NOTHING;

-- 2. Этапы (с ролью-подписантом и требованием подписи)
INSERT INTO stage_templates (id, process_template_id, code, name_ru, has_tasks, sort_order, required_role_code, requires_signature) VALUES
('ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000001', 'academic',       'Учебная проверка',     false, 10, 'head_of_studies',    true),
('ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000001', 'dormitory',      'Общежитие',            false, 20, 'dorm_director',      true),
('ac000000-0000-4000-8000-000000000030', 'ac000000-0000-4000-8000-000000000001', 'jewishness',     'Проверка еврейства',   false, 30, 'jewishness_officer', true),
('ac000000-0000-4000-8000-000000000040', 'ac000000-0000-4000-8000-000000000001', 'medical',        'Мед. заключение',      false, 40, 'doctor,psychologist', true),
('ac000000-0000-4000-8000-000000000050', 'ac000000-0000-4000-8000-000000000001', 'final_approval', 'Финальное утверждение',false, 50, 'school_director',    true)
ON CONFLICT (process_template_id, code) DO NOTHING;

-- 3. Финалы
INSERT INTO stage_finals (id, stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order) VALUES
-- academic
('ac000000-0000-4000-8000-000000000101', 'ac000000-0000-4000-8000-000000000010', 'approved',        'Одобрено',            true,  false, NULL, 10),
('ac000000-0000-4000-8000-000000000102', 'ac000000-0000-4000-8000-000000000010', 'refer_to_doctor', 'Направить к врачу',   false, false, NULL, 20),
('ac000000-0000-4000-8000-000000000103', 'ac000000-0000-4000-8000-000000000010', 'rejected',        'Отклонено',           false, false, NULL, 30),
-- dormitory
('ac000000-0000-4000-8000-000000000201', 'ac000000-0000-4000-8000-000000000020', 'approved',        'Одобрено',            true,  false, NULL, 10),
('ac000000-0000-4000-8000-000000000202', 'ac000000-0000-4000-8000-000000000020', 'refer_to_doctor', 'Направить к врачу',   false, false, NULL, 20),
('ac000000-0000-4000-8000-000000000203', 'ac000000-0000-4000-8000-000000000020', 'rejected',        'Отклонено',           false, false, NULL, 30),
-- jewishness
('ac000000-0000-4000-8000-000000000301', 'ac000000-0000-4000-8000-000000000030', 'approved', 'Подтверждено', true,  false, NULL, 10),
('ac000000-0000-4000-8000-000000000302', 'ac000000-0000-4000-8000-000000000030', 'rejected', 'Отклонено',    false, false, NULL, 20),
-- medical (информационный)
('ac000000-0000-4000-8000-000000000401', 'ac000000-0000-4000-8000-000000000040', 'approved', 'Пригодна',    true,  false, NULL, 10),
('ac000000-0000-4000-8000-000000000402', 'ac000000-0000-4000-8000-000000000040', 'rejected', 'Не пригодна', false, false, NULL, 20),
-- final_approval (closes → student)
('ac000000-0000-4000-8000-000000000501', 'ac000000-0000-4000-8000-000000000050', 'admitted',             'Принята',         true,  true, 'admitted',             10),
('ac000000-0000-4000-8000-000000000502', 'ac000000-0000-4000-8000-000000000050', 'admitted_conditional', 'Условно принята', true,  true, 'admitted_conditional', 20),
('ac000000-0000-4000-8000-000000000503', 'ac000000-0000-4000-8000-000000000050', 'rejected',             'Отклонена',       false, true, 'rejected',             30)
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- 4. Переходы
INSERT INTO stage_transitions (id, from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order) VALUES
-- старт → 3 обязательных параллельных
('ac000000-0000-4000-8000-000000000601', NULL, 'ac000000-0000-4000-8000-000000000010', NULL, 'after_one', 10),
('ac000000-0000-4000-8000-000000000602', NULL, 'ac000000-0000-4000-8000-000000000020', NULL, 'after_one', 20),
('ac000000-0000-4000-8000-000000000603', NULL, 'ac000000-0000-4000-8000-000000000030', NULL, 'after_one', 30),
-- refer_to_doctor → medical (условная активация)
('ac000000-0000-4000-8000-000000000610', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000040', 'refer_to_doctor', 'after_one', 10),
('ac000000-0000-4000-8000-000000000611', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000040', 'refer_to_doctor', 'after_one', 20),
-- каждый обязательный финал → final_approval (after_all: активируется, когда ВСЕ 3 терминальны)
('ac000000-0000-4000-8000-000000000620', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000050', 'approved',        'after_all', 30),
('ac000000-0000-4000-8000-000000000621', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000050', 'rejected',        'after_all', 31),
('ac000000-0000-4000-8000-000000000622', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000050', 'refer_to_doctor', 'after_all', 32),
('ac000000-0000-4000-8000-000000000630', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000050', 'approved',        'after_all', 33),
('ac000000-0000-4000-8000-000000000631', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000050', 'rejected',        'after_all', 34),
('ac000000-0000-4000-8000-000000000632', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000050', 'refer_to_doctor', 'after_all', 35),
('ac000000-0000-4000-8000-000000000640', 'ac000000-0000-4000-8000-000000000030', 'ac000000-0000-4000-8000-000000000050', 'approved',        'after_all', 36),
('ac000000-0000-4000-8000-000000000641', 'ac000000-0000-4000-8000-000000000030', 'ac000000-0000-4000-8000-000000000050', 'rejected',        'after_all', 37)
ON CONFLICT (id) DO NOTHING;

-- 5. Автозапуск переключается на 'acceptance' в коде route-ов; admission-v1
--    остаётся в БД для уже запущенных инстансов, но новым абитуриентам не стартует.
