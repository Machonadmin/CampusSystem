-- Создать 6 уровней кодеша (רמה א'..ו') под кафедрой иудаики, если их ещё нет.
-- Кодеш — независимый «маршрут»: ученицу расставляют в уровень отдельно, вне
-- связи с классом/учебным маршрутом. Трёхъязычно (name=RU / name_he=HE /
-- name_en=EN). Отображаются по department_id кафедры иудаики (см. kodesh page).
-- Идемпотентно: пропускаем уровень, если он уже есть.
DO $$
DECLARE
  kodesh_dept uuid := '9a3d7b3f-3f65-4653-a111-4d5296404a27';
  r RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM departments WHERE id = kodesh_dept) THEN RETURN; END IF;
  FOR r IN SELECT * FROM (VALUES
    ('רמה א''', 'Уровень 1', 'Level 1'),
    ('רמה ב''', 'Уровень 2', 'Level 2'),
    ('רמה ג''', 'Уровень 3', 'Level 3'),
    ('רמה ד''', 'Уровень 4', 'Level 4'),
    ('רמה ה''', 'Уровень 5', 'Level 5'),
    ('רמה ו''', 'Уровень 6', 'Level 6')
  ) AS t(he, ru, en) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM class_groups
      WHERE department_id = kodesh_dept AND name_he = r.he AND is_semester = false
    ) THEN
      INSERT INTO class_groups (name, name_he, name_en, department_id, is_semester, is_active)
      VALUES (r.ru, r.he, r.en, kodesh_dept, false, true);
    END IF;
  END LOOP;
END $$;
