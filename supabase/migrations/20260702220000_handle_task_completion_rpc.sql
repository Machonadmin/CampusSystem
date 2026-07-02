-- Атомарная обработка завершения задачи: событие + активация следующих задач
-- подэтапа по task_transitions (after_one/after_all) — одной транзакцией.
--
-- Заменяет lib/workflow/handle-task-completion.ts::handleTaskCompletion (см.
-- docs/workflow-transaction-risk-analysis.md, §3): цикл создания задач делал
-- по одному PostgREST-запросу на каждый исходящий переход. Если создание
-- задачи #2 из 3 падает — задача #1 уже создана, #3 нет: асимметричное
-- продвижение веток подэтапа, которое трудно закрыть руками.
--
-- Отличие от TS-версии:
--   - Событие "Задача завершена" остаётся best-effort (savepoint), как и в
--     оригинале (void _evErr).
--   - Создание следующих задач — НЕ best-effort: если падает вставка любой
--     из них, откатывается вся обработка целиком.
--   - "Тихие" ранние выходы (задача не найдена, нет шаблона/stage_instance,
--     нет исходящих переходов) остаются тихими — RETURN без RAISE EXCEPTION,
--     как и в оригинале (`if (!task) return`). Это осознанно отличается от
--     reactivate_stage/start_process, которые в аналогичных ситуациях
--     бросают P0002/22023: там "не найдено" — ошибка вызывающего кода,
--     здесь — штатный путь (например, legacy-задача без привязки к этапу).
--
-- after_all: задача создаётся только когда ВСЕ предшественники (все
-- from_task_code, ведущие к этому to_task_code) имеют задачу со статусом
-- 'completed' в этом же stage_instance. Дедупликация по to_task_code — если
-- несколько исходящих переходов ведут к одному and тому же to_task_code,
-- берётся с наименьшим sort_order (как и `seen`-множество в оригинале при
-- переборе, отсортированном по sort_order).
--
-- Возвращаемое значение — jsonb с массивом id созданных задач. Оригинальная
-- TS-функция возвращала void (вызывающий код игнорирует результат); здесь
-- добавлено чисто для наглядности при отладке/тестировании, поведение не
-- меняет.
--
-- Сигнатура — типизированные параметры, как у reactivate_stage/start_process.

