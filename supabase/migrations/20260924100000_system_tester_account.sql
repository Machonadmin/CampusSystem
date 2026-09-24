-- ═════════════════════════════════════════════════════════════════════
-- Служебный вход «בודק מערכת (Claude)» — только просмотр.
--
-- ЗАЧЕМ. Агенты Claude должны заходить на живой сайт и смотреть экраны глазами
-- пользователя. Под аккаунтом владельца этого делать нельзя: он superadmin, и
-- случайный клик «מחק»/«שמור» ушёл бы в настоящие данные. Здесь создаётся
-- отдельный человек с отдельным входом.
--
-- ДВА ЗАМКА.
--   1. Права: только ступени access/view из каталога module_privileges, личными
--      строками person_privileges (модель владельца — права на людях, не на
--      должностях, 20260917180000). Ни одного edit/manage.
--   2. person_accounts.read_only = true → при входе в токен кладётся read_only,
--      и middleware отклоняет ЛЮБОЙ не-GET вызов /api/** — тот же механизм, что
--      у режима «צפייה כמשתמש». Даже если где-то маршрут записи проверяет
--      только факт входа, запись не пройдёт.
--
-- ВСЁ НА УРОВНЕ ПРОСМОТРА (решение владельца, 2026-09-24: «גישה להכול כולל
-- המידע הכי סודי»): включая медицину (doctor), эмоциональную консультацию
-- (psychologist), бирур яхадут (jewishness), чувствительные личные данные и
-- тревоги, настройки, «אבטחת מידע» и выгрузки отчётов (*export*, ступень view).
-- Не выдаются только устаревшие коды (is_legacy) — их уже никто не проверяет.
--
-- ИЗВЕСТНОЕ ОГРАНИЧЕНИЕ. Личная выдача даёт область «department», а у тестировщика
-- нет должности ни в одном подразделении. Экраны, которые фильтруют по
-- подразделениям пользователя (часть учебных списков), могут показаться ему
-- пустыми. Это не ошибка сайта.
--
-- ПАРОЛЬ. Не хранится в этом файле. Генерируется случайно при запуске,
-- хэшируется bcrypt'ом (pgcrypto, тот же формат, что у приложения) и
-- показывается ОДИН РАЗ в результате последнего запроса. Повторный запуск
-- выдаёт НОВЫЙ пароль (старый перестаёт работать) и заново раскладывает права.
--
-- Отключить вход: UPDATE person_accounts SET is_active = false
--                  WHERE login_email = 'claude-tester@campus.local';
--
-- Применять ВРУЧНУЮ через Supabase Dashboard → SQL Editor. Идемпотентно.
-- ═════════════════════════════════════════════════════════════════════

-- ── 1. Флаг «только чтение» на аккаунте ────────────────────────────────────
ALTER TABLE person_accounts
  ADD COLUMN IF NOT EXISTS read_only BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN person_accounts.read_only IS
  'Служебный вход только для просмотра: middleware блокирует любые изменения через API (как в режиме «צפייה כמשתמש»).';

-- ── 2. pgcrypto для bcrypt ─────────────────────────────────────────────────
-- В Supabase расширение обычно уже стоит в схеме extensions. Если его нет —
-- ставим туда. Схему ищем ниже динамически, чтобы не гадать.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── 3. Человек, аккаунт, права ─────────────────────────────────────────────
DO $$
DECLARE
  v_person_id CONSTANT UUID := 'ffffffff-0000-4000-8000-000000000002';
  v_email     CONSTANT TEXT := 'claude-tester@campus.local';
  v_schema    TEXT;
  v_password  TEXT;
  v_hash      TEXT;
  v_grants    INT;
BEGIN
  -- Случайный пароль: 32 hex-символа (122 бита случайности) + буквенный и
  -- цифровой хвост, чтобы он проходил правило «буква + цифра, от 8 символов».
  v_password := 'Ct' || replace(gen_random_uuid()::text, '-', '') || '7';

  SELECT n.nspname INTO v_schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pgcrypto';
  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'ОСТАНОВЛЕНО: расширение pgcrypto не найдено — пароль нечем захэшировать';
  END IF;
  EXECUTE format('SELECT %I.crypt($1, %I.gen_salt(''bf'', 12))', v_schema, v_schema)
     INTO v_hash USING v_password;

  -- Человек (фиксированный id, как у служебной записи публичной формы).
  INSERT INTO persons (id, first_name, last_name, notes)
  VALUES (v_person_id, 'בודק מערכת', '(Claude)',
          'Служебный вход только для просмотра — для проверки сайта агентами Claude. Не удалять без владельца.')
  ON CONFLICT (id) DO NOTHING;

  -- Аккаунт: вход активен, только чтение, без принудительной смены пароля.
  INSERT INTO person_accounts (person_id, login_email, password_hash, is_active, read_only, must_change_password)
  VALUES (v_person_id, v_email, v_hash, TRUE, TRUE, FALSE)
  ON CONFLICT (login_email) DO UPDATE
     SET password_hash        = EXCLUDED.password_hash,
         is_active            = TRUE,
         read_only            = TRUE,
         must_change_password = FALSE
   WHERE person_accounts.person_id = v_person_id;

  IF NOT EXISTS (SELECT 1 FROM person_accounts WHERE login_email = v_email AND person_id = v_person_id) THEN
    RAISE EXCEPTION 'ОСТАНОВЛЕНО: адрес % уже занят другим человеком', v_email;
  END IF;

  -- Никаких должностей: права только личные, выдаются ниже.
  DELETE FROM person_roles WHERE person_id = v_person_id;

  -- Права раскладываются заново при каждом запуске — ровно по фильтру.
  DELETE FROM person_privileges WHERE person_id = v_person_id;

  INSERT INTO person_privileges (person_id, module, privilege_code, is_granted, reason)
  SELECT v_person_id, mp.module, mp.privilege_code, TRUE,
         'Служебный вход Claude: только просмотр (20260924100000)'
    FROM module_privileges mp
   WHERE mp.level IN ('access', 'view')
     AND mp.is_legacy = FALSE;
  GET DIAGNOSTICS v_grants = ROW_COUNT;

  -- Страж: ни одного права выше просмотра.
  IF EXISTS (
    SELECT 1 FROM person_privileges pp
      LEFT JOIN module_privileges mp
        ON mp.module = pp.module AND mp.privilege_code = pp.privilege_code
     WHERE pp.person_id = v_person_id
       AND (mp.level IS NULL OR mp.level NOT IN ('access', 'view'))
  ) THEN
    RAISE EXCEPTION 'ОСТАНОВЛЕНО: у тестировщика оказалось право выше просмотра';
  END IF;

  -- Передаём результат в итоговый SELECT через настройку сессии (без таблиц).
  PERFORM set_config('campus_tester.login',    v_email,          false);
  PERFORM set_config('campus_tester.password', v_password,       false);
  PERFORM set_config('campus_tester.grants',   v_grants::text,   false);
END $$;

-- ── 4. Результат: логин и пароль (показываются один раз) ──────────────────
-- Скопировать в настройки облачной среды Claude: TEST_USER и TEST_PASSWORD.
SELECT current_setting('campus_tester.login')    AS "TEST_USER",
       current_setting('campus_tester.password') AS "TEST_PASSWORD",
       current_setting('campus_tester.grants')   AS "הרשאות צפייה שניתנו";
