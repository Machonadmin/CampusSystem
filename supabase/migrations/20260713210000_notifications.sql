-- ═════════════════════════════════════════════════════════════════════
-- Личные уведомления (колокольчик в шапке).
--
-- Пока один источник — приёмная комиссия: когда абитуриентка попадает на
-- ролевой этап, каждому носителю нужной роли создаётся уведомление рядом с
-- автозадачей (lib/workflow/acceptance-tasks.ts). Модель универсальна (type +
-- link + metadata), чтобы позже слать уведомления и из других модулей.
--
-- RLS в проекте отключён (service-role ключ на сервере); доступ ограничивает
-- API: пользователь видит и помечает прочитанными ТОЛЬКО свои уведомления
-- (person_id = session.person_id).
--
-- Код читает таблицу защищённо: до применения этой миграции API отдаёт пустой
-- список, а создание уведомлений — best-effort, поэтому деплой до миграции
-- безопасен (просто нет уведомлений).
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor. Идемпотентно.
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  type       TEXT NOT NULL DEFAULT 'general',
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- «Мои уведомления», новые сверху.
CREATE INDEX IF NOT EXISTS idx_notifications_person
  ON notifications(person_id, created_at DESC);

-- Быстрый счётчик непрочитанных.
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(person_id) WHERE read_at IS NULL;
