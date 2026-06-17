-- Soft delete для education_journeys (лидов)
ALTER TABLE education_journeys
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES persons(id);

CREATE INDEX IF NOT EXISTS idx_education_journeys_is_deleted
  ON education_journeys(is_deleted)
  WHERE is_deleted = true;
