-- ═════════════════════════════════════════════════════════════════════
-- Сид процесса «Набор» (recruitment) — версионируемый, в миграции.
--
-- ПРОБЛЕМА, которую чиним: рантайм уже запускает этот процесс автоматически
-- при создании лида (app/api/education/leads/route.ts, applications/route.ts,
-- public/applications/route.ts вызывают start_process('recruitment', …)), а
-- также handoff-кнопка и уведомления опираются на него. НО шаблон никогда не
-- заводился миграцией — только вручную через scripts/seed-workflow-recruitment.ts
-- (требует поднятый сервер + cookie суперадмина) и в docs/recruitment-template.md.
-- На БД, собранной из миграций, каждый автозапуск «Набора» тихо падает
-- (best-effort) и лид создаётся без процесса.
--
-- Эта миграция заводит шаблон согласно docs/recruitment-template.md (он же
-- бизнес-процесс «גיוס»): 4 подэтапа, задачи, финалы, переходы.
--
-- Структура:
--   contact   (has_action_log) — задача first_contact; финалы:
--       done_event_yes / done_event_skip / rejected(closes) / postponed(closes)
--   documents — ДВЕ ПАРАЛЛЕЛЬНЫЕ задачи collect_docs + verify_docs; финалы:
--       all_collected / partial / not_provided
--   event (optional) — ТРИ ПОСЛЕДОВАТЕЛЬНЫЕ задачи invite→arrange→feedback
--       (через task_transitions); финалы: feedback_received / no_show / refused
--   decision — задача make_decision; финалы:
--       convert_to_applicant(closes→converted) / rejected(closes) / postponed(closes)
--
-- Переходы: start→contact; contact→documents (yes|skip); contact→event (yes);
--           documents→decision (after_all); event→decision (after_all).
--
-- ИДЕМПОТЕНТНОСТЬ И БЕЗОПАСНОСТЬ: миграция написана как UPSERT (ON CONFLICT DO
-- UPDATE) и разрешает id по коду, поэтому корректно отрабатывает В ЛЮБОМ из
-- состояний — чистая БД, БД с частичным сидом от старого скрипта (там подэтапы
-- contact/event были has_tasks=false, была лишняя задача request_docs и финал
-- done_event_later — они здесь исправляются/удаляются). Не трогает уже
-- запущенные экземпляры процесса.
--
-- Зависит от 20260724100000 (stage_finals.closes_process / process_finish_reason).
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_proc      UUID;
  v_contact   UUID;
  v_documents UUID;
  v_event     UUID;
  v_decision  UUID;
