-- ═══════════════════════════════════════════════════════════════════════
-- «הצעה לשיפור או באג» — канал замечаний сотрудников (решение владельца,
-- 2026-10-08).
--
-- ЗАЧЕМ. Часть сотрудников знает учреждение лучше владельца и хочет предлагать
-- изменения. Прямой доступ к Claude им давать нельзя: каждый смотрит только на
-- свой участок и не видит, что сломает в остальной системе. Поэтому:
--   • сотрудник пишет замечание (текст + скриншоты) кнопкой в шапке сайта;
--   • замечание только СОХРАНЯЕТСЯ здесь — само по себе оно ничего не меняет;
--   • раз в день (и по просьбе владельца) Claude забирает новые замечания через
--     /api/agent/feedback и приносит их владельцу в проект; что делать, решает
--     только владелец;
--   • сотрудник видит статус своего замечания на экране «ההערות שלי».
--
-- КТО МОЖЕТ ПИСАТЬ. Право feedback.submit. Не выдаётся никому автоматически:
-- владелец сам выдаёт его конкретным людям на экране «אבטחת מידע».
-- superadmin может всё (как везде в hasPrivilege).
--
-- Идемпотентно. Применять ВРУЧНУЮ в Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Таблица замечаний
CREATE TABLE IF NOT EXISTS feedback_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              TEXT NOT NULL CHECK (kind IN ('bug', 'suggestion')),
  body              TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  page_url          TEXT,
  user_agent        TEXT,
  -- [{ path, name, mime, size }] — файлы в приватном бакете feedback
  screenshots       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by        UUID NOT NULL REFERENCES persons(id),
  status            TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'in_review', 'in_progress', 'done', 'rejected')),
  owner_reply       TEXT CHECK (owner_reply IS NULL OR char_length(owner_reply) <= 2000),
  status_changed_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_reports_status     ON feedback_reports(status, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_created_by ON feedback_reports(created_by, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at_feedback_reports ON feedback_reports;
CREATE TRIGGER set_updated_at_feedback_reports
  BEFORE UPDATE ON feedback_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE feedback_reports IS
  'Замечания сотрудников (баг / предложение) для владельца. Сами ничего не меняют: владелец решает, что делать.';

-- RLS: как на всех таблицах public (миграция 20260908120000). Приложение ходит
-- в Supabase только с сервера под service_role, который RLS обходит; для
-- anon/authenticated доступ закрыт полностью. Политик НЕ добавляем намеренно.
ALTER TABLE feedback_reports ENABLE ROW LEVEL SECURITY;

-- 2. Приватный бакет для скриншотов (только через подписанные ссылки сервера)
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback', 'feedback', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Право в каталоге. Никому не выдаётся — владелец выдаёт людям сам.
INSERT INTO module_privileges (
  module, privilege_code, privilege_name, sort_order,
  name_he, name_ru, name_en,
  description_he, description_ru, description_en,
  level, risk, allowed_scopes
) VALUES (
  'feedback', 'submit', 'Отправка предложений и сообщений об ошибках', 10,
  'שליחת הצעות לשיפור ודיווח על באגים',
  'Отправка предложений и сообщений об ошибках',
  'Send suggestions and bug reports',
  'מציג בראש האתר כפתור "הצעה לשיפור או באג". ההערה מגיעה לבעל המערכת בלבד ולא משנה שום דבר בעצמה.',
  'Показывает в шапке кнопку «Предложение или ошибка». Замечание попадает только владельцу системы и само ничего не меняет.',
  'Shows a "Suggestion or bug" button in the header. The note goes only to the system owner and changes nothing by itself.',
  'edit', 'normal', ARRAY['all']
)
ON CONFLICT (module, privilege_code) DO NOTHING;
