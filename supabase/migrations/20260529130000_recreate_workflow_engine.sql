-- ═════════════════════════════════════════════════════════
-- ШАГ A: DROP всех существующих таблиц движка
-- ═════════════════════════════════════════════════════════

-- Сначала убрать связь tasks → stage_instances
ALTER TABLE tasks DROP COLUMN IF EXISTS stage_instance_id;

-- DROP CASCADE для всех таблиц движка
DROP TABLE IF EXISTS stage_actions CASCADE;
DROP TABLE IF EXISTS stage_instances CASCADE;
DROP TABLE IF EXISTS process_instances CASCADE;
DROP TABLE IF EXISTS stage_transitions CASCADE;
DROP TABLE IF EXISTS stage_finals CASCADE;
DROP TABLE IF EXISTS stage_task_templates CASCADE;
DROP TABLE IF EXISTS stage_templates CASCADE;
DROP TABLE IF EXISTS process_templates CASCADE;

-- ═════════════════════════════════════════════════════════
-- ШАГ B: Создать заново по спецификации
-- ═════════════════════════════════════════════════════════

CREATE TABLE process_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  name_ru         TEXT NOT NULL,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE process_templates IS 'Шаблоны бизнес-процессов (Набор, Приём, ...)';

CREATE TABLE stage_templates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_template_id   UUID NOT NULL REFERENCES process_templates(id) ON DELETE CASCADE,
  code                  TEXT NOT NULL,
  name_ru               TEXT NOT NULL,
  description           TEXT,
  has_tasks             BOOLEAN NOT NULL DEFAULT false,
  has_action_log        BOOLEAN NOT NULL DEFAULT true,
  is_optional           BOOLEAN NOT NULL DEFAULT false,
  is_addable            BOOLEAN NOT NULL DEFAULT false,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (process_template_id, code)
);

COMMENT ON TABLE stage_templates IS 'Подэтапы шаблона процесса';
COMMENT ON COLUMN stage_templates.is_optional IS 'Подэтап может быть пропущен при создании экземпляра';
COMMENT ON COLUMN stage_templates.is_addable IS 'Подэтап можно добавить в уже запущенный экземпляр';

CREATE TABLE stage_task_templates (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_template_id        UUID NOT NULL REFERENCES stage_templates(id) ON DELETE CASCADE,
  code                     TEXT NOT NULL,
  title                    TEXT NOT NULL,
  description              TEXT,
  default_assignee_type    TEXT CHECK (default_assignee_type IN ('role', 'department', 'creator', 'manual')),
  default_role_code        TEXT,
  default_priority         TEXT NOT NULL DEFAULT 'normal' CHECK (default_priority IN ('low', 'normal', 'high', 'urgent')),
  default_due_days         INTEGER,
  sort_order               INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (stage_template_id, code)
);

COMMENT ON TABLE stage_task_templates IS 'Задачи, которые автогенерируются при активации подэтапа';
COMMENT ON COLUMN stage_task_templates.default_due_days IS 'Срок выполнения = сегодня + due_days (если null — без срока)';

CREATE TABLE stage_finals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_template_id   UUID NOT NULL REFERENCES stage_templates(id) ON DELETE CASCADE,
  code                TEXT NOT NULL,
  name_ru             TEXT NOT NULL,
  is_positive         BOOLEAN NOT NULL DEFAULT true,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  UNIQUE (stage_template_id, code)
);

COMMENT ON TABLE stage_finals IS 'Возможные варианты завершения подэтапа';

CREATE TABLE stage_transitions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_stage_template_id   UUID REFERENCES stage_templates(id) ON DELETE CASCADE,
  to_stage_template_id     UUID NOT NULL REFERENCES stage_templates(id) ON DELETE CASCADE,
  trigger_final_code       TEXT,
  activation_mode          TEXT NOT NULL DEFAULT 'after_one' CHECK (activation_mode IN ('after_one', 'after_all')),
  sort_order               INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE stage_transitions IS 'Переходы между подэтапами шаблона. NULL from = начальный подэтап.';

CREATE TABLE process_instances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_template_id UUID NOT NULL REFERENCES process_templates(id),
  journey_id          UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  collected_data      JSONB NOT NULL DEFAULT '{}',
  started_at          TIMESTAMPTZ DEFAULT NOW(),
  finished_at         TIMESTAMPTZ,
  finish_reason       TEXT,
  created_by          UUID REFERENCES persons(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (journey_id, process_template_id, status) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_process_instances_journey ON process_instances(journey_id);
CREATE INDEX idx_process_instances_status ON process_instances(status);

COMMENT ON TABLE process_instances IS 'Экземпляр процесса для конкретного journey';

CREATE TABLE stage_instances (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_instance_id   UUID NOT NULL REFERENCES process_instances(id) ON DELETE CASCADE,
  stage_template_id     UUID NOT NULL REFERENCES stage_templates(id),
  status                TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'skipped', 'cancelled')),
  final_code            TEXT,
  result_data           JSONB,
  activated_at          TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  completed_by          UUID REFERENCES persons(id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stage_instances_process ON stage_instances(process_instance_id);
CREATE INDEX idx_stage_instances_status ON stage_instances(status);

COMMENT ON TABLE stage_instances IS 'Состояние конкретного подэтапа в экземпляре процесса';

CREATE TABLE stage_actions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_instance_id     UUID NOT NULL REFERENCES stage_instances(id) ON DELETE CASCADE,
  action_type           TEXT NOT NULL,
  content               TEXT NOT NULL,
  metadata              JSONB,
  created_by            UUID REFERENCES persons(id),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stage_actions_stage ON stage_actions(stage_instance_id);
CREATE INDEX idx_stage_actions_created ON stage_actions(created_at DESC);

COMMENT ON TABLE stage_actions IS 'Лента действий подэтапа';

-- Восстановить связь tasks → stage_instances
ALTER TABLE tasks ADD COLUMN stage_instance_id UUID REFERENCES stage_instances(id) ON DELETE SET NULL;
CREATE INDEX idx_tasks_stage_instance ON tasks(stage_instance_id);

COMMENT ON COLUMN tasks.stage_instance_id IS 'Если задача создана из подэтапа процесса, ссылка на подэтап';
