-- ═════════════════════════════════════════════════════════════════════
-- АРХИВ СТАРЫХ ТАБЛИЦ (выполнено владельцем вручную 2026-09-24 ~18:46Z).
--
-- 10 таблиц, которые код больше не читает, перенесены из public в схему
-- archive. Данные целы; схема archive не открыта в API, поэтому сайт их
-- не видит. Проверка перед переносом: ни одна функция/представление их не
-- упоминает; внешние ключи есть только между самими старыми таблицами.
-- Единственное упоминание в коде — предпросмотр в /api/persons/merge
-- ('students', 'person_documents'): ошибка там игнорируется (count ?? 0).
--
-- semesters НЕ переносится: на неё ссылаются finance_charges.semester_id
-- и semester_enrollments (последняя уезжает в archive вместе с FK).
--
-- Вернуть таблицу обратно:  ALTER TABLE archive.<имя> SET SCHEMA public;
-- Миграция идемпотентна: переносит только то, что ещё лежит в public.
-- ═════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS archive;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'role_privileges_archive_20260917',
    'reference_cities',
    'person_documents',
    'document_types',
    'document_categories',
    'journey_documents',
    'students',
    'semester_enrollments',
    'person_family',
    'sponsor_profiles'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA archive', t);
    END IF;
  END LOOP;
END $$;

-- Проверка (должно быть 10 строк):
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema = 'archive' ORDER BY table_name;
