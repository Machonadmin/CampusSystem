-- ═════════════════════════════════════════════════════════════════════
-- Переключение class_enrollments со students на education_journeys
--
-- До:  student_id → students(id)
-- После: journey_id → education_journeys(id)
--
-- В class_enrollments сейчас 0 записей.
-- ═════════════════════════════════════════════════════════════════════

-- 1. Удалить старый FK
ALTER TABLE class_enrollments
  DROP CONSTRAINT IF EXISTS class_enrollments_student_id_fkey;

-- 2. Удалить составной PK (student_id, class_group_id)
ALTER TABLE class_enrollments
  DROP CONSTRAINT IF EXISTS class_enrollments_pkey;

-- 3. Переименовать колонку
ALTER TABLE class_enrollments
  RENAME COLUMN student_id TO journey_id;

-- 4. Новый FK → education_journeys
ALTER TABLE class_enrollments
  ADD CONSTRAINT class_enrollments_journey_id_fkey
    FOREIGN KEY (journey_id) REFERENCES education_journeys(id) ON DELETE CASCADE;

-- 5. Восстановить PK
ALTER TABLE class_enrollments
  ADD CONSTRAINT class_enrollments_pkey PRIMARY KEY (journey_id, class_group_id);

COMMENT ON COLUMN class_enrollments.journey_id IS
  'Journey (education_journeys) со status=student, записанный в учебную группу.';

-- ─── Проверка ────────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='class_enrollments'
-- ORDER BY ordinal_position;
-- → journey_id, class_group_id, enrolled_at
--
-- SELECT conname FROM pg_constraint
-- WHERE conrelid='class_enrollments'::regclass;
-- → class_enrollments_pkey, class_enrollments_journey_id_fkey,
--   class_enrollments_class_group_id_fkey (FK на class_groups)
