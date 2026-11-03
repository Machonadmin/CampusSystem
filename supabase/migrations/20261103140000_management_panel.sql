-- ═════════════════════════════════════════════════════════════════════
-- פאנל ניהול: סיכומי אסיפות + מטרות עם אבני דרך (דרישות מנהל טורו, 2026-11-03).
--
-- management_meetings          — אסיפה: дата, название, סיכום, החלטות.
-- management_meeting_attendees — участники אסיפה.
-- management_goals             — מטרה: ответственный, срок, статус, % выполнения;
--                                 может быть поставлена на אסיפה (meeting_id).
-- management_goal_milestones   — אבן דרך מטרה: название, срок, ответственный, выполнено.
--
-- Видимость (решает API, не RLS): создатель, участники אסיפה, ответственные
-- за מטרה/אבן דרך; superadmin — всё.
-- Сроки попадают в личный календарь через calendar_events
-- (source_type = 'meeting' | 'goal' | 'goal_milestone') — так они видны и в
-- календаре приложения, и в подписке Google.
--
-- Идемпотентно. Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS management_meetings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  meeting_date  date NOT NULL,
  meeting_time  time,
  summary       text,
  decisions     text,
  created_by    uuid REFERENCES persons(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_management_meetings_date ON management_meetings(meeting_date DESC);

CREATE TABLE IF NOT EXISTS management_meeting_attendees (
  meeting_id  uuid NOT NULL REFERENCES management_meetings(id) ON DELETE CASCADE,
  person_id   uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meeting_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_management_meeting_attendees_person ON management_meeting_attendees(person_id);

CREATE TABLE IF NOT EXISTS management_goals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text,
  owner_id     uuid REFERENCES persons(id) ON DELETE SET NULL,
  meeting_id   uuid REFERENCES management_meetings(id) ON DELETE SET NULL,
  start_date   date,
  target_date  date,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','dropped')),
  progress     smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  created_by   uuid REFERENCES persons(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT management_goals_dates CHECK (start_date IS NULL OR target_date IS NULL OR target_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_management_goals_owner ON management_goals(owner_id);
CREATE INDEX IF NOT EXISTS idx_management_goals_meeting ON management_goals(meeting_id);

CREATE TABLE IF NOT EXISTS management_goal_milestones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     uuid NOT NULL REFERENCES management_goals(id) ON DELETE CASCADE,
  title       text NOT NULL,
  due_date    date,
  owner_id    uuid REFERENCES persons(id) ON DELETE SET NULL,
  done_at     timestamptz,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_management_goal_milestones_goal ON management_goal_milestones(goal_id);
CREATE INDEX IF NOT EXISTS idx_management_goal_milestones_owner ON management_goal_milestones(owner_id);

DROP TRIGGER IF EXISTS set_updated_at_management_meetings ON management_meetings;
CREATE TRIGGER set_updated_at_management_meetings
  BEFORE UPDATE ON management_meetings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_management_goals ON management_goals;
CREATE TRIGGER set_updated_at_management_goals
  BEFORE UPDATE ON management_goals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_management_goal_milestones ON management_goal_milestones;
CREATE TRIGGER set_updated_at_management_goal_milestones
  BEFORE UPDATE ON management_goal_milestones FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Как и все таблицы схемы (миграция 20260908120000): доступ только с сервера.
ALTER TABLE management_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE management_meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE management_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE management_goal_milestones ENABLE ROW LEVEL SECURITY;
