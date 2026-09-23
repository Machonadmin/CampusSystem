-- ═══════════════════════════════════════════════════════════════════════
-- ВОССТАНОВЛЕНИЕ stage_transitions (и task_transitions) для всех процессов.
--
-- Что произошло: скрипт очистки тестовых данных (2026-09) удалил
-- stage_transitions вместе с операционными данными. Это НЕ операционные
-- данные, а КОНФИГУРАЦИЯ движка процессов: без переходов start_process
-- падает с «У процесса нет начальных этапов» (ERRCODE 22023), и КАЖДЫЙ
-- новый лид создаётся без процесса — молча, потому что автостарт в
-- POST /api/education/leads намеренно некритичен.
--
-- Диагностика на момент написания (все 4 шаблона):
--   code           stages  transitions  initial_steps
--   acceptance        6         0            0
--   acceptance_v2     6         0            0
--   admission         2         0            0
--   recruitment       4         0            0
--
-- Источники строк — исходные сиды, скопированы дословно:
--   recruitment    20260724110000_recruitment_process_seed.sql      (§5, §6)
--   admission      20260703180000_admission_process_template.sql    (§4)
--   acceptance     20260713170000_acceptance_process.sql            (§4)
--   acceptance_v2  20260813120000_acceptance_v2_sequential.sql      (§4)
--
-- Идемпотентно: фиксированные id + ON CONFLICT DO NOTHING там, где id
-- заданы сидом; anti-join для recruitment, у которого id не фиксированы
-- (этапы ищутся по code внутри шаблона, как в исходном сиде).
--
-- RLS в проекте отключён. Применять ВРУЧНУЮ в Supabase SQL Editor.
-- Вся миграция — одна транзакция: при любой ошибке не применяется ничего.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. recruitment ────────────────────────────────────────────────────
-- id этапов не фиксированы сидом (ON CONFLICT (process_template_id, code)),
-- поэтому ищем их по code, как это делает исходный сид.
DO $$
DECLARE
  v_proc      uuid;
  v_contact   uuid;
  v_documents uuid;
  v_event     uuid;
  v_decision  uuid;
BEGIN
  SELECT id INTO v_proc FROM process_templates WHERE code = 'recruitment';
  IF v_proc IS NULL THEN
    RAISE EXCEPTION 'Шаблон процесса «recruitment» не найден — сначала применить 20260724110000';
  END IF;

  SELECT id INTO v_contact   FROM stage_templates WHERE process_template_id = v_proc AND code = 'contact';
  SELECT id INTO v_documents FROM stage_templates WHERE process_template_id = v_proc AND code = 'documents';
  SELECT id INTO v_event     FROM stage_templates WHERE process_template_id = v_proc AND code = 'event';
  SELECT id INTO v_decision  FROM stage_templates WHERE process_template_id = v_proc AND code = 'decision';

  IF v_contact IS NULL OR v_documents IS NULL OR v_event IS NULL OR v_decision IS NULL THEN
    RAISE EXCEPTION 'У «recruitment» отсутствуют этапы contact/documents/event/decision — применить 20260724110000 целиком';
  END IF;

  INSERT INTO stage_transitions (from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order)
  SELECT x.f, x.t, x.trig, x.mode, x.so
  FROM (VALUES
    (NULL::uuid, v_contact,   NULL::text,          'after_one', 10),
    (v_contact,  v_documents, 'done_event_yes',    'after_one', 20),
    (v_contact,  v_documents, 'done_event_skip',   'after_one', 30),
    (v_contact,  v_event,     'done_event_yes',    'after_one', 40),
    (v_documents,v_decision,  'all_collected',     'after_all', 50),
    (v_documents,v_decision,  'partial',           'after_all', 51),
    (v_documents,v_decision,  'not_provided',      'after_all', 52),
    (v_event,    v_decision,  'feedback_received', 'after_all', 60),
    (v_event,    v_decision,  'no_show',           'after_all', 61),
    (v_event,    v_decision,  'refused',           'after_all', 62)
  ) AS x(f, t, trig, mode, so)
  WHERE NOT EXISTS (
    SELECT 1 FROM stage_transitions st
    WHERE st.from_stage_template_id IS NOT DISTINCT FROM x.f
      AND st.to_stage_template_id = x.t
      AND st.trigger_final_code IS NOT DISTINCT FROM x.trig
  );

  -- Переходы между задачами внутри «Мероприятия» (та же семья таблиц —
  -- если их тоже вычистили, три задачи этапа перестали идти по порядку).
  INSERT INTO task_transitions (stage_template_id, from_task_code, to_task_code, activation_mode, sort_order)
  SELECT v_event, x.frm, x.toc, 'after_one', x.so
  FROM (VALUES
    (NULL::text,      'invite_event', 10),
    ('invite_event',  'arrange_trip', 20),
    ('arrange_trip',  'get_feedback', 30)
  ) AS x(frm, toc, so)
  WHERE NOT EXISTS (
    SELECT 1 FROM task_transitions tt
    WHERE tt.stage_template_id = v_event
      AND tt.from_task_code IS NOT DISTINCT FROM x.frm
      AND tt.to_task_code = x.toc
  );
END $$;

-- ─── 2. admission ──────────────────────────────────────────────────────
INSERT INTO stage_transitions (id, from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order) VALUES
('ad000000-0000-4000-8000-000000000301', NULL,
 'ad000000-0000-4000-8000-000000000010', NULL, 'after_one', 10),
('ad000000-0000-4000-8000-000000000302', 'ad000000-0000-4000-8000-000000000010',
 'ad000000-0000-4000-8000-000000000020', 'waitlisted', 'after_one', 20)
