-- Лента событий подэтапа
CREATE TABLE IF NOT EXISTS process_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_instance_id UUID NOT NULL REFERENCES stage_instances(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('system','note','call','meeting','message','email')),
  content TEXT NOT NULL,
  author_id UUID REFERENCES persons(id),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_process_events_stage ON process_events(stage_instance_id);
CREATE INDEX IF NOT EXISTS idx_process_events_created ON process_events(created_at DESC);
