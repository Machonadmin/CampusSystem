-- Атомарное завершение подэтапа + продвижение процесса — одной транзакцией.
--
-- Заменяет lib/workflow/complete-stage.ts::completeStage — самую сложную и
-- рискованную функцию движка (см. docs/workflow-transaction-risk-analysis.md
-- §5, разбор веток в docs/complete-stage-conversion-prep.md, эталон поведения
-- в docs/complete-stage-baseline.md). 15+ последовательных операций, 2 крупные
-- ветки (closes_process / обычный поток), after_one/after_all, каскадный skip
-- недостижимых подэтапов.
--
-- ПЕРЕНОС ОДИН-В-ОДИН. Сознательно сохранены (не «исправлены») тонкости,
-- зафиксированные в prep-доке §3 и подтверждённые эталоном:
--   • Конверсия лида закодирована в ДВУХ местах (ветка A и авто-закрытие) с
--     разным статусом процесса: ветка A → 'cancelled', авто-закрытие →
--     'completed'. Для recruitment все closes_process-финалы идут веткой A →
--     процесс 'cancelled' даже при успешной конверсии.
--   • application_date НЕ трогается ни в одной из веток (в отличие от
--     close_process_early) — оставлено как в оригинале.
--   • Проверка after_all в шаге 5 (активация) — БЕЗ проверки «предшественников
--     найдено >= ожидалось»; в шаге 5b (skip) — С проверкой. Асимметрия
--     сохранена дословно.
--   • Skip недостижимых (5b) — best-effort (savepoint): сбой skip не
--     откатывает уже сделанные активации (в оригинале — console.error без
--     throw). Все события (process_events) — тоже best-effort.
--
-- Логика создания стартовых задач подэтапа инлайнится (как в reactivate_stage
-- и start_process) — сознательно не выносится в общую функцию, чтобы не
-- трогать уже проверенные RPC.
--
-- Коды ошибок для jsonError (mapPgError): P0002 — подэтап не найден (404);
-- 22023 — подэтап не активен (400).

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
  -- task creation locals
  v_start_codes         text[];
  v_tt                  RECORD;
  v_assignee_type       text;
  v_assignee_id         uuid;
  v_department_id       uuid;
  v_position_id         uuid;
  v_task_status         text;
  v_title               text;
BEGIN
  -- 1. Загрузка + валидация
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

  -- 2. Завершить текущий подэтап
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

  -- 3. Завершить задачи этого подэтапа
  UPDATE tasks SET status = 'completed', completed_at = v_now
  WHERE stage_instance_id = p_stage_instance_id
    AND status <> 'completed' AND status <> 'cancelled';

  -- 3b. Финал закрывает процесс?
  SELECT closes_process, process_finish_reason INTO v_closes_process, v_process_finish
  FROM stage_finals
  WHERE stage_template_id = v_stage_template_id AND code = p_final_code;

  IF COALESCE(v_closes_process, false) THEN
    v_process_finish := COALESCE(v_process_finish, p_final_code);

    -- а. Отменить оставшиеся active/waiting подэтапы (+ события best-effort)
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

    -- б. Отменить незавершённые задачи всех подэтапов процесса
    UPDATE tasks SET status = 'cancelled', completed_at = v_now
    WHERE stage_instance_id IN (
      SELECT id FROM stage_instances WHERE process_instance_id = v_process_instance_id
    )
    AND status IN ('unassigned', 'pending', 'in_progress', 'review');

    -- в. Закрыть процесс (статус 'cancelled' — как в оригинале)
    UPDATE process_instances
    SET status = 'cancelled', finish_reason = v_process_finish, finished_at = v_now
    WHERE id = v_process_instance_id;

    -- г. Конверсия (без application_date)
    IF v_process_finish = 'converted' THEN
      UPDATE education_journeys SET education_status = 'applicant' WHERE id = v_journey_id;
    END IF;

    RETURN jsonb_build_object(
      'stage_instance_id', p_stage_instance_id,
      'activated_stage_ids', '[]'::jsonb,
      'process_completed', true,
      'finish_reason', v_process_finish
    );
  END IF;

  -- 4b. ФИО лида для title создаваемых задач
  SELECT person_id INTO v_person_id FROM education_journeys WHERE id = v_journey_id;
  IF v_person_id IS NOT NULL THEN
    SELECT full_name INTO v_person_full_name FROM persons WHERE id = v_person_id;
  END IF;

  -- 4/5. Исходящие переходы + активация целевых подэтапов
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
      -- after_all: все предшественники completed|skipped (БЕЗ проверки количества)
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

    -- Найти waiting-инстанс цели
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

    -- Создать стартовые задачи, если у цели has_tasks и есть автор
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

  -- 5b. Skip недостижимых waiting-подэтапов (best-effort: сбой не откатывает).
  --     Проверка С учётом количества предшественников (в отличие от шага 5).
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

  -- 6. Авто-закрытие процесса, если не осталось active подэтапов
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
