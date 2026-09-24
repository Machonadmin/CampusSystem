-- Один «глава единицы» вместо двух
--
-- В системе жили ДВА поля «глава», и только одно из них что-то решало:
--
--   staff_positions.is_head       — настоящее: по нему считает getHeadedUnitIds,
--                                   а значит и права на состав единицы, посадку
--                                   и старшинство в календаре;
--   departments.head_person_id    — второе, которое НИКТО не синхронизировал с
--                                   первым. Экран мог показывать одного
--                                   человека главой, пока полномочия держал
--                                   другой, — и увидеть это было неоткуда.
--
-- Аудит на живой базе (21 единица): 20 без главы вообще, 1 — оба поля указывают
-- на одного человека. Расхождений НЕТ НИ ОДНОГО, поэтому второе поле не
-- «выбирается» и не сливается, а удаляется: оно ничего не хранит.
--
-- Код, который читал эту колонку, уже переведён на is_head и задеплоен ДО этой
-- миграции (иначе PostgREST отдал бы ошибку на select несуществующего столбца).
--
-- Идемпотентна: повторный прогон ничего не делает.

DO $$
DECLARE
  unbacked integer;
  sample   text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'departments'
      AND column_name  = 'head_person_id'
  ) THEN
    RAISE NOTICE 'departments.head_person_id already dropped, nothing to do';
    RETURN;
  END IF;

  -- Предохранитель. Если между аудитом и прогоном кто-то успел записать главу
  -- ТОЛЬКО в удаляемую колонку, удаление стёрло бы единственную запись об этом.
  -- В таком случае миграция падает и называет виновные единицы, вместо того
  -- чтобы молча потерять данные.
  WITH active_heads AS (
    SELECT DISTINCT sp.department_id, sp.person_id
    FROM staff_positions sp
    WHERE sp.is_head = true
      AND (sp.end_date IS NULL OR sp.end_date > current_date)
  ),
  bad AS (
    SELECT d.id, d.name
    FROM departments d
    WHERE d.head_person_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM active_heads a
        WHERE a.department_id = d.id AND a.person_id = d.head_person_id
      )
  )
  SELECT count(*), coalesce(string_agg(name, ', '), '') INTO unbacked, sample FROM bad;

  IF unbacked > 0 THEN
    RAISE EXCEPTION
      'departments.head_person_id still holds % head(s) with no matching active staff_positions.is_head: %. Seat them as head first, then re-run.',
      unbacked, sample;
  END IF;

  ALTER TABLE departments DROP COLUMN head_person_id;
  RAISE NOTICE 'departments.head_person_id dropped';
END $$;
