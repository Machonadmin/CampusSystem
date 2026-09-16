-- ═════════════════════════════════════════════════════════════════════
-- Каталог прав: подписи и объяснения на трёх языках + уровень, риск и область.
--
-- ЗАЧЕМ. module_privileges хранил ровно одну подпись — privilege_name по-русски,
-- description пустой у всех строк. Из-за этого единственный способ показать
-- право на экране — технический код ('studies.set_grades'), а он не говорит
-- администратору НИЧЕГО о том, что право реально открывает. Владелец поставил
-- прямое требование: технический код на экране не показывается нигде, у каждого
-- права есть имя на языке человека и объяснение «что это даёт на самом деле».
--
-- ЧТО ДОБАВЛЯЕТСЯ.
--   name_he/ru/en, description_he/ru/en — подпись и объяснение на трёх языках;
--   level          — ступень (access < view < edit < manage) для шкалы на экране;
--   risk           — насколько чувствительно (normal / sensitive / critical);
--   allowed_scopes — какие области вообще осмысленны для этого права;
--   superseded_by / is_legacy — чем перекрыт устаревший код.
--
-- ЧТО НЕ МЕНЯЕТСЯ. privilege_name остаётся как есть (в него смотрит старый экран
-- ролей). Ни одна строка role_privileges / person_privileges не трогается:
-- это каталог, а не выдача прав. Проверки доступа не меняются НИКАК.
--
-- ПОЧЕМУ НЕ ДОБАВЛЕНЫ calendar.* и health.*: их никто не проверяет. Строка в
-- каталоге без проверки в коде — это ровно та «мёртвая привилегия», из-за
-- которой каталог и стал непонятным (security.manage_access, security.view_logs
-- лежат так с сида 002). Заводить новые такие же — значит повторить проблему.
--
-- Идемпотентно: ADD COLUMN IF NOT EXISTS, INSERT ... ON CONFLICT DO NOTHING,
-- UPDATE по ключу (module, privilege_code).
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE module_privileges
  ADD COLUMN IF NOT EXISTS name_he        TEXT,
  ADD COLUMN IF NOT EXISTS name_ru        TEXT,
  ADD COLUMN IF NOT EXISTS name_en        TEXT,
  ADD COLUMN IF NOT EXISTS description_he TEXT,
  ADD COLUMN IF NOT EXISTS description_ru TEXT,
  ADD COLUMN IF NOT EXISTS description_en TEXT,
  ADD COLUMN IF NOT EXISTS level          TEXT,
  ADD COLUMN IF NOT EXISTS risk           TEXT    NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS allowed_scopes TEXT[]  NOT NULL DEFAULT ARRAY['all','department','own'],
  ADD COLUMN IF NOT EXISTS superseded_by  TEXT,
  ADD COLUMN IF NOT EXISTS is_legacy      BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE module_privileges DROP CONSTRAINT IF EXISTS module_privileges_level_check;
ALTER TABLE module_privileges ADD  CONSTRAINT module_privileges_level_check
  CHECK (level IS NULL OR level IN ('access','view','edit','manage'));

ALTER TABLE module_privileges DROP CONSTRAINT IF EXISTS module_privileges_risk_check;
ALTER TABLE module_privileges ADD  CONSTRAINT module_privileges_risk_check
  CHECK (risk IN ('normal','sensitive','critical'));

COMMENT ON COLUMN module_privileges.level IS
  'Ступень права для шкалы на экране: access (вход в модуль) < view (чтение) < edit (изменение) < manage (управление/необратимое). Только для отображения — проверки доступа уровень не читают.';
COMMENT ON COLUMN module_privileges.risk IS
  'Чувствительность: normal / sensitive / critical. Влияет на пометку на экране, не на проверки.';
COMMENT ON COLUMN module_privileges.allowed_scopes IS
  'Какие значения role_privileges.scope осмысленны для этого права. Для access — только all: middleware проверяет лишь наличие строки.';
COMMENT ON COLUMN module_privileges.superseded_by IS
  'Код-замена в формате module.code для устаревшего права (разделение матрицы учёбы 20260819120000, замена «заявок» на «приём»). NULL — замены нет.';
COMMENT ON COLUMN module_privileges.is_legacy IS
  'Дубль/устаревшая подпись: на экране скрыт, показывается замена (superseded_by). ВНИМАНИЕ: education.* при этом ПРОДОЛЖАЮТ действовать — lib/education/permissions.ts читает права из всех четырёх модулей учёбы; скрыт только дубль в каталоге. applicants.* не читаются никаким кодом.';

-- ── 1. Перенос существующей русской подписи в name_ru ────────────────────────
UPDATE module_privileges SET name_ru = privilege_name WHERE name_ru IS NULL;


