-- Имена авто-созданных семестров — на иврит («Дизайн · 1» → «עיצוב · 1»).
-- Трогаем ТОЛЬКО семестры, чьё имя всё ещё равно авто-шаблону с русским именем
-- предмета (subject.name · term) — переименованные вручную не затрагиваем.
-- Идемпотентно: после прогона имя = ивриту и больше не совпадает с шаблоном.
UPDATE class_groups cg
SET name = s.name_he || ' · ' || cg.term_number
FROM subjects s
WHERE cg.subject_id = s.id
  AND cg.is_semester = true
  AND cg.term_number IS NOT NULL
  AND s.name_he IS NOT NULL AND s.name_he <> ''
  AND cg.name = s.name || ' · ' || cg.term_number;
