-- ═════════════════════════════════════════════════════════════════════
-- Условный «Пансион» в процессе приёма (acceptance) — гейтинг по флагу
-- education_journeys.needs_dormitory (см. 20260724180000).
--
-- По документу бизнес-процесса: «Пансион» = набор интервью (заведующая
-- общежитием → психолог → врач), который проходят ТОЛЬКО абитуриентки,
-- которым нужна пансион. В текущей структуре приёма это три этапа:
--   • dormitory     (020, dorm_director)  — стартует активным всегда;
--   • medical       (040, doctor)         — обычно ждёт направления;
--   • medical_psych (045, psychologist)   — обычно ждёт направления.
--
-- Эта функция приводит их состояние в соответствие с флагом. Все три —
-- этапы-подписи (has_tasks=false), поэтому «активировать» = выставить
-- status='active', «пропустить» = status='skipped'. Движковые RPC
-- (start_process / complete_stage) НЕ трогаются — функция вызывается ИЗ
-- кода-роута ПОСЛЕ старта приёма и при изменении флага (аддитивно,
-- deploy-safe). Идемпотентна.
--
-- Поведение по значению флага:
--   • NULL  — решение ещё не принято → НИЧЕГО не трогаем (движок оставил
--             общежитие активным, врача/психолога — waiting). Так процесс
--             ведёт себя как раньше, пока решение не принято.
--   • true  — активировать врача и психолога (если ещё ждут); если
--             общежитие ранее было пропущено (флаг менялся) и финал ещё не
--             активирован — вернуть его в active.
--   • false — пропустить (skip) общежитие, если оно ещё не завершено;
--             закрыть его автозадачи; затем ПЕРЕСЧИТАТЬ after_all-join
--             финального утверждения — движок сам этого не делает при
--             out-of-band skip, и final_approval мог бы зависнуть в waiting.
--
-- Ограничение (документировано): поздний флип флага уже ПОСЛЕ того, как
-- финальное утверждение активировано/завершено, состояние общежития не
-- меняет (поезд ушёл). Флаг предполагается решать на раннем этапе.
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

  -- Активный экземпляр приёма (самый свежий, если вдруг несколько)
  SELECT pi.id INTO v_pi_id
  FROM process_instances pi
  JOIN process_templates pt ON pt.id = pi.process_template_id
  WHERE pi.journey_id = p_journey_id
    AND pt.code = 'acceptance'
    AND pi.status = 'active'
  ORDER BY pi.created_at DESC
  LIMIT 1;

  IF v_pi_id IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_active_acceptance');
  END IF;

  IF v_needs THEN
    -- ── Нужен пансион ─────────────────────────────────────────────────
    -- Гейтинг применяем, только пока финальное утверждение ещё не активно:
    -- после его активации/завершения «поезд ушёл» (документированное
    -- ограничение позднего флипа).
    SELECT si.status INTO v_final_status
    FROM stage_instances si
    JOIN stage_templates st ON st.id = si.stage_template_id
    WHERE si.process_instance_id = v_pi_id AND st.code = 'final_approval'
    LIMIT 1;

    IF COALESCE(v_final_status, 'waiting') = 'waiting' THEN
      -- Активировать врача (040) и психолога (045). Из waiting (обычный старт)
      -- ИЛИ из skipped (движок мог пропустить их при раннем false-гейтинге,
      -- а флаг затем сменили на true).
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
    -- ── Пансион НЕ нужен ──────────────────────────────────────────────
    -- Пропустить общежитие, если оно ещё не завершено.
    FOR v_row IN
      SELECT si.id, st.code
      FROM stage_instances si
      JOIN stage_templates st ON st.id = si.stage_template_id
      WHERE si.process_instance_id = v_pi_id
        AND st.code = 'dormitory'
        AND si.status IN ('active', 'waiting')
    LOOP
      UPDATE stage_instances
        SET status = 'skipped', completed_at = v_now, completed_by = p_actor_id
      WHERE id = v_row.id;
      -- Закрыть автозадачи общежития (best-effort по составу статусов).
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

    -- Пересчёт after_all-join финального утверждения. Движок пересчитывает
    -- join только внутри complete_stage смежного этапа; при out-of-band skip
    -- этого не происходит, и final_approval завис бы в waiting, если academic
    -- и jewishness уже завершены. Повторяем предикат шага 5 complete_stage.
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
