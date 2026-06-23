-- email_events: append-only log of everything that happens to a send after it
-- leaves SES (opens, clicks, bounces, complaints, unsubscribes). metadata holds
-- the raw SES payload for bounce/complaint events.
CREATE TABLE email_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id     UUID NOT NULL REFERENCES sends(id) ON DELETE CASCADE,
  type        TEXT NOT NULL
                CHECK (type IN ('opened', 'clicked', 'bounced', 'complained', 'unsubscribed')),
  url         TEXT,                          -- destination for click events
  metadata    JSONB NOT NULL DEFAULT '{}',   -- raw SES event payload
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Analytics queries fan out from a send_id.
CREATE INDEX email_events_send_id_idx ON email_events (send_id);
