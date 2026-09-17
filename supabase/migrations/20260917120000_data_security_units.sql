-- ═════════════════════════════════════════════════════════════════════
-- Право «управлять учебными единицами» из «Безопасности данных».
--
-- ЗАЧЕМ. Владелец: «у каждого направления свой руководитель, доступ должен
-- быть только у него и у его сотрудников, и управлять этим я должен через
-- новый модуль». Граница руководителя — его единица в оргструктуре: посаженный
-- на «Колледж» получает его И ВСЁ, ЧТО НИЖЕ (expandDepartmentTree идёт вниз).
-- Отсюда и разбиение: чтобы дать секретарю доступ ТОЛЬКО к колледжу 3-летнему
-- или ТОЛЬКО к 4-летнему, каждый из них должен быть отдельной единицей под
-- «Колледжем», и секретарь сажается на неё, а руководитель — на «Колледж».
--
-- ПОЧЕМУ ОТДЕЛЬНОЕ ПРАВО, А НЕ manage_tree. Это принципиально:
--
--   manage_tree   — перестановка ДЕРЕВА ОТОБРАЖЕНИЯ. Безопасна: экран
--                   перекладывается, права не меняются ни у кого.
--   manage_units  — правка ОРГСТРУКТУРЫ и посадки людей. НЕБЕЗОПАСНА: перенос
--                   единицы или пересадка человека МЕНЯЕТ, кого он видит,
--                   прямо сейчас и без всякой выдачи прав.
--
-- Склеить их в одно право значило бы выдать «наведи порядок на экране» вместе
-- с «переопредели, кто что видит». Поэтому risk = critical.
--
-- Схему миграция НЕ меняет: departments и staff_positions уже есть, колонки
-- name_he/name_en у departments добавлены миграцией 20260715280000. Здесь
-- только строка каталога, чтобы право можно было выдать и объяснить.
--
-- Идемпотентно: INSERT ... ON CONFLICT DO NOTHING + UPDATE по ключу.
-- ═════════════════════════════════════════════════════════════════════

INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order)
VALUES ('data_security', 'manage_units', 'Управление учебными единицами', 303)
ON CONFLICT (module, privilege_code) DO NOTHING;

UPDATE module_privileges SET
  name_he = 'ניהול יחידות המוסד',
  name_ru = 'Управление учебными единицами',
  name_en = 'Manage institution units',
  description_he =
    'יצירה, שינוי והזזה של יחידות בעץ הארגוני, ושיוך אנשי צוות אליהן. '
    || 'שים לב: זה משנה גישה בפועל — מי שיושב ביחידה רואה אותה ואת כל מה שתחתיה. '
    || 'הזזת יחידה או העברת אדם משנה מיד את מה שהוא רואה, בלי שניתנה לו שום הרשאה נוספת.',
  description_ru =
    'Создание, правка и перенос единиц оргструктуры и посадка в них сотрудников. '
    || 'Внимание: это меняет доступ по-настоящему — посаженный на единицу видит её и всё, что ниже. '
    || 'Перенос единицы или пересадка человека сразу меняет то, что он видит, без выдачи ему каких-либо прав.',
  description_en =
    'Creates, edits and moves units in the org tree, and seats staff in them. '
    || 'Note: this changes real access — whoever sits on a unit sees it and everything beneath it. '
    || 'Moving a unit or reseating a person changes what they see immediately, without granting them any permission.',
  level = 'manage',
  risk = 'critical',
  allowed_scopes = ARRAY['all'],
  superseded_by = NULL,
  is_legacy = FALSE
WHERE module = 'data_security' AND privilege_code = 'manage_units';

-- Разложить новое право в тот же узел дерева отображения, что и остальные
-- права модуля, — иначе оно окажется в «не распределено».
INSERT INTO security_tree_items (node_id, module, privilege_code, sort_order)
SELECT n.id, 'data_security', 'manage_units', 303
  FROM security_tree_nodes n
 WHERE n.module_code = 'data_security'
ON CONFLICT (module, privilege_code) DO NOTHING;
