-- ============================================================================
-- Блокировка входа после неудачных попыток (аудит безопасности 2026-09-23).
--
-- Лимит попыток по IP живёт в памяти сервера и не мешает перебирать пароль
-- одного человека с многих адресов. Теперь счётчик хранится в самом аккаунте
-- (lib/auth/account-lockout.ts):
--   failed_login_count — неудачи подряд с последнего успешного входа;
--   locked_until       — до этого момента вход закрыт даже с верным паролем.
-- После 10 неудач подряд вход закрывается на 15 минут. Успешный вход и сброс
-- пароля администратором обнуляют оба поля.
--
-- Код готов к любому порядку: до миграции он читает аккаунт без этих колонок
-- и ничего не пишет. Идемпотентно. Применять ВРУЧНУЮ в Supabase SQL Editor.
-- Ожидаемый результат: "Success. No rows returned".
-- ============================================================================

ALTER TABLE public.person_accounts
  ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

ALTER TABLE public.student_credentials
  ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;
