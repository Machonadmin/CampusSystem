-- Активный, но НЕвходной аккаунт для служебной записи публичной формы
-- (20260703150000). Нужен, потому что триггер tasks_validate_account
-- (20260511000343) требует, чтобы creator_id задачи имел АКТИВНЫЙ
-- person_account. Публичная форма создаёт задачу-уведомление от имени этой
-- служебной записи, значит у неё должен быть активный аккаунт.
--
-- Вход невозможен: /api/auth/login явно отклоняет аккаунт с password_hash IS
-- NULL (возвращает 401 до сверки пароля). is_active=TRUE нужно только для
-- прохождения триггера задач. У записи нет person_roles → прав нет в любом
-- случае.
INSERT INTO person_accounts (person_id, login_email, password_hash, is_active)
VALUES (
  'ffffffff-0000-4000-8000-000000000001',
  'system+public-form@campus.internal',
  NULL,
  TRUE
)
ON CONFLICT (login_email) DO NOTHING;
