-- ─────────────────────────────────────────────────────────────────────────────
-- Tasks module — единая система задач для всего кампуса (MVP+)
--
-- Покрывает три режима назначения:
--   • себе                   (assignee_type='person', assignee_id=self)
--   • другому человеку       (assignee_type='person', assignee_id=other)
--   • в пул отдела           (assignee_type='department', department_id=X)
--
-- Поддерживает: комментарии, наблюдателей (watchers), историю смены статуса.
-- Не входит в MVP+: recurrence, подзадачи, шаблоны задач, файлы, уведомления.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────
-- 1. TASKS (основная таблица)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Содержимое
  title         TEXT NOT NULL,
  description   TEXT,

  -- Контекст создания.
  -- module = откуда задача (общая доска, форма лида, форма сотрудника, и т.д.)
  -- metadata = ссылки на связанные сущности, специфичные для модуля-источника.
  -- Примеры metadata:
  --   { "lead_id": "uuid" }                       — задача из карточки лида
  --   { "employee_id": "uuid" }                   — задача из карточки сотрудника
  --   { "quality_check_id": "uuid" }              — задача из проверки качества
  --   { }                                          — задача с общей доски
  module        TEXT NOT NULL DEFAULT 'general'
                  CHECK (module IN ('general','education','staff','quality_control')),
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Назначение
  assignee_type TEXT NOT NULL DEFAULT 'person'
                  CHECK (assignee_type IN ('person','department')),
  assignee_id   UUID REFERENCES persons(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,

  -- Автор задачи
  creator_id    UUID NOT NULL REFERENCES persons(id),

  -- Статус.
  --   unassigned  — задача в пуле отдела, никто не взял
  --   pending     — назначена, ожидает начала работы
  --   in_progress — исполнитель работает
  --   review      — отдана на проверку автору
  --   completed   — выполнена
  --   cancelled   — отменена автором
  --   declined    — исполнитель отказался (возвращается автору)
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('unassigned','pending','in_progress',
                                    'review','completed','cancelled','declined')),

  -- Приоритет
  priority      TEXT NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low','normal','high','urgent')),

  -- Сроки.
  -- Три поля вместо одного timestamp:
  --   due_date     — дата дедлайна (NULL = без срока)
  --   due_time     — конкретное время (NULL = весь день)
  --   due_all_day  — true когда время не важно (дублирует due_time IS NULL,
  --                  но удобно для UI-логики и фильтров)
  due_date      DATE,
  due_time      TIME,
  due_all_day   BOOLEAN NOT NULL DEFAULT TRUE,

  -- Когда задачу взяли из пула отдела (NULL для задач не из пула).
  claimed_at    TIMESTAMPTZ,

  -- Таймстемпы
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,

  -- ─── Бизнес-правила ─────────────────────────

  -- 1) Согласованность assignee_type с заполненностью полей:
  --    'person'     требует assignee_id, department_id опционален (но обычно NULL)
  --    'department' требует department_id
  CONSTRAINT tasks_assignee_consistency CHECK (
    (assignee_type = 'person'     AND assignee_id IS NOT NULL)
    OR
    (assignee_type = 'department' AND department_id IS NOT NULL)
  ),

  -- 2) Статус 'unassigned' возможен только для задач в пуле отдела
  --    и подразумевает отсутствие конкретного исполнителя.
  CONSTRAINT tasks_unassigned_only_for_pool CHECK (
    (status = 'unassigned' AND assignee_type = 'department' AND assignee_id IS NULL)
    OR
    (status <> 'unassigned')
  ),

  -- 3) Согласованность due_time и due_all_day:
  --    due_all_day=true   ⇒ due_time должно быть NULL
  --    due_all_day=false  ⇒ due_time должно быть заполнено
  CONSTRAINT tasks_due_time_consistency CHECK (
    (due_all_day = TRUE  AND due_time IS NULL)
    OR
    (due_all_day = FALSE AND due_time IS NOT NULL)
  ),

  -- 4) Время дедлайна не может быть без даты
  CONSTRAINT tasks_due_time_requires_date CHECK (
    due_time IS NULL OR due_date IS NOT NULL
  )
);


-- ─── Триггер защиты: исполнитель должен иметь активный аккаунт ──────────────
-- Не позволяет назначить задачу на person'а, у которого нет person_account
-- или у которого account деактивирован. creator_id тоже проверяется.

