-- ═════════════════════════════════════════════════════════════════════
-- Шаблоны процессов на трёх языках (wording-review L04 / S5, решение
-- владельца 2026-10-08: «должно работать на иврите и английском так же,
-- как на русском, с точным переводом»).
--
-- ДО: у process_templates / stage_templates / stage_finals было только
-- name_ru (и description по-русски). Редактор «תבניות תהליכים» показывал
-- русские названия и коды, а поле «שם» меняло только русское имя — в
-- ивритском интерфейсе ничего не менялось.
--
-- ПОСЛЕ:
--   name_he / name_en — НЕОБЯЗАТЕЛЬНЫЕ переопределения названия. NULL =
--     показывать стандартный перевод системы по коду (словарь
--     education.process.*, тот же, что в карточке лида). Если админ впишет
--     название в редакторе — именно его увидит персонал в редакторе, в блоке
--     процесса карточки и на схеме процесса (lib/workflow/labels.ts).
--     Поэтому здесь они НЕ заполняются: стандартные переводы уже точные и
--     живут в одном месте (словарь), а не в двух.
--   description_he / description_en — описания процессов/этапов; для четырёх
--     существующих процессов заполняются переводом русского описания.
--
-- name_ru остаётся внутренним именем шаблона: в нём движок (start_process и
-- др.) пишет системные события, поэтому он не меняется.
--
-- Аддитивно и идемпотентно. Код читает эти колонки через select('*') и
-- работает и до применения миграции (просто без переопределений).
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE process_templates
  ADD COLUMN IF NOT EXISTS name_he        TEXT,
  ADD COLUMN IF NOT EXISTS name_en        TEXT,
  ADD COLUMN IF NOT EXISTS description_he TEXT,
  ADD COLUMN IF NOT EXISTS description_en TEXT;

ALTER TABLE stage_templates
  ADD COLUMN IF NOT EXISTS name_he        TEXT,
  ADD COLUMN IF NOT EXISTS name_en        TEXT,
  ADD COLUMN IF NOT EXISTS description_he TEXT,
  ADD COLUMN IF NOT EXISTS description_en TEXT;

ALTER TABLE stage_finals
  ADD COLUMN IF NOT EXISTS name_he TEXT,
  ADD COLUMN IF NOT EXISTS name_en TEXT;

COMMENT ON COLUMN process_templates.name_he IS
  'Название на иврите, заданное в редакторе. NULL = стандартный перевод по коду (education.process.names.*).';
COMMENT ON COLUMN process_templates.name_en IS
  'Название на английском, заданное в редакторе. NULL = стандартный перевод по коду.';
COMMENT ON COLUMN stage_templates.name_he IS
  'Название этапа на иврите, заданное в редакторе. NULL = стандартный перевод по коду (education.process.stages.*).';
COMMENT ON COLUMN stage_templates.name_en IS
  'Название этапа на английском, заданное в редакторе. NULL = стандартный перевод по коду.';
COMMENT ON COLUMN stage_finals.name_he IS
  'Название исхода на иврите, заданное в редакторе. NULL = стандартный перевод по коду (education.process.finals.* / acceptance_finals.*).';
COMMENT ON COLUMN stage_finals.name_en IS
  'Название исхода на английском, заданное в редакторе. NULL = стандартный перевод по коду.';

-- Описания существующих процессов — перевод русского текста. Только если ещё
-- пусто (админ мог уже написать своё).
UPDATE process_templates pt SET
  description_he = COALESCE(pt.description_he, v.he),
  description_en = COALESCE(pt.description_en, v.en)
FROM (VALUES
  ('recruitment',
   'עבודה עם ליד עד להעברתו לוועדת הקבלה',
   'Working with a lead until she is handed to the admission committee'),
  ('acceptance',
   'קבלה בכמה שלבים: לימודים, פנימייה, יהדות, (רופא), אישור סופי',
   'Multi-stage admission: studies, dormitory, Jewishness, (doctor), final approval'),
  ('acceptance_v2',
   'קבלה לפי סדר: בירור יהדות ← בדיקה לימודית ← פנימייה (אם צריך) ← אישור סופי',
   'Sequential admission: Jewishness → studies → dormitory (if needed) → final approval'),
  ('admission',
   'תהליך ועדת הקבלה: ממועמדת לתלמידה',
   'Admission committee process: from applicant to student')
) AS v(code, he, en)
WHERE pt.code = v.code;
