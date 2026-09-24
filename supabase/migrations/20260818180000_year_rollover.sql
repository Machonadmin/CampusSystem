-- ============================================================================
-- Автоматический переход на следующий учебный год (מעבר שנה אוטומטי).
--
-- Модель (согласовано с владельцем):
--   • У студентки есть ТЕКУЩИЙ ГОД в её маршруте (year_level на связке
--     journey_study_tracks). Новая студентка = год 1.
--   • В заданную ДАТУ каждый год: все продвигаются на +1 год (не выше числа
--     лет маршрута). Те, кто закончил последний год, помечаются completed_at
--     (בוגרת) — перевод в «выпускницы/контакты» сделаем отдельно позже.
--   • Идемпотентно: за один календарный год перекат выполняется один раз
--     (last_rolled_year).
-- ============================================================================

-- 1) Текущий год студентки в маршруте + отметка завершения.
ALTER TABLE journey_study_tracks
  ADD COLUMN IF NOT EXISTS year_level int NOT NULL DEFAULT 1
  CHECK (year_level BETWEEN 1 AND 8);

ALTER TABLE journey_study_tracks
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 2) Настройки перехода (singleton-строка).
CREATE TABLE IF NOT EXISTS academic_year_settings (
  id               boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  rollover_month   int NOT NULL DEFAULT 9  CHECK (rollover_month BETWEEN 1 AND 12),
  rollover_day     int NOT NULL DEFAULT 1  CHECK (rollover_day BETWEEN 1 AND 31),
  auto_enabled     boolean NOT NULL DEFAULT true,
  last_rolled_year int,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
INSERT INTO academic_year_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- 3) Атомарный движок перехода: сперва выпускаем закончивших последний год,
--    затем продвигаем остальных на +1 (в рамках years_count маршрута).
--    Порядок важен: выпуск ДО продвижения, иначе доведённые до последнего года
--    выпустились бы в тот же прогон.
CREATE OR REPLACE FUNCTION advance_academic_year()
RETURNS TABLE(promoted int, graduated int)
LANGUAGE plpgsql
AS $$
DECLARE
  g int;
  p int;
BEGIN
  UPDATE journey_study_tracks jst
  SET completed_at = now(), updated_at = now()
  FROM study_tracks st
  WHERE jst.track_id = st.id
    AND jst.completed_at IS NULL
    AND jst.year_level >= st.years_count;
  GET DIAGNOSTICS g = ROW_COUNT;

  UPDATE journey_study_tracks jst
  SET year_level = jst.year_level + 1, updated_at = now()
  FROM study_tracks st
  WHERE jst.track_id = st.id
    AND jst.completed_at IS NULL
    AND jst.year_level < st.years_count;
  GET DIAGNOSTICS p = ROW_COUNT;

  promoted := p;
  graduated := g;
  RETURN NEXT;
END;
$$;