BEGIN
  -- 1. Процесс
  INSERT INTO process_templates (code, name_ru, description, is_active)
  VALUES ('recruitment', 'Набор',
          'Процесс работы с лидом до перевода в абитуриенты', true)
  ON CONFLICT (code) DO UPDATE
    SET name_ru = EXCLUDED.name_ru,
        description = EXCLUDED.description,
        is_active = true
  RETURNING id INTO v_proc;

  -- 2. Подэтапы (UPSERT — исправляет has_tasks/optional при частичном старом сиде)
  INSERT INTO stage_templates (process_template_id, code, name_ru, has_tasks, has_action_log, is_optional, is_addable, sort_order)
  VALUES (v_proc, 'contact', 'Контакт', true, true, false, false, 10)
  ON CONFLICT (process_template_id, code) DO UPDATE
    SET name_ru = EXCLUDED.name_ru, has_tasks = EXCLUDED.has_tasks,
        has_action_log = EXCLUDED.has_action_log, is_optional = EXCLUDED.is_optional,
        is_addable = EXCLUDED.is_addable, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_contact;

  INSERT INTO stage_templates (process_template_id, code, name_ru, has_tasks, has_action_log, is_optional, is_addable, sort_order)
  VALUES (v_proc, 'documents', 'Документы', true, true, false, false, 20)
  ON CONFLICT (process_template_id, code) DO UPDATE
    SET name_ru = EXCLUDED.name_ru, has_tasks = EXCLUDED.has_tasks,
        has_action_log = EXCLUDED.has_action_log, is_optional = EXCLUDED.is_optional,
        is_addable = EXCLUDED.is_addable, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_documents;

  INSERT INTO stage_templates (process_template_id, code, name_ru, has_tasks, has_action_log, is_optional, is_addable, sort_order)
  VALUES (v_proc, 'event', 'Мероприятие', true, true, true, false, 30)
  ON CONFLICT (process_template_id, code) DO UPDATE
    SET name_ru = EXCLUDED.name_ru, has_tasks = EXCLUDED.has_tasks,
        has_action_log = EXCLUDED.has_action_log, is_optional = EXCLUDED.is_optional,
        is_addable = EXCLUDED.is_addable, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_event;

  INSERT INTO stage_templates (process_template_id, code, name_ru, has_tasks, has_action_log, is_optional, is_addable, sort_order)
  VALUES (v_proc, 'decision', 'Решение', true, true, false, false, 40)
  ON CONFLICT (process_template_id, code) DO UPDATE
    SET name_ru = EXCLUDED.name_ru, has_tasks = EXCLUDED.has_tasks,
        has_action_log = EXCLUDED.has_action_log, is_optional = EXCLUDED.is_optional,
        is_addable = EXCLUDED.is_addable, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_decision;

  -- 2b. Чистка артефактов старого скрипта (только если остались)
  DELETE FROM stage_task_templates
    WHERE stage_template_id = v_documents AND code = 'request_docs';
  DELETE FROM stage_transitions
    WHERE from_stage_template_id = v_contact AND trigger_final_code = 'done_event_later';
  DELETE FROM stage_finals
    WHERE stage_template_id = v_contact AND code = 'done_event_later';

  -- 3. Финалы (UPSERT — проставляет closes_process/reason и добавляет rejected/postponed)
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
  ON CONFLICT (stage_template_id, code) DO UPDATE
    SET name_ru = EXCLUDED.name_ru,
        is_positive = EXCLUDED.is_positive,
        closes_process = EXCLUDED.closes_process,
        process_finish_reason = EXCLUDED.process_finish_reason,
        sort_order = EXCLUDED.sort_order;

  -- 4. Задачи (UPSERT — добавляет first_contact / collect_docs+verify_docs /
  --    invite_event+arrange_trip+get_feedback / make_decision)
  INSERT INTO stage_task_templates (stage_template_id, code, title, default_assignee_type, default_priority, default_due_days, sort_order)
  VALUES
    (v_contact,   'first_contact', 'Связаться с новым лидом',    'creator', 'high',   2, 10),
    (v_documents, 'collect_docs',  'Собрать документы',          'creator', 'normal', 7, 10),
    (v_documents, 'verify_docs',   'Проверить документы',        'creator', 'normal', 7, 20),
    (v_event,     'invite_event',  'Пригласить на мероприятие',  'creator', 'normal', 5, 10),
    (v_event,     'arrange_trip',  'Организовать приезд',        'creator', 'normal', 7, 20),
    (v_event,     'get_feedback',  'Получить обратную связь',    'creator', 'normal', 7, 30),
    (v_decision,  'make_decision', 'Принять решение по лиду',    'creator', 'high',   3, 10)
  ON CONFLICT (stage_template_id, code) DO UPDATE
    SET title = EXCLUDED.title,
        default_assignee_type = EXCLUDED.default_assignee_type,
        default_priority = EXCLUDED.default_priority,
        default_due_days = EXCLUDED.default_due_days,
        sort_order = EXCLUDED.sort_order;

  -- 5. Переходы между подэтапами (anti-join: без natural unique key)
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

  -- 6. Переходы между задачами внутри «Мероприятия» (3 последовательные задачи)
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
