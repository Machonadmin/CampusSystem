-- ═════════════════════════════════════════════════════════════════════
-- Две מכללות — две РАЗНЫЕ единицы.
--
-- ─── Почему ─────────────────────────────────────────────────────────────────
--
-- Владелец: «צריך שיהיה לי אפשרות לאשר למישהו מסויים שיוכל לראות את התלמידים
-- במכללה, וזה בעצמו מתחלק למכללה של הקטנות והגדולות».
--
-- Сегодня это НЕВОЗМОЖНО. Миграция 20260819160000 СОЗНАТЕЛЬНО посадила оба
-- маршрута колледжа на ОДНО подразделение, чтобы руководитель колледжа видел
-- их оба. Побочный эффект: кто видит один — видит и второй, и «открыть
-- секретарю только קטנות» нельзя в принципе.
--
-- ─── Что делает миграция ────────────────────────────────────────────────────
--
-- Создаёт под существующим подразделением колледжа две ПОД-единицы и привязывает
-- к ним маршруты:
--     מכללה  ← остаётся как есть, руководитель колледжа сидит здесь
--       ├── קטנות  (база 9 класс, 4 года)  ← маршрут college_g9  / college_a
--       └── גדולות (база 11 класс, 3 года) ← маршрут college_g11 / college
--
-- Границу считает expandDepartmentTree — ВНИЗ по дереву. Поэтому:
--   • руководитель колледжа сидит на «מכללה» и продолжает видеть ОБЕ;
--   • секретарь, посаженная на «קטנות», видит только их.
-- Ни одно право при этом не выдаётся и не отзывается: меняется только граница.
--
-- ─── ЧЕГО ЭТА МИГРАЦИЯ НЕ ДЕЛАЕТ (согласовано с владельцем) ─────────────────
--
-- Она НЕ трогает студенток. У их journey (primary_department_id) остаётся
-- подразделение колледжа-родителя. Значит, пока владелец не перенесёт их сам на
-- экране, посаженная на «קטנות» секретарь увидит ПУСТОЙ список студенток —
-- фильтр идёт вниз по дереву, а родитель находится выше.
-- То же касается уже созданных предметов и учебных групп колледжа.
-- Руководитель колледжа на «מכללה» видит всё это как прежде.
--
-- Поэтому обе под-единицы помечены is_educational_institution = true: без этого
-- их не было бы в списке заведения на карточке студентки
-- (StudentsTab.tsx фильтрует список именно по этому флагу).
--
-- Идемпотентно: под-единицы ищутся по имени под тем же родителем.
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_parent  UUID;
  v_distinct INT;
  v_small   UUID;   -- קטנות, 4 года
  v_big     UUID;   -- גדולות, 3 года
  n_journeys INT;
BEGIN
  -- 1. Родитель — текущее общее подразделение колледжа.
  SELECT count(DISTINCT department_id) INTO v_distinct
    FROM study_tracks
   WHERE code IN ('college_g9', 'college_a', 'college_g11', 'college')
     AND department_id IS NOT NULL;

  IF v_distinct = 0 THEN
    RAISE EXCEPTION 'У маршрутов колледжа не проставлено подразделение — разделять нечего';
  END IF;

  IF v_distinct > 1 THEN
    -- Уже разделены (или настроены вручную). Переклеивать вслепую нельзя:
    -- это меняло бы видимость у живых людей.
    RAISE NOTICE 'Маршруты колледжа уже сидят на разных подразделениях (%). Миграция ничего не меняет.', v_distinct;
    RETURN;
  END IF;

  SELECT department_id INTO v_parent
    FROM study_tracks
   WHERE code IN ('college_g9', 'college_a', 'college_g11', 'college')
     AND department_id IS NOT NULL
   LIMIT 1;

  -- 2. Под-единицы. Ищем по имени под этим же родителем — повторный запуск
  --    находит их и не плодит дубли.
  SELECT id INTO v_small FROM departments
   WHERE parent_id = v_parent AND name_he = 'מכללה · קטנות (בסיס כיתה 9, 4 שנים)';
  IF v_small IS NULL THEN
    INSERT INTO departments (name, name_he, name_en, parent_id, sort_order, is_educational_institution)
    VALUES ('Колледж — младшие (база 9 класс, 4 года)',
            'מכללה · קטנות (בסיס כיתה 9, 4 שנים)',
            'College — juniors (grade 9 base, 4y)',
            v_parent, 10, true)
    RETURNING id INTO v_small;
    RAISE NOTICE 'Создана под-единица «קטנות»';
  END IF;

  SELECT id INTO v_big FROM departments
   WHERE parent_id = v_parent AND name_he = 'מכללה · גדולות (בסיס כיתה 11, 3 שנים)';
  IF v_big IS NULL THEN
    INSERT INTO departments (name, name_he, name_en, parent_id, sort_order, is_educational_institution)
    VALUES ('Колледж — старшие (база 11 класс, 3 года)',
            'מכללה · גדולות (בסיס כיתה 11, 3 שנים)',
            'College — seniors (grade 11 base, 3y)',
            v_parent, 20, true)
    RETURNING id INTO v_big;
    RAISE NOTICE 'Создана под-единица «גדולות»';
  END IF;

  -- 3. Маршруты переезжают на свои под-единицы.
  UPDATE study_tracks SET department_id = v_small
   WHERE code IN ('college_g9', 'college_a') AND department_id IS DISTINCT FROM v_small;

  UPDATE study_tracks SET department_id = v_big
   WHERE code IN ('college_g11', 'college') AND department_id IS DISTINCT FROM v_big;

  -- 4. Сказать вслух, сколько студенток ПОКА остаются на родителе.
  SELECT count(*) INTO n_journeys
    FROM education_journeys WHERE primary_department_id = v_parent;
  RAISE NOTICE 'Готово. Студенток на родительской единице колледжа: % — до их переноса фильтр по под-единице вернёт пусто (так и согласовано).', n_journeys;
END $$;

-- Самопроверка: маршруты колледжа обязаны сидеть на разных подразделениях.
DO $$
DECLARE v_distinct INT;
BEGIN
  SELECT count(DISTINCT department_id) INTO v_distinct
    FROM study_tracks
   WHERE code IN ('college_g9', 'college_a', 'college_g11', 'college')
     AND department_id IS NOT NULL;
  IF v_distinct < 2 THEN
    RAISE WARNING 'Маршруты колледжа по-прежнему на одном подразделении — разделения не произошло';
  ELSE
    RAISE NOTICE 'Проверка пройдена: маршруты колледжа разведены по разным единицам';
  END IF;
END $$;
