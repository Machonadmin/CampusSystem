-- ═════════════════════════════════════════════════════════════════════
-- Должности (reference_positions) и «должность» сотрудника (staff_positions)
-- по ревью владельца 2026-10-08 (wording-review L02, L03).
--
-- L02. У 12 должностей не было названия на иврите — в ивритском интерфейсе
--      показывался русский текст. Заполняем name_he (только где пусто).
--      Три должности для одной и той же роли («אחראי לימודי קודש»,
--      «אחראית יהדות», «Заведующая кафедрой иудаики.») сводим в одну:
--      основная — «Ответственная за иудаику» (её использует роль
--      jewish_studies_manager), её name_he = «אחראית לימודי קודש»;
--      ссылки двух других переводим на неё, сами они отключаются
--      (is_active=false, не удаляются — это история).
--
-- L03. Посадка в подразделение через «Безопасность данных» записывала в
--      staff_positions.position_ru/position_he ИМЯ ПОДРАЗДЕЛЕНИЯ — колонка
--      «תואר משרה» показывала отдел («מכון חמש», «גיוס»). Такие строки
--      (без position_id, текст совпадает с именем своего подразделения)
--      очищаются: position_ru = '' (NOT NULL), position_he = NULL. Экран
--      тогда показывает «—», а шапка/профиль — роль. Код посадки больше
--      имя подразделения не пишет.
--
-- Идемпотентно.
-- ═════════════════════════════════════════════════════════════════════

-- ─── L02: названия на иврите ───────────────────────────────────────────────
UPDATE reference_positions rp SET name_he = v.name_he
FROM (VALUES
  ('Доцент',                       'דוקטור/מרצה בכיר'),
  ('Профессор',                    'פרופסור'),
  ('Президент кампуса',            'נשיא הקמפוס'),
  ('Директор школы',               'מנהל/ת בית הספר'),
  ('Заведующий кафедрой',          'ראש מחלקה'),
  ('Заведующий программой',        'ראש תוכנית'),
  ('HR-директор',                  'מנהל/ת משאבי אנוש'),
  ('Бухгалтер',                    'מנהל/ת חשבונות'),
  ('IT-администратор',             'מנהל/ת מערכות מידע'),
  ('Технический администратор',    'מנהל/ת טכני/ת'),
  ('Инспектор контроля качества',  'מבקר/ת איכות הוראה'),
  ('Психолог',                     'פסיכולוג/ית'),
  ('Врач',                         'רופא/ה')
) AS v(name_ru, name_he)
WHERE rp.name_ru = v.name_ru AND (rp.name_he IS NULL OR btrim(rp.name_he) = '');

-- ─── L02: одна должность «אחראית לימודי קודש» вместо трёх ─────────────────
DO $$
DECLARE
  v_main uuid;
  v_dups uuid[];
BEGIN
  SELECT id INTO v_main FROM reference_positions WHERE name_ru = 'Ответственная за иудаику';
  IF v_main IS NULL THEN
    RAISE NOTICE 'L02: должность «Ответственная за иудаику» не найдена — объединение пропущено';
    RETURN;
  END IF;

  UPDATE reference_positions SET name_he = 'אחראית לימודי קודש' WHERE id = v_main;

  SELECT array_agg(id) INTO v_dups FROM reference_positions
   WHERE name_ru IN ('Ответственный за лимудей кодеш', 'Заведующая кафедрой иудаики.')
     AND id <> v_main;
  IF v_dups IS NULL THEN
    RETURN;
  END IF;

  -- Текущие и прошлые посадки: ссылка и снимок названия — на основную.
  UPDATE staff_positions SET
    position_id = v_main,
    position_ru = 'Ответственная за иудаику',
    position_he = 'אחראית לימודי קודש'
  WHERE position_id = ANY (v_dups);

  UPDATE tasks SET position_id = v_main WHERE position_id = ANY (v_dups);
  UPDATE stage_task_templates SET default_position_id = v_main WHERE default_position_id = ANY (v_dups);

  UPDATE reference_positions SET is_active = false WHERE id = ANY (v_dups);
END $$;

-- ─── L03: «должность» = имя подразделения → пусто ──────────────────────────
UPDATE staff_positions sp SET position_ru = '', position_he = NULL
FROM departments d
WHERE d.id = sp.department_id
  AND sp.position_id IS NULL
  AND btrim(sp.position_ru) <> ''
  AND btrim(sp.position_ru) IN (btrim(d.name), btrim(COALESCE(d.name_he, '')), btrim(COALESCE(d.name_en, '')))
  AND (sp.position_he IS NULL
       OR btrim(sp.position_he) IN (btrim(d.name), btrim(COALESCE(d.name_he, '')), btrim(COALESCE(d.name_en, ''))));
