-- persons.education_status было денормализованной копией
-- education_journeys.education_status, которую полагалось держать в синхроне
-- вручную в каждом write-site. Проверка показала:
--   1. Ни один read-site в коде не читает persons.education_status —
--      единственный источник правды в приложении уже был education_journeys.
--   2. lib/workflow/complete-stage.ts и close-process-early.ts, которые меняют
--      education_journeys.education_status при конверсии lead→applicant через
--      воркфлоу-движок, никогда не трогали persons.education_status —
--      то есть поле реально дрейфовало на части путей уже сегодня.
--   3. Комментарий в коде (leads/[id]/convert/route.ts) уже называл его
--      "Legacy... удалим в Part 2 миграции".
-- Решение: не чинить синхронизацию (ещё один write-site, который забудут в
-- следующий раз), а убрать дублирующее поле целиком.
--
-- ВАЖНО: перед применением убедиться, что задеплоен код без записи в
-- persons.education_status (иначе INSERT/UPDATE упадут на несуществующей
-- колонке) — на момент миграции это уже так.

-- 1. Пересоздаём create_application без записи persons.education_status
--    (см. 20260702130000_create_application_rpc.sql)
CREATE OR REPLACE FUNCTION create_application(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_person_id uuid;
  v_journey_id uuid;
  v_existing RECORD;
  v_interest jsonb;
  v_today date := CURRENT_DATE;
  v_phones jsonb;
BEGIN
  -- 1. Найти или создать person
  IF (payload->>'person_id') IS NOT NULL THEN
    v_person_id := (payload->>'person_id')::uuid;

    IF NOT EXISTS (SELECT 1 FROM persons WHERE id = v_person_id) THEN
      RAISE EXCEPTION 'Person не найден' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    v_phones := COALESCE(
      NULLIF(payload->'phones', 'null'::jsonb),
      CASE WHEN payload->>'phone' IS NOT NULL
        THEN jsonb_build_array(payload->>'phone')
        ELSE '[]'::jsonb
      END
    );

    IF COALESCE(payload->>'first_name', '') = '' THEN
      RAISE EXCEPTION 'ФИО обязательно' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_phones) = 0 THEN
      RAISE EXCEPTION 'Телефон обязателен' USING ERRCODE = '22023';
    END IF;

    INSERT INTO persons (
      last_name, first_name, middle_name, hebrew_name, phones, email, gender,
      birth_date, address, marital_status, nationality, passport_number
    ) VALUES (
      NULLIF(payload->>'last_name', ''),
      payload->>'first_name',
      NULLIF(payload->>'middle_name', ''),
      NULLIF(payload->>'hebrew_name', ''),
      v_phones,
      NULLIF(payload->>'email', ''),
      NULLIF(payload->>'gender', ''),
      NULLIF(payload->>'birth_date', '')::date,
      NULLIF(payload->'address', 'null'::jsonb),
      NULLIF(payload->>'marital_status', ''),
      NULLIF(payload->>'citizenship', ''),
      NULLIF(payload->>'passport_number', '')
    )
    RETURNING id INTO v_person_id;
  END IF;

  -- 2. Найти открытый journey этого person либо создать новый (статус 'lead')
  SELECT id, education_status INTO v_existing
    FROM education_journeys
    WHERE person_id = v_person_id AND closed_at IS NULL
    LIMIT 1;

  IF FOUND THEN
    IF v_existing.education_status <> 'lead' THEN
      RAISE EXCEPTION 'У этого человека уже есть активный journey с другим статусом' USING ERRCODE = 'P0001';
    END IF;
    v_journey_id := v_existing.id;
  ELSE
    INSERT INTO education_journeys (
      person_id, education_status, opened_at, application_date, referral_source, notes, status
    ) VALUES (
      v_person_id, 'lead', v_today, v_today,
      NULLIF(payload->>'referral_source', ''),
      NULLIF(payload->>'comment', ''),
      'new'
    )
    RETURNING id INTO v_journey_id;
  END IF;

  -- 3. lead_interests (каскад direction_id/level_id либо свободный текст)
  FOR v_interest IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'interests', '[]'::jsonb))
  LOOP
    IF (v_interest->>'direction_id') IS NOT NULL THEN
      INSERT INTO lead_interests (person_id, direction_id, level_id)
      VALUES (
        v_person_id,
        (v_interest->>'direction_id')::uuid,
        NULLIF(v_interest->>'level_id', '')::uuid
      );
    ELSIF COALESCE(v_interest->>'free_text', '') <> '' THEN
      INSERT INTO lead_interests (person_id, free_text)
      VALUES (v_person_id, v_interest->>'free_text');
    END IF;
  END LOOP;

  -- 4. person_status_history
  INSERT INTO person_status_history (person_id, from_status, to_status, changed_by)
  VALUES (v_person_id, NULL, 'lead', NULLIF(payload->>'actor_id', '')::uuid);

  RETURN jsonb_build_object('person_id', v_person_id, 'journey_id', v_journey_id);
END;
$$;

-- 2. Убираем дублирующее поле
ALTER TABLE persons DROP COLUMN IF EXISTS education_status;
