-- Атомарная реактивация пропущенного подэтапа (stage_instance) + создание его
-- стартовых задач — одной транзакцией Postgres.
--
-- Заменяет lib/workflow/reactivate-stage.ts::reactivateStage, которая делала
-- то же самое последовательными HTTP-запросами через PostgREST (каждый
-- .update()/.insert() — своя мини-транзакция). Риск (см.
-- docs/workflow-transaction-risk-analysis.md, §1): если создание задачи #2 из
-- 3 падает — подэтап уже помечен 'active', но не все ожидаемые задачи
-- созданы, и это никак не сигнализируется куратору.
--
-- Отличие от TS-версии:
--   - Системное событие (process_events) остаётся best-effort — обёрнуто в
--     BEGIN/EXCEPTION со своим savepoint, точно как в оригинале
--     (void _evErr — ошибка игнорируется, не должна ронять реактивацию).
--   - Создание задач НЕ best-effort — это и есть исправляемый риск: если
--     падает вставка любой задачи, откатывается вся операция целиком
--     (включая UPDATE stage_instances), а не только "хвost".
--   - Не воспроизведена проверка "processInstance IS NULL" из оригинала —
--     она была защитной веткой на случай, если embedded-join вернёт NULL
--     несмотря на NOT NULL FK (stage_instances.process_instance_id →
--     process_instances(id) ON DELETE CASCADE). При INNER JOIN здесь это
--     недостижимо: раз RLS отключён и FK гарантирует существование строки,
--     ветка не может сработать ни в оригинале, ни здесь.
--
-- Сигнатура — два обычных параметра, а не jsonb payload (в отличие от
-- create_application/create_staff_member): здесь всего два скалярных
-- аргумента, а не набор полей формы, обёртка в jsonb не добавляла бы
-- ценности.
--
-- Коды ошибок для маппинга в lib/api/handler.ts (mapPgError):
--   P0002 — подэтап не найден (404)
--   22023 — подэтап не в статусе 'skipped', либо процесс не активен (400)

CREATE OR REPLACE FUNCTION reactivate_stage(p_stage_instance_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_status            text;
  v_stage_template_id uuid;
  v_process_status    text;
  v_journey_id        uuid;
  v_person_id         uuid;
  v_person_full_name  text;
  v_now               timestamptz := NOW();
  v_start_codes       text[];
  v_tt                RECORD;
  v_assignee_type     text;
  v_assignee_id       uuid;
  v_department_id     uuid;
  v_position_id       uuid;
  v_task_status       text;
  v_title             text;
BEGIN
  -- 1. Загрузить stage_instance + контекст процесса
  SELECT si.status, si.stage_template_id, pi.status, pi.journey_id
    INTO v_status, v_stage_template_id, v_process_status, v_journey_id
  FROM stage_instances si
  JOIN process_instances pi ON pi.id = si.process_instance_id
  WHERE si.id = p_stage_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Подэтап не найден' USING ERRCODE = 'P0002';
  END IF;

  IF v_status <> 'skipped' THEN
    RAISE EXCEPTION 'Активировать можно только пропущенный подэтап' USING ERRCODE = '22023';
  END IF;
  IF v_process_status <> 'active' THEN
    RAISE EXCEPTION 'Процесс уже завершён — подэтап нельзя активировать' USING ERRCODE = '22023';
  END IF;

  -- 2. Вернуть подэтап в активное состояние
  UPDATE stage_instances
  SET status = 'active', activated_at = v_now, completed_at = NULL,
      completed_by = NULL, final_code = NULL
  WHERE id = p_stage_instance_id;

  -- 3. ФИО лида — подставляется в title задач
  SELECT person_id INTO v_person_id FROM education_journeys WHERE id = v_journey_id;
  IF v_person_id IS NOT NULL THEN
    SELECT full_name INTO v_person_full_name FROM persons WHERE id = v_person_id;
  END IF;

  -- Системное событие — best-effort, как и в оригинале (void _evErr).
  -- Вложенный BEGIN/EXCEPTION = savepoint: ошибка здесь откатывается сама по
  -- себе и не роняет всю функцию.
  BEGIN
    INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
    VALUES (p_stage_instance_id, 'system', 'Подэтап активирован вручную', p_actor_id, NULL);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 4. Стартовые задачи подэтапа (см. createStartingTasks в start-process.ts).
  -- Пусто в task_transitions (from_task_code IS NULL) для этого подэтапа →
  -- legacy fallback: создаём все шаблоны.
  SELECT COALESCE(array_agg(DISTINCT to_task_code), ARRAY[]::text[])
    INTO v_start_codes
  FROM task_transitions
  WHERE stage_template_id = v_stage_template_id AND from_task_code IS NULL;

  FOR v_tt IN
    SELECT * FROM stage_task_templates
    WHERE stage_template_id = v_stage_template_id
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
    -- role / manual / null / department без отдела / position без должности
    -- → остаётся 'unassigned' (как и в mapTaskTemplate в start-process.ts).

    v_title := CASE WHEN v_person_full_name IS NOT NULL
      THEN v_tt.title || ': ' || v_person_full_name
      ELSE v_tt.title
    END;

    -- Вставка НЕ обёрнута в savepoint: ошибка здесь должна откатить всю
    -- реактивацию, включая уже сделанный UPDATE stage_instances — это и есть
    -- исправляемый риск частичного состояния.
    INSERT INTO tasks (
      title, description, module, metadata, assignee_type, assignee_id,
      department_id, position_id, creator_id, status, priority,
      due_date, due_time, due_all_day, stage_instance_id, stage_task_template_id
    ) VALUES (
      v_title, v_tt.description, 'general', '{}'::jsonb, v_assignee_type, v_assignee_id,
      v_department_id, v_position_id, p_actor_id, v_task_status, v_tt.default_priority,
      NULL, NULL, true, p_stage_instance_id, v_tt.id
    );
  END LOOP;

  RETURN jsonb_build_object('stage_instance_id', p_stage_instance_id);
END;
$$;
