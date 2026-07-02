-- Атомарное создание сотрудника (person + staff_profiles + staff_positions)
-- внутри одной транзакции — тот же класс проблемы, что и в
-- create_application (20260702130000): раньше это были 3 последовательных
-- insert-а в app/api/staff/route.ts без отката при частичном сбое.
--
-- Коды ошибок:
--   22023 — некорректные входные данные (400)
--   P0002 — person_id/position_id не найден (404)

CREATE OR REPLACE FUNCTION create_staff_member(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_person_id uuid;
  v_person_name text;
  v_profile_id uuid;
  v_position_id uuid;
  v_position_name text;
  v_department_id uuid;
BEGIN
  PERFORM set_config('app.current_actor_id', NULLIF(payload->>'actor_id', ''), true);

  v_department_id := NULLIF(payload->>'department_id', '')::uuid;
  IF v_department_id IS NULL THEN
    RAISE EXCEPTION 'Отдел обязателен' USING ERRCODE = '22023';
  END IF;

  -- 1. Найти или создать person
  IF (payload->>'person_id') IS NOT NULL THEN
    v_person_id := (payload->>'person_id')::uuid;
    SELECT full_name INTO v_person_name FROM persons WHERE id = v_person_id;
    IF v_person_name IS NULL THEN
      RAISE EXCEPTION 'Человек не найден' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    IF COALESCE(payload->>'first_name', '') = '' THEN
      RAISE EXCEPTION 'ФИО обязательно' USING ERRCODE = '22023';
    END IF;

    INSERT INTO persons (
      last_name, first_name, middle_name, hebrew_name, gender, birth_date,
      marital_status, nationality, passport_number, phones, email, address
    ) VALUES (
      NULLIF(payload->>'last_name', ''),
      payload->>'first_name',
      NULLIF(payload->>'middle_name', ''),
      NULLIF(payload->>'hebrew_name', ''),
      NULLIF(payload->>'gender', ''),
      NULLIF(payload->>'birth_date', '')::date,
      NULLIF(payload->>'marital_status', ''),
      NULLIF(payload->>'nationality', ''),
      NULLIF(payload->>'passport_number', ''),
      COALESCE(payload->'phones', '[]'::jsonb),
      NULLIF(payload->>'email', ''),
      COALESCE(payload->'address', '{}'::jsonb)
    )
    RETURNING id, full_name INTO v_person_id, v_person_name;
  END IF;

  -- 2. staff_profiles — игнорируем дубль (у человека уже может быть профиль)
  BEGIN
    INSERT INTO staff_profiles (person_id, employment_type, hire_date, fire_date, notes)
    VALUES (
      v_person_id,
      COALESCE(NULLIF(payload->>'employment_type', ''), 'staff'),
      NULLIF(payload->>'hire_date', '')::date,
      NULL,
      NULLIF(payload->>'notes', '')
    )
    RETURNING id INTO v_profile_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_profile_id FROM staff_profiles WHERE person_id = v_person_id;
  END;

  -- 3. Разрешить должность
  v_position_id := NULLIF(payload->>'position_id', '')::uuid;
  IF v_position_id IS NOT NULL THEN
    SELECT name_ru INTO v_position_name FROM reference_positions WHERE id = v_position_id;
    IF v_position_name IS NULL THEN
      RAISE EXCEPTION 'Должность не найдена' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    v_position_name := NULLIF(payload->>'position', '');
    IF v_position_name IS NULL THEN
      RAISE EXCEPTION 'position или position_id обязательны' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 4. staff_positions
  INSERT INTO staff_positions (
    person_id, department_id, position_ru, position_he, position_id,
    is_head, start_date, end_date
  ) VALUES (
    v_person_id, v_department_id, v_position_name, NULL, v_position_id,
    false, NULLIF(payload->>'hire_date', '')::date, NULL
  );

  RETURN jsonb_build_object(
    'profile_id', v_profile_id,
    'person_id', v_person_id,
    'full_name', v_person_name,
    'position', v_position_name,
    'department_id', v_department_id
  );
END;
$$;
