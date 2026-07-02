-- Универсальный audit log — "что изменилось и когда" через триггер на самой
-- таблице (нельзя забыть, работает при любом способе записи — RPC, обычный
-- insert/update через PostgREST, или прямой SQL). "Кто" — опционально:
-- если вызывающий код (RPC-функция) заранее выставил
-- set_config('app.current_actor_id', ..., true) в рамках своей транзакции —
-- триггер его подхватит. Если нет — changed_by остаётся NULL, но сама запись
-- об изменении не теряется.
--
-- Осознанное ограничение: НЕ настраиваем это на уровне PostgREST/заголовков
-- запроса для всех ~90 endpoints — это отдельная, куда более дорогая задача
-- (см. обсуждение). Здесь только: (1) триггер, который сам по себе уже видит
-- каждое изменение на подключённых таблицах, и (2) точка расширения
-- (set_config), которой уже пользуются RPC-функции нового образца.

-- 1. Таблица
CREATE TABLE IF NOT EXISTS audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    TEXT NOT NULL,
  entity_id      UUID NOT NULL,
  action         TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  old_data       JSONB,
  new_data       JSONB,
  changed_fields TEXT[],
  changed_by     UUID REFERENCES persons(id),
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by ON audit_log(changed_by) WHERE changed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON audit_log(changed_at);

-- 2. Универсальная триггерная функция — вешается на любую таблицу с PK "id"
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_changed_fields text[] := ARRAY[]::text[];
  v_actor uuid;
  v_key text;
BEGIN
  v_actor := NULLIF(current_setting('app.current_actor_id', true), '')::uuid;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (entity_type, entity_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'delete', to_jsonb(OLD), NULL, v_actor);
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (entity_type, entity_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'create', NULL, to_jsonb(NEW), v_actor);
    RETURN NEW;
  END IF;

  -- UPDATE: считаем реально изменившиеся поля, кроме updated_at
  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);
  FOR v_key IN SELECT jsonb_object_keys(v_new)
  LOOP
    IF v_key = 'updated_at' THEN CONTINUE; END IF;
    IF v_old -> v_key IS DISTINCT FROM v_new -> v_key THEN
      v_changed_fields := array_append(v_changed_fields, v_key);
    END IF;
  END LOOP;

  IF array_length(v_changed_fields, 1) IS NULL THEN
    RETURN NEW; -- ничего значимого не поменялось (например, только updated_at)
  END IF;

  INSERT INTO audit_log (entity_type, entity_id, action, old_data, new_data, changed_fields, changed_by)
  VALUES (TG_TABLE_NAME, NEW.id, 'update', v_old, v_new, v_changed_fields, v_actor);
  RETURN NEW;
END;
$$;

-- 3. Подключаем к первым двум таблицам — persons и education_journeys
--    (те же таблицы, для которых только что закрыли доступ по привилегиям).
--    Расширение на другие таблицы — отдельными миграциями по мере надобности.
DROP TRIGGER IF EXISTS trg_audit_log ON persons;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON persons
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_log ON education_journeys;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON education_journeys
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- 4. create_application теперь передаёт актёра через set_config — тот же
--    payload->>'actor_id', что уже передавался (использовался только для
--    person_status_history). Пересоздаём функцию с одной добавленной строкой
--    в самом начале.
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
  PERFORM set_config('app.current_actor_id', NULLIF(payload->>'actor_id', ''), true);

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
