-- ═════════════════════════════════════════════════════════════════════
-- RPC: transition_education_status — атомарный переход education_status
-- студента по учебному циклу + запись в person_status_history.
--
-- Тот же паттерн, что у конверсий движка (complete_stage): смена статуса
-- journey и запись истории выполняются ОДНОЙ транзакцией — частичных
-- состояний нет. Route-хендлер (app/api/education/journeys/[id]/transition)
-- отвечает только за аутентификацию и проверку привилегии manage_students,
-- затем вызывает эту функцию.
--
-- Требует применённой миграции 20260705120000_extend_education_status_enum
-- (значения on_leave/graduated/expelled должны существовать в enum).
--
-- Разрешённые переходы (валидируются внутри функции):
--   student   → on_leave    (академический отпуск)  — нужны reason + date
--   on_leave  → student     (возврат из отпуска)     — без reason/date
--   student   → graduated   (выпуск)                 — нужны reason + date
--   student   → expelled    (отчисление)             — нужны reason + date
-- Любой другой переход → ошибка 22023 (→ HTTP 400).
--
-- reason пишется в person_status_history.comment, date — в changed_at
-- (переопределяет DEFAULT now()). Существующие колонки, новых полей нет.
--
-- Коды ошибок для маппинга в lib/api (см. route):
--   P0002 — journey не найден (→ 404)
--   22023 — недопустимый переход / нет reason / нет date (→ 400)
-- ═════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION transition_education_status(
  p_journey_id     uuid,
  p_to_status      text,
  p_actor_id       uuid,
  p_reason         text DEFAULT NULL,
  p_effective_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_person_id uuid;
  v_from      text;
  v_allowed   boolean := false;
  v_needs_details boolean;
BEGIN
  SELECT person_id, education_status::text
    INTO v_person_id, v_from
    FROM education_journeys
   WHERE id = p_journey_id;

  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'journey % not found', p_journey_id USING ERRCODE = 'P0002';
  END IF;

  -- Валидация допустимых переходов
  IF (v_from = 'student'  AND p_to_status IN ('on_leave', 'graduated', 'expelled'))
     OR (v_from = 'on_leave' AND p_to_status = 'student') THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'illegal education_status transition % -> %', v_from, p_to_status
      USING ERRCODE = '22023';
  END IF;

  -- Отрицательные/финальные переходы требуют причину и дату
  v_needs_details := p_to_status IN ('on_leave', 'graduated', 'expelled');
  IF v_needs_details THEN
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
      RAISE EXCEPTION 'reason is required for transition to %', p_to_status
        USING ERRCODE = '22023';
    END IF;
    IF p_effective_date IS NULL THEN
      RAISE EXCEPTION 'effective_date is required for transition to %', p_to_status
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE education_journeys
     SET education_status = p_to_status::person_education_status
   WHERE id = p_journey_id;

  INSERT INTO person_status_history (person_id, from_status, to_status, changed_by, comment, changed_at)
  VALUES (
    v_person_id,
    v_from::person_education_status,
    p_to_status::person_education_status,
    p_actor_id,
    NULLIF(btrim(COALESCE(p_reason, '')), ''),
    COALESCE(p_effective_date::timestamptz, now())
  );

  RETURN jsonb_build_object(
    'journey_id', p_journey_id,
    'from_status', v_from,
    'to_status', p_to_status
  );
END;
$$;

COMMENT ON FUNCTION transition_education_status(uuid, text, uuid, text, date) IS
  'Атомарный переход education_status студента (учёба ↔ отпуск / выпуск / отчисление) + запись person_status_history. Валидирует допустимость перехода и обязательность reason+date для on_leave/graduated/expelled.';
