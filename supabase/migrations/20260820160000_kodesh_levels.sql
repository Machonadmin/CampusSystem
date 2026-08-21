-- Кодеш — независимый «маршрут» из 6 уровней (רמה א'..ו'), НЕ связанный с классом
-- или учебным маршрутом ученицы (её расставляют в уровень кодеша отдельно).
-- Переименовываем 6 групп кодеша в уровни, трёхъязычно
-- (name=RU / name_he=HE / name_en=EN). Отображение локализуется в UI.
-- Идемпотентно: сопоставление по старым именам сид-групп; после прогона старые
-- имена не совпадают → повторный запуск ничего не делает.
DO $$
DECLARE
  subj uuid;
  r RECORD;
BEGIN
  SELECT id INTO subj FROM subjects WHERE name = 'קודש' LIMIT 1;
  IF subj IS NULL THEN RETURN; END IF;
  FOR r IN SELECT * FROM (VALUES
    ('כיתה י',   'רמה א''', 'Уровень 1', 'Level 1'),
    ('כיתה י"א', 'רמה ב''', 'Уровень 2', 'Level 2'),
    ('כיתה 1',   'רמה ג''', 'Уровень 3', 'Level 3'),
    ('כיתה 2',   'רמה ד''', 'Уровень 4', 'Level 4'),
    ('כיתה 3',   'רמה ה''', 'Уровень 5', 'Level 5'),
    ('כיתה 4',   'רמה ו''', 'Уровень 6', 'Level 6')
  ) AS t(old, he, ru, en) LOOP
    UPDATE class_groups
    SET name = r.ru, name_he = r.he, name_en = r.en
    WHERE subject_id = subj AND name = r.old;
  END LOOP;
END $$;
