-- ═════════════════════════════════════════════════════════════════════
-- Упрощение подэтапа «Мероприятие» (אירוע) в процессе набора (п. י"ב —
-- «אירוע ואישור או לא», текущий механизм «נראה חובבני»).
--
-- БЫЛО: 3 последовательные задачи (invite→arrange→feedback) + 3 финала
--       (feedback_received / no_show / refused).
-- СТАЛО: 1 задача + 2 финала — «האירוע התקיים» / «האירוע לא התקיים».
--
-- БЕЗОПАСНОСТЬ (живой шаблон, есть бегущие лиды): НЕ удаляем шаблоны задач
-- (arrange_trip/get_feedback остаются в БД — существующие tasks на них ссылаются),
-- лишь убираем task_transitions, которые их ЗАПУСКАЮТ → новые процессы создают
-- ровно одну задачу. Финал 'refused' и его переход в 'decision' удаляем (это
-- строки-конфиг, не данные экземпляров; ушедшие ранее по 'refused' лиды уже
-- перешли и не затрагиваются). Идемпотентно, deploy-safe.
-- ═════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_proc  UUID;
  v_event UUID;
BEGIN
  SELECT id INTO v_proc FROM process_templates WHERE code = 'recruitment';
  IF v_proc IS NULL THEN RETURN; END IF;
  SELECT id INTO v_event FROM stage_templates
    WHERE process_template_id = v_proc AND code = 'event';
  IF v_event IS NULL THEN RETURN; END IF;

  -- 1. Одна задача: убираем цепочку invite→arrange→feedback (и любые переходы,
  --    ведущие к arrange_trip/get_feedback), чтобы стартовала только одна.
  DELETE FROM task_transitions
    WHERE stage_template_id = v_event
      AND to_task_code IN ('arrange_trip', 'get_feedback');

  -- Оставшуюся задачу переименовываем в «провести мероприятие».
  UPDATE stage_task_templates
    SET title = 'לקיים אירוע'
    WHERE stage_template_id = v_event AND code = 'invite_event';

  -- 2. Два финала: убираем 'refused' (+ его переход в decision).
  DELETE FROM stage_transitions
    WHERE from_stage_template_id = v_event AND trigger_final_code = 'refused';
  DELETE FROM stage_finals
    WHERE stage_template_id = v_event AND code = 'refused';

  -- Оставшиеся два — «состоялось» (положительный) / «не состоялось».
  UPDATE stage_finals
    SET name_ru = 'Мероприятие состоялось', is_positive = true, sort_order = 10
    WHERE stage_template_id = v_event AND code = 'feedback_received';
  UPDATE stage_finals
    SET name_ru = 'Мероприятие не состоялось', is_positive = false, sort_order = 20
    WHERE stage_template_id = v_event AND code = 'no_show';
END $$;
