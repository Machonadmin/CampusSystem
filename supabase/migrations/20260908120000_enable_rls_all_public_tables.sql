-- ============================================================================
-- Включить RLS на ВСЕХ таблицах схемы public (без политик).
--
-- Контекст (аудит Supabase, security advisor):
--   rls_disabled_in_public / sensitive_columns_exposed — таблицы схемы public
--   доступны через публичный PostgREST (anon-ключ), потому что RLS выключен.
--   Кто угодно с URL проекта и anon-ключом мог читать/писать данные напрямую,
--   в обход приложения, включая чувствительные колонки.
--
-- Приложение НИКОГДА не ходит в Supabase из браузера: сервер использует
-- SUPABASE_SECRET_KEY (service_role), а в проде явно ОТКАЗЫВАЕТСЯ падать на
-- anon-ключ (lib/supabase/server.ts). service_role ПОЛНОСТЬЮ обходит RLS.
--
-- Поэтому безопасное закрытие дыры:
--   • включаем RLS на каждой таблице public;
--   • НЕ добавляем ни одной политики → для anon/authenticated доступ ПОЛНОСТЬЮ
--     запрещён (deny-all), а приложение (service_role) продолжает работать 1-в-1.
--
-- Идемпотентно (ENABLE RLS повторно — no-op). Применять ВРУЧНУЮ в Supabase
-- SQL Editor. НОВЫЕ таблицы в будущих миграциях тоже должны включать RLS —
-- повторный прогон этого блока ловит все таблицы public.
-- ============================================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
