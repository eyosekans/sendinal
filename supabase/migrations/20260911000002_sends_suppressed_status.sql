-- Distinguish an Amazon SES Auto Validation suppression from a real bounce.
--
-- Auto Validation is enabled account-wide (SES-managed threshold). When it
-- blocks a recipient, SES reports it as a bounce with
-- `bounceType=Permanent, bounceSubType=EmailValidationSuppressed` — but no
-- mailbox ever rejected the message; SES declined to try.
--
-- Treating those as ordinary hard bounces was wrong twice over:
--   1. The contact was marked `status='bounced'`, a terminal state implying a
--      dead mailbox, when the address may be perfectly deliverable.
--   2. They inflated our rolling bounce rate and could trip the 2% auto-pause
--      guard — even though SES itself excludes account-suppression-list sends
--      from Reputation.BounceRate, so our dashboard was reading *worse* than
--      the number AWS actually judges the account on.
--
-- A dedicated `suppressed` status fixes both: the reputation queries count
-- `status='bounced'` and total over ('sent','bounced','complained'), so
-- `suppressed` drops out of numerator and denominator alike with no query
-- change. The contact is flagged `email_unverified` instead (already excluded
-- from dispatch) so it can be reviewed rather than written off.
--
-- The original CHECKs were declared inline and unnamed, so their names are
-- whatever Postgres generated. Drop by lookup rather than by guessed name — a
-- name that doesn't match would leave the old CHECK in place and every
-- 'suppressed' write would fail at runtime instead of here.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conrelid::regclass AS tbl, conname
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN ('sends'::regclass, 'email_events'::regclass)
      AND (
        pg_get_constraintdef(oid) LIKE '%''complained''%'
        OR pg_get_constraintdef(oid) LIKE '%''unsubscribed''%'
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;

ALTER TABLE sends
  ADD CONSTRAINT sends_status_check
    CHECK (status IN ('queued', 'sent', 'failed', 'bounced', 'complained', 'suppressed'));

-- Same distinction in the append-only event log.
ALTER TABLE email_events
  ADD CONSTRAINT email_events_type_check
    CHECK (type IN ('opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'suppressed'));
