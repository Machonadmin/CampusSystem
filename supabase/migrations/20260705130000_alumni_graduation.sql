-- ═════════════════════════════════════════════════════════════════════
-- Alumni — Milestone 3, Part 1: наполнение alumni_profiles при выпуске.
--
-- Расширяет RPC transition_education_status (см. 20260705120100): при
-- переходе студента в статус 'graduated' одной транзакцией UPSERT-ит запись
-- в alumni_profiles, ключ — person_id. Идемпотентно: повторный выпуск НЕ
-- создаёт дубликат (ON CONFLICT (person_id) DO UPDATE).
--
-- Эта миграция:
--   1) добавляет UNIQUE INDEX на alumni_profiles(person_id) — его не было в
--      001_initial_schema.sql, без него ON CONFLICT (person_id) не работает;
--   2) CREATE OR REPLACE FUNCTION transition_education_status с ПОЛНЫМ телом
--      предыдущей версии + блок наполнения alumni_profiles для 'graduated'
--      (миграция 20260705120100 НЕ редактируется на месте);
--   3) выдаёт role_privileges модуля 'alumni' (view/manage, scope='all')
--      системным ролям — по образцу 20260511175354_education_privileges.sql.
--
-- ВАЖНО (применять вручную через Supabase Dashboard SQL Editor):
--   Перед созданием UNIQUE INDEX убедитесь, что в alumni_profiles нет
--   дублей по person_id. Проверка (ожидается 0 строк):
--     SELECT person_id, count(*) FROM alumni_profiles
--     GROUP BY person_id HAVING count(*) > 1;
--   Если строки есть — сначала устраните дубли, иначе CREATE UNIQUE INDEX
--   упадёт.
-- ═════════════════════════════════════════════════════════════════════

-- ── 1. UNIQUE INDEX для ON CONFLICT (person_id) ───────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS alumni_profiles_person_id_key
  ON alumni_profiles(person_id);

-- ── 2. Расширенный RPC transition_education_status ────────────────────────────
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
  v_primary_department_id uuid;
  v_specialty_id uuid;
  v_institution text;
  v_direction   text;
  v_grad_year   integer;
BEGIN
  SELECT person_id, education_status::text, primary_department_id, specialty_id
    INTO v_person_id, v_from, v_primary_department_id, v_specialty_id
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

  -- ─── Наполнение alumni_profiles при выпуске ──────────────────────────────────
  -- Только при переходе в 'graduated'. p_effective_date для этого перехода
  -- уже обязателен (проверено выше), поэтому EXTRACT корректен.
  --   graduation_year = год из даты выпуска
  --   institution     = departments.name primary_department_id journey (NULL если нет)
  --   direction       = specialties.name specialty_id journey (NULL если нет)
  -- UPSERT по person_id: на конфликте обновляем ТОЛЬКО graduation_year/
  -- institution/direction. Поля current_location/current_occupation/notes —
  -- редактируются пользователем и НЕ перезаписываются.
  IF p_to_status = 'graduated' THEN
    v_grad_year := EXTRACT(YEAR FROM p_effective_date)::integer;

    SELECT name INTO v_institution
      FROM departments WHERE id = v_primary_department_id;

    SELECT name INTO v_direction
      FROM specialties WHERE id = v_specialty_id;

    INSERT INTO alumni_profiles (person_id, graduation_year, institution, direction)
    VALUES (v_person_id, v_grad_year, v_institution, v_direction)
    ON CONFLICT (person_id) DO UPDATE
      SET graduation_year = EXCLUDED.graduation_year,
          institution     = EXCLUDED.institution,
          direction       = EXCLUDED.direction;
  END IF;

  RETURN jsonb_build_object(
    'journey_id', p_journey_id,
    'from_status', v_from,
    'to_status', p_to_status
  );
END;
$$;

COMMENT ON FUNCTION transition_education_status(uuid, text, uuid, text, date) IS
  'Атомарный переход education_status студента (учёба ↔ отпуск / выпуск / отчисление) + запись person_status_history. При выпуске (graduated) UPSERT-ит alumni_profiles по person_id (идемпотентно). Валидирует допустимость перехода и обязательность reason+date для on_leave/graduated/expelled.';

-- ── 3. Права модуля 'alumni' системным ролям ─────────────────────────────────
-- По образцу 20260511175354_education_privileges.sql (блок 4.1). Без этого
-- гранта НИ ОДИН пользователь (включая superadmin) не проходит проверку
-- requireAlumniPrivilege — модуль недоступен. module_privileges для
-- ('alumni','view'/'manage') объявлены в 002_roles_and_privileges.sql, но
-- на проверке выяснилось, что этот сид не был применён к целевой БД —
-- каталог там пуст. Поэтому 3a досеивает его здесь же, идемпотентно.

-- 3a. Каталог привилегий модуля 'alumni' — на случай, если сид 002
-- не был применён к целевой БД (иначе цикл ниже находит 0 строк и не выдаёт прав).
INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('alumni', 'view',   'Просмотр',   1),
  ('alumni', 'manage', 'Управление', 2)
ON CONFLICT (module, privilege_code) DO NOTHING;

DO $$
DECLARE
  rcode TEXT;
  pcode TEXT;
  rid UUID;
BEGIN
  FOREACH rcode IN ARRAY ARRAY['superadmin', 'tech_admin', 'campus_president']
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;
    FOR pcode IN SELECT privilege_code FROM module_privileges WHERE module = 'alumni'
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'alumni', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;
