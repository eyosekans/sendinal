-- Task 4.2 — in-app alerts.
--
-- 1) Campaign ownership, so the reputation guard can route a "campaign paused"
--    alert to the user who created it. This is the project's first per-user
--    ownership column (the rest of the schema is shared, no per-user isolation);
--    it only drives alert routing, not data access. Existing campaigns stay NULL
--    (no creator on record → no alert) and fill in going forward.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS campaigns_created_by_idx ON campaigns (created_by);

-- 2) Per-user notification feed. The worker (service-role) inserts rows; users
--    read/update ONLY their own (RLS scoped to auth.uid(), unlike the shared
--    internal tables which any authenticated member can access).
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,                 -- e.g. 'reputation_paused'
  severity    TEXT NOT NULL DEFAULT 'warning'
                CHECK (severity IN ('info', 'warning', 'critical')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  metadata    JSONB NOT NULL DEFAULT '{}',
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feed query: a user's rows newest-first; unread filter rides the same index.
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Read your own feed. No INSERT policy for `authenticated` on purpose — only the
-- service-role worker writes notifications (and it bypasses RLS).
CREATE POLICY notifications_select_own ON notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Mark your own notifications read.
CREATE POLICY notifications_update_own ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
