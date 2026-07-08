-- ═════════════════════════════════════════════════════════════════════
-- Безопасность / אבטחה (Security) — MVP: журнал инцидентов безопасности
-- кампуса с рабочим процессом статусов.
--
-- Одна таблица:
--   • security_incidents — инцидент: что произошло, когда (occurred_at), где
--     (здание общежития ИЛИ свободный текст локации), категория, серьёзность,
--     статус, кто сообщил / на кого назначено, разрешение и время разрешения.
--
-- Место инцидента может ссылаться на dorm_buildings (ON DELETE SET NULL —
-- удаление здания не удаляет историю инцидентов, только обнуляет ссылку) и
-- дополняется свободным текстом location_text. Модуль decoupled: имя здания
-- резолвится ПАКЕТНО в API (см. lib/security/locations-server.ts), без завязки
-- на права модуля «Общежитие».
--
-- Ранг серьёзности (сортировка) и валидность перехода статуса (canTransition) —
-- чистая логика в lib/security/incidents.ts (покрыта vitest), НЕ в БД.
--
-- Права: НОВЫХ имён привилегий не изобретаем — модуль 'security' с привилегиями
-- 'view' / 'manage'. ВНИМАНИЕ: сид 002 УЖЕ содержит для 'security' привилегии
-- 'view' (sort_order 1), 'manage_access' (2), 'view_logs' (3). Их НЕ трогаем:
-- ON CONFLICT DO NOTHING сохраняет 'view'; ДОБАВЛЯЕМ только 'manage' на
-- свободном sort_order 4. Гранты scope='all' системным ролям выдаются лишь на
-- 'view'/'manage' (тот же приём, что 20260707140000_maintenance.sql — иначе НИ
-- ОДИН пользователь, включая superadmin, не проходит requireSecurityPrivilege).
--
-- Идемпотентно: CREATE TABLE IF NOT EXISTS; DROP TRIGGER IF EXISTS + CREATE;
-- set_updated_at() определяется здесь же через CREATE OR REPLACE.
--
-- ЗАВИСИМОСТЬ: должна применяться ПОСЛЕ 20260707120000_dormitory.sql — FK на
-- dorm_buildings требует существования этой таблицы.
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
-- 1. SECURITY_INCIDENTS (инциденты безопасности)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS security_incidents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  building_id    UUID REFERENCES dorm_buildings(id) ON DELETE SET NULL,
  location_text  TEXT,
  category       TEXT NOT NULL CHECK (category IN ('theft', 'vandalism', 'trespassing', 'altercation', 'fire', 'medical', 'property_damage', 'other')) DEFAULT 'other',
  severity       TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  title          TEXT NOT NULL,
  description    TEXT,
  status         TEXT NOT NULL CHECK (status IN ('open', 'investigating', 'resolved', 'closed')) DEFAULT 'open',
  reported_by    UUID,
  assigned_to    UUID,
  resolution     TEXT,
  resolved_at    TIMESTAMPTZ,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_incidents_status   ON security_incidents(status);
CREATE INDEX IF NOT EXISTS idx_security_incidents_severity ON security_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_security_incidents_category ON security_incidents(category);
CREATE INDEX IF NOT EXISTS idx_security_incidents_building ON security_incidents(building_id);

DROP TRIGGER IF EXISTS set_updated_at_security_incidents ON security_incidents;
CREATE TRIGGER set_updated_at_security_incidents
  BEFORE UPDATE ON security_incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 2. Права модуля 'security' — issue #1 grant block.
--    Каталог module_privileges ('security','view'/'manage') досеивается
--    идемпотентно, затем выдаётся системным ролям scope='all'. Паттерн
--    идентичен 20260707140000_maintenance.sql.
--    NB: сид 002 уже завёл 'security': 'view' (sort_order 1), 'manage_access'
--    (2), 'view_logs' (3). ON CONFLICT DO NOTHING их сохраняет; мы лишь
--    ДОБАВЛЯЕМ 'manage' на свободном sort_order 4. 'view' повторяем на
--    sort_order 1 — если сид 002 на боевой БД неполон, INSERT его заведёт;
--    иначе no-op.
-- ─────────────────────────────────────────────

INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('security', 'view',   'Просмотр',   1),
  ('security', 'manage', 'Управление', 4)
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

    -- Только view/manage: прочие привилегии 'security' из сида 002
    -- (manage_access, view_logs) НЕ выдаём — модуль их не использует.
    FOREACH pcode IN ARRAY ARRAY['view', 'manage']
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'security', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;
