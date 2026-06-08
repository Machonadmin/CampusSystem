-- Добавляет updated_at (и created_at там где отсутствует) для всех таблиц,
-- у которых этих колонок нет. Исключены: лог/аудит-таблицы и junction-таблицы.
--
-- ВАЖНО: миграция идемпотентна через ADD COLUMN IF NOT EXISTS и
-- DROP TRIGGER IF EXISTS перед каждым CREATE TRIGGER.

-- ─── Функция триггера (idempotent) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
$$;

-- ─── education_journeys — нет ни created_at, ни updated_at ────────────────────
ALTER TABLE education_journeys
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS education_journeys_updated_at ON education_journeys;
CREATE TRIGGER education_journeys_updated_at
  BEFORE UPDATE ON education_journeys FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─── stage_finals — нет timestamps ───────────────────────────────────────────
ALTER TABLE stage_finals
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS stage_finals_updated_at ON stage_finals;
CREATE TRIGGER stage_finals_updated_at
  BEFORE UPDATE ON stage_finals FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─── stage_transitions — нет timestamps ──────────────────────────────────────
ALTER TABLE stage_transitions
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS stage_transitions_updated_at ON stage_transitions;
CREATE TRIGGER stage_transitions_updated_at
  BEFORE UPDATE ON stage_transitions FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─── Таблицы с created_at: добавляем только updated_at ───────────────────────

ALTER TABLE lead_interests
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS lead_interests_updated_at ON lead_interests;
CREATE TRIGGER lead_interests_updated_at
  BEFORE UPDATE ON lead_interests FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE stage_templates
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS stage_templates_updated_at ON stage_templates;
CREATE TRIGGER stage_templates_updated_at
  BEFORE UPDATE ON stage_templates FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE stage_task_templates
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS stage_task_templates_updated_at ON stage_task_templates;
CREATE TRIGGER stage_task_templates_updated_at
  BEFORE UPDATE ON stage_task_templates FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE task_transitions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS task_transitions_updated_at ON task_transitions;
CREATE TRIGGER task_transitions_updated_at
  BEFORE UPDATE ON task_transitions FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE person_relatives
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS person_relatives_updated_at ON person_relatives;
CREATE TRIGGER person_relatives_updated_at
  BEFORE UPDATE ON person_relatives FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE reference_levels
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS reference_levels_updated_at ON reference_levels;
CREATE TRIGGER reference_levels_updated_at
  BEFORE UPDATE ON reference_levels FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS departments_updated_at ON departments;
CREATE TRIGGER departments_updated_at
  BEFORE UPDATE ON departments FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS roles_updated_at ON roles;
CREATE TRIGGER roles_updated_at
  BEFORE UPDATE ON roles FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE person_accounts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS person_accounts_updated_at ON person_accounts;
CREATE TRIGGER person_accounts_updated_at
  BEFORE UPDATE ON person_accounts FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