ON CONFLICT (id) DO NOTHING;

-- ─── 3. acceptance (v1) ────────────────────────────────────────────────
INSERT INTO stage_transitions (id, from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order) VALUES
('ac000000-0000-4000-8000-000000000601', NULL, 'ac000000-0000-4000-8000-000000000010', NULL, 'after_one', 10),
('ac000000-0000-4000-8000-000000000602', NULL, 'ac000000-0000-4000-8000-000000000020', NULL, 'after_one', 20),
('ac000000-0000-4000-8000-000000000603', NULL, 'ac000000-0000-4000-8000-000000000030', NULL, 'after_one', 30),
('ac000000-0000-4000-8000-000000000610', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000040', 'refer_to_doctor', 'after_one', 10),
('ac000000-0000-4000-8000-000000000611', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000040', 'refer_to_doctor', 'after_one', 20),
('ac000000-0000-4000-8000-000000000620', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000050', 'approved',        'after_all', 30),
('ac000000-0000-4000-8000-000000000621', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000050', 'rejected',        'after_all', 31),
('ac000000-0000-4000-8000-000000000622', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000050', 'refer_to_doctor', 'after_all', 32),
('ac000000-0000-4000-8000-000000000630', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000050', 'approved',        'after_all', 33),
('ac000000-0000-4000-8000-000000000631', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000050', 'rejected',        'after_all', 34),
('ac000000-0000-4000-8000-000000000632', 'ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000050', 'refer_to_doctor', 'after_all', 35),
('ac000000-0000-4000-8000-000000000640', 'ac000000-0000-4000-8000-000000000030', 'ac000000-0000-4000-8000-000000000050', 'approved',        'after_all', 36),
('ac000000-0000-4000-8000-000000000641', 'ac000000-0000-4000-8000-000000000030', 'ac000000-0000-4000-8000-000000000050', 'rejected',        'after_all', 37)
ON CONFLICT (id) DO NOTHING;

-- ─── 4. acceptance_v2 (последовательный) ───────────────────────────────
INSERT INTO stage_transitions (id, from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order) VALUES
('ac200000-0000-4000-8000-000000000600', NULL, 'ac200000-0000-4000-8000-000000000030', NULL, 'after_one', 10),
('ac200000-0000-4000-8000-000000000610', 'ac200000-0000-4000-8000-000000000030', 'ac200000-0000-4000-8000-000000000010', 'approved', 'after_one', 10),
('ac200000-0000-4000-8000-000000000611', 'ac200000-0000-4000-8000-000000000030', 'ac200000-0000-4000-8000-000000000010', 'partial',  'after_one', 11),
('ac200000-0000-4000-8000-000000000620', 'ac200000-0000-4000-8000-000000000010', 'ac200000-0000-4000-8000-000000000020', 'approved',              'after_one', 10),
('ac200000-0000-4000-8000-000000000621', 'ac200000-0000-4000-8000-000000000010', 'ac200000-0000-4000-8000-000000000020', 'exam_required',         'after_one', 11),
('ac200000-0000-4000-8000-000000000622', 'ac200000-0000-4000-8000-000000000010', 'ac200000-0000-4000-8000-000000000020', 'refer_to_doctor',       'after_one', 12),
('ac200000-0000-4000-8000-000000000623', 'ac200000-0000-4000-8000-000000000010', 'ac200000-0000-4000-8000-000000000020', 'refer_to_psychologist', 'after_one', 13),
('ac200000-0000-4000-8000-000000000630', 'ac200000-0000-4000-8000-000000000010', 'ac200000-0000-4000-8000-000000000040', 'refer_to_doctor',       'after_one', 20),
('ac200000-0000-4000-8000-000000000631', 'ac200000-0000-4000-8000-000000000010', 'ac200000-0000-4000-8000-000000000045', 'refer_to_psychologist', 'after_one', 21),
('ac200000-0000-4000-8000-000000000640', 'ac200000-0000-4000-8000-000000000020', 'ac200000-0000-4000-8000-000000000050', 'approved',              'after_one', 10),
('ac200000-0000-4000-8000-000000000641', 'ac200000-0000-4000-8000-000000000020', 'ac200000-0000-4000-8000-000000000050', 'refer_to_doctor',       'after_one', 11),
('ac200000-0000-4000-8000-000000000642', 'ac200000-0000-4000-8000-000000000020', 'ac200000-0000-4000-8000-000000000050', 'refer_to_psychologist', 'after_one', 12),
('ac200000-0000-4000-8000-000000000650', 'ac200000-0000-4000-8000-000000000020', 'ac200000-0000-4000-8000-000000000040', 'refer_to_doctor',       'after_one', 20),
('ac200000-0000-4000-8000-000000000651', 'ac200000-0000-4000-8000-000000000020', 'ac200000-0000-4000-8000-000000000045', 'refer_to_psychologist', 'after_one', 21)
ON CONFLICT (id) DO NOTHING;

-- ─── 5. Проверка: у каждого шаблона должен появиться начальный этап ────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT pt.code,
           (SELECT count(*) FROM stage_transitions tr
             JOIN stage_templates st ON st.id = tr.to_stage_template_id
            WHERE st.process_template_id = pt.id
              AND tr.from_stage_template_id IS NULL) AS initial_steps
    FROM process_templates pt
  LOOP
    IF r.initial_steps = 0 THEN
      RAISE EXCEPTION 'У процесса «%» по-прежнему нет начальных этапов — откат', r.code;
    END IF;
  END LOOP;
END $$;

COMMIT;
