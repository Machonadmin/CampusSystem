-- Расширение конверсии journey в движке: поддержка applicant → student
-- (процесс «Приём»), в дополнение к существующей lead → applicant («Набор»).
--
-- Изменение ХИРУРГИЧЕСКОЕ: тронуты только блоки конверсии в complete_stage
-- (ветка A, closes_process) и close_process_early. Вся остальная логика
-- (переходы, after_one/after_all, skip недостижимых) — байт-в-байт как в
-- 20260703120000 / 20260703130000. Маппинг причины завершения:
--   'converted'                        → applicant  (как было)
--   'admitted' / 'admitted_conditional'→ student    (новое)
-- Условное зачисление помечается флагом education_journeys.is_conditional_admission.
--
-- Ветка 6 (авто-закрытие) complete_stage НЕ трогается: закрывающие финалы
-- приёма (admitted/rejected/conditional) имеют closes_process=true и идут
-- веткой A, а не веткой 6.

-- 1. Флаг условного зачисления
ALTER TABLE education_journeys
  ADD COLUMN IF NOT EXISTS is_conditional_admission BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. complete_stage — расширенная конверсия в ветке A
CREATE OR REPLACE FUNCTION complete_stage(
  p_stage_instance_id uuid,
  p_final_code text,
  p_actor_id uuid,
  p_result_data jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_status              text;
  v_stage_template_id   uuid;
  v_process_instance_id uuid;
  v_journey_id          uuid;
  v_now                 timestamptz := NOW();
  v_closes_process      boolean;
  v_process_finish      text;
  v_stage               RECORD;
  v_person_id           uuid;
  v_person_full_name    text;
  v_tr                  RECORD;
  v_target_si_id        uuid;
  v_target_has_tasks    boolean;
  v_should_activate     boolean;
  v_pred_ids            uuid[];
  v_pred_total          int;
  v_pred_not_term       int;
  v_activated_ids       uuid[] := ARRAY[]::uuid[];
  v_seen_targets        uuid[] := ARRAY[]::uuid[];
  v_wi                  RECORD;
  v_pred_tmpl_ids       uuid[];
  v_remaining_active    int;
  v_finish_reason       text;
  v_process_completed   boolean := false;
  v_start_codes         text[];
  v_tt                  RECORD;
  v_assignee_type       text;
  v_assignee_id         uuid;
  v_department_id       uuid;
  v_position_id         uuid;
  v_task_status         text;
  v_title               text;
BEGIN
  SELECT si.status, si.stage_template_id, si.process_instance_id, pi.journey_id
    INTO v_status, v_stage_template_id, v_process_instance_id, v_journey_id
  FROM stage_instances si
  JOIN process_instances pi ON pi.id = si.process_instance_id
  WHERE si.id = p_stage_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Подэтап не найден' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Подэтап не активен' USING ERRCODE = '22023';
  END IF;

  UPDATE stage_instances
  SET status = 'completed', final_code = p_final_code,
      completed_at = v_now, completed_by = p_actor_id,
      result_data = COALESCE(p_result_data, '{}'::jsonb)
  WHERE id = p_stage_instance_id;

  BEGIN
    INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
    VALUES (p_stage_instance_id, 'system', 'Подэтап завершён: ' || p_final_code,
            p_actor_id, jsonb_build_object('final_code', p_final_code));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  UPDATE tasks SET status = 'completed', completed_at = v_now
  WHERE stage_instance_id = p_stage_instance_id
    AND status <> 'completed' AND status <> 'cancelled';

  SELECT closes_process, process_finish_reason INTO v_closes_process, v_process_finish
  FROM stage_finals
  WHERE stage_template_id = v_stage_template_id AND code = p_final_code;

  IF COALESCE(v_closes_process, false) THEN
    v_process_finish := COALESCE(v_process_finish, p_final_code);

    FOR v_stage IN
      UPDATE stage_instances
      SET status = 'cancelled', completed_at = v_now, completed_by = p_actor_id
      WHERE process_instance_id = v_process_instance_id
        AND status IN ('active', 'waiting')
      RETURNING id
    LOOP
      BEGIN
        INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
        VALUES (v_stage.id, 'system', 'Подэтап отменён', p_actor_id,
                jsonb_build_object('reason', 'closes_process', 'final_code', p_final_code));
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP;

    UPDATE tasks SET status = 'cancelled', completed_at = v_now
    WHERE stage_instance_id IN (
      SELECT id FROM stage_instances WHERE process_instance_id = v_process_instance_id
    )
    AND status IN ('unassigned', 'pending', 'in_progress', 'review');

    UPDATE process_instances
    SET status = 'cancelled', finish_reason = v_process_finish, finished_at = v_now
    WHERE id = v_process_instance_id;

    -- Конверсия journey по причине завершения (без application_date).
    --   'converted'                         → applicant («Набор»)
    --   'admitted' / 'admitted_conditional' → student  («Приём»)
    IF v_process_finish = 'converted' THEN
      UPDATE education_journeys SET education_status = 'applicant' WHERE id = v_journey_id;
    ELSIF v_process_finish IN ('admitted', 'admitted_conditional') THEN
      UPDATE education_journeys
      SET education_status = 'student',
          is_conditional_admission = (v_process_finish = 'admitted_conditional')
      WHERE id = v_journey_id;
    END IF;

    RETURN jsonb_build_object(
      'stage_instance_id', p_stage_instance_id,
      'activated_stage_ids', '[]'::jsonb,
      'process_completed', true,
      'finish_reason', v_process_finish
    );
  END IF;

  SELECT person_id INTO v_person_id FROM education_journeys WHERE id = v_journey_id;
  IF v_person_id IS NOT NULL THEN
    SELECT full_name INTO v_person_full_name FROM persons WHERE id = v_person_id;
  END IF;

  FOR v_tr IN
    SELECT to_stage_template_id, activation_mode
    FROM stage_transitions
    WHERE from_stage_template_id = v_stage_template_id AND trigger_final_code = p_final_code
    ORDER BY sort_order
  LOOP
    IF v_tr.to_stage_template_id = ANY(v_seen_targets) THEN
      CONTINUE;
    END IF;
    v_seen_targets := array_append(v_seen_targets, v_tr.to_stage_template_id);

    IF v_tr.activation_mode = 'after_one' THEN
      v_should_activate := true;
    ELSE
      SELECT COALESCE(array_agg(DISTINCT from_stage_template_id), ARRAY[]::uuid[])
        INTO v_pred_ids
      FROM stage_transitions
      WHERE to_stage_template_id = v_tr.to_stage_template_id
        AND from_stage_template_id IS NOT NULL;

      IF COALESCE(array_length(v_pred_ids, 1), 0) > 0 THEN
        SELECT COUNT(*) FILTER (WHERE status NOT IN ('completed', 'skipped'))
          INTO v_pred_not_term
        FROM stage_instances
        WHERE process_instance_id = v_process_instance_id
          AND stage_template_id = ANY(v_pred_ids);
        v_should_activate := (v_pred_not_term = 0);
      ELSE
        v_should_activate := true;
      END IF;
    END IF;

    IF NOT v_should_activate THEN
      CONTINUE;
    END IF;

    SELECT id INTO v_target_si_id
    FROM stage_instances
    WHERE process_instance_id = v_process_instance_id
      AND stage_template_id = v_tr.to_stage_template_id
      AND status = 'waiting'
    LIMIT 1;

    IF v_target_si_id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE stage_instances SET status = 'active', activated_at = v_now
    WHERE id = v_target_si_id;
    v_activated_ids := array_append(v_activated_ids, v_target_si_id);

    BEGIN
      INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
      VALUES (v_target_si_id, 'system', 'Подэтап активирован', p_actor_id, NULL);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    SELECT has_tasks INTO v_target_has_tasks FROM stage_templates WHERE id = v_tr.to_stage_template_id;

    IF COALESCE(v_target_has_tasks, false) AND p_actor_id IS NOT NULL THEN
      SELECT COALESCE(array_agg(DISTINCT to_task_code), ARRAY[]::text[]) INTO v_start_codes
      FROM task_transitions
      WHERE stage_template_id = v_tr.to_stage_template_id AND from_task_code IS NULL;

      FOR v_tt IN
        SELECT * FROM stage_task_templates
        WHERE stage_template_id = v_tr.to_stage_template_id
          AND (array_length(v_start_codes, 1) IS NULL OR code = ANY(v_start_codes))
        ORDER BY sort_order
      LOOP
        v_assignee_type := 'unassigned'; v_assignee_id := NULL;
        v_department_id := NULL; v_position_id := NULL; v_task_status := 'unassigned';

        IF v_tt.default_assignee_type = 'creator' THEN
          v_assignee_type := 'person'; v_assignee_id := p_actor_id; v_task_status := 'pending';
        ELSIF v_tt.default_assignee_type = 'department' AND v_tt.default_department_id IS NOT NULL THEN
          v_assignee_type := 'department'; v_department_id := v_tt.default_department_id;
        ELSIF v_tt.default_assignee_type = 'position' AND v_tt.default_position_id IS NOT NULL THEN
          v_assignee_type := 'position'; v_position_id := v_tt.default_position_id;
        END IF;

        v_title := CASE WHEN v_person_full_name IS NOT NULL
          THEN v_tt.title || ': ' || v_person_full_name ELSE v_tt.title END;

        INSERT INTO tasks (
          title, description, module, metadata, assignee_type, assignee_id,
          department_id, position_id, creator_id, status, priority,
          due_date, due_time, due_all_day, stage_instance_id, stage_task_template_id
        ) VALUES (
          v_title, v_tt.description, 'general', '{}'::jsonb, v_assignee_type, v_assignee_id,
          v_department_id, v_position_id, p_actor_id, v_task_status, v_tt.default_priority,
          NULL, NULL, true, v_target_si_id, v_tt.id
        );
      END LOOP;
    END IF;
  END LOOP;

  FOR v_wi IN
    SELECT id, stage_template_id FROM stage_instances
    WHERE process_instance_id = v_process_instance_id AND status = 'waiting'
  LOOP
    SELECT COALESCE(array_agg(DISTINCT from_stage_template_id), ARRAY[]::uuid[])
      INTO v_pred_tmpl_ids
    FROM stage_transitions
    WHERE to_stage_template_id = v_wi.stage_template_id
      AND from_stage_template_id IS NOT NULL;

    IF COALESCE(array_length(v_pred_tmpl_ids, 1), 0) = 0 THEN
      CONTINUE;
    END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE status NOT IN ('completed', 'skipped'))
      INTO v_pred_total, v_pred_not_term
    FROM stage_instances
    WHERE process_instance_id = v_process_instance_id
      AND stage_template_id = ANY(v_pred_tmpl_ids);

    IF v_pred_total >= array_length(v_pred_tmpl_ids, 1) AND v_pred_not_term = 0 THEN
      BEGIN
        UPDATE stage_instances SET status = 'skipped' WHERE id = v_wi.id;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;

  SELECT COUNT(*) INTO v_remaining_active
  FROM stage_instances
  WHERE process_instance_id = v_process_instance_id AND status = 'active';

  IF v_remaining_active = 0 THEN
    v_finish_reason := CASE p_final_code
      WHEN 'convert_to_applicant' THEN 'converted'
      WHEN 'rejected'             THEN 'rejected'
      WHEN 'postponed'            THEN 'postponed'
      ELSE NULL
    END;

    UPDATE process_instances
    SET status = 'completed', finish_reason = v_finish_reason, finished_at = v_now
    WHERE id = v_process_instance_id;
    v_process_completed := true;

    IF p_final_code = 'convert_to_applicant' THEN
      UPDATE education_journeys SET education_status = 'applicant' WHERE id = v_journey_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'stage_instance_id', p_stage_instance_id,
    'activated_stage_ids', to_jsonb(v_activated_ids),
    'process_completed', v_process_completed,
    'finish_reason', v_finish_reason
  );
