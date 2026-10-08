-- ═════════════════════════════════════════════════════════════════════
-- Формулировки по ревью владельца 2026-10-08 (wording-review, пункты L).
-- Только подписи/объяснения в справочниках — НИКАКИХ изменений выдачи прав:
-- role_privileges / person_privileges и проверки доступа не трогаются.
--
--   L13/S22  «פניות» → «לידים» в правах набора.
--   L15/S36  «מעונות» → «פנימייה» в правах общежития.
--   L14/M25  психолог: одно имя модуля («פסיכולוג»), без «ייעוץ רגשי».
--   L16      «כניסה למודול החינוך» → «כניסה לגיוס, קבלה ולימודים».
--   L18      study_groups = «קבוצת לימודים», class_groups = «קבוצת כיתה».
--   L08/S34  права, которые ни один код не проверяет (security.view_logs,
--            security.manage_access, finance.confirm_payment) — помечены
--            is_legacy и честно объяснены: «הענקתה לא משנה דבר».
--   L21      «אישור תשלום» — объяснение говорит, что право даёт на самом деле.
--   L22/S13  названия разделов дерева прав без «כניסה ל…».
--   L23/S35  «בקשות (ותיק)» / «קוד ותיק» → «ישן, לא בשימוש» / «הרשאה ישנה».
--   L27/L28  «קבוצה א׳/ב׳» и «מכללה · קטנות/גדולות» — понятные имена.
--   L32      уровни кодеша — цифрами («רמה 3», не «רמה ג'»).
--
-- Идемпотентно: UPDATE по ключу; названия разделов дерева и подразделений
-- меняются только если администратор их ещё не переименовал (WHERE по
-- старому значению).
-- ═════════════════════════════════════════════════════════════════════

-- ─── 1. Каталог прав: подписи ─────────────────────────────────────────────
UPDATE module_privileges mp SET
  name_he = v.name_he, name_ru = v.name_ru, name_en = v.name_en,
  description_he = COALESCE(v.desc_he, mp.description_he),
  description_ru = COALESCE(v.desc_ru, mp.description_ru),
  description_en = COALESCE(v.desc_en, mp.description_en)
FROM (VALUES
  -- L13/S22 — лиды
  ('recruitment', 'view_leads',
   'צפייה בלידים', 'Просмотр лидов', 'View leads',
   'רשימת הלידים ומצב הטיפול בכל אחד.',
   'Список лидов и статус работы с ними.',
   'The list of leads and their handling status.'),
  ('recruitment', 'manage_leads',
   'ניהול לידים', 'Управление лидами', 'Manage leads',
   'הוספה, עריכה וסגירה של לידים, ורישום שיחות מעקב.',
   'Добавление, правка и закрытие лидов, запись звонков.',
   'Adds, edits and closes leads, and logs follow-up calls.'),
  ('recruitment', 'convert_lead',
   'העברת ליד לוועדת קבלה', 'Передача лида в приёмную комиссию', 'Hand a lead to the admission committee',
   'העברת הליד לשלב הקבלה ופתיחת תיק מועמדות.',
   'Перевод лида на этап приёма и открытие дела абитуриентки.',
   'Moves a lead to the admission stage and opens an applicant file.'),
  -- L15/S36 — פנימייה
  ('dormitory', 'access',
   'כניסה לפנימייה', 'Вход в общежитие', 'Open dormitory', NULL, NULL, NULL),
  ('dormitory', 'view',
   'צפייה בפנימייה', 'Просмотр общежития', 'View dormitory', NULL, NULL, NULL),
  ('dormitory', 'manage',
   'ניהול מלא של הפנימייה', 'Полное управление общежитием', 'Full dormitory management', NULL, NULL, NULL),
  -- L14/M25 — психолог
  ('psychologist', 'access',
   'כניסה למודול הפסיכולוג', 'Вход в модуль психолога', 'Open the psychologist module',
   'פותח את המודול בתפריט. מידע רגיש ביותר.',
   'Открывает модуль. Крайне чувствительные данные.',
   'Opens the module. Highly sensitive data.'),
  ('psychologist', 'view',
   'צפייה ברשומות הפסיכולוג', 'Просмотр записей психолога', 'View psychologist records',
   'תיקי הפסיכולוג. לא מופיעים בתיק החינוכי.',
   'Дела психолога. В учебном деле не показываются.',
   'Psychologist files. They never appear in the education file.'),
  ('psychologist', 'create',
   'פתיחת רשומת פסיכולוג', 'Создание записи психолога', 'Create a psychologist record', NULL, NULL, NULL),
  ('psychologist', 'edit',
   'עריכת רשומת פסיכולוג', 'Редактирование записи психолога', 'Edit a psychologist record', NULL, NULL, NULL),
  ('psychologist', 'manage',
   'ניהול מלא של מודול הפסיכולוג', 'Полное управление модулем психолога', 'Full psychologist module management', NULL, NULL, NULL),
  -- L16 — вход в «חינוך» открывает гиюс, кабалу и лимудим
  ('education', 'access',
   'כניסה לגיוס, קבלה ולימודים', 'Вход в набор, приём и учёбу', 'Open recruitment, admission and studies',
   'פותח בתפריט את «חינוך» — גיוס, קבלה ולימודים. בלי ההרשאה הזו לא נכנסים לאף אחד מהם, גם עם שאר ההרשאות.',
   'Открывает в меню «Образование» — набор, приём и учёбу. Без этого права не войти ни в один из них, даже с остальными правами.',
   'Opens Education in the menu — recruitment, admission and studies. Without it none of them opens, even with the other permissions.'),
  -- L18 — קבוצת לימודים / קבוצת כיתה
  ('studies', 'manage_study_groups',
   'ניהול קבוצות לימודים', 'Управление учебными группами', 'Manage study groups',
   'קבוצת הלימודים הקבועה של התלמידה (הכיתה שלה).',
   'Постоянная учебная группа студентки (её класс).',
   'The student''s permanent study group (her class).'),
  ('studies', 'manage_class_groups',
   'ניהול קבוצות כיתה', 'Управление группами-классами', 'Manage class groups',
   'פתיחה, עריכה וסגירה של קבוצות כיתה (קבוצות שיעור לסמסטר).',
   'Создание, правка и закрытие групп-классов (групп занятий на семестр).',
   'Creates, edits and closes class groups (lesson groups for a semester).'),
  ('studies', 'manage_enrollments',
   'ניהול שיבוץ לקבוצות כיתה', 'Управление зачислением в группы-классы', 'Manage class group enrolments',
   'שיבוץ תלמידה לקבוצת כיתה והוצאתה ממנה.',
   'Зачисление студентки в группу-класс и исключение из неё.',
   'Adds a student to a class group and removes her from it.'),
  -- то же для старых подписей этих прав в модуле education (до разделения)
  ('education', 'manage_study_groups',
   'ניהול קבוצות לימודים', 'Управление учебными группами', 'Manage study groups', NULL, NULL, NULL),
  ('education', 'manage_class_groups',
   'ניהול קבוצות כיתה', 'Управление группами-классами', 'Manage class groups', NULL, NULL, NULL),
  ('education', 'manage_enrollments',
   'ניהול שיבוץ לקבוצות כיתה', 'Управление зачислением в группы-классы', 'Manage class group enrolments', NULL, NULL, NULL),
  -- L21 — что на самом деле даёт «אישור תשלום»
  ('finance', 'approve_payment',
   'אישור תשלום', 'Подтверждение платежа', 'Approve a payment',
   'אישור תשלומים שהתקבלו, אישור תלושי שכר וניהול מי רואה את כספי התלמידות.',
   'Подтверждение полученных платежей, утверждение расчётных листков и управление тем, кто видит финансы студенток.',
   'Confirms received payments, approves payslips and manages who can see student finances.')
) AS v(module, privilege_code, name_he, name_ru, name_en, desc_he, desc_ru, desc_en)
WHERE mp.module = v.module AND mp.privilege_code = v.privilege_code;

-- ─── 2. L08/S34 — права, которые ничего не открывают ──────────────────────
-- Ни один экран и ни один API их не проверяет (поиск по коду: только тип в
-- lib/finance/permissions.ts). Помечаем как «старые» — экран прячет их за
-- «הצג», а объяснение говорит прямо, что выдача ничего не меняет.
UPDATE module_privileges SET
  is_legacy = true,
  description_he = 'ההרשאה עדיין לא מחוברת לשום מסך — הענקתה לא משנה דבר.',
  description_ru = 'Право пока не подключено ни к одному экрану — его выдача ничего не меняет.',
  description_en = 'Not connected to any screen yet — granting it changes nothing.'
WHERE (module, privilege_code) IN (
  ('security', 'view_logs'),
  ('security', 'manage_access'),
  ('finance', 'confirm_payment')
);

-- ─── 3. L23/S35 — «קוד ותיק» → «הרשאה ישנה» в объяснениях старых прав ─────
UPDATE module_privileges SET
  description_he = replace(replace(replace(description_he,
      'קוד ותיק — הוחלף על ידי', 'הרשאה ישנה — הוחלפה ב'),
      'קוד ותיק — אין לו מקבילה חדשה.', 'הרשאה ישנה — אין לה מקבילה חדשה.'),
      'קוד ותיק', 'הרשאה ישנה'),
  description_ru = replace(replace(replace(description_ru,
      'Старый код — заменён на', 'Старое право — заменено на'),
      'Старый код — нового аналога нет.', 'Старое право — нового аналога нет.'),
      'Старый код', 'Старое право'),
  description_en = replace(replace(replace(description_en,
      'Legacy code — replaced by', 'Old permission — replaced by'),
      'Legacy code — it has no current equivalent.', 'Old permission — it has no current equivalent.'),
      'Legacy code', 'Old permission')
WHERE description_he LIKE '%קוד ותיק%'
   OR description_ru LIKE '%Старый код%'
   OR description_en LIKE '%Legacy code%';

-- ─── 4. L22/S13 + L14 + L15 + L23 — названия разделов дерева прав ─────────
-- Раздел = модуль, а не право «כניסה ל…». Меняем только если имя ещё то,
-- которое засеяла миграция 20260916130000 (админ мог переименовать сам).
UPDATE security_tree_nodes n SET
  name_he = v.name_he, name_ru = v.name_ru, name_en = v.name_en
FROM (VALUES
  ('security',        'כניסה לאבטחה',            'אבטחה פיזית (שמירה)',  'Физическая охрана',             'Physical security (guards)'),
  ('data_security',   'כניסה לאבטחת מידע',        'אבטחת מידע והרשאות',   'Информационная безопасность и права', 'Data security and permissions'),
  ('contacts',        'כניסה לאנשי קשר',          'אנשי קשר',             'Контакты',                      'Contacts'),
  ('alumni',          'כניסה לבוגרות',            'בוגרות',               'Выпускницы',                    'Alumni'),
  ('jewishness',      'כניסה לבירור יהדות',       'בירור יהדות',          'Проверка еврейства',            'Jewishness verification'),
  ('reports',         'כניסה לדוחות',             'דוחות',                'Отчёты',                        'Reports'),
  ('settings',        'כניסה להגדרות המערכת',     'הגדרות המערכת',        'Настройки системы',             'System settings'),
  ('food',            'כניסה להזנה',              'הזנה',                 'Питание',                       'Catering'),
  ('quality_control', 'כניסה להערכת הוראה',       'הערכת הוראה',          'Оценка преподавания',           'Teaching evaluation'),
  ('chavruta',        'כניסה לחברותא',            'חברותא',               'Хеврута',                       'Chavruta'),
  ('psychologist',    'כניסה לייעוץ הרגשי',       'פסיכולוג',             'Психолог',                      'Psychologist'),
  ('finance',         'כניסה לכספים',             'כספים',                'Финансы',                       'Finance'),
  ('persons',         'כניסה למאגר האנשים',       'מאגר האנשים',          'База людей',                    'People directory'),
  ('documents',       'כניסה למסמכים',            'מסמכים',               'Документы',                     'Documents'),
  ('dormitory',       'כניסה למעונות',            'פנימייה',              'Общежитие',                     'Dormitory'),
  ('doctor',          'כניסה למרפאה',             'מרפאה',                'Медпункт',                      'Clinic'),
  ('tasks',           'כניסה למשימות',            'משימות',               'Задачи',                        'Tasks'),
  ('staff',           'כניסה לניהול העובדים',     'ניהול העובדים',        'Управление сотрудниками',       'Staff management'),
  ('sponsors',        'כניסה לתורמים',            'תורמים',               'Спонсоры',                      'Sponsors'),
  ('maintenance',     'כניסה לתחזוקה',            'תחזוקה',               'Эксплуатация',                  'Maintenance'),
  ('applicants',      'בקשות (ותיק)',             'בקשות (ישן, לא בשימוש)', 'Заявки (старое, не используется)', 'Applications (old, not in use)')
) AS v(module_code, old_he, name_he, name_ru, name_en)
WHERE n.module_code = v.module_code AND n.name_he = v.old_he;

-- Объяснения разделов, где были «פניות» и «קודים ותיקים».
UPDATE security_tree_nodes SET
  description_he = 'לידים עד להעברתם לוועדת קבלה.',
  description_ru = 'Лиды до передачи в приёмную комиссию.',
  description_en = 'Leads until they are handed to the admission committee.'
WHERE module_code = 'recruitment' AND description_he = 'פניות ולידים עד להפיכתם למועמדות.';

UPDATE security_tree_nodes SET
  description_he = 'הרשאות מלפני המעבר לקבלה. נשמרות כדי לא לבטל הרשאות שכבר ניתנו.',
  description_ru = 'Права до перехода на «Приём». Сохранены, чтобы не отменить уже выданное.',
  description_en = 'Permissions from before the move to Admission. Kept so grants already given do not break.'
WHERE module_code = 'applicants' AND description_he = 'קודים מלפני מעבר לקבלה. נשמרים כדי לא לשבור הרשאות ותיקות.';

-- ─── 5. L27 / L28 — подразделения «קבוצה א׳/ב׳» и колледжи ─────────────────
-- Меняем только если имя ещё прежнее (подразделения переименовываются в UI).
UPDATE departments SET
  name    = 'Младшие (школа и младший колледж)',
  name_he = 'צעירות (בית ספר ומכללה קטנות)',
  name_en = 'Younger (school and junior college)'
WHERE id = 'a0000000-0000-4000-8000-000000000001' AND name_he = 'קבוצה א׳';

UPDATE departments SET
  name    = 'Старшие (университет, Туро, старший колледж)',
  name_he = 'בוגרות (אוניברסיטה, טורו, מכללה גדולות)',
  name_en = 'Older (university, Touro, senior college)'
WHERE id = 'a0000000-0000-4000-8000-000000000002' AND name_he = 'קבוצה ב׳';

UPDATE departments SET
  name    = 'Колледж — младшие (с 9 класса)',
  name_he = 'מכללה — צעירות (מכיתה 9)',
  name_en = 'College — younger (from grade 9)'
WHERE id = 'a0000000-0000-4000-8000-000000000003' AND name_he = 'מכללה · קטנות (בסיס כיתה 9, 4 שנים)';

UPDATE departments SET
  name    = 'Колледж — старшие (с 11 класса)',
  name_he = 'מכללה — בוגרות (מכיתה 11)',
  name_en = 'College — older (from grade 11)'
WHERE name_he = 'מכללה · גדולות (בסיס כיתה 11, 3 שנים)';

-- То же имя у маршрута (study_tracks), чтобы в двух соседних фильтрах была
-- одна и та же единица под одним именем.
UPDATE study_tracks SET
  name_he = 'מכללה — צעירות (מכיתה 9)',
  name_ru = 'Колледж — младшие (с 9 класса)',
  name_en = 'College — younger (from grade 9)'
WHERE code = 'college_g9' AND name_he = 'מכללה · קטנות';

UPDATE study_tracks SET
  name_he = 'מכללה — בוגרות (מכיתה 11)',
  name_ru = 'Колледж — старшие (с 11 класса)',
  name_en = 'College — older (from grade 11)'
WHERE code = 'college_g11' AND name_he = 'מכללה · גדולות';

-- ─── 6. L32 — уровни кодеша цифрами ────────────────────────────────────────
UPDATE class_groups SET name_he = v.new_he
FROM (VALUES
  ('רמה 1 בית ספר',   'רמה 1 — בית ספר'),
  ('רמה 1 אוניברסיטה', 'רמה 1 — אוניברסיטה'),
  ('רמה 2 בית ספר',   'רמה 2 — בית ספר'),
  ('רמה 2 אוניברסיטה', 'רמה 2 — אוניברסיטה'),
  ('רמה ג''',          'רמה 3'),
  ('רמה ד''',          'רמה 4'),
  ('רמה ה''',          'רמה 5'),
  ('רמה ו''',          'רמה 6'),
  ('רמה ג׳',           'רמה 3'),
  ('רמה ד׳',           'רמה 4'),
  ('רמה ה׳',           'רמה 5'),
  ('רמה ו׳',           'רמה 6')
) AS v(old_he, new_he)
WHERE class_groups.kodesh_level IS NOT NULL AND class_groups.name_he = v.old_he;
