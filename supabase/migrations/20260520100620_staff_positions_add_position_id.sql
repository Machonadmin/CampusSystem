ALTER TABLE staff_positions
  ADD COLUMN position_id UUID REFERENCES reference_positions(id) ON DELETE SET NULL;

CREATE INDEX idx_staff_positions_position_id ON staff_positions(position_id);

COMMENT ON COLUMN staff_positions.position_id IS
  'FK на справочник должностей. position_ru оставлен для legacy записей.';

-- Заполнить position_id для существующих записей по точному совпадению имени
UPDATE staff_positions sp
SET position_id = rp.id
FROM reference_positions rp
WHERE sp.position_id IS NULL
  AND LOWER(TRIM(sp.position_ru)) = LOWER(TRIM(rp.name_ru));
