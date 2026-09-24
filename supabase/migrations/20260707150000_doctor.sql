-- ═════════════════════════════════════════════════════════════════════
-- Медпункт / Врач (Doctor / Clinic) — MVP: медкарты студентов и приёмы.
--
-- Две таблицы:
--   • medical_profiles — медкарта студента (группа крови, хронические
--     заболевания, аллергии, лекарства, экстренный контакт, заметки). Один
--     профиль на journey (UNIQUE journey_id) — зеркалит dietary_profiles.
--   • medical_visits   — журнал приёмов: дата, причина, диагноз, лечение, кто
--     принял, дата контрольного визита, статус open/closed.
--
-- Записи висят на education_journeys(id) студента (journey_id), НЕ на persons —
-- тот же приём анкоринга, что в остальных учебных модулях (food/dormitory).
--
-- Расчёты по контрольным визитам (upcoming/overdue) и валидность перехода
-- статуса (open↔closed) — чистая логика в lib/doctor/medical.ts (покрыта
-- vitest), НЕ в БД.
--
-- Права: НОВЫХ привилегий не изобретаем — модуль 'doctor' с привилегиями
-- 'view' / 'manage'. Каталог module_privileges досеивается идемпотентно (на
-- случай неполного сида 002 на боевой БД) и выдаётся системным ролям
-- scope='all' — тот же паттерн, что 20260707140000_maintenance.sql (иначе
-- НИ ОДИН пользователь, включая superadmin, не проходит requireDoctorPrivilege).
-- ВНИМАНИЕ: сид 002 УЖЕ содержит другие привилегии 'doctor' (view/create/edit) —
-- их НЕ трогаем, только ДОБАВЛЯЕМ 'manage' (view уже есть → ON CONFLICT DO
-- NOTHING) и выдаём системным ролям ТОЛЬКО view/manage.
--
-- ЧУВСТВИТЕЛЬНЫЕ МЕДИЦИНСКИЕ ДАННЫЕ: каждый маршрут API гейтится doctor.view /
-- doctor.manage; страницы /dashboard/doctor защищены middleware (PROTECTED_MODULES).
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
-- 1. MEDICAL_PROFILES (медкарта студента, одна на journey)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS medical_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id          UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  blood_type          TEXT,
  chronic_conditions  TEXT,
  allergies           TEXT,
  medications         TEXT,
  emergency_contact   TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (journey_id)
);

DROP TRIGGER IF EXISTS set_updated_at_medical_profiles ON medical_profiles;
CREATE TRIGGER set_updated_at_medical_profiles
  BEFORE UPDATE ON medical_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 2. MEDICAL_VISITS (журнал приёмов)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS medical_visits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id      UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  visit_date      DATE NOT NULL,
  reason          TEXT,
  diagnosis       TEXT,
  treatment       TEXT,
  attended_by     UUID,
  follow_up_date  DATE,
  status          TEXT NOT NULL CHECK (status IN ('open', 'closed')) DEFAULT 'open',
  notes           TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medical_visits_journey ON medical_visits(journey_id);
CREATE INDEX IF NOT EXISTS idx_medical_visits_status  ON medical_visits(status);
-- Частичный индекс: быстрый worklist контрольных визитов (открытые с датой).
CREATE INDEX IF NOT EXISTS idx_medical_visits_open_followup
  ON medical_visits(follow_up_date) WHERE status = 'open';

DROP TRIGGER IF EXISTS set_updated_at_medical_visits ON medical_visits;
CREATE TRIGGER set_updated_at_medical_visits
  BEFORE UPDATE ON medical_visits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 3. Права модуля 'doctor' — issue #1 grant block.
--    Каталог module_privileges ('doctor','view'/'manage') досеивается
--    идемпотентно, затем выдаётся системным ролям scope='all'. Паттерн
--    идентичен 20260707140000_maintenance.sql.
--    NB: сид 002 УЖЕ завёл привилегии 'doctor' view/create/edit —
--    ON CONFLICT DO NOTHING их сохраняет, мы лишь добавляем 'manage'.
--    Системным ролям выдаём ТОЛЬКО view/manage (не create/edit).
-- ─────────────────────────────────────────────

INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('doctor', 'view',   'Просмотр',   1),
  ('doctor', 'manage', 'Управление', 4)
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

    -- Только view/manage: если сид 002 завёл иные привилегии 'doctor'
    -- (create/edit), их НЕ выдаём. См. спецификацию модуля.
    FOREACH pcode IN ARRAY ARRAY['view', 'manage']
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'doctor', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;
