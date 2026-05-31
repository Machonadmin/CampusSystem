-- ═══════════════════════════════════════════════════════════════════════════════
-- Расширение задач (tasks) и шаблонов задач этапа (stage_task_templates) для
-- поддержки исполнителя-должности ('position') и честного «не назначено».
--
-- Применено вручную через Supabase Dashboard 2026-05-31; файл добавлен для
-- соответствия репозитория состоянию БД.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. stage_task_templates: 'position' в assignee_type + новые колонки ────────
ALTER TABLE stage_task_templates
  DROP CONSTRAINT IF EXISTS stage_task_templates_default_assignee_type_check;

ALTER TABLE stage_task_templates
  ADD CONSTRAINT stage_task_templates_default_assignee_type_check
    CHECK (default_assignee_type IN ('role', 'department', 'position', 'creator', 'manual'));

ALTER TABLE stage_task_templates
  ADD COLUMN IF NOT EXISTS default_position_id   UUID REFERENCES reference_positions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

-- ─── 2. tasks: новая колонка position_id ────────────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES reference_positions(id) ON DELETE SET NULL;

-- ─── 3. tasks: расширяем assignee_type ('position', 'unassigned') ────────────────
ALTER TABLE tasks DROP CONSTRAINT tasks_assignee_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_assignee_type_check
  CHECK (assignee_type IN ('person', 'department', 'position', 'unassigned'));

-- ─── 4. tasks: согласованность типа и полей ─────────────────────────────────────
ALTER TABLE tasks DROP CONSTRAINT tasks_assignee_consistency;
ALTER TABLE tasks ADD CONSTRAINT tasks_assignee_consistency CHECK (
  (assignee_type = 'person'     AND assignee_id   IS NOT NULL) OR
  (assignee_type = 'department' AND department_id IS NOT NULL) OR
  (assignee_type = 'position'   AND position_id   IS NOT NULL) OR
  (assignee_type = 'unassigned' AND assignee_id IS NULL
                                AND department_id IS NULL
                                AND position_id IS NULL)
);

-- ─── 5. tasks: unassigned-статус для пулов department/position/unassigned ────────
ALTER TABLE tasks DROP CONSTRAINT tasks_unassigned_only_for_pool;
ALTER TABLE tasks ADD CONSTRAINT tasks_unassigned_only_for_pool CHECK (
  (status = 'unassigned'
     AND assignee_type IN ('department', 'position', 'unassigned')
     AND assignee_id IS NULL)
  OR
  (status <> 'unassigned')
);
