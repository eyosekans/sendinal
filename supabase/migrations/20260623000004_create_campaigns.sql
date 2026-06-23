-- campaigns: a single email blast. html/design are the Unlayer export pair.
-- list_id is the audience; segment_rules narrows it at dispatch time.
-- scheduled_at NULL means "send immediately".
CREATE TABLE campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  subject       TEXT NOT NULL,
  from_name     TEXT NOT NULL,
  from_email    TEXT NOT NULL,
  html          TEXT NOT NULL,
  design        JSONB NOT NULL,
  list_id       UUID REFERENCES lists(id),
  segment_rules JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  scheduled_at  TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The scheduler scans for due campaigns: WHERE status='scheduled' AND scheduled_at <= NOW().
CREATE INDEX campaigns_scheduled_idx ON campaigns (scheduled_at) WHERE status = 'scheduled';
