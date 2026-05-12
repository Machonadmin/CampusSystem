-- ═════════════════════════════════════════════════════════════════════
-- person_relatives — связи между людьми (семейные, контактные, опекуны).
--
-- Архитектурное решение: любой человеческий контакт = person с минимумом
-- полей (ФИО + телефон + email). Связь определяется отношением.
-- Один person может иметь несколько ролей (преподаватель + папа студента).
--
-- Типы отношений живут в коде (RelationType TS-enum), не в БД-enum, чтобы
-- было проще расширять.
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE person_relatives (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id      UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  relative_id    UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  relation_type  TEXT NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),

  -- Защита от self-reference
  CONSTRAINT person_relatives_no_self_ref CHECK (person_id <> relative_id),

  -- Уникальность: одна и та же роль одного и того же relative
  UNIQUE (person_id, relative_id, relation_type)
);

CREATE INDEX idx_person_relatives_person   ON person_relatives(person_id);
CREATE INDEX idx_person_relatives_relative ON person_relatives(relative_id);

COMMENT ON TABLE person_relatives IS
  'Связи между людьми: семейные, контактные, опекуны. Один person может иметь несколько ролей (например, преподаватель + папа студента).';

COMMENT ON COLUMN person_relatives.relation_type IS
  'Тип отношения: mother | father | parent | spouse | child | sibling | grandparent | guardian | community_contact | emergency_contact | other';
