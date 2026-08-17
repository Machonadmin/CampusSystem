-- ═════════════════════════════════════════════════════════════════════
-- reactivate_stage: разрешить ПЕРЕОТКРЫТИЕ ЗАВЕРШЁННОГО подэтапа (п. י"ב —
-- «החלטה ניתנת לשינוי», «מסמכים חלקי→מלא»).
--
-- Раньше переоткрыть можно было только ПРОПУЩЕННЫЙ (skipped) подэтап. Теперь
-- дополнительно можно ЗАВЕРШЁННЫЙ (completed) — но БЕЗОПАСНО, только «фронтир»:
--   • процесс ещё активен (не закрыт — значит финальный/конвертящий этап ещё
--     не завершён, конверсия в студентку не случилась);
--   • НИ ОДИН последующий подэтап (цель перехода из этого) не 'completed' —
--     иначе поток ушёл слишком далеко, авто-откат небезопасен → ошибка;
--   • последующие 'active'/'waiting' цели откатываются в 'waiting' (снимаем
--     activated_at) и их незакрытые авто-задачи отменяются — чтобы не плодить
--     дубликаты (при повторном завершении этапа complete_stage создаст их снова).
-- Для completed НЕ создаём стартовые задачи заново (они уже есть). Для skipped —
-- прежнее поведение (создаём стартовые задачи).
-- Идемпотентно (CREATE OR REPLACE). Deploy-safe.
-- ═════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION reactivate_stage(p_stage_instance_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_status            text;
  v_stage_template_id uuid;
  v_process_status    text;
  v_process_id        uuid;
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
  v_downstream_done   int;
BEGIN
  -- 1. Контекст подэтапа + процесса
  SELECT si.status, si.stage_template_id, pi.status, pi.id, pi.journey_id
    INTO v_status, v_stage_template_id, v_process_status, v_process_id, v_journey_id
  FROM stage_instances si
  JOIN process_instances pi ON pi.id = si.process_instance_id
  WHERE si.id = p_stage_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Подэтап не найден' USING ERRCODE = 'P0002';
  END IF;

  IF v_process_status <> 'active' THEN
    RAISE EXCEPTION 'Процесс уже завершён — подэтап нельзя активировать' USING ERRCODE = '22023';
  END IF;

  IF v_status NOT IN ('skipped', 'completed') THEN
    RAISE EXCEPTION 'Активировать можно пропущенный или завершённый подэтап' USING ERRCODE = '22023';
  END IF;

  -- ── Ветка ЗАВЕРШЁННОГО подэтапа: безопасный откат «фронтира» ──
  IF v_status = 'completed' THEN
    -- Есть ли уже ЗАВЕРШЁННЫЙ последующий этап (цель перехода)? Тогда поток ушёл
    -- дальше — авто-откат небезопасен.
    SELECT count(*) INTO v_downstream_done
    FROM stage_instances si
    WHERE si.process_instance_id = v_process_id
      AND si.status = 'completed'
      AND si.stage_template_id IN (
        SELECT to_stage_template_id FROM stage_transitions
        WHERE from_stage_template_id = v_stage_template_id
      );
    IF v_downstream_done > 0 THEN
      RAISE EXCEPTION 'Следующий этап уже завершён — сначала переоткройте его' USING ERRCODE = '22023';
    END IF;

    -- Отменяем незакрытые авто-задачи последующих (active/waiting) этапов.
    UPDATE tasks SET status = 'cancelled'
    WHERE stage_instance_id IN (
      SELECT si.id FROM stage_instances si
      WHERE si.process_instance_id = v_process_id
        AND si.status IN ('active', 'waiting')
        AND si.stage_template_id IN (
          SELECT to_stage_template_id FROM stage_transitions
          WHERE from_stage_template_id = v_stage_template_id
        )
    )
    AND status NOT IN ('completed', 'cancelled');

    -- Откатываем последующие active-этапы в waiting.
    UPDATE stage_instances
    SET status = 'waiting', activated_at = NULL
    WHERE process_instance_id = v_process_id
      AND status = 'active'
      AND stage_template_id IN (
        SELECT to_stage_template_id FROM stage_transitions
        WHERE from_stage_template_id = v_stage_template_id
      );

    -- Переоткрываем сам подэтап (без пересоздания задач — они уже есть).
    UPDATE stage_instances
    SET status = 'active', activated_at = v_now, completed_at = NULL,
        completed_by = NULL, final_code = NULL
    WHERE id = p_stage_instance_id;

    BEGIN
      INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
      VALUES (p_stage_instance_id, 'system', 'Подэтап переоткрыт для изменения решения', p_actor_id, NULL);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN jsonb_build_object('stage_instance_id', p_stage_instance_id);
  END IF;

  -- ── Ветка ПРОПУЩЕННОГО подэтапа (прежнее поведение) ──
  UPDATE stage_instances
  SET status = 'active', activated_at = v_now, completed_at = NULL,
      completed_by = NULL, final_code = NULL
  WHERE id = p_stage_instance_id;

  SELECT person_id INTO v_person_id FROM education_journeys WHERE id = v_journey_id;
  IF v_person_id IS NOT NULL THEN
    SELECT full_name INTO v_person_full_name FROM persons WHERE id = v_person_id;
  END IF;

  BEGIN
    INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
    VALUES (p_stage_instance_id, 'system', 'Подэтап активирован вручную', p_actor_id, NULL);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

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
      NULL, NULL, true, p_stage_instance_id, v_tt.id
    );
  END LOOP;

  RETURN jsonb_build_object('stage_instance_id', p_stage_instance_id);
END;
$$;
