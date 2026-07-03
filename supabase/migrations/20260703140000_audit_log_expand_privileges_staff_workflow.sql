-- Расширение audit_log на таблицы модулей, затронутых в этой сессии
-- (привилегии, персонал, workflow). Инкрементально, как договорено — не
-- блэнкет-подключение ко всем таблицам сразу.
--
-- Триггерная функция audit_log_trigger() уже создана в 20260702170000 и
-- универсальна (любая таблица с PK "id"). Здесь только вешаем её на новые
-- таблицы. "Что/когда" фиксируется всегда; "кто" (changed_by) — только если
-- пишущий код выставил app.current_actor_id:
--   • staff_positions/staff_profiles: заполняется при создании через RPC
--     create_staff_member (там есть set_config), но НЕ при увольнении
--     (DELETE /api/staff/[profileId] — обычный PostgREST-update) и не при
--     прочих прямых правках. Тогда changed_by = NULL, запись не теряется.
--   • role_privileges/person_privileges: пишутся из settings-эндпоинтов
--     обычным PostgREST (superadmin) → changed_by = NULL. Всё равно ценно:
--     видно, КАКОЙ доступ и КОГДА менялся.
--   • process_instances/stage_instances: пишутся workflow-RPC, которые пока
--     не вызывают set_config → changed_by = NULL. Полная атрибуция «кто» для
--     workflow — отдельный follow-up (добавить одну строку set_config в 5
--     RPC).
--
-- tasks сознательно НЕ подключаем сейчас: высокий объём изменений статусов,
-- аудит задач менее приоритетен, чем безопасность/HR/жизненный цикл процесса.

-- ── Привилегии (изменения доступа — security-critical) ──────────────────────
DROP TRIGGER IF EXISTS trg_audit_log ON role_privileges;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON role_privileges
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_log ON person_privileges;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON person_privileges
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- ── Персонал (приём/увольнение/должности) ───────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_log ON staff_positions;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON staff_positions
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_log ON staff_profiles;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON staff_profiles
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- ── Workflow (жизненный цикл процесса и подэтапов) ──────────────────────────
DROP TRIGGER IF EXISTS trg_audit_log ON process_instances;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON process_instances
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_log ON stage_instances;
CREATE TRIGGER trg_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON stage_instances
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