END;
$$;

-- 3. close_process_early — расширенная конверсия
CREATE OR REPLACE FUNCTION close_process_early(
  p_process_instance_id uuid,
  p_final_code text,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_status              text;
  v_process_template_id uuid;
  v_journey_id          uuid;
  v_final_stage_id      uuid;
  v_finish_reason       text;
  v_now                 timestamptz := NOW();
  v_stage               RECORD;
  v_journey_converted   boolean := false;
BEGIN
  SELECT status, process_template_id, journey_id
    INTO v_status, v_process_template_id, v_journey_id
  FROM process_instances
  WHERE id = p_process_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Процесс не найден' USING ERRCODE = 'P0002';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Процесс уже завершён' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_final_stage_id
  FROM stage_templates
  WHERE process_template_id = v_process_template_id
  ORDER BY sort_order DESC
  LIMIT 1;

  IF v_final_stage_id IS NULL THEN
    RAISE EXCEPTION 'У процесса нет этапов' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM stage_finals
    WHERE stage_template_id = v_final_stage_id AND code = p_final_code
  ) THEN
    RAISE EXCEPTION 'Недопустимый финал' USING ERRCODE = '22023';
  END IF;

  v_finish_reason := CASE p_final_code
    WHEN 'convert_to_applicant' THEN 'converted'
    WHEN 'admitted'             THEN 'admitted'
    WHEN 'admitted_conditional' THEN 'admitted_conditional'
    WHEN 'rejected'             THEN 'rejected'
    WHEN 'postponed'            THEN 'postponed'
    ELSE 'cancelled'
  END;

  FOR v_stage IN
    UPDATE stage_instances
    SET status = 'skipped', completed_at = v_now, completed_by = p_actor_id
    WHERE process_instance_id = p_process_instance_id
      AND status IN ('active', 'waiting')
    RETURNING id
  LOOP
    BEGIN
      INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
      VALUES (
        v_stage.id, 'system', 'Подэтап отменён', p_actor_id,
        jsonb_build_object('reason', 'close_early', 'final_code', p_final_code)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  UPDATE tasks
  SET status = 'cancelled', completed_at = v_now
  WHERE stage_instance_id IN (
    SELECT id FROM stage_instances WHERE process_instance_id = p_process_instance_id
  )
  AND status IN ('unassigned', 'pending', 'in_progress', 'review');

  UPDATE process_instances
  SET status = 'completed', finish_reason = v_finish_reason, finished_at = v_now
  WHERE id = p_process_instance_id;

  -- Конверсия journey (без application_date):
  --   convert_to_applicant → applicant; admitted[/_conditional] → student
  IF p_final_code = 'convert_to_applicant' THEN
    UPDATE education_journeys SET education_status = 'applicant' WHERE id = v_journey_id;
    v_journey_converted := true;
  ELSIF p_final_code IN ('admitted', 'admitted_conditional') THEN
    UPDATE education_journeys
    SET education_status = 'student',
        is_conditional_admission = (p_final_code = 'admitted_conditional')
    WHERE id = v_journey_id;
    v_journey_converted := true;
  END IF;

  RETURN jsonb_build_object(
    'process_instance_id', p_process_instance_id,
    'final_code', p_final_code,
    'finish_reason', v_finish_reason,
    'journey_converted', v_journey_converted
  );
END;
$$;
