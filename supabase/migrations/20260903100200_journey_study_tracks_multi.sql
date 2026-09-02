-- ============================================================================
-- Judaism module (Phase 1, spec §3.2.2): a student may have a PRIMARY track and
-- additional tracks (e.g. Touro is usually "additional"). Move
-- journey_study_tracks from 1:1 (PK journey_id) to 1:N (PK journey_id+track_id)
-- with a role, enforcing at-most-one primary per journey.
--
-- ⚠ BEHAVIORAL CHANGE (flagged per CLAUDE.md): the old model unassigned a student
-- by writing track_id = NULL. A composite PK cannot hold NULL track_id, so
-- "unassign" now means DELETE the row, and track_id becomes NOT NULL. The FK
-- changes from ON DELETE SET NULL to ON DELETE RESTRICT (a track that has
-- assignments cannot be hard-deleted — the CRUD UI deactivates it instead).
-- "Exactly one primary" (presence) is guaranteed by the assignment API; the DB
-- enforces AT MOST one primary via a partial unique index.
--
-- Idempotent. Apply MANUALLY via Supabase Dashboard SQL Editor.
-- ============================================================================

-- 1) Role column (existing rows default to 'primary').
ALTER TABLE journey_study_tracks
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'primary';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journey_study_tracks_role_chk') THEN
    ALTER TABLE journey_study_tracks
      ADD CONSTRAINT journey_study_tracks_role_chk
      CHECK (role IN ('primary', 'additional'));
  END IF;
END $$;

-- 2) Drop legacy "unassigned" rows (track_id NULL) — in the 1:N model, unassigned
--    simply means no row for that journey.
DELETE FROM journey_study_tracks WHERE track_id IS NULL;

-- 3) track_id becomes mandatory.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journey_study_tracks' AND column_name = 'track_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE journey_study_tracks ALTER COLUMN track_id SET NOT NULL;
  END IF;
END $$;

-- 4) Recreate the track_id FK as ON DELETE RESTRICT (was ON DELETE SET NULL).
DO $$
DECLARE
  deltype "char";
BEGIN
  SELECT confdeltype INTO deltype FROM pg_constraint
  WHERE conname = 'journey_study_tracks_track_id_fkey';
  IF deltype = 'n' THEN
    ALTER TABLE journey_study_tracks DROP CONSTRAINT journey_study_tracks_track_id_fkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journey_study_tracks_track_id_fkey') THEN
    ALTER TABLE journey_study_tracks
      ADD CONSTRAINT journey_study_tracks_track_id_fkey
      FOREIGN KEY (track_id) REFERENCES study_tracks(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 5) Swap the single-column PK (journey_id) for a composite PK (journey_id, track_id).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'journey_study_tracks' AND c.contype = 'p' AND array_length(c.conkey, 1) = 1
  ) THEN
    ALTER TABLE journey_study_tracks DROP CONSTRAINT journey_study_tracks_pkey;
    ALTER TABLE journey_study_tracks
      ADD CONSTRAINT journey_study_tracks_pkey PRIMARY KEY (journey_id, track_id);
  END IF;
END $$;

-- 6) At most one PRIMARY track per journey.
CREATE UNIQUE INDEX IF NOT EXISTS uq_journey_study_tracks_one_primary
  ON journey_study_tracks (journey_id)
  WHERE role = 'primary';

-- Lookup by track (e.g. "who is on this track").
CREATE INDEX IF NOT EXISTS idx_journey_study_tracks_track
  ON journey_study_tracks (track_id);
