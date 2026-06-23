-- Add 'failed' to the campaign status set (a campaign whose dispatch errored out),
-- alongside the existing 'cancelled' (user-cancelled a scheduled campaign).
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed'));
