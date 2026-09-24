-- Журнал изменений: «кто изменил» для записей через обычный PostgREST +
-- аудит учебных единиц (departments) и дерева отображения прав
-- (security_tree_nodes / security_tree_items).
--
-- ПРОБЛЕМА. audit_log_trigger() (20260702170000) берёт автора только из
-- app.current_actor_id, а его выставляют лишь несколько RPC. Экран «Безопасность
-- данных» пишет обычными insert/update/delete через PostgREST под service_role,
-- и выставить set_config «заранее» нельзя: каждый HTTP-запрос PostgREST — своя
-- транзакция, отдельный вызов set_config до неё не доживает. Итог: changed_by
-- всегда NULL, хотя экран обещает «с именем и датой».
--
-- РЕШЕНИЕ. PostgREST кладёт заголовки КАЖДОГО запроса в GUC request.headers
-- (JSON) на время той же транзакции, в которой выполняется запись. Сервер
-- приложения (lib/supabase/server.ts, createServerClient({ actorPersonId }))
-- посылает заголовок x-campus-actor-id с person_id вошедшего пользователя, а
-- триггер читает его, если app.current_actor_id не выставлен. Колонки в
-- таблицы не добавляются — поэтому код приложения одинаково работает и до, и
-- после этой миграции (до неё заголовок просто никто не читает).
--
-- Почему не колонка updated_by: DELETE не несёт новых значений, автора
-- удаления так не передать без лишнего «пустого» update перед удалением.
-- Почему не явная строка audit_log из API: триггер всё равно пишет свою строку
-- (без автора) — были бы дубли, а таблицы, которые правятся мимо API, остались бы
-- с одной «безымянной» строкой.
--
-- Доверие к заголовку: писать в таблицы public может только service_role
-- (RLS включён на всех таблицах без политик, 20260908120000), то есть только
-- сервер приложения. Заголовок проверяется на формат UUID и на наличие такого
-- человека в persons; иначе автор = NULL. Ошибка в заголовке НИКОГДА не
-- срывает саму запись.
--
-- Идемпотентна: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.

-- ─── 1. Триггерная функция v2 ────────────────────────────────────────────────
-- Отличия от v1:
--   • автор: app.current_actor_id → иначе заголовок x-campus-actor-id;
--     безопасное приведение к uuid (мусор → NULL, а не исключение);
--     несуществующий в persons → NULL (иначе FK changed_by сорвал бы запись);
--   • идентификатор сущности берётся из колонки TG_ARGV[0] (по умолчанию id) —
--     у security_tree_items нет колонки id, первичный ключ (module,
--     privilege_code); для неё передаём node_id (узел, где лежит право);
--   • updated_by, если когда-нибудь появится, как и updated_at, не считается
--     значимым изменением.
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_changed_fields text[] := ARRAY[]::text[];
  v_actor_text text;
  v_actor uuid;
  v_key text;
  v_id_col text := COALESCE(NULLIF(TG_ARGV[0], ''), 'id');
  v_entity_id uuid;
  v_uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  -- Автор: сначала явный set_config из RPC, затем заголовок запроса PostgREST.
  v_actor_text := NULLIF(current_setting('app.current_actor_id', true), '');
  IF v_actor_text IS NULL THEN
    BEGIN
      v_actor_text := NULLIF(current_setting('request.headers', true), '')::json ->> 'x-campus-actor-id';
    EXCEPTION WHEN OTHERS THEN
      v_actor_text := NULL;  -- битый JSON в GUC не должен срывать запись
    END;
  END IF;
  IF v_actor_text IS NOT NULL AND v_actor_text ~ v_uuid_re THEN
    v_actor := v_actor_text::uuid;
    IF NOT EXISTS (SELECT 1 FROM persons WHERE id = v_actor) THEN
      v_actor := NULL;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_entity_id := CASE WHEN (v_old ->> v_id_col) ~ v_uuid_re THEN (v_old ->> v_id_col)::uuid END;
    IF v_entity_id IS NOT NULL THEN
      INSERT INTO audit_log (entity_type, entity_id, action, old_data, new_data, changed_by)
      VALUES (TG_TABLE_NAME, v_entity_id, 'delete', v_old, NULL, v_actor);
    END IF;
    RETURN OLD;
  END IF;

  v_new := to_jsonb(NEW);
  v_entity_id := CASE WHEN (v_new ->> v_id_col) ~ v_uuid_re THEN (v_new ->> v_id_col)::uuid END;
  IF v_entity_id IS NULL THEN
    RETURN NEW;  -- некуда привязать запись; саму операцию не срываем
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (entity_type, entity_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, v_entity_id, 'create', NULL, v_new, v_actor);
    RETURN NEW;
  END IF;

  -- UPDATE: считаем реально изменившиеся поля, кроме служебных
  v_old := to_jsonb(OLD);
  FOR v_key IN SELECT jsonb_object_keys(v_new)
  LOOP
    IF v_key IN ('updated_at', 'updated_by') THEN CONTINUE; END IF;
    IF v_old -> v_key IS DISTINCT FROM v_new -> v_key THEN
      v_changed_fields := array_append(v_changed_fields, v_key);
    END IF;
  END LOOP;

  IF array_length(v_changed_fields, 1) IS NULL THEN
    RETURN NEW; -- ничего значимого не поменялось
  END IF;

  INSERT INTO audit_log (entity_type, entity_id, action, old_data, new_data, changed_fields, changed_by)
  VALUES (TG_TABLE_NAME, v_entity_id, 'update', v_old, v_new, v_changed_fields, v_actor);
  RETURN NEW;
END;
$$;

-- ─── 2. Учебные единицы (departments) — граница доступа ─────────────────────
DROP TRIGGER IF EXISTS trg_audit_log ON departments;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON departments
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- ─── 3. Дерево отображения прав ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_log ON security_tree_nodes;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON security_tree_nodes
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- У security_tree_items нет колонки id → entity_id = node_id (узел, в котором
-- лежит право). Какое именно право — видно в old_data/new_data
-- (module, privilege_code).
DROP TRIGGER IF EXISTS trg_audit_log ON security_tree_items;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON security_tree_items
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger('node_id');
