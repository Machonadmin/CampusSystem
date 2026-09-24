-- ═════════════════════════════════════════════════════════════════════
-- הערכת הוראה לפי מחלקה — привязка сбора обратной связи к подразделению.
--
-- Решение владельца: менеджер подразделения (напр. менеджер лимудей-кодеш)
-- должен видеть/вести сборы ТОЛЬКО по преподавателям своего подразделения, а не
-- по всему институту. Для этого у сбора появляется department_id.
--
--   • NULL department_id — «старый» институтский сбор: видят/ведут только
--     superadmin и менеджеры со scope='all' (обратная совместимость).
--   • Непустой department_id — сбор конкретного подразделения: видит/ведёт тот,
--     у кого manage_students в этом подразделении (или superadmin).
--
-- Идемпотентно, deploy-safe (ADD COLUMN IF NOT EXISTS).
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE teaching_surveys
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_teaching_surveys_department
  ON teaching_surveys(department_id);
