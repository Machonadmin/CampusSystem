-- Служебная запись-«актёр» для публичных заявок с сайта.
--
-- У публичной формы заявок нет сессии/пользователя, но create_application и
-- start_process требуют actor_id (start_process — потому что стартовый подэтап
-- «Контакт» имеет задачи, а tasks.creator_id NOT NULL). Эта запись служит
-- таким actor_id и creator_id автосоздаваемых задач для публичных заявок.
--
-- Фиксированный id, чтобы код (app/api/public/applications) мог на него
-- ссылаться. Идемпотентно. full_name — GENERATED из first_name/last_name.
INSERT INTO persons (id, first_name, last_name, notes)
VALUES (
  'ffffffff-0000-4000-8000-000000000001',
  'Система',
  '(публичная заявка)',
  'Служебная запись: актёр публичной формы заявок с сайта. Не удалять.'
)
ON CONFLICT (id) DO NOTHING;
