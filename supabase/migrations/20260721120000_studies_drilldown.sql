-- ─────────────────────────────────────────────────────────────────────────────
-- Studies drill-down model
--   Structure → Year → Hebrew-year → Semester → Course → Lesson
--
-- Все изменения АДДИТИВНЫ и ИДЕМПОТЕНТНЫ (IF NOT EXISTS). Ничего не удаляется и
-- не переименовывается — существующий код продолжает работать до и после.
-- Применять ВРУЧНУЮ в Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. «Год» (א/ב/ג/ד) на семестре. Семестр = class_groups WHERE is_semester=true.
--    Еврейский год (מחזור, напр. תשפ"ז) хранится в уже существующем year_label.
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS year_level INTEGER;

-- 2. Курс принадлежит семестру-родителю. «Курс» = class_groups, у которого
--    parent_semester_id указывает на семестр (class_groups с is_semester=true).
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS parent_semester_id UUID
  REFERENCES class_groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_class_groups_parent_semester
  ON class_groups(parent_semester_id);

-- 3. Здания и аудитории — выбираемые сущности вместо свободного текста.
CREATE TABLE IF NOT EXISTS buildings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  code        text,
  sort_order  integer DEFAULT 0,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id  uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name         text NOT NULL,          -- номер/название аудитории, напр. "201"
  capacity     integer,
  sort_order   integer DEFAULT 0,
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rooms_building ON rooms(building_id);

-- 4. Ссылка слота расписания на здание/аудиторию. Свободный текст `room`
--    остаётся для обратной совместимости; новый UI пишет building_id/room_id.
ALTER TABLE class_schedule_slots ADD COLUMN IF NOT EXISTS building_id UUID
  REFERENCES buildings(id) ON DELETE SET NULL;
ALTER TABLE class_schedule_slots ADD COLUMN IF NOT EXISTS room_id UUID
  REFERENCES rooms(id) ON DELETE SET NULL;

-- 5. Пометка «блок иудаики» на слоте — первые два урока дня резервируются под
--    יהדות. Позволяет предупреждать о конфликте, не завися только от времени.
ALTER TABLE class_schedule_slots ADD COLUMN IF NOT EXISTS is_kodesh_block BOOLEAN DEFAULT false;
