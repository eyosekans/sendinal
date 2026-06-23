-- lists: named groupings of contacts. Membership lives in list_contacts.
CREATE TABLE lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
