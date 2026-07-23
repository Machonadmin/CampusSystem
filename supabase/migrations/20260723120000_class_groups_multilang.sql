-- Мультиязычные названия классов и семестров (class_groups).
-- `name` остаётся русским (по умолчанию/резерв); name_he / name_en — переводы,
-- заполняются по желанию и редактируются в любой момент. Deploy-safe: IF NOT
-- EXISTS, ничего не удаляет; до применения код показывает `name`.
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS name_he TEXT;
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS name_en TEXT;