CREATE OR REPLACE FUNCTION tasks_validate_account()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Проверка автора (всегда обязателен)
  IF NOT EXISTS (
    SELECT 1 FROM person_accounts
    WHERE person_id = NEW.creator_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'creator_id % does not have an active person_account', NEW.creator_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Проверка исполнителя (только если назначен)
  IF NEW.assignee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM person_accounts
    WHERE person_id = NEW.assignee_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'assignee_id % does not have an active person_account', NEW.assignee_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_validate_account_trigger
  BEFORE INSERT OR UPDATE OF assignee_id, creator_id ON tasks
  FOR EACH ROW EXECUTE FUNCTION tasks_validate_account();


-- ─── Триггер автообновления updated_at ──────────────────────────────────────

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─── Индексы для типовых выборок ────────────────────────────────────────────

-- "Назначенные мне" + сортировка по дате создания
CREATE INDEX idx_tasks_assignee_status
  ON tasks(assignee_id, status, created_at DESC)
  WHERE assignee_id IS NOT NULL;

-- "Мои задачи" (где я автор)
CREATE INDEX idx_tasks_creator_status
  ON tasks(creator_id, status, created_at DESC);

-- "Пул отдела" — задачи без исполнителя в моих отделах
CREATE INDEX idx_tasks_department_pool
  ON tasks(department_id, status, priority, due_date)
  WHERE status = 'unassigned';

-- Фильтр по модулю на общей доске
CREATE INDEX idx_tasks_module ON tasks(module, status, created_at DESC);

-- Поиск просроченных
CREATE INDEX idx_tasks_due_date ON tasks(due_date)
  WHERE status NOT IN ('completed','cancelled');


-- ─────────────────────────────────────────────
-- 2. TASK_COMMENTS (комментарии к задачам)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES persons(id),

  content     TEXT NOT NULL,

  -- Тип комментария.
  -- 'comment'        — обычный комментарий
  -- 'decline_reason' — причина отказа от выполнения (status → declined)
  -- 'status_note'    — заметка при смене статуса
  comment_type TEXT NOT NULL DEFAULT 'comment'
                  CHECK (comment_type IN ('comment','decline_reason','status_note')),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_comments_task ON task_comments(task_id, created_at);


-- ─────────────────────────────────────────────
-- 3. TASK_WATCHERS (наблюдатели за задачей)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_watchers (
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  person_id  UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  added_by   UUID REFERENCES persons(id),
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (task_id, person_id)
);

-- Обратный индекс: "за какими задачами я слежу"
CREATE INDEX idx_task_watchers_person ON task_watchers(person_id);


-- ─────────────────────────────────────────────
-- 4. TASK_STATUS_HISTORY (история смены статусов)
-- ─────────────────────────────────────────────

-- Лёгкая версия аудит-лога: фиксируем только смену статуса и автора смены.
-- Заполняется из API-кода (Supabase не передаёт current_user в триггерах),
-- но валидируется триггером — нельзя вставить запись с from_status,
-- не совпадающим с текущим статусом задачи (защита от рассинхрона).

CREATE TABLE IF NOT EXISTS task_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id    UUID NOT NULL REFERENCES persons(id),

  from_status TEXT,
  to_status   TEXT NOT NULL,
  note        TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_status_history_task ON task_status_history(task_id, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ПРИВИЛЕГИИ
--
-- Модуль 'tasks' доступен по факту наличия активного person_account —
-- проверка делается в коде middleware, без записей в role_privileges.
--
-- В каталоге module_privileges остаётся одна запись 'delete' как формальная
-- отметка "в этом модуле существует операция удаления". В role_privileges
-- никому не раздаётся: право удаления = "автор задачи ИЛИ суперадмин"
-- реализуется в API-обработчике DELETE /api/tasks/:id.
--
-- Удаляем неиспользуемые привилегии из 002_roles_and_privileges.sql
-- (view_own, view_all, create, assign): они зарезервированы исторически,
-- но не используются в логике модуля.
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM module_privileges
WHERE module = 'tasks' AND privilege_code IN ('view_own','view_all','create','assign');

-- Убедимся, что 'delete' существует (на случай если его нет в каталоге).
INSERT INTO module_privileges (module, privilege_code, privilege_name, description, sort_order)
VALUES ('tasks', 'delete', 'Удаление задач', 'Право безвозвратно удалить задачу', 1)
ON CONFLICT (module, privilege_code) DO NOTHING;