-- ── 2. Досев каталога: строки, которых на этой БД может не быть ──────────────
--
-- Каталог на целевой БД уже расходился с миграциями: 20260705140000 обнаружила
-- 20 строк вместо 52 и досевала недостающие. Тот же риск здесь: UPDATE ниже
-- правит только существующие строки, поэтому недосеянное право осталось бы без
-- подписи и не появилось бы в модуле «Безопасность данных» вовсе.
--
-- Поэтому сначала досеваем ВЕСЬ каталог (ON CONFLICT DO NOTHING — существующие
-- строки не трогаются), и только потом обновляем подписи. Строка каталога сама
-- по себе НИКОМУ НИЧЕГО НЕ ВЫДАЁТ: выдача живёт в role_privileges /
-- person_privileges, которых эта миграция не касается.
--
-- Новое здесь по существу:
--   education.delegate_privileges — проверяется в lib/education/unit-access.ts
--     (hasDelegatedTeamAccess) и выдаётся из панели состава единицы, но строки
--     в каталоге не имело, то есть было невидимо для администратора;
--   data_security.* — права самого нового модуля.
INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('persons', 'access', 'Вход в базу людей', 1),
  ('persons', 'view', 'Просмотр списка людей', 102),
  ('persons', 'view_sensitive', 'Просмотр чувствительных данных', 103),
  ('persons', 'create', 'Создание человека', 204),
  ('persons', 'edit', 'Редактирование карточки', 205),
  ('persons', 'delete', 'Удаление человека', 306),
  ('persons', 'manage', 'Полное управление базой', 307),
  ('staff', 'access', 'Вход в управление сотрудниками', 1),
  ('education', 'access', 'Вход в образование', 1),
  ('education', 'view', 'Просмотр данных образования', 102),
  ('education', 'view_own_only', 'Только свои данные', 103),
  ('education', 'manage_groups', 'Управление группами', 204),
  ('education', 'manage_schedule', 'Управление расписанием', 205),
  ('education', 'manage_grades', 'Выставление оценок', 206),
  ('education', 'manage_communities', 'Управление общинами', 207),
  ('education', 'delegate_privileges', 'Право выдавать права', 308),
  ('recruitment', 'view_leads', 'Просмотр лидов', 101),
  ('recruitment', 'manage_leads', 'Управление лидами', 202),
  ('recruitment', 'convert_lead', 'Конвертация лида', 203),
  ('admission', 'view_applicants', 'Просмотр абитуриентов', 101),
  ('admission', 'manage_applicants', 'Управление абитуриентами', 202),
  ('admission', 'enroll_applicant', 'Зачисление абитуриента', 303),
  ('studies', 'view_students', 'Просмотр студентов', 101),
  ('studies', 'manage_students', 'Управление студентами', 202),
  ('studies', 'manage_enrollments', 'Управление записями в группы', 203),
  ('studies', 'manage_class_groups', 'Управление учебными группами', 204),
  ('studies', 'manage_class_teachers', 'Управление преподавателями групп', 205),
  ('studies', 'mark_attendance', 'Отметка посещаемости', 206),
  ('studies', 'set_grades', 'Выставление оценок', 207),
  ('studies', 'set_lesson_topics', 'Заполнение тем уроков', 208),
  ('studies', 'write_evaluation', 'Написание характеристики', 209),
  ('studies', 'manage_communities', 'Управление общинами', 210),
  ('studies', 'manage_subjects', 'Управление предметами', 211),
  ('studies', 'manage_specialties', 'Управление специальностями', 212),
  ('studies', 'manage_study_groups', 'Управление базовыми группами', 213),
  ('studies', 'manage_tracks', 'Управление маршрутами обучения', 314),
  ('studies', 'create_kodesh_course', 'Создание курса кодеша', 315),
  ('studies', 'approve_kodesh_teacher', 'Утверждение преподавателя кодеша', 316),
  ('studies', 'set_teacher_quota', 'Установка часовой квоты', 317),
  ('studies', 'manage_alerts', 'Управление оповещениями', 218),
  ('studies', 'view_sensitive_alerts', 'Просмотр чувствительных оповещений', 119),
  ('studies', 'jewishness_initial_check', 'Первичная проверка еврейства', 320),
  ('studies', 'jewishness_final_approve', 'Финальное утверждение еврейства', 321),
  ('jewishness', 'access', 'Вход в проверку еврейства', 1),
  ('jewishness', 'view', 'Просмотр записей', 102),
  ('jewishness', 'create', 'Создание записи', 203),
  ('jewishness', 'edit', 'Редактирование записи', 204),
  ('chavruta', 'access', 'Вход в хевруту', 1),
  ('finance', 'access', 'Вход в финансы', 1),
  ('finance', 'view', 'Просмотр финансов', 102),
  ('finance', 'view_student_balance', 'Итоги студентки', 103),
  ('finance', 'create_invoice', 'Создание счёта', 204),
  ('finance', 'approve_payment', 'Подтверждение платежа', 305),
  ('finance', 'confirm_payment', 'Подтверждение оплаты', 306),
  ('finance', 'approve_discount', 'Утверждение скидки', 307),
  ('finance', 'manage_budget', 'Управление бюджетом', 308),
  ('finance', 'export_reports', 'Экспорт финансовых отчётов', 109),
  ('dormitory', 'access', 'Вход в общежитие', 1),
  ('dormitory', 'view', 'Просмотр общежития', 102),
  ('dormitory', 'manage_rooms', 'Управление комнатами', 203),
  ('dormitory', 'manage_residents', 'Управление жильцами', 204),
  ('dormitory', 'manage', 'Полное управление общежитием', 305),
  ('food', 'access', 'Вход в питание', 1),
  ('food', 'view', 'Просмотр питания', 102),
  ('food', 'view_menu', 'Просмотр меню', 103),
  ('food', 'manage_menu', 'Управление меню', 204),
  ('food', 'manage_orders', 'Управление заказами', 205),
  ('food', 'manage', 'Полное управление питанием', 306),
  ('doctor', 'access', 'Вход в медпункт', 1),
  ('doctor', 'view', 'Просмотр медицинских записей', 102),
  ('doctor', 'create', 'Создание медицинской записи', 203),
  ('doctor', 'edit', 'Редактирование медицинской записи', 204),
  ('doctor', 'manage', 'Полное управление медпунктом', 305),
  ('psychologist', 'access', 'Вход в психологическую службу', 1),
  ('psychologist', 'view', 'Просмотр записей психолога', 102),
  ('psychologist', 'create', 'Создание записи психолога', 203),
  ('psychologist', 'edit', 'Редактирование записи психолога', 204),
  ('psychologist', 'manage', 'Полное управление службой', 305),
  ('documents', 'access', 'Вход в документы', 1),
  ('documents', 'view', 'Просмотр документов', 102),
  ('documents', 'create', 'Создание документа', 203),
  ('documents', 'manage_templates', 'Управление шаблонами', 304),
  ('documents', 'manage', 'Полное управление документами', 305),
  ('reports', 'access', 'Вход в отчёты', 1),
  ('reports', 'view', 'Просмотр отчётов', 102),
  ('reports', 'export', 'Экспорт отчётов', 103),
  ('reports', 'manage', 'Управление отчётами', 304),
  ('contacts', 'access', 'Вход в контакты', 1),
  ('contacts', 'view', 'Просмотр контактов', 102),
  ('contacts', 'manage', 'Управление контактами', 303),
  ('alumni', 'access', 'Вход в выпускниц', 1),
  ('alumni', 'view', 'Просмотр выпускниц', 102),
  ('alumni', 'manage', 'Управление выпускницами', 303),
  ('sponsors', 'access', 'Вход в спонсоров', 1),
  ('sponsors', 'view', 'Просмотр спонсоров', 102),
  ('sponsors', 'manage', 'Управление спонсорами', 303),
  ('maintenance', 'access', 'Вход в эксплуатацию', 1),
  ('maintenance', 'view', 'Просмотр эксплуатации', 102),
  ('maintenance', 'manage', 'Управление эксплуатацией', 303),
  ('security', 'access', 'Вход в безопасность', 1),
  ('security', 'view', 'Просмотр безопасности', 102),
  ('security', 'manage', 'Управление безопасностью', 303),
  ('security', 'manage_access', 'Управление пропусками', 304),
  ('security', 'view_logs', 'Просмотр журнала', 105),
  ('tasks', 'access', 'Вход в задачи', 1),
  ('tasks', 'view_own', 'Свои задачи', 102),
  ('tasks', 'view_all', 'Все задачи', 103),
  ('tasks', 'create', 'Создание задачи', 204),
  ('tasks', 'assign', 'Назначение задачи', 205),
  ('tasks', 'delete', 'Удаление задачи', 306),
  ('quality_control', 'access', 'Вход в оценку преподавания', 1),
  ('applicants', 'view', 'Просмотр заявок', 101),
  ('applicants', 'create', 'Создание заявки', 202),
  ('applicants', 'edit', 'Редактирование заявки', 203),
  ('applicants', 'change_status', 'Изменение статуса заявки', 204),
  ('applicants', 'delete', 'Удаление заявки', 305),
  ('settings', 'access', 'Вход в настройки', 1),
  ('settings', 'view', 'Просмотр настроек', 102),
  ('settings', 'manage_departments', 'Управление оргструктурой', 303),
  ('settings', 'manage_roles', 'Управление ролями и правами', 304),
  ('settings', 'manage_system', 'Системные настройки', 305),
  ('data_security', 'access', 'Вход в информационную безопасность', 1),
  ('data_security', 'grant', 'Выдача и отзыв прав', 302),
  ('data_security', 'manage_tree', 'Настройка структуры прав', 303),
  ('education', 'view_leads', 'Просмотр лидов', 109),
  ('education', 'manage_leads', 'Управление лидами', 210),
  ('education', 'convert_lead', 'Конвертация лида', 211),
  ('education', 'view_applicants', 'Просмотр абитуриентов', 112),
  ('education', 'manage_applicants', 'Управление абитуриентами', 213),
  ('education', 'enroll_applicant', 'Зачисление абитуриента', 314),
  ('education', 'view_students', 'Просмотр студентов', 115),
  ('education', 'manage_students', 'Управление студентами', 216),
  ('education', 'manage_enrollments', 'Управление записями в группы', 217),
  ('education', 'manage_class_groups', 'Управление учебными группами', 218),
  ('education', 'manage_class_teachers', 'Управление преподавателями групп', 219),
  ('education', 'mark_attendance', 'Отметка посещаемости', 220),
  ('education', 'set_grades', 'Выставление оценок', 221),
  ('education', 'set_lesson_topics', 'Заполнение тем уроков', 222),
  ('education', 'manage_subjects', 'Управление предметами', 223),
  ('education', 'manage_specialties', 'Управление специальностями', 224),
  ('education', 'manage_study_groups', 'Управление базовыми группами', 225)
ON CONFLICT (module, privilege_code) DO NOTHING;


-- ── 3. Подписи, объяснения, уровень, риск и область ──────────────────────────
UPDATE module_privileges AS mp SET
  name_he        = v.name_he,
  name_ru        = v.name_ru,
  name_en        = v.name_en,
  description_he = v.description_he,
  description_ru = v.description_ru,
  description_en = v.description_en,
  level          = v.level,
  risk           = v.risk,
  allowed_scopes = v.allowed_scopes,
  superseded_by  = v.superseded_by,
  is_legacy      = v.is_legacy
