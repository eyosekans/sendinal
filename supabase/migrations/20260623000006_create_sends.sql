-- sends: one row per recipient per campaign. ses_message_id ties a send back to
-- the bounce/complaint notifications SES publishes asynchronously.
CREATE TABLE sends (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id     UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'sent', 'failed', 'bounced', 'complained')),
  ses_message_id TEXT,
  error          TEXT,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stats roll-ups group by campaign; webhook lookups match on ses_message_id.
CREATE INDEX sends_campaign_id_idx ON sends (campaign_id);
CREATE INDEX sends_ses_message_id_idx ON sends (ses_message_id);
