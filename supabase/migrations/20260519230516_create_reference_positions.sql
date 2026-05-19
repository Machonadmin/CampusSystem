CREATE TABLE reference_positions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ru       TEXT NOT NULL,
  name_he       TEXT,
  category      TEXT NOT NULL CHECK (category IN ('academic', 'administrative', 'support')),
  is_teaching   BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 100,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_position_name_ru UNIQUE (name_ru)
);

CREATE INDEX idx_reference_positions_category ON reference_positions(category);
CREATE INDEX idx_reference_positions_active   ON reference_positions(is_active);

COMMENT ON TABLE reference_positions IS
  'Справочник должностей. Используется в staff_positions для нормализации данных.';
COMMENT ON COLUMN reference_positions.category IS
  'academic = преподавательские, administrative = управленческие, support = вспомогательные';
COMMENT ON COLUMN reference_positions.is_teaching IS
  'true = должность даёт право преподавать (например, в учебной группе)';

-- Начальные данные (21 должность)
INSERT INTO reference_positions (name_ru, name_he, category, is_teaching, sort_order) VALUES
  -- Преподавательские (academic, is_teaching=true)
  ('Преподаватель',               NULL,       'academic',       true,  10),
  ('Старший преподаватель',       NULL,       'academic',       true,  11),
  ('Доцент',                      NULL,       'academic',       true,  12),
  ('Профессор',                   NULL,       'academic',       true,  13),
  ('Учитель',                     NULL,       'academic',       true,  14),
  ('ЭмБайт',                      'אם בית',   'academic',       true,  15),

  -- Руководящие (administrative, is_teaching=false)
  ('Президент кампуса',           NULL,       'administrative', false, 20),
  ('Ректор',                      NULL,       'administrative', false, 21),
  ('Директор школы',              NULL,       'administrative', false, 22),
  ('Декан',                       NULL,       'administrative', false, 23),
  ('Заместитель директора',       NULL,       'administrative', false, 24),
  ('Заведующий кафедрой',         NULL,       'administrative', false, 25),
  ('Заведующий программой',       NULL,       'administrative', false, 26),
  ('HR-директор',                 NULL,       'administrative', false, 27),
  ('Секретарь',                   NULL,       'administrative', false, 28),

  -- Вспомогательные (support, is_teaching=false)
  ('Бухгалтер',                   NULL,       'support',        false, 40),
  ('IT-администратор',            NULL,       'support',        false, 41),
  ('Технический администратор',   NULL,       'support',        false, 42),
  ('Инспектор контроля качества', NULL,       'support',        false, 43),
  ('Психолог',                    NULL,       'support',        false, 44),
  ('Врач',                        NULL,       'support',        false, 45);
