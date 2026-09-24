-- ============================================================================
-- Закрыть вызов функций public через публичный ключ Supabase.
--
-- Контекст (аудит безопасности 2026-09-23):
--   Миграция 20260908120000 включила RLS на всех таблицах public — прямое
--   чтение таблиц публичным (anon) ключом закрыто. Но функции public по
--   умолчанию исполнимы ДЛЯ ВСЕХ (EXECUTE выдан PUBLIC), и PostgREST отдаёт их
--   как /rest/v1/rpc/<имя>.
--
--   Опасна функция из миграции 004: verify_login(p_email) объявлена
--   SECURITY DEFINER (выполняется с правами владельца, мимо RLS) и возвращает
--   password_hash, is_active и роли по любому e-mail. То есть с публичным
--   ключом можно было получить хэш пароля любого сотрудника и подбирать пароль
--   у себя, без ограничения попыток. Рядом update_last_login(p_person_id) —
--   тоже SECURITY DEFINER, пишет в person_accounts.
--
--   Обе функции приложение НЕ использует: вход проверяется в
--   app/api/auth/login/route.ts запросами под service_role.
--
-- Что делаем:
--   1. Удаляем verify_login и update_last_login (восстановимы из 004, если
--      вдруг понадобятся, но приложению они не нужны).
--   2. Отзываем EXECUTE на все функции public у PUBLIC, anon и authenticated.
--      Приложение ходит в базу только под service_role — ему явно выдаём
--      EXECUTE, так что RPC приложения (complete_stage, start_process,
--      create_application и др.) работают как раньше. Триггеры право EXECUTE
--      при срабатывании не проверяют — они тоже не затронуты.
--   3. Для функций, которые появятся позже в public: anon/authenticated не
--      получают EXECUTE автоматически (default privileges), service_role —
--      получает.
--   4. Самопроверка: если после этого anon всё ещё может вызвать хоть одну
--      SECURITY DEFINER-функцию public — миграция падает с понятным текстом.
--
-- Безопасно до и после деплоя кода: код эти функции не вызывает, а service_role
-- сохраняет все права. Идемпотентно, можно запускать повторно.
-- Применять ВРУЧНУЮ в Supabase SQL Editor. Ожидаемый результат:
-- "Success. No rows returned".
-- ============================================================================

DROP FUNCTION IF EXISTS public.verify_login(text);
DROP FUNCTION IF EXISTS public.update_last_login(uuid);

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

DO $$
DECLARE
  exposed text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO exposed
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF exposed IS NOT NULL THEN
    RAISE EXCEPTION 'Публичный ключ всё ещё может вызвать SECURITY DEFINER-функции: %', exposed;
  END IF;
END $$;
