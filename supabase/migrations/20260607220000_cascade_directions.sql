-- ═══════════════════════════════════════════════════════════════════════════════
-- Каскадный селектор направлений — Этап 1: структура БД.
--
-- Цель: перейти от свободного текста направления (lead_interests.direction)
-- к каскаду Учреждение (departments) → Направление (reference_directions)
-- → Уровень/Курс (reference_levels).
--
-- Применяется ВРУЧНУЮ через Supabase Dashboard → SQL Editor.
-- Наполнение справочника данными — отдельным скриптом (НЕ здесь).
-- RLS-политики в этой миграции не задаются (по решению владельца БД).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. departments: флаг учебного заведения ────────────────────────────────────
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS is_educational_institution BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN departments.is_educational_institution IS
  'Является ли этот отдел учебным заведением (для каскадного селектора направлений)';

-- ─── 2. Справочник направлений ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reference_directions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name_ru       TEXT        NOT NULL,
  code          TEXT,
  has_levels    BOOLEAN     NOT NULL DEFAULT false,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reference_directions_dept ON reference_directions(department_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reference_directions_code
  ON reference_directions(code) WHERE code IS NOT NULL;

COMMENT ON TABLE reference_directions IS
  'Справочник направлений обучения в учебных заведениях';
COMMENT ON COLUMN reference_directions.department_id IS
  'Учебное заведение (departments с is_educational_institution=true)';
COMMENT ON COLUMN reference_directions.has_levels IS
  'true = у направления есть уровни/курсы (reference_levels)';

-- ─── 3. Справочник уровней (курсов/классов) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS reference_levels (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_id  UUID        NOT NULL REFERENCES reference_directions(id) ON DELETE CASCADE,
  name_ru       TEXT        NOT NULL,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reference_levels_direction ON reference_levels(direction_id);

COMMENT ON TABLE reference_levels IS
  'Справочник уровней (курсов/классов) внутри направлений';

-- ─── 4. Триггер updated_at для reference_directions ─────────────────────────────
-- Функция update_updated_at_column() уже существует (создана в более ранней
-- миграции). CREATE OR REPLACE — идемпотентно и безопасно.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_reference_directions_updated_at ON reference_directions;
CREATE TRIGGER update_reference_directions_updated_at
  BEFORE UPDATE ON reference_directions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── 5. Переход lead_interests на справочник ────────────────────────────────────
-- В таблице только тестовые записи — очищаем перед сменой структуры.
DELETE FROM lead_interests;

ALTER TABLE lead_interests
  DROP COLUMN IF EXISTS institution,
  DROP COLUMN IF EXISTS direction;

ALTER TABLE lead_interests
  ADD COLUMN IF NOT EXISTS direction_id UUID
    REFERENCES reference_directions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS level_id UUID
    REFERENCES reference_levels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS free_text TEXT;

COMMENT ON COLUMN lead_interests.direction_id IS
  'FK на справочник направлений (новая схема). Может быть null.';
COMMENT ON COLUMN lead_interests.level_id IS
  'FK на справочник уровней. Может быть null, если у направления нет уровней.';
COMMENT ON COLUMN lead_interests.free_text IS
  'Свободный текст направления для учреждений без справочника. Fallback.';

-- ─── 6. Маркировка учебных заведений ────────────────────────────────────────────
UPDATE departments SET is_educational_institution = true
WHERE id IN (
  '5741d8d4-d1e5-4140-9056-a9916962a414',  -- Университет
  '6724b3d4-3281-4a9a-a2ac-a5eefab02260',  -- Touro University
  '71278f74-51dd-4985-ba24-cb7096b153a3',  -- Колледж
  '6f37f079-e0be-443c-b87e-f6af9fff8dc2',  -- Школа
  'fbb1f80f-21b2-4a3d-91ac-89e8eef4a941'   -- Эмуна
);
