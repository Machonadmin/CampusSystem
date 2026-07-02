-- Атомарный запуск экземпляра процесса (process_instance + все stage_instances
-- + стартовые задачи начальных этапов) — одной транзакцией Postgres.
--
-- Заменяет lib/workflow/start-process.ts::startProcess (см.
-- docs/workflow-transaction-risk-analysis.md, §2): раньше цикл создания
-- stage_instances делал по одному PostgREST-запросу на этап. Если падал
-- этап #2 из 4 — получался process_instance с физически неполным набором
-- этапов. Хуже: идемпотентность (проверка "уже есть активный instance") не
-- лечит это — повторный вызов найдёт уже сломанный instance и вернёт его
-- как already_existed=true, ничего не почини́в.
--
-- Отличие от TS-версии:
--   - Событие "Процесс запущен" на каждом активном стартовом этапе остаётся
--     best-effort (savepoint), как и в оригинале (void _evErr).
--   - Создание задач для этапов с has_tasks=true — НЕ best-effort: если
--     падает вставка любой задачи, откатывается вся операция целиком
--     (process_instance + все stage_instances), а не только "хвost".
--
-- ВАЖНО про коды ошибок: оба вызывающих места (app/api/applications/route.ts,
-- app/api/education/leads/route.ts) уже сегодня оборачивают вызов startProcess
-- в свой try/catch и трактуют его как best-effort шаг — ошибка НИКОГДА не
-- долетает до общего catch/jsonError, а просто кладётся в поле
-- workflow_error ответа. Поэтому конкретные ERRCODE здесь не влияют на HTTP-
-- статус ни в одном из двух мест; используются те же коды, что и в остальных
-- RPC, для единообразия и на случай будущего вызывающего кода, который
-- перестанет глотать ошибку молча.
--
-- Сигнатура — типизированные параметры, не jsonb payload, как и у
-- reactivate_stage (см. 20260702200000): фиксированный небольшой набор
-- скалярных аргументов, обёртка в jsonb не добавляла бы ценности.

