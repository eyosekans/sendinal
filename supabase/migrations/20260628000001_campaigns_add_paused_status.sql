-- Task 4.1 — SES reputation monitoring (auto-pause).
--
-- Adds 'paused' to the campaign status set. The worker's reputation guard flips
-- a `sending` campaign to `paused` when the account's 7-day bounce or complaint
-- rate crosses the SES thresholds (bounce > 2% / complaint > 0.1%), and the
-- `email.send` processor skips any send whose campaign is no longer `sending`,
-- so in-flight queued sends stop immediately.

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed', 'paused'));
