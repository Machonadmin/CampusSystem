-- Слияние двух записей человека (устранение дублей в מאגר אנשים).
--
-- merge_persons(p_keep, p_remove, p_keep_fields, p_actor):
--   1. Переносит ВСЕ ссылки на p_remove → p_keep во всех таблицах, где есть
--      внешний ключ на persons(id). Делает это построчно по ctid: обычную строку
--      переназначает, а если перенос нарушил бы уникальность/исключение (у
--      выжившего уже есть такая же связь — напр. та же роль, тот же профиль,
--      та же зарплата за месяц) — удаляет дублирующую строку удаляемого. Так
--      обрабатываются ЛЮБЫЕ unique-ограничения без ручного перечисления.
--   2. Применяет выбранные пользователем значения полей на выжившего
--      (p_keep_fields — только присутствующие ключи меняются; поле за полем).
--   3. Удаляет запись-дубль p_remove (к этому моменту на неё нет ссылок).
--
-- Всё в одной транзакции (функция) — либо целиком, либо ничего.
--
-- Коды ошибок: 22023 — некорректный вход; P0002 — человек не найден.

CREATE OR REPLACE FUNCTION merge_persons(
  p_keep uuid,
  p_remove uuid,
  p_keep_fields jsonb DEFAULT '{}'::jsonb,
  p_actor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  r        record;
  ct       tid;
  cts      tid[];
  v_moved  int := 0;
  v_dropped int := 0;
BEGIN
  IF p_keep IS NULL OR p_remove IS NULL THEN
    RAISE EXCEPTION 'keep/remove обязательны' USING ERRCODE = '22023';
  END IF;
  IF p_keep = p_remove THEN
    RAISE EXCEPTION 'нельзя слить человека с самим собой' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM persons WHERE id = p_keep;
  IF NOT FOUND THEN RAISE EXCEPTION 'keep не найден' USING ERRCODE = 'P0002'; END IF;
  PERFORM 1 FROM persons WHERE id = p_remove;
  IF NOT FOUND THEN RAISE EXCEPTION 'remove не найден' USING ERRCODE = 'P0002'; END IF;

  IF p_actor IS NOT NULL THEN
    PERFORM set_config('app.current_actor_id', p_actor::text, true);
  END IF;

  -- 1. Переназначить все внешние ключи на persons(id): p_remove → p_keep.
  FOR r IN
    SELECT tc.table_schema AS sch, tc.table_name AS tbl, kcu.column_name AS col
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
     AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'persons'
      AND ccu.column_name = 'id'
  LOOP
    -- Снимок ctid всех строк удаляемого в этой (таблице, колонке).
    EXECUTE format('SELECT array_agg(ctid) FROM %I.%I WHERE %I = $1', r.sch, r.tbl, r.col)
      INTO cts USING p_remove;
    IF cts IS NULL THEN CONTINUE; END IF;

    FOREACH ct IN ARRAY cts LOOP
      BEGIN
        EXECUTE format('UPDATE %I.%I SET %I = $1 WHERE ctid = $2', r.sch, r.tbl, r.col)
          USING p_keep, ct;
        v_moved := v_moved + 1;
      EXCEPTION
        WHEN unique_violation OR exclusion_violation THEN
          -- У выжившего уже есть такая связь — строка дубля лишняя.
          EXECUTE format('DELETE FROM %I.%I WHERE ctid = $1', r.sch, r.tbl) USING ct;
          v_dropped := v_dropped + 1;
      END;
    END LOOP;
  END LOOP;

  -- 2. Применить выбранные поля на выжившего (только присутствующие ключи).
  UPDATE persons SET
    last_name       = CASE WHEN p_keep_fields ? 'last_name'       THEN NULLIF(p_keep_fields->>'last_name','')                       ELSE last_name END,
    first_name      = CASE WHEN p_keep_fields ? 'first_name'      THEN COALESCE(NULLIF(p_keep_fields->>'first_name',''), first_name) ELSE first_name END,
    middle_name     = CASE WHEN p_keep_fields ? 'middle_name'     THEN NULLIF(p_keep_fields->>'middle_name','')                     ELSE middle_name END,
    hebrew_name     = CASE WHEN p_keep_fields ? 'hebrew_name'     THEN NULLIF(p_keep_fields->>'hebrew_name','')                     ELSE hebrew_name END,
    email           = CASE WHEN p_keep_fields ? 'email'           THEN NULLIF(p_keep_fields->>'email','')                          ELSE email END,
    gender          = CASE WHEN p_keep_fields ? 'gender'          THEN NULLIF(p_keep_fields->>'gender','')                         ELSE gender END,
    birth_date      = CASE WHEN p_keep_fields ? 'birth_date'      THEN NULLIF(p_keep_fields->>'birth_date','')::date               ELSE birth_date END,
    passport_number = CASE WHEN p_keep_fields ? 'passport_number' THEN NULLIF(p_keep_fields->>'passport_number','')                ELSE passport_number END,
    marital_status  = CASE WHEN p_keep_fields ? 'marital_status'  THEN NULLIF(p_keep_fields->>'marital_status','')                 ELSE marital_status END,
    nationality     = CASE WHEN p_keep_fields ? 'nationality'     THEN NULLIF(p_keep_fields->>'nationality','')                    ELSE nationality END,
    photo_url       = CASE WHEN p_keep_fields ? 'photo_url'       THEN NULLIF(p_keep_fields->>'photo_url','')                      ELSE photo_url END,
    phones          = CASE WHEN p_keep_fields ? 'phones'          THEN COALESCE(p_keep_fields->'phones', phones)                   ELSE phones END,
    address         = CASE WHEN p_keep_fields ? 'address'         THEN COALESCE(p_keep_fields->'address', address)                 ELSE address END
  WHERE id = p_keep;

  -- 3. Удалить дубль (ссылок на него уже нет).
  DELETE FROM persons WHERE id = p_remove;

  RETURN jsonb_build_object(
    'kept', p_keep,
    'removed', p_remove,
    'refs_moved', v_moved,
    'refs_dropped', v_dropped
  );
END;
$$;
