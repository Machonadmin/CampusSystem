-- ═══════════════════════════════════════════════════════════════════════
-- ВОССТАНОВЛЕНИЕ stage_finals для всех процессов.
--
-- Продолжение 20260923120000_restore_stage_transitions.sql. Тот же скрипт
-- очистки тестовых данных вычистил и stage_finals — «исходы» этапа, то есть
-- кнопки, которыми этап вообще закрывается. Без них ProcessInfoBlock не
-- рисует ни одной кнопки (условие finals.length > 0, строка ~689), и НИ ОДИН
-- этап НИ В ОДНОМ процессе закрыть нельзя: карточка лида показывает задачу,
-- но продвинуть её некуда.
--
-- Замер перед миграцией — finals = 0 во ВСЕХ 18 этапах 4 шаблонов.
-- stage_task_templates и task_transitions уцелели, их не трогаем.
--
-- Строки скопированы из исходных сидов СКРИПТОМ, не руками:
--   recruitment    20260724110000_recruitment_process_seed.sql      §3
--   admission      20260703180000_admission_process_template.sql    §3
--   acceptance     20260713170000_acceptance_process.sql            §3
--   acceptance_v2  20260813120000_acceptance_v2_sequential.sql      §3
--
-- Идемпотентно (ON CONFLICT (stage_template_id, code)). Одна транзакция +
-- проверка в конце: если у активного этапа по-прежнему нет исходов — откат.
--
-- RLS в проекте отключён. Применять ВРУЧНУЮ в Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. recruitment (id этапов не фиксированы — ищем по code) ──────────
DO $$
DECLARE
  v_proc      uuid;
  v_contact   uuid;
  v_documents uuid;
  v_event     uuid;
  v_decision  uuid;
BEGIN
  SELECT id INTO v_proc FROM process_templates WHERE code = 'recruitment';
  IF v_proc IS NULL THEN RAISE EXCEPTION 'Шаблон «recruitment» не найден'; END IF;

  SELECT id INTO v_contact   FROM stage_templates WHERE process_template_id = v_proc AND code = 'contact';
  SELECT id INTO v_documents FROM stage_templates WHERE process_template_id = v_proc AND code = 'documents';
  SELECT id INTO v_event     FROM stage_templates WHERE process_template_id = v_proc AND code = 'event';
  SELECT id INTO v_decision  FROM stage_templates WHERE process_template_id = v_proc AND code = 'decision';
  IF v_contact IS NULL OR v_documents IS NULL OR v_event IS NULL OR v_decision IS NULL THEN
    RAISE EXCEPTION 'У «recruitment» отсутствуют этапы';
  END IF;

  INSERT INTO stage_finals (stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order)
  VALUES
    -- contact
    (v_contact,   'done_event_yes',       'Записан на мероприятие', true,  false, NULL,        10),
    (v_contact,   'done_event_skip',      'Без мероприятия',        true,  false, NULL,        20),
    (v_contact,   'rejected',             'Отказ',                  false, true,  'rejected',  30),
    (v_contact,   'postponed',            'Поступление отложено',   false, true,  'postponed', 40),
    -- documents
    (v_documents, 'all_collected',        'Все собраны',            true,  false, NULL,        10),
    (v_documents, 'partial',              'Частично собраны',       true,  false, NULL,        20),
    (v_documents, 'not_provided',         'Не предоставил',         false, false, NULL,        30),
    -- event
    (v_event,     'feedback_received',    'Обратная связь получена',true,  false, NULL,        10),
    (v_event,     'no_show',              'Не приехал',             false, false, NULL,        20),
    (v_event,     'refused',              'Отказ от приезда',       false, false, NULL,        30),
    -- decision
    (v_decision,  'convert_to_applicant', 'Перевести в абитуриенты',true,  true,  'converted', 10),
    (v_decision,  'rejected',             'Отказ',                  false, true,  'rejected',  20),
    (v_decision,  'postponed',            'Отложено',               false, true,  'postponed', 30)
  ON CONFLICT (stage_template_id, code) DO NOTHING;
END $$;