CREATE OR REPLACE FUNCTION handle_task_completion(p_task_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_title               text;
  v_stage_instance_id   uuid;
  v_stage_task_template_id uuid;
  v_from_code           text;
  v_stage_template_id   uuid;
  v_process_instance_id uuid;
  v_journey_id          uuid;
  v_person_id           uuid;
  v_person_full_name    text;
  v_tr                  RECORD;
  v_target              RECORD;
  v_predecessor_ids     uuid[];
  v_pred_count          int;
  v_pred_total          int;
  v_pred_not_done       int;
  v_assignee_type       text;
  v_assignee_id         uuid;
  v_department_id       uuid;
  v_position_id         uuid;
  v_task_status         text;
  v_new_title           text;
  v_new_task_id         uuid;
  v_created_ids         uuid[] := ARRAY[]::uuid[];
BEGIN
  -- 1. Задача + её шаблон
  SELECT t.title, t.stage_instance_id, t.stage_task_template_id, stt.code, stt.stage_template_id
    INTO v_title, v_stage_instance_id, v_stage_task_template_id, v_from_code, v_stage_template_id
  FROM tasks t
  LEFT JOIN stage_task_templates stt ON stt.id = t.stage_task_template_id
  WHERE t.id = p_task_id;

  -- Задача не найдена, либо нет шаблона (legacy), либо не привязана к
  -- подэтапу — тихий no-op, как и в оригинале.
  IF NOT FOUND OR v_stage_task_template_id IS NULL OR v_stage_instance_id IS NULL THEN
    RETURN jsonb_build_object('created_task_ids', '[]'::jsonb);
  END IF;

  -- Системное событие — best-effort, как и в оригинале (void _evErr).
  BEGIN
    INSERT INTO process_events (stage_instance_id, event_type, content, author_id, metadata)
    VALUES (
      v_stage_instance_id, 'system',
      format('Задача «%s» завершена', v_title),
      p_actor_id,
      jsonb_build_object('task_id', p_task_id)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- ФИО лида для title следующих задач
  SELECT process_instance_id INTO v_process_instance_id
  FROM stage_instances WHERE id = v_stage_instance_id;
  IF v_process_instance_id IS NOT NULL THEN
    SELECT journey_id INTO v_journey_id FROM process_instances WHERE id = v_process_instance_id;
  END IF;
  IF v_journey_id IS NOT NULL THEN
    SELECT person_id INTO v_person_id FROM education_journeys WHERE id = v_journey_id;
  END IF;
  IF v_person_id IS NOT NULL THEN
    SELECT full_name INTO v_person_full_name FROM persons WHERE id = v_person_id;
  END IF;

  -- 2. Исходящие переходы от завершённой задачи, дедуплицированные по
  -- to_task_code (при нескольких рёбрах в один код — берём с наименьшим
  -- sort_order, как и `seen`-множество в оригинале).
  FOR v_tr IN
    SELECT DISTINCT ON (to_task_code) to_task_code, activation_mode
    FROM task_transitions
    WHERE stage_template_id = v_stage_template_id AND from_task_code = v_from_code
    ORDER BY to_task_code, sort_order
  LOOP
    -- Шаблон задачи под этот code
    SELECT * INTO v_target
    FROM stage_task_templates
    WHERE stage_template_id = v_stage_template_id AND code = v_tr.to_task_code;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- a. Уже есть задача с этим шаблоном в этом stage_instance?
    IF EXISTS (
      SELECT 1 FROM tasks
      WHERE stage_instance_id = v_stage_instance_id AND stage_task_template_id = v_target.id
    ) THEN
      CONTINUE;
    END IF;

    -- b/c. Режим активации
    IF v_tr.activation_mode = 'after_all' THEN
      SELECT COALESCE(array_agg(stt2.id), ARRAY[]::uuid[]) INTO v_predecessor_ids
      FROM task_transitions tt2
      JOIN stage_task_templates stt2
        ON stt2.stage_template_id = v_stage_template_id AND stt2.code = tt2.from_task_code
      WHERE tt2.stage_template_id = v_stage_template_id
        AND tt2.to_task_code = v_tr.to_task_code
        AND tt2.from_task_code IS NOT NULL;

      v_pred_count := COALESCE(array_length(v_predecessor_ids, 1), 0);

      IF v_pred_count > 0 THEN
        SELECT COUNT(*), COUNT(*) FILTER (WHERE status <> 'completed')
          INTO v_pred_total, v_pred_not_done
        FROM tasks
        WHERE stage_instance_id = v_stage_instance_id
          AND stage_task_template_id = ANY(v_predecessor_ids);

        -- Точное соответствие оригиналу: predTasks.length >= predecessorIds.length
        -- И все найденные строки — 'completed' (а не «столько же completed,
        -- сколько предшественников» — это разные условия при дублях задач).
        IF v_pred_total < v_pred_count OR v_pred_not_done > 0 THEN
          CONTINUE;
        END IF;
      END IF;
      -- v_pred_count = 0 (нет предшественников с непустым from_task_code) →
      -- как и в оригинале, создаём безусловно (тот же пограничный случай).
    END IF;

    -- Создать задачу (см. mapTaskTemplate в start-process.ts)
    v_assignee_type := 'unassigned';
    v_assignee_id := NULL;
    v_department_id := NULL;
    v_position_id := NULL;
    v_task_status := 'unassigned';

    IF v_target.default_assignee_type = 'creator' THEN
      v_assignee_type := 'person';
      v_assignee_id := p_actor_id;
      v_task_status := 'pending';
    ELSIF v_target.default_assignee_type = 'department' AND v_target.default_department_id IS NOT NULL THEN
      v_assignee_type := 'department';
      v_department_id := v_target.default_department_id;
    ELSIF v_target.default_assignee_type = 'position' AND v_target.default_position_id IS NOT NULL THEN
      v_assignee_type := 'position';
      v_position_id := v_target.default_position_id;
    END IF;

    v_new_title := CASE WHEN v_person_full_name IS NOT NULL
      THEN v_target.title || ': ' || v_person_full_name
      ELSE v_target.title
    END;

    INSERT INTO tasks (
      title, description, module, metadata, assignee_type, assignee_id,
      department_id, position_id, creator_id, status, priority,
      due_date, due_time, due_all_day, stage_instance_id, stage_task_template_id
    ) VALUES (
      v_new_title, v_target.description, 'general', '{}'::jsonb, v_assignee_type, v_assignee_id,
      v_department_id, v_position_id, p_actor_id, v_task_status, v_target.default_priority,
      NULL, NULL, true, v_stage_instance_id, v_target.id
    )
    RETURNING id INTO v_new_task_id;

    v_created_ids := array_append(v_created_ids, v_new_task_id);
  END LOOP;

  RETURN jsonb_build_object('created_task_ids', to_jsonb(v_created_ids));
END;
$$;
