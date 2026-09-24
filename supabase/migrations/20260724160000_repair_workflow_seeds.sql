-- ═════════════════════════════════════════════════════════════════════
-- РЕМОНТ сидов процессов, пострадавших от порядка миграций.
--
-- КОРЕНЬ: колонки stage_finals.closes_process / process_finish_reason
-- создавались миграцией с датой 20260724100000, а ИСПОЛЬЗОВАЛИСЬ тремя более
-- ранними миграциями (в INSERT ... stage_finals):
--   • 20260703180000_admission_process_template.sql   (процесс 'admission' v1)
--   • 20260713170000_acceptance_process.sql           (процесс 'acceptance')
--   • 20260716140000_medical_split_doctor_psych.sql   (этап психолога + направления)
-- При применении по порядку на чистой/staging БД эти три падали на
-- «column closes_process does not exist», их INSERT'ы финалов/переходов НЕ
-- применялись, и процесс 'acceptance' оставался БЕЗ финалов и БЕЗ стартовых
-- переходов → start_process('acceptance') падал («У процесса нет начальных
-- этапов»), перевод в приёмную комиссию был невозможен.
--
-- Порядок исправлен: 20260703180000 теперь сам заводит колонки в самом начале
-- (до первого использования). На СВЕЖЕЙ БД этот ремонт — чистый no-op.
-- На уже накатанной (боевой/staging) БД он ИДЕМПОТЕНТНО до-заводит недостающие
-- строки. Блоки НИЖЕ — ДОСЛОВНЫЕ копии канонических INSERT'ов из исходных
-- миграций (те же фикс. UUID + ON CONFLICT), поэтому граф совпадает с сидом
-- байт-в-байт. Ничего не удаляет и не трогает запущенные экземпляры.
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

-- Страховка: гарантируем колонки (на случай применения в отрыве).
ALTER TABLE stage_finals ADD COLUMN IF NOT EXISTS closes_process boolean NOT NULL DEFAULT false;
ALTER TABLE stage_finals ADD COLUMN IF NOT EXISTS process_finish_reason text;

-- ─────────────────────────────────────────────────────────────────────
-- A. Процесс 'acceptance' (дословно из 20260713170000).
-- ─────────────────────────────────────────────────────────────────────
-- A.1 Шаблон процесса
INSERT INTO process_templates (id, code, name_ru, description, is_active) VALUES
('ac000000-0000-4000-8000-000000000001', 'acceptance', 'Приёмная комиссия',
 'Многоэтапный приём: учёба, общежитие, еврейство, (врач), финальное утверждение', true)
ON CONFLICT (code) DO NOTHING;

-- A.2 Этапы
INSERT INTO stage_templates (id, process_template_id, code, name_ru, has_tasks, sort_order, required_role_code, requires_signature) VALUES
('ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000001', 'academic',       'Учебная проверка',     false, 10, 'head_of_studies',    true),
('ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000001', 'dormitory',      'Общежитие',            false, 20, 'dorm_director',      true),
('ac000000-0000-4000-8000-000000000030', 'ac000000-0000-4000-8000-000000000001', 'jewishness',     'Проверка еврейства',   false, 30, 'jewishness_officer', true),
('ac000000-0000-4000-8000-000000000040', 'ac000000-0000-4000-8000-000000000001', 'medical',        'Мед. заключение',      false, 40, 'doctor,psychologist', true),
('ac000000-0000-4000-8000-000000000050', 'ac000000-0000-4000-8000-000000000001', 'final_approval', 'Финальное утверждение',false, 50, 'school_director',    true)
ON CONFLICT (process_template_id, code) DO NOTHING;

-- A.3 Финалы
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

-- A.4 Переходы
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


-- ─────────────────────────────────────────────────────────────────────
-- B. Разделение мед. этапа (дословно из 20260716140000).
-- ─────────────────────────────────────────────────────────────────────
-- B.1 medical → врач
UPDATE stage_templates
  SET required_role_code = 'doctor', name_ru = 'Заключение врача'
  WHERE id = 'ac000000-0000-4000-8000-000000000040';

