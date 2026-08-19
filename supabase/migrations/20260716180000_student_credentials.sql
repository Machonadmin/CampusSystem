-- Учётные данные для входа СТУДЕНТКИ в её личный портал (/portal).
--
-- ВАЖНО (безопасность): это ОТДЕЛЬНАЯ таблица, НЕ person_accounts. Логин
-- сотрудника (/api/auth/login) читает только person_accounts, поэтому он
-- НИКОГДА не сможет аутентифицировать студентку, и наоборот — портальный
-- логин (/api/portal/login) читает только student_credentials.
--
-- Одна строка = одна journey (education_journeys) со статусом 'student'.
-- login_email уникален глобально. Пароль хранится только как bcrypt-хеш;
-- открытый текст возвращается сотруднику ОДИН раз при создании/сбросе.
-- Идемпотентно (можно перезапускать).

CREATE TABLE IF NOT EXISTS student_credentials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id    uuid NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  person_id     uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  login_email   text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  last_login    timestamptz,
  created_at    timestamptz DEFAULT now()
);
