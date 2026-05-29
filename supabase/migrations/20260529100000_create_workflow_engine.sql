-- ============================================================
-- Workflow Engine: шаблоны + экземпляры бизнес-процессов
-- ============================================================

-- 1. Шаблон процесса (верхний уровень)
CREATE TABLE IF NOT EXISTS process_templates (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  description       TEXT,
  module            TEXT,                         -- 'staff' | 'education' | 'finance' | …
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Шаблон этапа (входит в процесс)
CREATE TABLE IF NOT EXISTS stage_templates (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  process_template_id   UUID        NOT NULL REFERENCES process_templates(id) ON DELETE CASCADE,
  name                  TEXT        NOT NULL,
  description           TEXT,
  sort_order            INTEGER     NOT NULL DEFAULT 0,
  is_initial            BOOLEAN     NOT NULL DEFAULT false,  -- стартовый этап
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stage_templates_process ON stage_templates(process_template_id);

-- 3. Шаблон задачи внутри этапа
CREATE TABLE IF NOT EXISTS stage_task_templates (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_template_id   UUID        NOT NULL REFERENCES stage_templates(id) ON DELETE CASCADE,
  title               TEXT        NOT NULL,
  description         TEXT,
  assignee_type       TEXT,                       -- 'person' | 'department' | 'any'
  department_id       UUID        REFERENCES departments(id) ON DELETE SET NULL,
  priority            TEXT        NOT NULL DEFAULT 'normal',
  due_days            INTEGER,                    -- срок в днях от начала этапа
  sort_order          INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stage_task_templates_stage ON stage_task_templates(stage_template_id);

-- 4. Финальные состояния (исходы) этапа
CREATE TABLE IF NOT EXISTS stage_finals (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_template_id   UUID        NOT NULL REFERENCES stage_templates(id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,       -- 'Одобрен', 'Отклонён', …
  code                TEXT        NOT NULL,       -- 'approved', 'rejected', …
  sort_order          INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stage_template_id, code)
);
CREATE INDEX IF NOT EXISTS idx_stage_finals_stage ON stage_finals(stage_template_id);

-- 5. Правила переходов между этапами
CREATE TABLE IF NOT EXISTS stage_transitions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_stage_id   UUID        NOT NULL REFERENCES stage_templates(id) ON DELETE CASCADE,
  final_id        UUID        NOT NULL REFERENCES stage_finals(id)    ON DELETE CASCADE,
  to_stage_id     UUID        REFERENCES stage_templates(id)          ON DELETE SET NULL,  -- NULL = процесс завершён
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_stage_id, final_id)
);

-- 6. Экземпляр процесса (запущенный процесс)
CREATE TABLE IF NOT EXISTS process_instances (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  process_template_id   UUID        NOT NULL REFERENCES process_templates(id) ON DELETE RESTRICT,
  entity_type           TEXT        NOT NULL,     -- 'person' | 'lead' | 'enrollment' | …
  entity_id             UUID        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'active',  -- 'active' | 'completed' | 'cancelled'
  started_by            UUID        REFERENCES persons(id) ON DELETE SET NULL,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_process_instances_template ON process_instances(process_template_id);
CREATE INDEX IF NOT EXISTS idx_process_instances_entity   ON process_instances(entity_type, entity_id);

-- 7. Экземпляр этапа
CREATE TABLE IF NOT EXISTS stage_instances (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  process_instance_id   UUID        NOT NULL REFERENCES process_instances(id) ON DELETE CASCADE,
  stage_template_id     UUID        NOT NULL REFERENCES stage_templates(id)   ON DELETE RESTRICT,
  status                TEXT        NOT NULL DEFAULT 'active',  -- 'active' | 'completed' | 'skipped'
  final_id              UUID        REFERENCES stage_finals(id) ON DELETE SET NULL,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ,
  completed_by          UUID        REFERENCES persons(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stage_instances_process ON stage_instances(process_instance_id);
CREATE INDEX IF NOT EXISTS idx_stage_instances_stage   ON stage_instances(stage_template_id);

-- 8. Лог действий внутри этапа
CREATE TABLE IF NOT EXISTS stage_actions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_instance_id   UUID        NOT NULL REFERENCES stage_instances(id) ON DELETE CASCADE,
  actor_id            UUID        REFERENCES persons(id) ON DELETE SET NULL,
  action_type         TEXT        NOT NULL,  -- 'comment' | 'final_selected' | 'task_completed' | 'file_attached'
  payload             JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stage_actions_stage_instance ON stage_actions(stage_instance_id);

-- Привязка задач к экземплярам этапов
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS stage_instance_id UUID REFERENCES stage_instances(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_stage_instance ON tasks(stage_instance_id);