-- B.2 Этап психолога
INSERT INTO stage_templates (id, process_template_id, code, name_ru, has_tasks, sort_order, required_role_code, requires_signature) VALUES
('ac000000-0000-4000-8000-000000000045', 'ac000000-0000-4000-8000-000000000001', 'medical_psych', 'Заключение психолога', false, 45, 'psychologist', true)
ON CONFLICT (process_template_id, code) DO NOTHING;

-- B.3 Финалы психолога
INSERT INTO stage_finals (id, stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order) VALUES
('ac000000-0000-4000-8000-000000000451', 'ac000000-0000-4000-8000-000000000045', 'approved', 'Пригодна',    true,  false, NULL, 10),
('ac000000-0000-4000-8000-000000000452', 'ac000000-0000-4000-8000-000000000045', 'rejected', 'Не пригодна', false, false, NULL, 20)
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- B.4 Финал «к психологу»
INSERT INTO stage_finals (id, stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order) VALUES
('ac000000-0000-4000-8000-000000000104', 'ac000000-0000-4000-8000-000000000010', 'refer_to_psychologist', 'Направить к психологу', false, false, NULL, 25),
('ac000000-0000-4000-8000-000000000204', 'ac000000-0000-4000-8000-000000000020', 'refer_to_psychologist', 'Направить к психологу', false, false, NULL, 25)
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- B.5 Переходы к психологу
INSERT INTO stage_transitions (id, from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order) VALUES
-- условная активация этапа психолога
('ac000000-0000-4000-8000-000000000612', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000045', 'refer_to_psychologist', 'after_one', 12),
('ac000000-0000-4000-8000-000000000613', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000045', 'refer_to_psychologist', 'after_one', 22),
-- after_all join к финалу (чтобы final_approval активировался и при этом финале)
('ac000000-0000-4000-8000-000000000650', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000050', 'refer_to_psychologist', 'after_all', 38),
('ac000000-0000-4000-8000-000000000651', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000050', 'refer_to_psychologist', 'after_all', 39)
ON CONFLICT (id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────
-- C. Процесс 'admission' v1 (дословно из 20260703180000). Деактивирован
--    миграцией 20260724120000, но восстанавливаем для целостности истории.
-- ─────────────────────────────────────────────────────────────────────
-- C.1 Шаблон
INSERT INTO process_templates (id, code, name_ru, description, is_active) VALUES
('ad000000-0000-4000-8000-000000000001', 'admission', 'Приём',
 'Процесс приёмной комиссии: абитуриент → студент', true)
ON CONFLICT (code) DO NOTHING;

-- C.2 Этапы
INSERT INTO stage_templates (id, process_template_id, code, name_ru, has_tasks, sort_order) VALUES
('ad000000-0000-4000-8000-000000000010', 'ad000000-0000-4000-8000-000000000001',
 'admission_decision', 'Приёмное решение', true, 10),
('ad000000-0000-4000-8000-000000000020', 'ad000000-0000-4000-8000-000000000001',
 'waitlist', 'Список ожидания', true, 20)
ON CONFLICT (process_template_id, code) DO NOTHING;

-- C.3 Финалы
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

-- C.4 Переходы
INSERT INTO stage_transitions (id, from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order) VALUES
('ad000000-0000-4000-8000-000000000301', NULL,
 'ad000000-0000-4000-8000-000000000010', NULL, 'after_one', 10),
('ad000000-0000-4000-8000-000000000302', 'ad000000-0000-4000-8000-000000000010',
 'ad000000-0000-4000-8000-000000000020', 'waitlisted', 'after_one', 20)
ON CONFLICT (id) DO NOTHING;

-- C.5 Задачи
INSERT INTO stage_task_templates (id, stage_template_id, code, title, description, default_assignee_type, default_priority, sort_order) VALUES
('ad000000-0000-4000-8000-000000000401', 'ad000000-0000-4000-8000-000000000010',
 'make_decision', 'Рассмотреть заявку и принять решение',
 'Рассмотреть абитуриента и вынести приёмное решение.', 'creator', 'high', 10),
('ad000000-0000-4000-8000-000000000402', 'ad000000-0000-4000-8000-000000000020',
 'waitlist_review', 'Решение по списку ожидания',
 'Пересмотреть заявку из списка ожидания.', 'creator', 'normal', 10)
ON CONFLICT (stage_template_id, code) DO NOTHING;

