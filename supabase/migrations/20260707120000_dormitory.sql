-- ═════════════════════════════════════════════════════════════════════
-- Общежитие (Dormitory) — MVP: здания, комнаты, назначения студентов.
--
-- Три таблицы:
--   • dorm_buildings   — здания общежития (пол, адрес, активность).
--   • dorm_rooms       — комнаты здания (этаж, вместимость). UNIQUE номер
--     комнаты в пределах здания.
--   • dorm_assignments — назначение студента (journey) в комнату на диапазон
--     дат, статус active/ended. Занятость и баланс мест НЕ хранятся —
--     считаются при чтении (см. lib/dormitory/occupancy.ts).
--
-- Назначения висят на education_journeys(id) студента (journey_id), НЕ на
-- persons — тот же приём анкоринга, что в остальных учебных модулях.
--
-- Права: НОВЫХ привилегий не изобретаем — модуль 'dormitory' с привилегиями
-- 'view' / 'manage'. Каталог module_privileges досеивается идемпотентно (на
-- случай неполного сида 002 на боевой БД) и выдаётся системным ролям
-- scope='all' — тот же паттерн, что 20260705130000_alumni_graduation.sql
-- (иначе НИ ОДИН пользователь, включая superadmin, не проходит
-- requireDormitoryPrivilege).
--
-- Идемпотентно: CREATE TABLE IF NOT EXISTS; DROP TRIGGER IF EXISTS + CREATE;
-- set_updated_at() определяется здесь же через CREATE OR REPLACE.
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
-- 1. DORM_BUILDINGS (здания общежития)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dorm_buildings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  code        TEXT,
  gender      TEXT CHECK (gender IN ('male', 'female', 'mixed')) DEFAULT 'mixed',
  address     TEXT,
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at_dorm_buildings ON dorm_buildings;
CREATE TRIGGER set_updated_at_dorm_buildings
  BEFORE UPDATE ON dorm_buildings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 2. DORM_ROOMS (комнаты здания)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dorm_rooms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id  UUID NOT NULL REFERENCES dorm_buildings(id) ON DELETE CASCADE,
  room_number  TEXT NOT NULL,
  floor        INT,
  capacity     INT NOT NULL CHECK (capacity > 0),
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (building_id, room_number)
);

CREATE INDEX IF NOT EXISTS idx_dorm_rooms_building ON dorm_rooms(building_id);

DROP TRIGGER IF EXISTS set_updated_at_dorm_rooms ON dorm_rooms;
CREATE TRIGGER set_updated_at_dorm_rooms
  BEFORE UPDATE ON dorm_rooms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 3. DORM_ASSIGNMENTS (назначение студента в комнату)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dorm_assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id        UUID NOT NULL REFERENCES dorm_rooms(id) ON DELETE CASCADE,
  journey_id     UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  assigned_from  DATE NOT NULL,
  assigned_to    DATE,
  status         TEXT NOT NULL CHECK (status IN ('active', 'ended')) DEFAULT 'active',
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (assigned_to IS NULL OR assigned_to >= assigned_from)
);

CREATE INDEX IF NOT EXISTS idx_dorm_assignments_room    ON dorm_assignments(room_id);
CREATE INDEX IF NOT EXISTS idx_dorm_assignments_journey ON dorm_assignments(journey_id);
-- Частичный индекс: быстрый поиск ТЕКУЩЕГО назначения студента (для проверки
-- двойного бронирования и колонки «комната» в списке студентов).
CREATE INDEX IF NOT EXISTS idx_dorm_assignments_active_journey
  ON dorm_assignments(journey_id) WHERE status = 'active';

DROP TRIGGER IF EXISTS set_updated_at_dorm_assignments ON dorm_assignments;
CREATE TRIGGER set_updated_at_dorm_assignments
  BEFORE UPDATE ON dorm_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 4. Права модуля 'dormitory' — issue #1 grant block.
--    Каталог module_privileges ('dormitory','view'/'manage') досеивается
--    идемпотентно (сид 002 на боевой БД неполон), затем выдаётся системным
--    ролям scope='all'. Паттерн идентичен 20260705130000_alumni_graduation.sql.
-- ─────────────────────────────────────────────

INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('dormitory', 'view',   'Просмотр',   1),
  ('dormitory', 'manage', 'Управление', 2)
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

    FOR pcode IN SELECT privilege_code FROM module_privileges WHERE module = 'dormitory'
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'dormitory', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;
