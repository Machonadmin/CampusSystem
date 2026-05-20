-- 1. Добавить три новых поля (nullable пока)
ALTER TABLE persons ADD COLUMN last_name   TEXT;
ALTER TABLE persons ADD COLUMN first_name  TEXT;
ALTER TABLE persons ADD COLUMN middle_name TEXT;

-- 2. Заполнить существующие записи вручную
UPDATE persons SET last_name='Шемякин',  first_name='Константин'                         WHERE id='506b86df-6458-4318-adbb-38d79bed3e91';
UPDATE persons SET last_name='Бекерман', first_name='Авраам'                              WHERE id='f8d95222-e5fb-4063-8a60-979450219d0e';
UPDATE persons SET last_name='Бекерман', first_name='Аврахам'                             WHERE id='972f9d5c-eecc-4b4f-b3d2-62aecc2f46b6';
UPDATE persons SET last_name='Файн',     first_name='Аделина',   middle_name='Петровна'  WHERE id='c5152829-dbf9-44ae-b64a-fd0df4f6c898';
UPDATE persons SET last_name='Фролова',  first_name='Василиса',  middle_name='Владимировна' WHERE id='5e82980c-1dce-44a2-a35a-7fd930f00a46';
UPDATE persons SET first_name='Суперадминистратор'     WHERE id='778359af-0b37-4289-9d59-84628a97c386';
UPDATE persons SET first_name='Тестовый пользователь'  WHERE id='581699b7-0329-44d3-87e9-bddceb1bb4a1';
UPDATE persons SET first_name='Контактное лицо общины' WHERE id='14829dce-ab39-4332-83dd-734e747c42a0';
UPDATE persons SET first_name='שרה שמח'                WHERE id='b234097a-766f-4dea-ad95-9f103680c05f';

-- 3. Удалить старую full_name и пересоздать как GENERATED ALWAYS STORED
ALTER TABLE persons DROP COLUMN full_name;
ALTER TABLE persons ADD COLUMN full_name TEXT
  GENERATED ALWAYS AS (
    TRIM(
      COALESCE(last_name, '') ||
      CASE WHEN first_name IS NOT NULL AND first_name != '' THEN
        CASE WHEN last_name IS NOT NULL AND last_name != '' THEN ' ' ELSE '' END || first_name
      ELSE '' END ||
      CASE WHEN middle_name IS NOT NULL AND middle_name != '' THEN ' ' || middle_name ELSE '' END
    )
  ) STORED;

-- 4. first_name обязательно после заполнения
ALTER TABLE persons ALTER COLUMN first_name SET NOT NULL;

-- Проверка:
-- SELECT id, last_name, first_name, middle_name, full_name FROM persons;
