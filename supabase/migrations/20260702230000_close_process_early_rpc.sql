-- Атомарное досрочное закрытие процесса (skip подэтапов + cancel задач +
-- завершение процесса + опциональная конверсия лида) — одной транзакцией.
--
-- Заменяет lib/workflow/close-process-early.ts::closeProcessEarly (см.
-- docs/workflow-transaction-risk-analysis.md, §4): ~8 последовательных шагов
-- через PostgREST. Опасный failure mode — "зомби-задачи": если шаг отмены
-- задач падает ПОСЛЕ того, как подэтапы уже помечены skipped / процесс уже
-- completed, задачи остаются pending, но принадлежат мёртвому процессу.
--
-- Отличие от TS-версии:
--   - Событие "Подэтап отменён" на каждом отменённом подэтапе остаётся
--     best-effort (savepoint), как и в оригинале (void _evErr).
--   - Всё остальное (skip подэтапов, cancel задач, завершение процесса,
--     конверсия journey) — атомарно: если что-то падает, откатывается всё.
--
-- Коды ошибок для маппинга в lib/api/handler.ts (mapPgError):
--   P0002 — процесс не найден (404)
--   22023 — процесс уже завершён / нет этапов / недопустимый финал (400)
--
-- Сигнатура — типизированные параметры, как у остальных workflow-RPC.

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
  -- 1. Загрузить process_instance
  SELECT status, process_template_id, journey_id
    INTO v_status, v_process_template_id, v_journey_id
  FROM process_instances
  WHERE id = p_process_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Процесс не найден' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Процесс должен быть активным
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Процесс уже завершён' USING ERRCODE = '22023';
  END IF;

  -- 3. Финальный stage_template (MAX sort_order для этого process_template)
  SELECT id INTO v_final_stage_id
  FROM stage_templates
  WHERE process_template_id = v_process_template_id
  ORDER BY sort_order DESC
  LIMIT 1;

  IF v_final_stage_id IS NULL THEN
    RAISE EXCEPTION 'У процесса нет этапов' USING ERRCODE = '22023';
  END IF;

  -- 4. finalCode должен быть среди финалов последнего подэтапа
  IF NOT EXISTS (
    SELECT 1 FROM stage_finals
    WHERE stage_template_id = v_final_stage_id AND code = p_final_code
  ) THEN
    RAISE EXCEPTION 'Недопустимый финал' USING ERRCODE = '22023';
  END IF;

  -- Маппинг финала → причина завершения (см. mapFinishReason в оригинале
  -- и логику completeStage: convert_to_applicant→converted и т.д.).
  v_finish_reason := CASE p_final_code
    WHEN 'convert_to_applicant' THEN 'converted'
    WHEN 'rejected'             THEN 'rejected'
    WHEN 'postponed'            THEN 'postponed'
    ELSE 'cancelled'
  END;

  -- 5. Отменить (skip) незавершённые подэтапы + событие на каждый (best-effort).
  -- UPDATE ... RETURNING в FOR-цикле: обрабатываем ровно те строки, что были
  -- active|waiting и потому обновлены — как и pre-collect в оригинале.
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

  -- 6. Отменить незавершённые задачи всех подэтапов процесса
  UPDATE tasks
  SET status = 'cancelled', completed_at = v_now
  WHERE stage_instance_id IN (
    SELECT id FROM stage_instances WHERE process_instance_id = p_process_instance_id
  )
  AND status IN ('unassigned', 'pending', 'in_progress', 'review');

  -- 7. Завершить процесс
  UPDATE process_instances
  SET status = 'completed', finish_reason = v_finish_reason, finished_at = v_now
  WHERE id = p_process_instance_id;

  -- 8. Конверсия лида в абитуриента
  IF p_final_code = 'convert_to_applicant' THEN
    UPDATE education_journeys
    SET education_status = 'applicant', application_date = v_now
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