-- ─── 2. admission ─────────────────────────────────────────────────────
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
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- ─── 3. acceptance ────────────────────────────────────────────────────
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
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- ─── 4. acceptance_v2 ─────────────────────────────────────────────────
INSERT INTO stage_finals (id, stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order) VALUES
-- jewishness
('ac200000-0000-4000-8000-000000000301', 'ac200000-0000-4000-8000-000000000030', 'approved', 'Подтверждено',         true,  false, NULL,       10),
('ac200000-0000-4000-8000-000000000302', 'ac200000-0000-4000-8000-000000000030', 'partial',  'Подтверждено частично',true,  false, NULL,       15),
('ac200000-0000-4000-8000-000000000303', 'ac200000-0000-4000-8000-000000000030', 'rejected', 'Отклонено',            false, true,  'rejected', 20),
-- academic
('ac200000-0000-4000-8000-000000000101', 'ac200000-0000-4000-8000-000000000010', 'approved',              'Одобрено',              true,  false, NULL,       10),
('ac200000-0000-4000-8000-000000000105', 'ac200000-0000-4000-8000-000000000010', 'exam_required',         'Нужны вступит. экзамены',false, false, NULL,       15),
('ac200000-0000-4000-8000-000000000102', 'ac200000-0000-4000-8000-000000000010', 'refer_to_doctor',       'Направить к врачу',     false, false, NULL,       20),
('ac200000-0000-4000-8000-000000000104', 'ac200000-0000-4000-8000-000000000010', 'refer_to_psychologist', 'Направить к психологу', false, false, NULL,       25),
('ac200000-0000-4000-8000-000000000103', 'ac200000-0000-4000-8000-000000000010', 'rejected',              'Отклонено',             false, true,  'rejected', 30),
-- dormitory
('ac200000-0000-4000-8000-000000000201', 'ac200000-0000-4000-8000-000000000020', 'approved',              'Одобрено',              true,  false, NULL,       10),
('ac200000-0000-4000-8000-000000000202', 'ac200000-0000-4000-8000-000000000020', 'refer_to_doctor',       'Направить к врачу',     false, false, NULL,       20),
('ac200000-0000-4000-8000-000000000204', 'ac200000-0000-4000-8000-000000000020', 'refer_to_psychologist', 'Направить к психологу', false, false, NULL,       25),
('ac200000-0000-4000-8000-000000000203', 'ac200000-0000-4000-8000-000000000020', 'rejected',              'Отклонено',             false, true,  'rejected', 30),
-- medical (информационный)
('ac200000-0000-4000-8000-000000000401', 'ac200000-0000-4000-8000-000000000040', 'approved', 'Пригодна',    true,  false, NULL, 10),
('ac200000-0000-4000-8000-000000000402', 'ac200000-0000-4000-8000-000000000040', 'rejected', 'Не пригодна', false, false, NULL, 20),
-- medical_psych (информационный)
('ac200000-0000-4000-8000-000000000451', 'ac200000-0000-4000-8000-000000000045', 'approved', 'Пригодна',    true,  false, NULL, 10),
('ac200000-0000-4000-8000-000000000452', 'ac200000-0000-4000-8000-000000000045', 'rejected', 'Не пригодна', false, false, NULL, 20),
-- final_approval (все закрывают процесс)
('ac200000-0000-4000-8000-000000000501', 'ac200000-0000-4000-8000-000000000050', 'admitted',             'Принята',         true,  true, 'admitted',             10),
('ac200000-0000-4000-8000-000000000502', 'ac200000-0000-4000-8000-000000000050', 'admitted_conditional', 'Условно принята', true,  true, 'admitted_conditional', 20),
('ac200000-0000-4000-8000-000000000504', 'ac200000-0000-4000-8000-000000000050', 'external_studies',     'Внешнее обучение',true,  true, 'external_studies',     30),
('ac200000-0000-4000-8000-000000000505', 'ac200000-0000-4000-8000-000000000050', 'postponed',            'Отложено',        false, true, 'postponed',            40),
('ac200000-0000-4000-8000-000000000503', 'ac200000-0000-4000-8000-000000000050', 'rejected',             'Отклонена',       false, true, 'rejected',             50)
ON CONFLICT (stage_template_id, code) DO NOTHING;
ON CONFLICT (stage_template_id, code) DO NOTHING;

-- ─── 5. Проверка: у каждого этапа должен быть хотя бы один исход ───────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT pt.code AS proc, st.code AS stage
      FROM stage_templates st
      JOIN process_templates pt ON pt.id = st.process_template_id
     WHERE NOT EXISTS (SELECT 1 FROM stage_finals sf WHERE sf.stage_template_id = st.id)
  LOOP
    RAISE EXCEPTION 'У этапа «%» процесса «%» нет исходов — откат', r.stage, r.proc;
  END LOOP;
END $$;

COMMIT;
