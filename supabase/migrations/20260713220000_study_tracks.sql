-- ═════════════════════════════════════════════════════════════════════
-- Учебные маршруты (מסלולי לימוד).
--
-- Первую половину дня ВСЕ учатся иудаизму (не выбор — по умолчанию), поэтому
-- моделируем только маршрут ВТОРОЙ половины: Туро / Школа / Колледж. Плюс поле
-- заметок для исключений.
--
-- Отдельные таблицы (НЕ трогаем education_journeys), поэтому деплой до миграции
-- безопасен: API читает защищённо и отдаёт пусто, если таблиц ещё нет.
--
-- RLS в проекте отключён; доступ ограничивает API (view_students / manage_students).
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor. Идемпотентно.
-- ═════════════════════════════════════════════════════════════════════

-- Справочник маршрутов второй половины дня.
CREATE TABLE IF NOT EXISTS study_tracks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT UNIQUE NOT NULL,
  name_he    TEXT NOT NULL,
  name_ru    TEXT NOT NULL,
  name_en    TEXT NOT NULL,
  sort_order INT  NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO study_tracks (code, name_he, name_ru, name_en, sort_order) VALUES
  ('touro',   'טורו',     'Туро',    'Touro',   10),
  ('school',  'בית ספר',  'Школа',   'School',  20),
  ('college', 'מכללה',    'Колледж', 'College', 30)
ON CONFLICT (code) DO NOTHING;

-- Назначение маршрута студентке (один на journey) + заметка для исключений.
CREATE TABLE IF NOT EXISTS journey_study_tracks (
  journey_id UUID PRIMARY KEY REFERENCES education_journeys(id) ON DELETE CASCADE,
  track_id   UUID REFERENCES study_tracks(id) ON DELETE SET NULL,
  notes      TEXT,
  updated_by UUID REFERENCES persons(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
