-- ═════════════════════════════════════════════════════════════════════
-- Психолог / Консультации (Psychologist / Counseling) — MVP: карты
-- психологического сопровождения студентов и журнал консультаций.
--
-- Две таблицы:
--   • psych_profiles  — карта сопровождения студента (жалобы, анамнез, уровень
--     риска, источник направления, заметки). Одна карта на journey
--     (UNIQUE journey_id) — зеркалит medical_profiles модуля «Врач».
--   • psych_sessions  — журнал консультаций: дата, тип (intake/followup/crisis/
--     group/other), краткое содержание, дата контроля, статус open/closed, кто
--     провёл (counselor_id), кто внёс (created_by).
--
-- Записи висят на education_journeys(id) студента (journey_id), НЕ на persons —
-- тот же приём анкоринга, что в остальных учебных модулях (doctor/food/dormitory).
--
-- Расчёты по контрольным консультациям (upcoming/overdue) и валидность перехода
-- статуса (open↔closed) — чистая логика в lib/psychologist/counseling.ts (покрыта
-- vitest), НЕ в БД.
--
-- Права: НОВЫХ привилегий не изобретаем — модуль 'psychologist' с привилегиями
-- 'view' / 'manage'. Каталог module_privileges досеивается идемпотентно (на
-- случай неполного сида 002 на боевой БД) и выдаётся системным ролям
-- scope='all' — тот же паттерн, что 20260707150000_doctor.sql (иначе НИ ОДИН
-- пользователь, включая superadmin, не проходит requirePsychologistPrivilege).
-- ВНИМАНИЕ: сид 002 УЖЕ содержит другие привилегии 'psychologist'
-- (view/create/edit, sort_order 1/2/3) — их НЕ трогаем, только ДОБАВЛЯЕМ 'manage'
-- (sort_order 4 — первый свободный; view уже есть → ON CONFLICT DO NOTHING) и
-- выдаём системным ролям ТОЛЬКО view/manage.
--
-- ЧУВСТВИТЕЛЬНЫЕ ДАННЫЕ О ПСИХИЧЕСКОМ ЗДОРОВЬЕ: каждый маршрут API гейтится
-- psychologist.view / psychologist.manage; страницы /dashboard/psychologist
-- защищены middleware (PROTECTED_MODULES уже содержит 'psychologist').
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
-- 1. PSYCH_PROFILES (карта сопровождения студента, одна на journey)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS psych_profiles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id           UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  presenting_concerns  TEXT,
  background           TEXT,
  risk_level           TEXT NOT NULL CHECK (risk_level IN ('none', 'low', 'medium', 'high')) DEFAULT 'none',
  referral_source      TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (journey_id)
);

DROP TRIGGER IF EXISTS set_updated_at_psych_profiles ON psych_profiles;
CREATE TRIGGER set_updated_at_psych_profiles
  BEFORE UPDATE ON psych_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 2. PSYCH_SESSIONS (журнал консультаций)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS psych_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id      UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  session_date    DATE NOT NULL,
  session_type    TEXT NOT NULL CHECK (session_type IN ('intake', 'followup', 'crisis', 'group', 'other')) DEFAULT 'followup',
  summary         TEXT,
  follow_up_date  DATE,
  status          TEXT NOT NULL CHECK (status IN ('open', 'closed')) DEFAULT 'open',
  counselor_id    UUID,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psych_sessions_journey ON psych_sessions(journey_id);
CREATE INDEX IF NOT EXISTS idx_psych_sessions_status  ON psych_sessions(status);
-- Частичный индекс: быстрый worklist контрольных консультаций (открытые с датой).
CREATE INDEX IF NOT EXISTS idx_psych_sessions_open_followup
  ON psych_sessions(follow_up_date) WHERE status = 'open';

DROP TRIGGER IF EXISTS set_updated_at_psych_sessions ON psych_sessions;
CREATE TRIGGER set_updated_at_psych_sessions
  BEFORE UPDATE ON psych_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 3. Права модуля 'psychologist' — issue #1 grant block.
--    Каталог module_privileges ('psychologist','view'/'manage') досеивается
--    идемпотентно, затем выдаётся системным ролям scope='all'. Паттерн
--    идентичен 20260707150000_doctor.sql.
--    NB: сид 002 УЖЕ завёл привилегии 'psychologist' view/create/edit
--    (sort_order 1/2/3) — ON CONFLICT DO NOTHING их сохраняет, мы лишь добавляем
--    'manage' (sort_order 4 — первый свободный). Системным ролям выдаём ТОЛЬКО
--    view/manage (не create/edit).
-- ─────────────────────────────────────────────

INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('psychologist', 'view',   'Просмотр',   1),
  ('psychologist', 'manage', 'Управление', 4)
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

    -- Только view/manage: если сид 002 завёл иные привилегии 'psychologist'
    -- (create/edit), их НЕ выдаём. См. спецификацию модуля.
    FOREACH pcode IN ARRAY ARRAY['view', 'manage']
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'psychologist', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;
