-- tracking_tokens: short, URL-safe tokens embedded in open pixels and click
-- links. Each maps back to a send so /t/o/:token and /t/c/:token can record the
-- event. Click tokens carry the original destination url.
CREATE TABLE tracking_tokens (
  token      TEXT PRIMARY KEY,              -- random 16-char URL-safe string
  send_id    UUID NOT NULL REFERENCES sends(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('open', 'click')),
  url        TEXT,                          -- destination URL for click tokens
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
