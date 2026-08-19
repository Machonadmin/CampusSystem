-- ═════════════════════════════════════════════════════════════════════
-- НАВЕДЕНИЕ ПОРЯДКА в учебных подразделениях (по данным владельца 2026-07-15).
--
-- Проблема: миграция 20260715120000 создала учебные единицы department'ами с
-- ИВРИТ-названиями РЯДОМ с уже существующими русскими → дубли (в т.ч. «Туро»
-- дважды). Владелец: всё должно быть по-русски по умолчанию (персонал колледжа —
-- русскоязычный), учебные программы НИКОГДА не под «Отдел набора», и это была
-- РЕОРГАНИЗАЦИЯ, а не добавление.
--
-- Делает:
--   1. name_he / name_en у departments (RU-название `name` — по умолчанию).
--   2. (идемпотентно) удаляет 5 пустых ивритских дублей (владелец уже удалил).
--   3. Сливает набор: переносит штат из «גиוס» в «Отдел набора», удаляет «גиוс».
--   4. Создаёт родителя «Учёба» под институтом и переносит 6 учебных единиц под
--      него (отдельно от админ-подразделений и набора).
--   5. Русские названия/описания для ролей, созданных сегодня.
--
-- RLS отключён. Применять ВРУЧНУЮ в Supabase SQL Editor. Транзакция —
-- при любой ошибке откат целиком.
-- ═════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Мультиязычные названия (RU `name` остаётся значением по умолчанию).
ALTER TABLE departments ADD COLUMN IF NOT EXISTS name_he TEXT;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS name_en TEXT;

-- 2. Идемпотентно: 5 пустых ивритских дублей (уже удалены владельцем).
DELETE FROM departments WHERE id IN (
  '0d89e381-37b5-4128-8b87-d05746f39648', -- אוניברסיטה  (дубль Университет)
  '4619bc36-8b3f-445e-945a-fe049e2d0cac', -- טורו        (дубль Touro University)
  '71d58067-1480-49d9-a832-e6337dbd9c4b', -- לимודи קодеш (дубль Кафедра иудаики)
  '7d7145b5-1e99-43cd-868f-f8941a6cece9', -- קолג׳       (дубль Колледж)
  'fdcded15-6b5f-4b9b-b9e8-b37d3cdd9841'  -- תיכон       (дубль Школа)
);

-- 3. Слияние набора: штат из «גиוס» → «Отдел набора», затем удалить «גиус».
UPDATE staff_positions SET department_id = '8efbb072-6bef-4117-aec9-71b8166b7d63'
  WHERE department_id = '0a70f79d-b175-4ca3-a141-9784ca04d0ac';
DELETE FROM departments WHERE id = '0a70f79d-b175-4ca3-a141-9784ca04d0ac';

UPDATE departments SET name_he = 'גיוס', name_en = 'Recruitment'
  WHERE id = '8efbb072-6bef-4117-aec9-71b8166b7d63';

-- 4. Родитель «Учёба» под институтом + перенос 6 учебных единиц под него.
INSERT INTO departments (name, name_he, name_en, parent_id)
  SELECT 'Учёба', 'לимודים', 'Studies', '24672830-f38e-4d85-bc6f-e8fbd2dd904e'
  WHERE NOT EXISTS (
    SELECT 1 FROM departments
     WHERE name = 'Учёба' AND parent_id = '24672830-f38e-4d85-bc6f-e8fbd2dd904e'
  );

UPDATE departments SET parent_id = (
    SELECT id FROM departments
     WHERE name = 'Учёба' AND parent_id = '24672830-f38e-4d85-bc6f-e8fbd2dd904e'
     LIMIT 1
  )
  WHERE id IN (
    '9a3d7b3f-3f65-4653-a111-4d5296404a27', -- Кафедра иудаики (кодеш/утро)
    '6f37f079-e0be-443c-b87e-f6af9fff8dc2', -- Школа
    '71278f74-51dd-4985-ba24-cb7096b153a3', -- Колледж
    '5741d8d4-d1e5-4140-9056-a9916962a414', -- Университет
    '6724b3d4-3281-4a9a-a2ac-a5eefab02260', -- Touro University
    'fbb1f80f-21b2-4a3d-91ac-89e8eef4a941'  -- Эмуна
  );

-- 5. Мультиязычные названия учебных единиц.
UPDATE departments SET name_he = 'לимודי קодеш', name_en = 'Judaic Studies' WHERE id = '9a3d7b3f-3f65-4653-a111-4d5296404a27';
UPDATE departments SET name_he = 'תיכון',       name_en = 'School'          WHERE id = '6f37f079-e0be-443c-b87e-f6af9fff8dc2';
UPDATE departments SET name_he = 'קולג׳',       name_en = 'College'         WHERE id = '71278f74-51dd-4985-ba24-cb7096b153a3';
UPDATE departments SET name_he = 'אוניברסיטה',  name_en = 'University'       WHERE id = '5741d8d4-d1e5-4140-9056-a9916962a414';
UPDATE departments SET name_he = 'טורו',        name_en = 'Touro University' WHERE id = '6724b3d4-3281-4a9a-a2ac-a5eefab02260';
UPDATE departments SET name_he = 'אמונה',       name_en = 'Emuna'           WHERE id = 'fbb1f80f-21b2-4a3d-91ac-89e8eef4a941';

-- 6. Роли, созданные сегодня → русские названия/описания по умолчанию.
UPDATE roles SET name = 'Ответственный за учёбу',
  description = 'Отвечает за учебную единицу (хол или кодеш): видит всех, управляет своей'
  WHERE code = 'studies_manager';
UPDATE roles SET name = 'Секретарь учёбы',
  description = 'Секретарь под ответственным за учёбу; права назначаются лично'
  WHERE code = 'studies_secretary';

COMMIT;
