-- ═════════════════════════════════════════════════════════════════════
-- Эксплуатация / Обслуживание (Maintenance) — MVP: заявки на ремонт и
-- обслуживание помещений кампуса.
--
-- Одна таблица:
--   • maintenance_requests — заявка: что сломано, где (здание/комната
--     общежития ИЛИ свободный текст локации), категория, приоритет, статус,
--     кто подал / на кого назначено, время подачи и закрытия.
--
-- Локация заявки может ссылаться на dorm_buildings/dorm_rooms (ON DELETE SET
-- NULL — удаление здания не удаляет историю заявок, только обнуляет ссылку) и
-- дополняется свободным текстом location_text. Модуль decoupled: имена
-- здания/комнаты резолвятся ПАКЕТНО в API (см. lib/maintenance/locations-server.ts),
-- без завязки на права модуля «Общежитие».
--
-- SLA/просрочка (is_overdue) и валидность перехода статуса (canTransition) —
-- чистая логика в lib/maintenance/tickets.ts (покрыта vitest), НЕ в БД.
--
-- Права: НОВЫХ привилегий не изобретаем — модуль 'maintenance' с привилегиями
-- 'view' / 'manage'. Каталог module_privileges досеивается идемпотентно (на
-- случай неполного сида 002 на боевой БД) и выдаётся системным ролям
-- scope='all' — тот же паттерн, что 20260707130000_food.sql (иначе НИ ОДИН
-- пользователь, включая superadmin, не проходит requireMaintenancePrivilege).
-- ВНИМАНИЕ: сид 002 может уже содержать другие привилегии 'maintenance' — их не
-- трогаем, только ДОБАВЛЯЕМ 'view'/'manage' (ON CONFLICT DO NOTHING).
--
-- Идемпотентно: CREATE TABLE IF NOT EXISTS; DROP TRIGGER IF EXISTS + CREATE;
-- set_updated_at() определяется здесь же через CREATE OR REPLACE.
--
-- ЗАВИСИМОСТЬ: должна применяться ПОСЛЕ 20260707120000_dormitory.sql — FK на
-- dorm_buildings/dorm_rooms требует существования этих таблиц.
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 0. set_updated_at() — на случай если функции ещё нет в целевой БД
--    (идентична версии проекта)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
$$;


-- ─────────────────────────────────────────────
-- 1. MAINTENANCE_REQUESTS (заявки на обслуживание)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS maintenance_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  description    TEXT,
  building_id    UUID REFERENCES dorm_buildings(id) ON DELETE SET NULL,
  room_id        UUID REFERENCES dorm_rooms(id) ON DELETE SET NULL,
  location_text  TEXT,
  category       TEXT NOT NULL CHECK (category IN ('plumbing', 'electrical', 'furniture', 'cleaning', 'appliance', 'other')) DEFAULT 'other',
  priority       TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')) DEFAULT 'normal',
  status         TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'cancelled')) DEFAULT 'open',
  reported_by    UUID,
  assigned_to    UUID,
  reported_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_requests_status      ON maintenance_requests(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_priority    ON maintenance_requests(priority);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_assigned_to ON maintenance_requests(assigned_to);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_building    ON maintenance_requests(building_id);

DROP TRIGGER IF EXISTS set_updated_at_maintenance_requests ON maintenance_requests;
CREATE TRIGGER set_updated_at_maintenance_requests
  BEFORE UPDATE ON maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 2. Права модуля 'maintenance' — issue #1 grant block.
--    Каталог module_privileges ('maintenance','view'/'manage') досеивается
--    идемпотентно (сид 002 на боевой БД неполон), затем выдаётся системным
--    ролям scope='all'. Паттерн идентичен 20260707130000_food.sql.
--    NB: сид 002 мог уже завести другие привилегии 'maintenance' —
--    ON CONFLICT DO NOTHING их сохраняет, мы лишь добавляем view/manage.
-- ─────────────────────────────────────────────

INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('maintenance', 'view',   'Просмотр',   1),
  ('maintenance', 'manage', 'Управление', 2)
ON CONFLICT (module, privilege_code) DO NOTHING;

DO $$
DECLARE
  rcode TEXT;
  pcode TEXT;
  rid   UUID;
BEGIN
  FOREACH rcode IN ARRAY ARRAY['superadmin', 'tech_admin', 'campus_president']
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;

    -- Только view/manage: если сид 002 завёл иные привилегии 'maintenance',
    -- их НЕ выдаём (в отличие от food-паттерна, где кроме view/manage ничего
    -- нет). См. спецификацию модуля.
    FOREACH pcode IN ARRAY ARRAY['view', 'manage']
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'maintenance', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;
