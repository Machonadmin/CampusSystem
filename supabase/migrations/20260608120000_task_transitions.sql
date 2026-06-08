-- task_transitions: переходы между задачами внутри подэтапа.
-- Аналог stage_transitions, но для задач (stage_task_templates) внутри
-- одного stage_template. from_task_code IS NULL = стартовая задача
-- (создаётся при активации подэтапа).

-- ─── UNIQUE на (stage_template_id, code) ──────────────────────────────────────
-- Нужен для логической целостности task_transitions.from/to_task_code.
-- Данные не ломаются: code уникален в рамках шаблона по факту.
ALTER TABLE stage_task_templates
  ADD CONSTRAINT stage_task_templates_stage_code_unique
  UNIQUE (stage_template_id, code);

-- ─── Таблица переходов между задачами ─────────────────────────────────────────
CREATE TABLE task_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_template_id UUID NOT NULL REFERENCES stage_templates(id)
    ON DELETE CASCADE,
  from_task_code TEXT,  -- NULL = стартовая задача
  to_task_code TEXT NOT NULL,
  activation_mode TEXT NOT NULL DEFAULT 'after_one'
    CHECK (activation_mode IN ('after_one', 'after_all')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_transitions_stage
  ON task_transitions(stage_template_id);
CREATE INDEX idx_task_transitions_from
  ON task_transitions(stage_template_id, from_task_code);

COMMENT ON TABLE task_transitions IS
  'Переходы между задачами внутри подэтапа: какая задача активирует какую при завершении';

-- ─── Связь живой задачи с её шаблоном ─────────────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS stage_task_template_id UUID
  REFERENCES stage_task_templates(id) ON DELETE SET NULL;

CREATE INDEX idx_tasks_task_template
  ON tasks(stage_task_template_id)
  WHERE stage_task_template_id IS NOT NULL;

COMMENT ON COLUMN tasks.stage_task_template_id IS
  'FK на шаблон задачи. NULL для legacy задач или для созданных вне шаблонов. Используется для task_transitions.';

-- ─── Обратная совместимость: стартовые transitions для существующих задач ─────
-- По одной "стартовой" transition (NULL → code) на каждый существующий шаблон.
-- После миграции старые подэтапы создают свои задачи как раньше.
INSERT INTO task_transitions (stage_template_id, from_task_code, to_task_code, activation_mode, sort_order)
SELECT stt.stage_template_id, NULL, stt.code, 'after_one', stt.sort_order
FROM stage_task_templates stt;
