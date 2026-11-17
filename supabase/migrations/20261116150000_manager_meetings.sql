-- ═════════════════════════════════════════════════════════════════════
-- פגישות המנהל ומזכירת המנהל (בקשת הלקוח, 2026-11-16).
--
-- Строится НА СУЩЕСТВУЮЩИХ appointments / appointment_attendees / tasks.
-- Ничего не удаляется и не переименовывается — только новые таблицы,
-- новые nullable-колонки и одна новая строка в reference_positions.
--
--   calendar_delegates          — кто ведёт чей календарь (מזכירת המנהל ведёт
--                                 календарь המנהל): видит время, участников и
--                                 тему, назначает встречи, ведёт заявки.
--   appointments.+колонки       — summary (סיכום), private_note (הערה חסויה,
--                                 только владелец), prep_notes (חומר הכנה).
--   appointment_action_items    — החלטות ומשימות: у каждой ответственный и срок;
--                                 по каждой автоматически открывается задача
--                                 (task_id) у ответственного.
--   appointment_content_viewers — кому владелец открыл СОДЕРЖАНИЕ встречи
--                                 (по умолчанию — никому, в т.ч. секретарю).
--   appointment_shares          — העברה של חלק מהמידע לגורם אחר: получатель
--                                 видит ТОЛЬКО переданный текст.
--   appointment_requests        — בקשות לפגישה от студентки (из портала) или
--                                 сотрудника: אישור / דחייה / הצעת מועד אחר.
--   appointment_documents       — מסמכים לפגישה (приватный бакет documents,
--                                 путь appointments/<id>/...).
--
-- Видимость решает API (lib/meetings/access.ts), не RLS — как во всей схеме:
-- RLS включается без политик, доступ только с сервера (service_role).
--
-- Идемпотентно. Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

-- ── 1. Кто ведёт чей календарь ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_delegates (
  owner_id     uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  delegate_id  uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  created_by   uuid REFERENCES persons(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, delegate_id),
  CONSTRAINT calendar_delegates_not_self CHECK (owner_id <> delegate_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_delegates_delegate ON calendar_delegates(delegate_id);

-- ── 2. Новые поля встречи ───────────────────────────────────────────────────
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS summary      text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS private_note text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS prep_notes   text;

-- ── 3. Решения и задачи встречи ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointment_action_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  kind            text NOT NULL DEFAULT 'task' CHECK (kind IN ('decision', 'task')),
  text            text NOT NULL,
  assignee_id     uuid REFERENCES persons(id) ON DELETE SET NULL,
  due_date        date,
  task_id         uuid REFERENCES tasks(id) ON DELETE SET NULL,
  sort_order      integer NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES persons(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appt_items_appt ON appointment_action_items(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appt_items_task ON appointment_action_items(task_id);

DROP TRIGGER IF EXISTS set_updated_at_appointment_action_items ON appointment_action_items;
CREATE TRIGGER set_updated_at_appointment_action_items
  BEFORE UPDATE ON appointment_action_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 4. Кому открыто содержание встречи ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointment_content_viewers (
  appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  person_id       uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  created_by      uuid REFERENCES persons(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (appointment_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_appt_viewers_person ON appointment_content_viewers(person_id);

-- ── 5. Передача части информации другому человеку ───────────────────────────
CREATE TABLE IF NOT EXISTS appointment_shares (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  recipient_id    uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  content         text NOT NULL,
  created_by      uuid REFERENCES persons(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  read_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_appt_shares_appt ON appointment_shares(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appt_shares_recipient ON appointment_shares(recipient_id, created_at DESC);

-- ── 6. Заявки на встречу ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointment_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  requester_id        uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  journey_id          uuid REFERENCES education_journeys(id) ON DELETE SET NULL,
  subject             text NOT NULL,
  details             text,
  preferred_times     text,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'declined', 'proposed', 'cancelled')),
  proposed_starts_at  timestamptz,
  proposed_ends_at    timestamptz,
  response_note       text,
  appointment_id      uuid REFERENCES appointments(id) ON DELETE SET NULL,
  handled_by          uuid REFERENCES persons(id) ON DELETE SET NULL,
  handled_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointment_requests_proposal CHECK (
    proposed_starts_at IS NULL OR (proposed_ends_at IS NOT NULL AND proposed_ends_at > proposed_starts_at)
  )
);
CREATE INDEX IF NOT EXISTS idx_appt_requests_owner ON appointment_requests(owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appt_requests_requester ON appointment_requests(requester_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at_appointment_requests ON appointment_requests;
CREATE TRIGGER set_updated_at_appointment_requests
  BEFORE UPDATE ON appointment_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 7. Документы к встрече ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointment_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  storage_path    text NOT NULL,
  file_name       text NOT NULL,
  mime_type       text,
  size_bytes      bigint,
  uploaded_by     uuid REFERENCES persons(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appt_documents_appt ON appointment_documents(appointment_id);

-- ── 8. Должность «מזכירת המנהל» в справочнике должностей ───────────────────
INSERT INTO reference_positions (name_ru, name_he, category, is_teaching, is_active, sort_order)
SELECT 'Секретарь директора', 'מזכירת המנהל', 'administrative', false, true, 21
WHERE NOT EXISTS (SELECT 1 FROM reference_positions WHERE name_he = 'מזכירת המנהל');

-- ── 9. RLS без политик: доступ только с сервера ─────────────────────────────
ALTER TABLE calendar_delegates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_action_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_content_viewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_shares          ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_documents       ENABLE ROW LEVEL SECURITY;
