-- ═════════════════════════════════════════════════════════════════════
-- Питание (Food & Dining) — MVP: планы питания, записи студентов, диет-профили.
--
-- Три таблицы:
--   • meal_plans        — планы питания (какие приёмы пищи включены, цена,
--     период, активность).
--   • meal_enrollments  — запись студента (journey) на план на диапазон дат,
--     статус active/ended. Правило: у студента одна АКТИВНАЯ запись на
--     пересекающемся диапазоне (проверяется в API, см. lib/food/enrollment.ts).
--   • dietary_profiles  — диет-ограничения/аллергии студента, один на journey.
--
-- Записи висят на education_journeys(id) студента (journey_id), НЕ на persons —
-- тот же приём анкоринга, что в остальных учебных модулях.
--
-- Права: НОВЫХ привилегий не изобретаем — модуль 'food' с привилегиями
-- 'view' / 'manage'. Каталог module_privileges досеивается идемпотентно (на
-- случай неполного сида 002 на боевой БД) и выдаётся системным ролям
-- scope='all' — тот же паттерн, что 20260707120000_dormitory.sql (иначе
-- НИ ОДИН пользователь, включая superadmin, не проходит requireFoodPrivilege).
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
-- 1. MEAL_PLANS (планы питания)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meal_plans (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  code               TEXT,
  description        TEXT,
  includes_breakfast BOOLEAN NOT NULL DEFAULT true,
  includes_lunch     BOOLEAN NOT NULL DEFAULT true,
  includes_dinner    BOOLEAN NOT NULL DEFAULT true,
  price              NUMERIC(12,2),
  period_label       TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at_meal_plans ON meal_plans;
CREATE TRIGGER set_updated_at_meal_plans
  BEFORE UPDATE ON meal_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 2. MEAL_ENROLLMENTS (запись студента на план)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meal_enrollments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id   UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  journey_id     UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  enrolled_from  DATE NOT NULL,
  enrolled_to    DATE,
  status         TEXT NOT NULL CHECK (status IN ('active', 'ended')) DEFAULT 'active',
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (enrolled_to IS NULL OR enrolled_to >= enrolled_from)
);

CREATE INDEX IF NOT EXISTS idx_meal_enrollments_plan    ON meal_enrollments(meal_plan_id);
CREATE INDEX IF NOT EXISTS idx_meal_enrollments_journey ON meal_enrollments(journey_id);
-- Частичный индекс: быстрый поиск ТЕКУЩЕЙ записи студента (для проверки
-- двойной записи и колонки «план» в списке студентов).
CREATE INDEX IF NOT EXISTS idx_meal_enrollments_active_journey
  ON meal_enrollments(journey_id) WHERE status = 'active';

DROP TRIGGER IF EXISTS set_updated_at_meal_enrollments ON meal_enrollments;
CREATE TRIGGER set_updated_at_meal_enrollments
  BEFORE UPDATE ON meal_enrollments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 3. DIETARY_PROFILES (диет-профиль студента, один на journey)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dietary_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id    UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  restrictions  TEXT,
  allergies     TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (journey_id)
);

DROP TRIGGER IF EXISTS set_updated_at_dietary_profiles ON dietary_profiles;
CREATE TRIGGER set_updated_at_dietary_profiles
  BEFORE UPDATE ON dietary_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 4. Права модуля 'food' — issue #1 grant block.
--    Каталог module_privileges ('food','view'/'manage') досеивается
--    идемпотентно (сид 002 на боевой БД неполон), затем выдаётся системным
--    ролям scope='all'. Паттерн идентичен 20260707120000_dormitory.sql.
-- ─────────────────────────────────────────────

INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('food', 'view',   'Просмотр',   1),
  ('food', 'manage', 'Управление', 2)
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

    FOR pcode IN SELECT privilege_code FROM module_privileges WHERE module = 'food'
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'food', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;
