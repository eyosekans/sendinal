-- contacts: the people we send to. Email is the natural unique key.
-- status drives send eligibility (bounced/complained/unsubscribed are excluded
-- from future dispatches).
CREATE TABLE contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  first_name  TEXT,
  last_name   TEXT,
  attributes  JSONB NOT NULL DEFAULT '{}',   -- custom fields, e.g. {"company": "Acme"}
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'unsubscribed', 'bounced', 'complained')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
