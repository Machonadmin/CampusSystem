-- Link quality_checks to class_groups from Education module
ALTER TABLE quality_checks
  ADD COLUMN class_group_id UUID REFERENCES class_groups(id) ON DELETE SET NULL;

COMMENT ON COLUMN quality_checks.class_group_id IS
  'Учебная группа из модуля Образование. group_name и course_name остаются как снимок (если группу удалят).';

CREATE INDEX idx_quality_checks_class_group ON quality_checks(class_group_id)
  WHERE class_group_id IS NOT NULL;