CREATE OR REPLACE FUNCTION start_process(p_process_code text, p_journey_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_template_id         uuid;
  v_template_name       text;
  v_existing_id         uuid;
  v_stage               RECORD;
  v_stage_ids           uuid[] := ARRAY[]::uuid[];
  v_initial_ids         uuid[];
  v_any_initial_tasks   boolean;
  v_person_id           uuid;
  v_person_full_name    text;
  v_now                 timestamptz := NOW();
  v_pi_id               uuid;
  v_si_id               uuid;
  v_is_active           boolean;
  v_stage_instance_ids  uuid[] := ARRAY[]::uuid[];
  v_start_codes         text[];
  v_tt                  RECORD;
  v_assignee_type       text;
  v_assignee_id         uuid;
  v_department_id       uuid;
  v_position_id         uuid;
  v_task_status         text;
  v_title                text;
BEGIN
  -- 1. Шаблон процесса
  SELECT id, name_ru INTO v_template_id, v_template_name
  FROM process_templates WHERE code = p_process_code;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Шаблон процесса «%» не найден', p_process_code USING ERRCODE = 'P0002';
  END IF;

  -- 2. Идемпотентность — уже есть активный экземпляр?
  SELECT id INTO v_existing_id
  FROM process_instances
  WHERE journey_id = p_journey_id AND process_template_id = v_template_id AND status = 'active';

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'process_instance_id', v_existing_id,
      'stage_instance_ids', '[]'::jsonb,
      'already_existed', true
    );
  END IF;

  -- 3. Этапы процесса
  IF NOT EXISTS (SELECT 1 FROM stage_templates WHERE process_template_id = v_template_id) THEN
    RAISE EXCEPTION 'У процесса нет этапов' USING ERRCODE = '22023';
  END IF;

  -- 4. Начальные этапы (from_stage_template_id IS NULL), упорядоченные по sort_order
  SELECT COALESCE(array_agg(st.id ORDER BY st.sort_order), ARRAY[]::uuid[])
    INTO v_initial_ids
  FROM (
    SELECT DISTINCT tr.to_stage_template_id AS id
    FROM stage_transitions tr
    JOIN stage_templates t ON t.id = tr.to_stage_template_id
    WHERE tr.from_stage_template_id IS NULL AND t.process_template_id = v_template_id
  ) x
  JOIN stage_templates st ON st.id = x.id;

  IF array_length(v_initial_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'У процесса нет начальных этапов' USING ERRCODE = '22023';
  END IF;

  -- 5. Проверка автора для этапов с задачами
  SELECT EXISTS (
    SELECT 1 FROM stage_templates WHERE id = ANY(v_initial_ids) AND has_tasks
  ) INTO v_any_initial_tasks;

  IF v_any_initial_tasks AND p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Нельзя запустить процесс с задачами без автора (actorId=null)' USING ERRCODE = '22023';
  END IF;

  -- 5а. ФИО лида — подставляется в title задач
  IF v_any_initial_tasks THEN
    SELECT person_id INTO v_person_id FROM education_journeys WHERE id = p_journey_id;
    IF v_person_id IS NOT NULL THEN
      SELECT full_name INTO v_person_full_name FROM persons WHERE id = v_person_id;
    END IF;
  END IF;

  -- 6. process_instance
  INSERT INTO process_instances (process_template_id, journey_id, status, created_by)
  VALUES (v_template_id, p_journey_id, 'active', p_actor_id)
  RETURNING id INTO v_pi_id;

  -- 7. stage_instances (все подэтапы: активные начальные + waiting) + задачи
  FOR v_stage IN
    SELECT id, has_tasks FROM stage_templates
    WHERE process_template_id = v_template_id
    ORDER BY sort_order
  LOOP
    v_is_active := v_stage.id = ANY(v_initial_ids);

    INSERT INTO stage_instances (process_instance_id, stage_template_id, status, activated_at)
    VALUES (v_pi_id, v_stage.id, CASE WHEN v_is_active THEN 'active' ELSE 'waiting' END,
            CASE WHEN v_is_active THEN v_now ELSE NULL END)
    RETURNING id INTO v_si_id;

    v_stage_instance_ids := array_append(v_stage_instance_ids, v_si_id);

    IF v_is_active THEN
      -- Системное событие — best-effort, как и в оригинале (void _evErr).
      BEGIN
        INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
        VALUES (
          v_si_id, 'system',
          format('Процесс «%s» запущен', COALESCE(v_template_name, p_process_code)),
          p_actor_id,
          jsonb_build_object('process_code', p_process_code)
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    IF NOT v_is_active OR NOT v_stage.has_tasks THEN
      CONTINUE;
    END IF;

    -- Стартовые задачи подэтапа (см. createStartingTasks в start-process.ts).
    -- Вставка НЕ обёрнута в savepoint — ошибка должна откатить весь запуск
    -- процесса, а не оставить его с частью задач.
    SELECT COALESCE(array_agg(DISTINCT to_task_code), ARRAY[]::text[])
      INTO v_start_codes
    FROM task_transitions
    WHERE stage_template_id = v_stage.id AND from_task_code IS NULL;

    FOR v_tt IN
      SELECT * FROM stage_task_templates
      WHERE stage_template_id = v_stage.id
        AND (array_length(v_start_codes, 1) IS NULL OR code = ANY(v_start_codes))
      ORDER BY sort_order
    LOOP
      v_assignee_type := 'unassigned';
      v_assignee_id := NULL;
      v_department_id := NULL;
      v_position_id := NULL;
      v_task_status := 'unassigned';

      IF v_tt.default_assignee_type = 'creator' THEN
        v_assignee_type := 'person';
        v_assignee_id := p_actor_id;
        v_task_status := 'pending';
      ELSIF v_tt.default_assignee_type = 'department' AND v_tt.default_department_id IS NOT NULL THEN
        v_assignee_type := 'department';
        v_department_id := v_tt.default_department_id;
      ELSIF v_tt.default_assignee_type = 'position' AND v_tt.default_position_id IS NOT NULL THEN
        v_assignee_type := 'position';
        v_position_id := v_tt.default_position_id;
      END IF;

      v_title := CASE WHEN v_person_full_name IS NOT NULL
        THEN v_tt.title || ': ' || v_person_full_name
        ELSE v_tt.title
      END;

      INSERT INTO tasks (
        title, description, module, metadata, assignee_type, assignee_id,
        department_id, position_id, creator_id, status, priority,
        due_date, due_time, due_all_day, stage_instance_id, stage_task_template_id
      ) VALUES (
        v_title, v_tt.description, 'general', '{}'::jsonb, v_assignee_type, v_assignee_id,
        v_department_id, v_position_id, p_actor_id, v_task_status, v_tt.default_priority,
        NULL, NULL, true, v_si_id, v_tt.id
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'process_instance_id', v_pi_id,
    'stage_instance_ids', to_jsonb(v_stage_instance_ids),
    'already_existed', false
  );
END;
$$;
