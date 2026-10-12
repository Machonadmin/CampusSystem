-- ═════════════════════════════════════════════════════════════════════
-- «תמונת פרופיל»: новый вид документа + право видеть фото в кружке у имени.
--
-- Решение владельца (замечание сотрудника 10-11 → «כן על התמונה»):
--   • секретариат загружает фото как обычный документ, вид «תמונת פרופיל»
--     (doc_type = 'photo'); файл виден в списке документов как любой другой;
--   • последнее активное фото этого вида показывается в кружке рядом с именем
--     в «מאגר האנשים», нажатие увеличивает его;
--   • пока фото в кружке видит только владелец (superadmin проходит любое
--     право), остальные видят инициалы. Позже владелец сам выдаёт право
--     persons.view_photos людям на экране «אבטחת מידע».
--
-- persons.photo_url НЕ используется: его уже отдают API врача, психолога,
-- יהדות и др. — фото утекло бы мимо права.
--
-- Идемпотентно: CHECK пересоздаётся, вставки — ON CONFLICT DO NOTHING.
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════


-- 1. doc_type: добавить 'photo'. CHECK был объявлен прямо в колонке
--    (20260707180000), поэтому имя у него системное — снимаем любой CHECK на
--    document_records, который упоминает doc_type, и ставим новый.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.document_records'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%doc_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.document_records DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE document_records
  ADD CONSTRAINT document_records_doc_type_check CHECK (doc_type IN (
    'id_card', 'passport', 'certificate', 'medical',
    'financial', 'contract', 'visa', 'other', 'photo'
  ));


-- 2. Право в каталоге. Никому не выдаётся — владелец выдаёт людям сам.
--    Номер — следующий свободный в диапазоне «просмотр» модуля (100+n).
INSERT INTO module_privileges (
  module, privilege_code, privilege_name, sort_order,
  name_he, name_ru, name_en,
  description_he, description_ru, description_en,
  level, risk, allowed_scopes
)
SELECT
  'persons', 'view_photos', 'Просмотр фото профиля',
  COALESCE((
    SELECT max(sort_order) FROM module_privileges
    WHERE module = 'persons' AND sort_order BETWEEN 100 AND 199
  ), 100) + 1,
  'צפייה בתמונות פרופיל',
  'Просмотр фото профиля',
  'View profile photos',
  'מציג בעיגול ליד השם את תמונת הפרופיל האחרונה שהועלתה במסמכים (סוג "תמונת פרופיל"), ולחיצה מגדילה אותה. בלי ההרשאה מוצגים ראשי תיבות.',
  'Показывает в кружке у имени последнее фото профиля из документов (вид «Фото профиля»), нажатие увеличивает его. Без права — инициалы.',
  'Shows the latest profile photo from documents (type "Profile photo") in the circle next to the name; tapping enlarges it. Without it, initials are shown.',
  'view', 'sensitive', ARRAY['all']
ON CONFLICT (module, privilege_code) DO NOTHING;


-- 3. Место на экране «אבטחת מידע»: рядом с «צפייה בפרטים אישיים רגישים».
--    Если того права в дереве нет, новое попадёт в «ללא תחום» — не пропадёт.
INSERT INTO security_tree_items (node_id, module, privilege_code, sort_order)
SELECT node_id, 'persons', 'view_photos', sort_order + 1
FROM security_tree_items
WHERE module = 'persons' AND privilege_code = 'view_sensitive'
ON CONFLICT (module, privilege_code) DO NOTHING;