FROM (VALUES
  ('persons', 'access', 'כניסה למאגר האנשים', 'Вход в базу людей', 'Open people directory', 'פותח את המודול בתפריט. בלי זה המודול לא מוצג כלל.', 'Открывает модуль в меню. Без него модуль не показывается.', 'Shows the module in the menu. Without it the module is hidden.', 'access', 'normal', ARRAY['all'], NULL, false),
  ('persons', 'view', 'צפייה ברשימת האנשים', 'Просмотр списка людей', 'View people list', 'שם, טלפון ואימייל של כל אדם במאגר. פרטים רגישים דורשים הרשאה נפרדת.', 'Имя, телефон и почта каждого. Чувствительные поля — отдельное право.', 'Name, phone and email of each person. Sensitive fields need a separate permission.', 'view', 'normal', ARRAY['all','department','own'], NULL, false),
  ('persons', 'view_sensitive', 'צפייה בפרטים אישיים רגישים', 'Просмотр чувствительных данных', 'View sensitive personal data', 'דרכון, תעודת זהות, כתובת מגורים, תאריך לידה, אזרחות ומצב משפחתי. בלי ההרשאה השדות חוזרים ריקים.', 'Паспорт, адрес, дата рождения, гражданство, семейное положение. Без права поля возвращаются пустыми.', 'Passport, address, date of birth, citizenship and marital status. Without it these fields come back empty.', 'view', 'critical', ARRAY['all','department','own'], NULL, false),
  ('persons', 'create', 'הוספת אדם חדש', 'Создание человека', 'Add a person', 'יצירת כרטיס אדם חדש במאגר.', 'Создание новой карточки человека в базе.', 'Creates a new person record in the directory.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('persons', 'edit', 'עריכת כרטיס אדם', 'Редактирование карточки', 'Edit a person', 'שינוי שם, פרטי קשר וכתובת של אדם קיים.', 'Изменение имени, контактов и адреса существующего человека.', 'Changes name, contact details and address of an existing person.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('persons', 'delete', 'מחיקת אדם', 'Удаление человека', 'Delete a person', 'הסרת כרטיס אדם מהמאגר. פעולה בלתי הפיכה.', 'Удаление карточки из базы. Необратимо.', 'Removes a person record. This cannot be undone.', 'manage', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('persons', 'manage', 'ניהול מלא של המאגר', 'Полное управление базой', 'Full directory management', 'כולל מיזוג כפילויות וטיפול ברשומות בעייתיות.', 'Включая слияние дублей и разбор проблемных записей.', 'Includes merging duplicates and fixing problem records.', 'manage', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('staff', 'access', 'כניסה לניהול העובדים', 'Вход в управление сотрудниками', 'Open staff management', 'פותח את המודול בתפריט: מבנה ארגוני, עובדים ותוארי משרה.', 'Открывает модуль: оргструктура, сотрудники, должности.', 'Opens the module: org structure, employees and job titles.', 'access', 'normal', ARRAY['all'], NULL, false),
  ('education', 'access', 'כניסה לחינוך ולימודים', 'Вход в образование', 'Open education', 'פותח את המודול בתפריט. ההרשאות המפורטות יושבות תחת גיוס, קבלה ולימודים.', 'Открывает модуль. Тонкие права живут в наборе, приёме и учёбе.', 'Opens the module. The detailed permissions live under recruitment, admission and studies.', 'access', 'normal', ARRAY['all'], NULL, false),
  ('education', 'view', 'צפייה בנתוני החינוך', 'Просмотр данных образования', 'View education data', 'מסכי הסקירה של המודול.', 'Обзорные экраны модуля.', 'The module overview screens.', 'view', 'normal', ARRAY['all','department','own'], NULL, false),
  ('education', 'view_own_only', 'צפייה בנתונים שלו בלבד', 'Только свои данные', 'Own data only', 'מגביל את הצפייה לקבוצות ולתלמידות שהאדם אחראי עליהן.', 'Ограничивает просмотр группами и студентками, за которых человек отвечает.', 'Limits the view to the groups and students this person is responsible for.', 'view', 'normal', ARRAY['all','department','own'], NULL, true),
  ('education', 'manage_groups', 'ניהול קבוצות לימוד', 'Управление группами', 'Manage study groups', 'יצירה ועריכה של קבוצות. קוד ותיק — המקבילה החדשה היא «ניהול קבוצות» תחת לימודים.', 'Создание и редактирование групп. Старый код — новый аналог в «Учёбе».', 'Creates and edits groups. Legacy code — the current equivalent lives under Studies.', 'edit', 'normal', ARRAY['all','department','own'], 'studies.manage_class_groups', true),
  ('education', 'manage_schedule', 'ניהול מערכת השעות', 'Управление расписанием', 'Manage timetable', 'שיבוץ שיעורים ושעות הוראה. קוד ותיק.', 'Расстановка уроков и часов преподавания. Старый код.', 'Schedules lessons and teaching hours. Legacy code.', 'edit', 'normal', ARRAY['all','department','own'], NULL, true),
  ('education', 'manage_grades', 'הזנת ציונים', 'Выставление оценок', 'Enter grades', 'קוד ותיק — המקבילה החדשה היא «הזנת ציונים» תחת לימודים.', 'Старый код — новый аналог в «Учёбе».', 'Legacy code — the current equivalent lives under Studies.', 'edit', 'normal', ARRAY['all','department','own'], 'studies.set_grades', true),
  ('education', 'manage_communities', 'ניהול קהילות', 'Управление общинами', 'Manage communities', 'שיוך תלמידות לקהילות. קוד ותיק.', 'Привязка студенток к общинам. Старый код.', 'Assigns students to communities. Legacy code.', 'edit', 'normal', ARRAY['all','department','own'], 'studies.manage_communities', true),
  ('education', 'delegate_privileges', 'מתן הרשאות לכפופים', 'Право выдавать права', 'Delegate permissions', 'מאפשר לחבר יחידה לפתוח הרשאות לאנשי הצוות שתחתיו — אך לא יותר ממה שהוא עצמו מחזיק, ולא את ההרשאה הזו עצמה.', 'Позволяет члену единицы открывать права подчинённым — но не больше, чем держит сам, и не само это право.', 'Lets a unit member grant permissions to their team — never more than they hold themselves, and never this permission itself.', 'manage', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('recruitment', 'view_leads', 'צפייה בפניות', 'Просмотр лидов', 'View leads', 'רשימת הפניות שהתקבלו ומצב הטיפול בהן.', 'Список поступивших обращений и статус работы с ними.', 'The list of incoming enquiries and their handling status.', 'view', 'normal', ARRAY['all','department','own'], NULL, false),
  ('recruitment', 'manage_leads', 'ניהול פניות', 'Управление лидами', 'Manage leads', 'הוספה, עריכה וסגירה של פניות, ורישום שיחות מעקב.', 'Добавление, правка и закрытие обращений, запись звонков.', 'Adds, edits and closes enquiries, and logs follow-up calls.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('recruitment', 'convert_lead', 'המרת פנייה למועמדת', 'Конвертация лида', 'Convert lead to applicant', 'העברת פנייה לשלב הקבלה ופתיחת תיק מועמדות.', 'Перевод обращения на этап приёма и открытие дела абитуриентки.', 'Moves an enquiry to the admission stage and opens an applicant file.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('admission', 'view_applicants', 'צפייה במועמדות', 'Просмотр абитуриентов', 'View applicants', 'רשימת המועמדות ומצב הטיפול בכל אחת.', 'Список абитуриенток и статус по каждой.', 'The applicant list and the status of each one.', 'view', 'normal', ARRAY['all','department','own'], NULL, false),
  ('admission', 'manage_applicants', 'ניהול מועמדות', 'Управление абитуриентами', 'Manage applicants', 'עריכת תיק מועמדת, מסמכים וראיונות.', 'Правка дела абитуриентки, документов и собеседований.', 'Edits the applicant file, documents and interviews.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('admission', 'enroll_applicant', 'רישום מועמדת כתלמידה', 'Зачисление абитуриента', 'Enrol an applicant', 'ההחלטה שהופכת מועמדת לתלמידה ופותחת לה מסלול לימודים.', 'Решение, которое делает абитуриентку студенткой и открывает ей маршрут обучения.', 'The decision that turns an applicant into a student and opens her study track.', 'manage', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('studies', 'view_students', 'צפייה בתלמידות', 'Просмотр студентов', 'View students', 'רשימת התלמידות ותיק הלימודים של כל אחת.', 'Список студенток и учебное дело каждой.', 'The student list and each student’s study file.', 'view', 'normal', ARRAY['all','department','own'], NULL, false),
  ('studies', 'manage_students', 'ניהול תיק תלמידה', 'Управление студентами', 'Manage students', 'עריכת פרטי הלימודים, המסלול והסטטוס של תלמידה.', 'Правка учебных данных, маршрута и статуса студентки.', 'Edits a student’s study details, track and status.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('studies', 'manage_enrollments', 'ניהול הרשמות לקבוצות', 'Управление записями в группы', 'Manage group enrolments', 'שיבוץ תלמידה לקבוצת לימוד והוצאתה ממנה.', 'Зачисление студентки в учебную группу и исключение из неё.', 'Adds a student to a study group and removes her from it.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('studies', 'manage_class_groups', 'ניהול קבוצות לימוד', 'Управление учебными группами', 'Manage class groups', 'פתיחה, עריכה וסגירה של קבוצות לימוד.', 'Создание, правка и закрытие учебных групп.', 'Creates, edits and closes class groups.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('studies', 'manage_class_teachers', 'שיוך מורות לקבוצות', 'Управление преподавателями групп', 'Assign teachers to groups', 'קביעת מי מלמדת כל קבוצה.', 'Назначение, кто ведёт каждую группу.', 'Sets who teaches each group.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('studies', 'mark_attendance', 'רישום נוכחות', 'Отметка посещаемости', 'Mark attendance', 'סימון נוכחות והיעדרות בשיעורים.', 'Отметка присутствия и отсутствия на уроках.', 'Records presence and absence in lessons.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('studies', 'set_grades', 'הזנת ציונים', 'Выставление оценок', 'Enter grades', 'הזנה ועריכה של ציונים בגיליון הקבוצה, כולל ציון שכבר פורסם.', 'Ввод и правка оценок в ведомости группы, включая уже опубликованные.', 'Enters and edits grades in the group sheet, including already published ones.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('studies', 'set_lesson_topics', 'רישום נושאי שיעור', 'Заполнение тем уроков', 'Record lesson topics', 'מילוי מה נלמד בכל שיעור.', 'Указание, что пройдено на каждом уроке.', 'Fills in what was covered in each lesson.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('studies', 'write_evaluation', 'כתיבת חוות דעת', 'Написание характеристики', 'Write an evaluation', 'כתיבת הערכה על תלמידה בתיק הלימודים שלה.', 'Написание оценки о студентке в её учебном деле.', 'Writes an assessment of a student in her study file.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('studies', 'manage_communities', 'ניהול קהילות', 'Управление общинами', 'Manage communities', 'ניהול רשימת הקהילות ושיוך התלמידות אליהן.', 'Ведение списка общин и привязка студенток.', 'Maintains the community list and assigns students to it.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('studies', 'manage_subjects', 'ניהול מקצועות', 'Управление предметами', 'Manage subjects', 'קטלוג מקצועות הלימוד ברמת המוסד.', 'Каталог учебных предметов на уровне учреждения.', 'The institution-level catalogue of study subjects.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('studies', 'manage_specialties', 'ניהול התמחויות', 'Управление специальностями', 'Manage specialties', 'קטלוג ההתמחויות ברמת המוסד.', 'Каталог специальностей на уровне учреждения.', 'The institution-level catalogue of specialties.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('studies', 'manage_study_groups', 'ניהול קבוצות בסיס', 'Управление базовыми группами', 'Manage base groups', 'קבוצות הבסיס שמהן נגזרות קבוצות הלימוד.', 'Базовые группы, из которых выводятся учебные.', 'The base groups that class groups derive from.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('studies', 'manage_tracks', 'ניהול מסלולי לימוד', 'Управление маршрутами обучения', 'Manage study tracks', 'קטלוג מסלולי הלימוד. החלטה ברמת המוסד — לא ניתנת למחלקה בודדת.', 'Каталог учебных маршрутов. Решение уровня учреждения.', 'The catalogue of study tracks. An institution-level decision.', 'manage', 'normal', ARRAY['all','department','own'], NULL, false),
  ('studies', 'create_kodesh_course', 'פתיחת קורס קודש', 'Создание курса кодеша', 'Create a kodesh course', 'יצירת קורס חדש בקטלוג לימודי הקודש.', 'Создание нового курса в каталоге кодеша.', 'Creates a new course in the kodesh catalogue.', 'manage', 'normal', ARRAY['all','department','own'], NULL, false),
  ('studies', 'approve_kodesh_teacher', 'אישור מורה לקודש', 'Утверждение преподавателя кодеша', 'Approve a kodesh teacher', 'אישור מי רשאית ללמד בלימודי קודש.', 'Утверждение, кто вправе преподавать кодеш.', 'Approves who may teach kodesh studies.', 'manage', 'normal', ARRAY['all','department','own'], NULL, false),
  ('studies', 'set_teacher_quota', 'קביעת מכסת שעות למורה', 'Установка часовой квоты', 'Set a teacher hour quota', 'הגדרת מספר שעות ההוראה המוקצות למורה.', 'Назначение числа учебных часов преподавателю.', 'Sets how many teaching hours a teacher is allocated.', 'manage', 'normal', ARRAY['all','department','own'], NULL, false),
  ('studies', 'manage_alerts', 'ניהול התראות על תלמידות', 'Управление оповещениями', 'Manage student alerts', 'פתיחה, עדכון וסגירה של התראות בתיק התלמידה.', 'Создание, обновление и закрытие оповещений в деле студентки.', 'Opens, updates and closes alerts in a student file.', 'edit', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('studies', 'view_sensitive_alerts', 'צפייה בהתראות רגישות', 'Просмотр чувствительных оповещений', 'View sensitive alerts', 'התראות שסומנו רגישות אינן מוצגות בלי ההרשאה הזו — גם למי שרואה את שאר התיק.', 'Оповещения с пометкой «чувствительно» без этого права не показываются.', 'Alerts flagged sensitive stay hidden without this permission, even from people who see the rest of the file.', 'view', 'critical', ARRAY['all','department','own'], NULL, false),
  ('studies', 'jewishness_initial_check', 'בירור יהדות — בדיקה ראשונית', 'Первичная проверка еврейства', 'Jewishness — initial check', 'השלב הראשון באישור היהדות של תלמידה.', 'Первый шаг подтверждения еврейства студентки.', 'The first step in confirming a student’s Jewish status.', 'manage', 'critical', ARRAY['all','department','own'], NULL, false),
  ('studies', 'jewishness_final_approve', 'בירור יהדות — אישור סופי', 'Финальное утверждение еврейства', 'Jewishness — final approval', 'השלב השני והמכריע. נפרד מהבדיקה הראשונית בכוונה — שני אנשים שונים.', 'Второй, решающий шаг. Намеренно отделён от первичной проверки — два разных человека.', 'The second, decisive step. Deliberately separate from the initial check — two different people.', 'manage', 'critical', ARRAY['all','department','own'], NULL, false),
  ('jewishness', 'access', 'כניסה לבירור יהדות', 'Вход в проверку еврейства', 'Open jewishness verification', 'פותח את המודול בתפריט. מודול רגיש — מסמכים ומידע אישי.', 'Открывает модуль. Чувствительный: документы и личные данные.', 'Opens the module. Sensitive: documents and personal data.', 'access', 'critical', ARRAY['all'], NULL, false),
  ('jewishness', 'view', 'צפייה ברשומות היהדות', 'Просмотр записей', 'View verification records', 'תיקי הבירור והמסמכים שצורפו.', 'Дела проверки и приложенные документы.', 'The verification files and the documents attached to them.', 'view', 'critical', ARRAY['all','department','own'], NULL, false),
  ('jewishness', 'create', 'פתיחת רשומת בירור', 'Создание записи', 'Create a verification record', 'יצירת תיק בירור יהדות חדש.', 'Создание нового дела проверки еврейства.', 'Opens a new jewishness verification file.', 'edit', 'critical', ARRAY['all','department','own'], NULL, false),
  ('jewishness', 'edit', 'עריכת רשומת בירור', 'Редактирование записи', 'Edit a verification record', 'עדכון תיק בירור קיים והמסמכים שבו.', 'Обновление существующего дела и его документов.', 'Updates an existing verification file and its documents.', 'edit', 'critical', ARRAY['all','department','own'], NULL, false),
  ('chavruta', 'access', 'כניסה לחברותא', 'Вход в хевруту', 'Open chavruta', 'פותח את מרכז החברותא. ניתן גם אוטומטית למורות קודש — ההרשאה הזו מרחיבה מעבר לכך.', 'Открывает центр хавруты. Даётся и автоматически преподавателям кодеша — это право расширяет круг.', 'Opens the chavruta centre. Kodesh teachers get it automatically; this permission widens the circle.', 'access', 'normal', ARRAY['all'], NULL, false),
  ('finance', 'access', 'כניסה לכספים', 'Вход в финансы', 'Open finance', 'פותח את המודול בתפריט.', 'Открывает модуль в меню.', 'Shows the module in the menu.', 'access', 'sensitive', ARRAY['all'], NULL, false),
  ('finance', 'view', 'צפייה בכספים', 'Просмотр финансов', 'View finance', 'חיובים, תשלומים וקבלות של התלמידות.', 'Начисления, платежи и квитанции студенток.', 'Student charges, payments and receipts.', 'view', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('finance', 'view_student_balance', 'צפייה ביתרת תלמידה', 'Итоги студентки', 'View a student balance', 'סכומים בלבד — חויב, שולם, חוב. ללא פירוט התשלומים והאמצעים.', 'Только суммы — начислено, оплачено, долг. Без детализации платежей.', 'Totals only — charged, paid, owed. No payment detail.', 'view', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('finance', 'create_invoice', 'יצירת חיוב', 'Создание счёта', 'Create an invoice', 'הוצאת חיוב חדש לתלמידה.', 'Выставление нового счёта студентке.', 'Issues a new charge to a student.', 'edit', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('finance', 'approve_payment', 'אישור תשלום', 'Подтверждение платежа', 'Approve a payment', 'אישור שתשלום התקבל בפועל.', 'Подтверждение фактического получения платежа.', 'Confirms that a payment was actually received.', 'manage', 'critical', ARRAY['all','department','own'], NULL, false),
  ('finance', 'confirm_payment', 'אימות תשלום', 'Подтверждение оплаты', 'Confirm a payment', 'שלב אימות נוסף לתשלום שאושר.', 'Дополнительный шаг проверки подтверждённого платежа.', 'An extra verification step on an approved payment.', 'manage', 'critical', ARRAY['all','department','own'], NULL, false),
  ('finance', 'approve_discount', 'אישור הנחה', 'Утверждение скидки', 'Approve a discount', 'אישור הנחה בשכר הלימוד. הנחות גבוהות דורשות אישור נפרד.', 'Утверждение скидки по оплате обучения.', 'Approves a tuition discount.', 'manage', 'critical', ARRAY['all','department','own'], NULL, false),
  ('finance', 'manage_budget', 'ניהול תקציב', 'Управление бюджетом', 'Manage budget', 'הגדרת שכר לימוד, סעיפי תקציב ומדיניות תשלומים.', 'Настройка оплаты обучения, статей бюджета и политики платежей.', 'Sets tuition, budget lines and payment policy.', 'manage', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('finance', 'export_reports', 'ייצוא דוחות כספיים', 'Экспорт финансовых отчётов', 'Export finance reports', 'הורדת נתוני הכספים לקובץ.', 'Выгрузка финансовых данных в файл.', 'Downloads finance data to a file.', 'view', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('dormitory', 'access', 'כניסה למעונות', 'Вход в общежитие', 'Open dormitory', 'פותח את המודול בתפריט.', 'Открывает модуль в меню.', 'Shows the module in the menu.', 'access', 'normal', ARRAY['all'], NULL, false),
  ('dormitory', 'view', 'צפייה במעונות', 'Просмотр общежития', 'View dormitory', 'חדרים, מיטות ומי גרה איפה.', 'Комнаты, места и кто где живёт.', 'Rooms, beds and who lives where.', 'view', 'normal', ARRAY['all','department','own'], NULL, false),
  ('dormitory', 'manage_rooms', 'ניהול חדרים', 'Управление комнатами', 'Manage rooms', 'פתיחה, עריכה וסגירה של חדרים ומיטות.', 'Создание, правка и закрытие комнат и мест.', 'Creates, edits and closes rooms and beds.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('dormitory', 'manage_residents', 'ניהול דיירות', 'Управление жильцами', 'Manage residents', 'שיבוץ תלמידה לחדר והעברתה בין חדרים.', 'Заселение студентки и перевод между комнатами.', 'Places a student in a room and moves her between rooms.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('dormitory', 'manage', 'ניהול מלא של המעונות', 'Полное управление общежитием', 'Full dormitory management', 'כולל מדיניות מגורים והגדרות המודול.', 'Включая политику проживания и настройки модуля.', 'Includes residence policy and module settings.', 'manage', 'normal', ARRAY['all','department','own'], NULL, false),
  ('food', 'access', 'כניסה להזנה', 'Вход в питание', 'Open catering', 'פותח את המודול בתפריט.', 'Открывает модуль в меню.', 'Shows the module in the menu.', 'access', 'normal', ARRAY['all'], NULL, false),
  ('food', 'view', 'צפייה בהזנה', 'Просмотр питания', 'View catering', 'נתוני המטבח, הזמנות ורישום ארוחות.', 'Данные кухни, заказы и учёт приёмов пищи.', 'Kitchen data, orders and meal records.', 'view', 'normal', ARRAY['all','department','own'], NULL, false),
  ('food', 'view_menu', 'צפייה בתפריט', 'Просмотр меню', 'View the menu', 'התפריט השבועי בלבד, בלי נתוני ההזמנות.', 'Только недельное меню, без данных заказов.', 'The weekly menu only, without order data.', 'view', 'normal', ARRAY['all','department','own'], NULL, false),
  ('food', 'manage_menu', 'ניהול התפריט', 'Управление меню', 'Manage the menu', 'בניית התפריט השבועי ועדכונו.', 'Составление и обновление недельного меню.', 'Builds and updates the weekly menu.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('food', 'manage_orders', 'ניהול הזמנות', 'Управление заказами', 'Manage orders', 'הזמנות מזון וספירת מנות.', 'Заказы продуктов и подсчёт порций.', 'Food orders and portion counts.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('food', 'manage', 'ניהול מלא של ההזנה', 'Полное управление питанием', 'Full catering management', 'כולל ספקים והגדרות המודול.', 'Включая поставщиков и настройки модуля.', 'Includes suppliers and module settings.', 'manage', 'normal', ARRAY['all','department','own'], NULL, false),
  ('doctor', 'access', 'כניסה למרפאה', 'Вход в медпункт', 'Open the clinic', 'פותח את המודול בתפריט. רשומות רפואיות — המידע הרגיש ביותר במערכת.', 'Открывает модуль. Медицинские записи — самое чувствительное в системе.', 'Opens the module. Medical records are the most sensitive data in the system.', 'access', 'critical', ARRAY['all'], NULL, false),
  ('doctor', 'view', 'צפייה ברשומות רפואיות', 'Просмотр медицинских записей', 'View medical records', 'תיקים רפואיים של תלמידות. לא מופיע כלל בתיק החינוכי.', 'Медкарты студенток. В учебном деле не показываются вовсе.', 'Student medical files. They never appear in the education file.', 'view', 'critical', ARRAY['all','department','own'], NULL, false),
  ('doctor', 'create', 'פתיחת רשומה רפואית', 'Создание медицинской записи', 'Create a medical record', 'יצירת רישום ביקור או ממצא.', 'Создание записи о визите или наблюдении.', 'Records a visit or a finding.', 'edit', 'critical', ARRAY['all','department','own'], NULL, false),
  ('doctor', 'edit', 'עריכת רשומה רפואית', 'Редактирование медицинской записи', 'Edit a medical record', 'עדכון רישום רפואי קיים.', 'Обновление существующей записи.', 'Updates an existing medical record.', 'edit', 'critical', ARRAY['all','department','own'], NULL, false),
  ('doctor', 'manage', 'ניהול מלא של המרפאה', 'Полное управление медпунктом', 'Full clinic management', 'כולל הגדרות המודול ומחיקת רשומות.', 'Включая настройки модуля и удаление записей.', 'Includes module settings and record deletion.', 'manage', 'critical', ARRAY['all','department','own'], NULL, false),
  ('psychologist', 'access', 'כניסה לייעוץ הרגשי', 'Вход в психологическую службу', 'Open counselling', 'פותח את המודול בתפריט. מידע רגיש ביותר.', 'Открывает модуль. Крайне чувствительные данные.', 'Opens the module. Highly sensitive data.', 'access', 'critical', ARRAY['all'], NULL, false),
  ('psychologist', 'view', 'צפייה ברשומות הייעוץ', 'Просмотр записей психолога', 'View counselling records', 'תיקי הייעוץ הרגשי. לא מופיעים בתיק החינוכי.', 'Дела психологической службы. В учебном деле не показываются.', 'Counselling files. They never appear in the education file.', 'view', 'critical', ARRAY['all','department','own'], NULL, false),
  ('psychologist', 'create', 'פתיחת רשומת ייעוץ', 'Создание записи психолога', 'Create a counselling record', 'יצירת רישום פגישה.', 'Создание записи о встрече.', 'Records a session.', 'edit', 'critical', ARRAY['all','department','own'], NULL, false),
  ('psychologist', 'edit', 'עריכת רשומת ייעוץ', 'Редактирование записи психолога', 'Edit a counselling record', 'עדכון רישום קיים.', 'Обновление существующей записи.', 'Updates an existing record.', 'edit', 'critical', ARRAY['all','department','own'], NULL, false),
  ('psychologist', 'manage', 'ניהול מלא של הייעוץ', 'Полное управление службой', 'Full counselling management', 'כולל הגדרות המודול ומחיקת רשומות.', 'Включая настройки модуля и удаление записей.', 'Includes module settings and record deletion.', 'manage', 'critical', ARRAY['all','department','own'], NULL, false),
  ('documents', 'access', 'כניסה למסמכים', 'Вход в документы', 'Open documents', 'פותח את המודול בתפריט.', 'Открывает модуль в меню.', 'Shows the module in the menu.', 'access', 'sensitive', ARRAY['all'], NULL, false),
  ('documents', 'view', 'צפייה במסמכים', 'Просмотр документов', 'View documents', 'מסמכי התלמידות והאישורים שהופקו.', 'Документы студенток и выданные справки.', 'Student documents and issued certificates.', 'view', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('documents', 'create', 'הפקת מסמך', 'Создание документа', 'Create a document', 'יצירת אישור או מסמך חדש מתבנית.', 'Создание справки или документа по шаблону.', 'Issues a certificate or document from a template.', 'edit', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('documents', 'manage_templates', 'ניהול תבניות', 'Управление шаблонами', 'Manage templates', 'עריכת התבניות שמהן מופקים כל האישורים.', 'Правка шаблонов, по которым выдаются все справки.', 'Edits the templates every certificate is issued from.', 'manage', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('documents', 'manage', 'ניהול מלא של המסמכים', 'Полное управление документами', 'Full document management', 'כולל מחיקת מסמכים והגדרות המודול.', 'Включая удаление документов и настройки модуля.', 'Includes deleting documents and module settings.', 'manage', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('reports', 'access', 'כניסה לדוחות', 'Вход в отчёты', 'Open reports', 'פותח את המודול בתפריט.', 'Открывает модуль в меню.', 'Shows the module in the menu.', 'access', 'normal', ARRAY['all'], NULL, false),
  ('reports', 'view', 'צפייה בדוחות', 'Просмотр отчётов', 'View reports', 'כל דוח שייך למודול — נראים רק דוחות של מודולים שפתוחים לאדם.', 'Каждый отчёт принадлежит модулю — видны только отчёты доступных модулей.', 'Each report belongs to a module — only reports of modules the person can open are shown.', 'view', 'normal', ARRAY['all','department','own'], NULL, false),
  ('reports', 'export', 'ייצוא דוחות', 'Экспорт отчётов', 'Export reports', 'הורדת תוצאות הדוח לקובץ.', 'Выгрузка результатов отчёта в файл.', 'Downloads report results to a file.', 'view', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('reports', 'manage', 'ניהול דוחות', 'Управление отчётами', 'Manage reports', 'הגדרת דוחות והפרמטרים שלהם.', 'Настройка отчётов и их параметров.', 'Configures reports and their parameters.', 'manage', 'normal', ARRAY['all','department','own'], NULL, false),
  ('contacts', 'access', 'כניסה לאנשי קשר', 'Вход в контакты', 'Open contacts', 'פותח את המודול בתפריט.', 'Открывает модуль в меню.', 'Shows the module in the menu.', 'access', 'normal', ARRAY['all'], NULL, false),
  ('contacts', 'view', 'צפייה באנשי קשר', 'Просмотр контактов', 'View contacts', 'ספר אנשי הקשר החיצוניים של המוסד.', 'Книга внешних контактов учреждения.', 'The institution’s external contact book.', 'view', 'normal', ARRAY['all','department','own'], NULL, false),
  ('contacts', 'manage', 'ניהול אנשי קשר', 'Управление контактами', 'Manage contacts', 'הוספה, עריכה ומחיקה של אנשי קשר.', 'Добавление, правка и удаление контактов.', 'Adds, edits and deletes contacts.', 'manage', 'normal', ARRAY['all','department','own'], NULL, false),
  ('alumni', 'access', 'כניסה לבוגרות', 'Вход в выпускниц', 'Open alumni', 'פותח את המודול בתפריט.', 'Открывает модуль в меню.', 'Shows the module in the menu.', 'access', 'normal', ARRAY['all'], NULL, false),
  ('alumni', 'view', 'צפייה בבוגרות', 'Просмотр выпускниц', 'View alumni', 'רשימת הבוגרות ופרטי הקשר שלהן.', 'Список выпускниц и их контакты.', 'The alumni list and their contact details.', 'view', 'normal', ARRAY['all','department','own'], NULL, false),
  ('alumni', 'manage', 'ניהול בוגרות', 'Управление выпускницами', 'Manage alumni', 'עדכון תיק בוגרת ורישום קשר מתמשך.', 'Обновление дела выпускницы и учёт связи.', 'Updates an alumna file and records ongoing contact.', 'manage', 'normal', ARRAY['all','department','own'], NULL, false),
  ('sponsors', 'access', 'כניסה לתורמים', 'Вход в спонсоров', 'Open sponsors', 'פותח את המודול בתפריט.', 'Открывает модуль в меню.', 'Shows the module in the menu.', 'access', 'sensitive', ARRAY['all'], NULL, false),
  ('sponsors', 'view', 'צפייה בתורמים', 'Просмотр спонсоров', 'View sponsors', 'רשימת התורמים, התרומות והקשר איתם.', 'Список спонсоров, пожертвований и связей.', 'The sponsor list, donations and relationships.', 'view', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('sponsors', 'manage', 'ניהול תורמים', 'Управление спонсорами', 'Manage sponsors', 'הוספה ועריכה של תורמים ותרומות.', 'Добавление и правка спонсоров и пожертвований.', 'Adds and edits sponsors and donations.', 'manage', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('maintenance', 'access', 'כניסה לתחזוקה', 'Вход в эксплуатацию', 'Open maintenance', 'פותח את המודול בתפריט.', 'Открывает модуль в меню.', 'Shows the module in the menu.', 'access', 'normal', ARRAY['all'], NULL, false),
  ('maintenance', 'view', 'צפייה בתחזוקה', 'Просмотр эксплуатации', 'View maintenance', 'קריאות שירות ומצב הטיפול בהן.', 'Заявки и статус работ по ним.', 'Service requests and their progress.', 'view', 'normal', ARRAY['all','department','own'], NULL, false),
  ('maintenance', 'manage', 'ניהול תחזוקה', 'Управление эксплуатацией', 'Manage maintenance', 'פתיחה, שיוך וסגירה של קריאות שירות.', 'Создание, назначение и закрытие заявок.', 'Opens, assigns and closes service requests.', 'manage', 'normal', ARRAY['all','department','own'], NULL, false),
  ('security', 'access', 'כניסה לאבטחה', 'Вход в безопасность', 'Open security', 'פותח את מודול האבטחה הפיזית — שומרים ואירועי ביטחון. אינו קשור לאבטחת מידע.', 'Открывает модуль физической безопасности. К информационной безопасности отношения не имеет.', 'Opens the physical-security module. Unrelated to data security.', 'access', 'sensitive', ARRAY['all'], NULL, false),
  ('security', 'view', 'צפייה באבטחה', 'Просмотр безопасности', 'View security', 'אירועי ביטחון ודוחות שמירה.', 'События безопасности и отчёты охраны.', 'Security incidents and guard reports.', 'view', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('security', 'manage', 'ניהול אבטחה', 'Управление безопасностью', 'Manage security', 'רישום אירועים, משמרות ונהלים.', 'Учёт событий, смен и регламентов.', 'Logs incidents, shifts and procedures.', 'manage', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('security', 'manage_access', 'ניהול כניסות ואישורי מעבר', 'Управление пропусками', 'Manage access passes', 'הרשאה שהוגדרה בקטלוג אך שום קוד אינו בודק אותה כיום.', 'Право заведено в каталоге, но никакой код его сейчас не проверяет.', 'Defined in the catalogue, but no code checks it today.', 'manage', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('security', 'view_logs', 'צפייה ביומן הכניסות', 'Просмотр журнала', 'View the access log', 'הרשאה שהוגדרה בקטלוג אך שום קוד אינו בודק אותה כיום.', 'Право заведено в каталоге, но никакой код его сейчас не проверяет.', 'Defined in the catalogue, but no code checks it today.', 'view', 'sensitive', ARRAY['all','department','own'], NULL, false),
  ('tasks', 'access', 'כניסה למשימות', 'Вход в задачи', 'Open tasks', 'פותח את המודול בתפריט.', 'Открывает модуль в меню.', 'Shows the module in the menu.', 'access', 'normal', ARRAY['all'], NULL, false),
  ('tasks', 'view_own', 'צפייה במשימות שלו', 'Свои задачи', 'View own tasks', 'רק משימות שהאדם יצר או שהוקצו לו.', 'Только задачи, созданные человеком или назначенные ему.', 'Only tasks this person created or was assigned.', 'view', 'normal', ARRAY['all','department','own'], NULL, false),
  ('tasks', 'view_all', 'צפייה בכל המשימות', 'Все задачи', 'View all tasks', 'משימות של כל אנשי הצוות.', 'Задачи всех сотрудников.', 'Tasks of every staff member.', 'view', 'normal', ARRAY['all','department','own'], NULL, false),
  ('tasks', 'create', 'יצירת משימה', 'Создание задачи', 'Create a task', 'פתיחת משימה חדשה.', 'Создание новой задачи.', 'Opens a new task.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('tasks', 'assign', 'הקצאת משימה', 'Назначение задачи', 'Assign a task', 'הטלת משימה על איש צוות אחר.', 'Поручение задачи другому сотруднику.', 'Assigns a task to another staff member.', 'edit', 'normal', ARRAY['all','department','own'], NULL, false),
  ('tasks', 'delete', 'מחיקת משימה', 'Удаление задачи', 'Delete a task', 'מחיקת משימה, כולל של אחרים.', 'Удаление задачи, в том числе чужой.', 'Deletes a task, including someone else’s.', 'manage', 'normal', ARRAY['all','department','own'], NULL, false),
  ('quality_control', 'access', 'כניסה להערכת הוראה', 'Вход в оценку преподавания', 'Open teaching evaluation', 'פותח את המודול בתפריט. ההרשאות הפנימיות שלו יושבות כרגע בטבלה נפרדת.', 'Открывает модуль. Внутренние права пока живут в отдельной таблице.', 'Opens the module. Its inner permissions still live in a separate table.', 'access', 'normal', ARRAY['all'], NULL, false),
  ('applicants', 'view', 'צפייה בבקשות', 'Просмотр заявок', 'View applications', 'קוד ותיק — הוחלף על ידי «צפייה במועמדות» תחת קבלה.', 'Старый код — заменён на «Просмотр абитуриентов» в приёме.', 'Legacy code — replaced by View applicants under Admission.', 'view', 'normal', ARRAY['all','department','own'], 'admission.view_applicants', true),
  ('applicants', 'create', 'יצירת בקשה', 'Создание заявки', 'Create an application', 'קוד ותיק — הוחלף על ידי «ניהול מועמדות» תחת קבלה.', 'Старый код — заменён на «Управление абитуриентами».', 'Legacy code — replaced by Manage applicants under Admission.', 'edit', 'normal', ARRAY['all','department','own'], 'admission.manage_applicants', true),
  ('applicants', 'edit', 'עריכת בקשה', 'Редактирование заявки', 'Edit an application', 'קוד ותיק — הוחלף על ידי «ניהול מועמדות» תחת קבלה.', 'Старый код — заменён на «Управление абитуриентами».', 'Legacy code — replaced by Manage applicants under Admission.', 'edit', 'normal', ARRAY['all','department','own'], 'admission.manage_applicants', true),
  ('applicants', 'change_status', 'שינוי סטטוס בקשה', 'Изменение статуса заявки', 'Change application status', 'קוד ותיק — הוחלף על ידי «רישום מועמדת כתלמידה».', 'Старый код — заменён на «Зачисление абитуриента».', 'Legacy code — replaced by Enrol an applicant.', 'edit', 'normal', ARRAY['all','department','own'], 'admission.enroll_applicant', true),
  ('applicants', 'delete', 'מחיקת בקשה', 'Удаление заявки', 'Delete an application', 'קוד ותיק — אין לו מקבילה חדשה.', 'Старый код — нового аналога нет.', 'Legacy code — it has no current equivalent.', 'manage', 'normal', ARRAY['all','department','own'], NULL, true),
  ('settings', 'access', 'כניסה להגדרות המערכת', 'Вход в настройки', 'Open system settings', 'פותח את מודול ההגדרות בתפריט.', 'Открывает модуль настроек в меню.', 'Shows the settings module in the menu.', 'access', 'critical', ARRAY['all'], NULL, false),
  ('settings', 'view', 'צפייה בהגדרות', 'Просмотр настроек', 'View settings', 'מסכי ההגדרות ללא אפשרות שינוי.', 'Экраны настроек без права изменения.', 'The settings screens, read-only.', 'view', 'critical', ARRAY['all'], NULL, false),
  ('settings', 'manage_departments', 'ניהול המבנה הארגוני', 'Управление оргструктурой', 'Manage the org structure', 'פתיחה, שינוי ומחיקה של מחלקות ויחידות. משפיע ישירות על היקף ההרשאות של כל מי שמשובץ בהן.', 'Создание, изменение и удаление подразделений. Прямо влияет на область прав всех, кто в них посажен.', 'Creates, changes and deletes departments. Directly affects the scope of everyone seated in them.', 'manage', 'critical', ARRAY['all'], NULL, false),
  ('settings', 'manage_roles', 'ניהול תפקידים והרשאות', 'Управление ролями и правами', 'Manage roles and permissions', 'שינוי מה כל תפקיד רשאי לעשות. משפיע על כל מי שמחזיק בתפקיד.', 'Изменение того, что вправе делать каждая роль. Влияет на всех её держателей.', 'Changes what each role may do. Affects everyone holding that role.', 'manage', 'critical', ARRAY['all'], NULL, false),
  ('settings', 'manage_system', 'הגדרות מערכת', 'Системные настройки', 'System settings', 'פרמטרים כלל-מערכתיים ותבניות תהליכים.', 'Общесистемные параметры и шаблоны процессов.', 'System-wide parameters and process templates.', 'manage', 'critical', ARRAY['all'], NULL, false),
  ('data_security', 'access', 'כניסה לאבטחת מידע', 'Вход в информационную безопасность', 'Open data security', 'פותח את המודול שבו רואים ומגדירים מי רואה מה בכל המערכת.', 'Открывает модуль, где видно и настраивается, кто что видит во всей системе.', 'Opens the module where you see and set who sees what across the whole system.', 'access', 'critical', ARRAY['all'], NULL, false),
  ('data_security', 'grant', 'מתן ושלילת הרשאות', 'Выдача и отзыв прав', 'Grant and revoke permissions', 'אישור או חסימה של הרשאות לאיש צוות. ההרשאה החזקה במערכת — מי שמחזיק בה יכול לפתוח לעצמו כל דבר.', 'Открытие и блокировка прав сотруднику. Самое сильное право: держатель может открыть себе что угодно.', 'Approves or blocks permissions for a staff member. The strongest permission there is — its holder can open anything to themselves.', 'manage', 'critical', ARRAY['all'], NULL, false),
  ('data_security', 'manage_tree', 'סידור מבנה ההרשאות', 'Настройка структуры прав', 'Arrange the permission structure', 'גרירה, קיבוץ והוצאת נושאים למודול עצמאי. משנה רק את התצוגה — לא את מה שמותר לאיש צוות בפועל.', 'Перетаскивание, группировка и вынос тем в отдельный модуль. Меняет только отображение, не сами права.', 'Drag, group and split topics into their own module. Changes presentation only, never what anyone may actually do.', 'manage', 'critical', ARRAY['all'], NULL, false),
  ('education', 'view_leads', 'צפייה בפניות', 'Просмотр лидов', 'View leads', 'התווית הוותיקה של ההרשאה הזו, מלפני הפיצול. עדיין פעילה — מוצגת תחת השם החדש.', 'Дореформенная подпись этого же права. По-прежнему действует — показывается под новым именем.', 'The pre-split label for this same permission. Still in force — shown under its current name.', 'view', 'normal', ARRAY['all','department','own'], 'recruitment.view_leads', true),
  ('education', 'manage_leads', 'ניהול פניות', 'Управление лидами', 'Manage leads', 'התווית הוותיקה של ההרשאה הזו, מלפני הפיצול. עדיין פעילה — מוצגת תחת השם החדש.', 'Дореформенная подпись этого же права. По-прежнему действует — показывается под новым именем.', 'The pre-split label for this same permission. Still in force — shown under its current name.', 'edit', 'normal', ARRAY['all','department','own'], 'recruitment.manage_leads', true),
  ('education', 'convert_lead', 'המרת פנייה למועמדת', 'Конвертация лида', 'Convert lead to applicant', 'התווית הוותיקה של ההרשאה הזו, מלפני הפיצול. עדיין פעילה — מוצגת תחת השם החדש.', 'Дореформенная подпись этого же права. По-прежнему действует — показывается под новым именем.', 'The pre-split label for this same permission. Still in force — shown under its current name.', 'edit', 'normal', ARRAY['all','department','own'], 'recruitment.convert_lead', true),
  ('education', 'view_applicants', 'צפייה במועמדות', 'Просмотр абитуриентов', 'View applicants', 'התווית הוותיקה של ההרשאה הזו, מלפני הפיצול. עדיין פעילה — מוצגת תחת השם החדש.', 'Дореформенная подпись этого же права. По-прежнему действует — показывается под новым именем.', 'The pre-split label for this same permission. Still in force — shown under its current name.', 'view', 'normal', ARRAY['all','department','own'], 'admission.view_applicants', true),
  ('education', 'manage_applicants', 'ניהול מועמדות', 'Управление абитуриентами', 'Manage applicants', 'התווית הוותיקה של ההרשאה הזו, מלפני הפיצול. עדיין פעילה — מוצגת תחת השם החדש.', 'Дореформенная подпись этого же права. По-прежнему действует — показывается под новым именем.', 'The pre-split label for this same permission. Still in force — shown under its current name.', 'edit', 'normal', ARRAY['all','department','own'], 'admission.manage_applicants', true),
  ('education', 'enroll_applicant', 'רישום מועמדת כתלמידה', 'Зачисление абитуриента', 'Enrol an applicant', 'התווית הוותיקה של ההרשאה הזו, מלפני הפיצול. עדיין פעילה — מוצגת תחת השם החדש.', 'Дореформенная подпись этого же права. По-прежнему действует — показывается под новым именем.', 'The pre-split label for this same permission. Still in force — shown under its current name.', 'manage', 'sensitive', ARRAY['all','department','own'], 'admission.enroll_applicant', true),
  ('education', 'view_students', 'צפייה בתלמידות', 'Просмотр студентов', 'View students', 'התווית הוותיקה של ההרשאה הזו, מלפני הפיצול. עדיין פעילה — מוצגת תחת השם החדש.', 'Дореформенная подпись этого же права. По-прежнему действует — показывается под новым именем.', 'The pre-split label for this same permission. Still in force — shown under its current name.', 'view', 'normal', ARRAY['all','department','own'], 'studies.view_students', true),
  ('education', 'manage_students', 'ניהול תיק תלמידה', 'Управление студентами', 'Manage students', 'התווית הוותיקה של ההרשאה הזו, מלפני הפיצול. עדיין פעילה — מוצגת תחת השם החדש.', 'Дореформенная подпись этого же права. По-прежнему действует — показывается под новым именем.', 'The pre-split label for this same permission. Still in force — shown under its current name.', 'edit', 'normal', ARRAY['all','department','own'], 'studies.manage_students', true),
  ('education', 'manage_enrollments', 'ניהול הרשמות לקבוצות', 'Управление записями в группы', 'Manage group enrolments', 'התווית הוותיקה של ההרשאה הזו, מלפני הפיצול. עדיין פעילה — מוצגת תחת השם החדש.', 'Дореформенная подпись этого же права. По-прежнему действует — показывается под новым именем.', 'The pre-split label for this same permission. Still in force — shown under its current name.', 'edit', 'normal', ARRAY['all','department','own'], 'studies.manage_enrollments', true),
  ('education', 'manage_class_groups', 'ניהול קבוצות לימוד', 'Управление учебными группами', 'Manage class groups', 'התווית הוותיקה של ההרשאה הזו, מלפני הפיצול. עדיין פעילה — מוצגת תחת השם החדש.', 'Дореформенная подпись этого же права. По-прежнему действует — показывается под новым именем.', 'The pre-split label for this same permission. Still in force — shown under its current name.', 'edit', 'normal', ARRAY['all','department','own'], 'studies.manage_class_groups', true),
  ('education', 'manage_class_teachers', 'שיוך מורות לקבוצות', 'Управление преподавателями групп', 'Assign teachers to groups', 'התווית הוותיקה של ההרשאה הזו, מלפני הפיצול. עדיין פעילה — מוצגת תחת השם החדש.', 'Дореформенная подпись этого же права. По-прежнему действует — показывается под новым именем.', 'The pre-split label for this same permission. Still in force — shown under its current name.', 'edit', 'normal', ARRAY['all','department','own'], 'studies.manage_class_teachers', true),
  ('education', 'mark_attendance', 'רישום נוכחות', 'Отметка посещаемости', 'Mark attendance', 'התווית הוותיקה של ההרשאה הזו, מלפני הפיצול. עדיין פעילה — מוצגת תחת השם החדש.', 'Дореформенная подпись этого же права. По-прежнему действует — показывается под новым именем.', 'The pre-split label for this same permission. Still in force — shown under its current name.', 'edit', 'normal', ARRAY['all','department','own'], 'studies.mark_attendance', true),
  ('education', 'set_grades', 'הזנת ציונים', 'Выставление оценок', 'Enter grades', 'התווית הוותיקה של ההרשאה הזו, מלפני הפיצול. עדיין פעילה — מוצגת תחת השם החדש.', 'Дореформенная подпись этого же права. По-прежнему действует — показывается под новым именем.', 'The pre-split label for this same permission. Still in force — shown under its current name.', 'edit', 'normal', ARRAY['all','department','own'], 'studies.set_grades', true),
  ('education', 'set_lesson_topics', 'רישום נושאי שיעור', 'Заполнение тем уроков', 'Record lesson topics', 'התווית הוותיקה של ההרשאה הזו, מלפני הפיצול. עדיין פעילה — מוצגת תחת השם החדש.', 'Дореформенная подпись этого же права. По-прежнему действует — показывается под новым именем.', 'The pre-split label for this same permission. Still in force — shown under its current name.', 'edit', 'normal', ARRAY['all','department','own'], 'studies.set_lesson_topics', true),
  ('education', 'manage_subjects', 'ניהול מקצועות', 'Управление предметами', 'Manage subjects', 'התווית הוותיקה של ההרשאה הזו, מלפני הפיצול. עדיין פעילה — מוצגת תחת השם החדש.', 'Дореформенная подпись этого же права. По-прежнему действует — показывается под новым именем.', 'The pre-split label for this same permission. Still in force — shown under its current name.', 'edit', 'normal', ARRAY['all','department','own'], 'studies.manage_subjects', true),
  ('education', 'manage_specialties', 'ניהול התמחויות', 'Управление специальностями', 'Manage specialties', 'התווית הוותיקה של ההרשאה הזו, מלפני הפיצול. עדיין פעילה — מוצגת תחת השם החדש.', 'Дореформенная подпись этого же права. По-прежнему действует — показывается под новым именем.', 'The pre-split label for this same permission. Still in force — shown under its current name.', 'edit', 'normal', ARRAY['all','department','own'], 'studies.manage_specialties', true),
  ('education', 'manage_study_groups', 'ניהול קבוצות בסיס', 'Управление базовыми группами', 'Manage base groups', 'התווית הוותיקה של ההרשאה הזו, מלפני הפיצול. עדיין פעילה — מוצגת תחת השם החדש.', 'Дореформенная подпись этого же права. По-прежнему действует — показывается под новым именем.', 'The pre-split label for this same permission. Still in force — shown under its current name.', 'edit', 'normal', ARRAY['all','department','own'], 'studies.manage_study_groups', true)
) AS v(module, privilege_code, name_he, name_ru, name_en,
        description_he, description_ru, description_en,
        level, risk, allowed_scopes, superseded_by, is_legacy)
WHERE mp.module = v.module AND mp.privilege_code = v.privilege_code;


-- ── 4. Подстраховка: ни одна строка каталога не остаётся без подписи ─────────
--
-- На целевой БД каталог уже расходился с миграциями (см. 20260705140000: там
-- обнаружилось 20 строк вместо 52). Поэтому здесь НЕ RAISE EXCEPTION: упасть на
-- неожиданной строке значит заблокировать всю миграцию из-за одной подписи.
-- Вместо этого непокрытые строки получают подпись из старого privilege_name —
-- экран останется рабочим, а отсутствие ОБЪЯСНЕНИЯ (description_he) модуль
-- «Безопасность данных» показывает как пометку «нет объяснения» с кнопкой
-- дописать: объяснение обязано быть написано человеком, выдумывать его нельзя.
UPDATE module_privileges
   SET name_he = COALESCE(name_he, privilege_name),
       name_ru = COALESCE(name_ru, privilege_name),
       name_en = COALESCE(name_en, privilege_name)
 WHERE name_he IS NULL OR name_ru IS NULL OR name_en IS NULL;

DO $$
DECLARE undescribed INT;
BEGIN
  SELECT count(*) INTO undescribed FROM module_privileges WHERE description_he IS NULL;
  IF undescribed > 0 THEN
    RAISE NOTICE 'Строк каталога без объяснения на иврите: % — они видны в «Безопасности данных» с пометкой «нет объяснения»', undescribed;
  END IF;
END $$;
