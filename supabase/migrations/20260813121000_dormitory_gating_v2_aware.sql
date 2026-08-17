-- ═════════════════════════════════════════════════════════════════════
-- Обновление acceptance_apply_dormitory_gating: поддержка ОБОИХ шаблонов
-- приёма — параллельного `acceptance` и последовательного `acceptance_v2`.
--
-- CREATE OR REPLACE — заменяет тело функции из 20260724190000. Движковые RPC
-- (start_process / complete_stage) НЕ трогаются.
--
-- Три изменения относительно 20260724190000, все безопасные для старого
-- параллельного `acceptance` (где этап dormitory всегда 'active' с самого
-- старта — поэтому новые guard'ы для него всегда истинны):
--
--   1. Инстанс приёма ищется по коду IN ('acceptance','acceptance_v2').
--
--   2. Врача/психолога (needs=true) активируем ТОЛЬКО когда этап dormitory уже
--      ДОСТИГНУТ в цепочке — его статус IN ('active','completed'). В
--      последовательном графе dormitory до завершения academic находится в
--      'waiting', и активировать «интервью пансиона» рано нельзя. В старом
--      графе dormitory 'active' сразу → поведение прежнее.
--
--   3. Пропуск dormitory (needs=false) — ТОЛЬКО когда он 'active' (раньше было
--      'active' ИЛИ 'waiting'). В последовательном графе 'waiting'-dormitory
--      означает «цепочка ещё не дошла» — пропускать и досрочно активировать
--      final_approval нельзя. Пропуск происходит, когда academic завершится и
--      активирует dormitory, а гейтинг (вызываемый после завершения этапа)
--      переведёт его в 'skipped' и пересчитает join. В старом графе dormitory
--      всегда 'active' → поведение прежнее.
--
-- Пересчёт after_all-join final_approval — динамический (по предшественникам из
-- stage_transitions), поэтому корректен для обоих графов: в `acceptance_v2`
-- предшественник final_approval = только dormitory; в `acceptance` — academic +
-- dormitory + jewishness.
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION acceptance_apply_dormitory_gating(
  p_journey_id uuid,
  p_actor_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_needs         boolean;
  v_pi_id         uuid;
  v_now           timestamptz := NOW();
  v_activated     text[] := ARRAY[]::text[];
  v_skipped       text[] := ARRAY[]::text[];
  v_dorm_status   text;
  v_final_si_id   uuid;
  v_final_tmpl_id uuid;
  v_final_status  text;
  v_pred_ids      uuid[];
  v_pred_not_term int;
  v_row           RECORD;
BEGIN
  -- Флаг журнея
  SELECT needs_dormitory INTO v_needs
  FROM education_journeys WHERE id = p_journey_id;

  -- NULL = решение ещё не принято → гейтинг не применяем.
  IF v_needs IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'undecided');
  END IF;

  -- Активный экземпляр приёма любой из двух семей (самый свежий).
  SELECT pi.id INTO v_pi_id
  FROM process_instances pi
  JOIN process_templates pt ON pt.id = pi.process_template_id
  WHERE pi.journey_id = p_journey_id
    AND pt.code IN ('acceptance', 'acceptance_v2')
    AND pi.status = 'active'
  ORDER BY pi.created_at DESC
  LIMIT 1;

  IF v_pi_id IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_active_acceptance');
  END IF;

  -- Текущий статус этапа общежития — определяет «достигнута ли фаза пансиона».
  SELECT si.status INTO v_dorm_status
  FROM stage_instances si
  JOIN stage_templates st ON st.id = si.stage_template_id
  WHERE si.process_instance_id = v_pi_id AND st.code = 'dormitory'
  LIMIT 1;

  IF v_needs THEN
    -- ── Нужен пансион ─────────────────────────────────────────────────
    SELECT si.status INTO v_final_status
    FROM stage_instances si
    JOIN stage_templates st ON st.id = si.stage_template_id
    WHERE si.process_instance_id = v_pi_id AND st.code = 'final_approval'
    LIMIT 1;

    IF COALESCE(v_final_status, 'waiting') = 'waiting' THEN
      -- Врач + психолог — только когда фаза пансиона ДОСТИГНУТА.
      IF v_dorm_status IN ('active', 'completed') THEN
        FOR v_row IN
          SELECT si.id, st.code
          FROM stage_instances si
          JOIN stage_templates st ON st.id = si.stage_template_id
          WHERE si.process_instance_id = v_pi_id
            AND st.code IN ('medical', 'medical_psych')
            AND si.status IN ('waiting', 'skipped')
        LOOP
          UPDATE stage_instances
            SET status = 'active', activated_at = v_now, completed_at = NULL, completed_by = NULL
          WHERE id = v_row.id;
          v_activated := array_append(v_activated, v_row.code);
          BEGIN
            INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
            VALUES (v_row.id, 'system', 'Подэтап активирован (нужен пансион)', p_actor_id,
                    jsonb_build_object('reason', 'needs_dormitory'));
          EXCEPTION WHEN OTHERS THEN NULL; END;
        END LOOP;
      END IF;

      -- Если общежитие ранее пропущено (флаг менялся) — вернуть в active.
      FOR v_row IN
        SELECT si.id, st.code
        FROM stage_instances si
        JOIN stage_templates st ON st.id = si.stage_template_id
        WHERE si.process_instance_id = v_pi_id
          AND st.code = 'dormitory'
          AND si.status = 'skipped'
      LOOP
        UPDATE stage_instances
          SET status = 'active', activated_at = v_now, completed_at = NULL, completed_by = NULL
        WHERE id = v_row.id;
        v_activated := array_append(v_activated, v_row.code);
        BEGIN
          INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
          VALUES (v_row.id, 'system', 'Этап общежития возвращён (нужен пансион)', p_actor_id,
                  jsonb_build_object('reason', 'needs_dormitory'));
        EXCEPTION WHEN OTHERS THEN NULL; END;
      END LOOP;
    END IF;

  ELSE
    -- ── Пансион НЕ нужен ── пропустить общежитие, ТОЛЬКО когда он 'active'
    --    (фаза достигнута). 'waiting' в последовательном графе = ещё не дошли.
    FOR v_row IN
      SELECT si.id, st.code
      FROM stage_instances si
      JOIN stage_templates st ON st.id = si.stage_template_id
      WHERE si.process_instance_id = v_pi_id
        AND st.code = 'dormitory'
        AND si.status = 'active'
    LOOP
      UPDATE stage_instances
        SET status = 'skipped', completed_at = v_now, completed_by = p_actor_id
      WHERE id = v_row.id;
      UPDATE tasks SET status = 'cancelled', completed_at = v_now
      WHERE stage_instance_id = v_row.id
        AND status IN ('unassigned', 'pending', 'in_progress', 'review');
      v_skipped := array_append(v_skipped, v_row.code);
      BEGIN
        INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
        VALUES (v_row.id, 'system', 'Этап общежития пропущен (пансион не нужен)', p_actor_id,
                jsonb_build_object('reason', 'no_dormitory'));
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;

    -- Пересчёт after_all-join final_approval после out-of-band skip
    -- (движок сам его не пересчитывает). Предшественники — динамически.
    IF array_length(v_skipped, 1) IS NOT NULL THEN
      SELECT si.id, si.stage_template_id, si.status
        INTO v_final_si_id, v_final_tmpl_id, v_final_status
      FROM stage_instances si
      JOIN stage_templates st ON st.id = si.stage_template_id
      WHERE si.process_instance_id = v_pi_id AND st.code = 'final_approval'
      LIMIT 1;

      IF v_final_si_id IS NOT NULL AND v_final_status = 'waiting' THEN
        SELECT COALESCE(array_agg(DISTINCT from_stage_template_id), ARRAY[]::uuid[])
          INTO v_pred_ids
        FROM stage_transitions
        WHERE to_stage_template_id = v_final_tmpl_id
          AND from_stage_template_id IS NOT NULL;

        IF COALESCE(array_length(v_pred_ids, 1), 0) > 0 THEN
          SELECT COUNT(*) FILTER (WHERE status NOT IN ('completed', 'skipped'))
            INTO v_pred_not_term
          FROM stage_instances
          WHERE process_instance_id = v_pi_id
            AND stage_template_id = ANY(v_pred_ids);

          IF v_pred_not_term = 0 THEN
            UPDATE stage_instances SET status = 'active', activated_at = v_now
            WHERE id = v_final_si_id;
            v_activated := array_append(v_activated, 'final_approval');
            BEGIN
              INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
              VALUES (v_final_si_id, 'system',
                      'Подэтап активирован (пересчёт join после skip общежития)', p_actor_id, NULL);
            EXCEPTION WHEN OTHERS THEN NULL; END;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'applied',         true,
    'needs_dormitory', v_needs,
    'activated',       to_jsonb(v_activated),
    'skipped',         to_jsonb(v_skipped)
  );
END;
$$;
