-- ═════════════════════════════════════════════════════════════════════
-- «קודש» → «יהדות» / «кодеш» → «иудаика» / «kodesh» → «Judaic studies»
-- в названиях, хранящихся в БД (продолжение PR #439, где поменяли тексты экранов).
--
-- Что меняется — только текстовые подписи (колонки *name*, *title*, *label*,
-- *description*, position_*) в таблицах:
--   departments, reference_positions, staff_positions, roles,
--   module_privileges, security_tree_nodes, subjects.
-- Предмет subjects.name 'קודש' → 'יהדות' (отдельным шагом, если имя 'יהדות'
--   ещё не занято). Код (app/api/education/kodesh/levels/route.ts) ищет предмет
--   по обоим именам, поэтому порядок деплоя и миграции не важен.
-- Не трогается:
--   • коды (code, privilege_code, module …), «בירור יהדות» (решение владельца).
--
-- Применять ВРУЧНУЮ через Supabase SQL Editor. Идемпотентно: повторный запуск
-- ничего не меняет. Deploy-safe: отсутствующие таблицы/колонки пропускаются.
-- В конце — NOTICE со списком мест в БД, где слово ещё осталось (только чтение).
-- ═════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION pg_temp.kodesh_to_judaic(t TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT
    -- English
    regexp_replace(regexp_replace(
    -- Russian (сначала словосочетания, потом падежи)
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    -- Hebrew
    replace(replace(replace(replace(replace(
      t,
      'לימודי הקודש', 'לימודי היהדות'),
      'לימודי קודש',  'לימודי יהדות'),
      'לקודש',        'ללימודי יהדות'),
      'הקודש',        'היהדות'),
      'קודש',         'יהדות'),
      'Лимудей кодеш',    'Иудаика'),
      'за лимудей кодеш', 'за иудаику'),
      'лимудей-кодеш',    'иудаика'),
      'лимудей кодеш',    'иудаика'),
      'кодеш-учителя',    'учителя иудаики'),
      'кодешем',          'иудаикой'),
      'кодеша',           'иудаики'),
      'кодешу',           'иудаике'),
      'Кодеш',            'Иудаика'),
      'кодеш',            'иудаика'),
      '\mkodesh studies\M', 'Judaic studies', 'gi'),
      '\mkodesh\M',         'Judaic studies', 'gi')
$fn$;

DO $$
DECLARE
  r RECORD;
  n BIGINT;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name IN ('departments', 'reference_positions', 'staff_positions',
                            'roles', 'module_privileges', 'security_tree_nodes', 'subjects')
       AND c.data_type IN ('text', 'character varying')
       AND (c.column_name LIKE '%name%' OR c.column_name LIKE '%title%'
            OR c.column_name LIKE '%label%' OR c.column_name LIKE '%description%'
            OR c.column_name LIKE 'position\_%')
       AND NOT (c.table_name = 'subjects' AND c.column_name = 'name')
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET %I = pg_temp.kodesh_to_judaic(%I)
        WHERE %I ~* ''(קודש|кодеш|kodesh)''',
      r.table_name, r.column_name, r.column_name, r.column_name);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      RAISE NOTICE 'Обновлено: %.% — % строк', r.table_name, r.column_name, n;
    END IF;
  END LOOP;
END $$;

-- Предмет: name 'קודש' → 'יהדות' (name выводится на нескольких экранах).
DO $$
BEGIN
  IF to_regclass('public.subjects') IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE name = 'קודש') THEN
    RETURN;  -- уже переименован (повторный запуск)
  ELSIF EXISTS (SELECT 1 FROM subjects WHERE name = 'יהדות') THEN
    RAISE NOTICE 'Предмет «יהדות» уже есть — subjects.name «קודש» не переименован.';
  ELSE
    UPDATE subjects SET name = 'יהדות' WHERE name = 'קודש';
  END IF;
END $$;

-- Проверка (только чтение): где в БД слово ещё встречается.
DO $$
DECLARE
  r RECORD;
  n BIGINT;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     WHERE c.table_schema = 'public' AND tb.table_type = 'BASE TABLE'
       AND c.data_type IN ('text', 'character varying')
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I ~* ''(קודש|кодеш)''',
                   r.table_name, r.column_name) INTO n;
    IF n > 0 THEN
      RAISE NOTICE 'Осталось: %.% — % строк', r.table_name, r.column_name, n;
    END IF;
  END LOOP;
END $$;
