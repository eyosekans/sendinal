-- 3.1 CSV Import Wizard — flag contacts imported with a malformed email.
--
-- The wizard's "If an email address is invalid → Import anyway and flag" option
-- imports rows whose email failed format validation, marking them for review.
-- Flagged contacts are excluded from campaign dispatch (a malformed address
-- would only hard-bounce) until someone fixes them. Defaults to false so all
-- existing contacts stay verified/sendable.
ALTER TABLE contacts
  ADD COLUMN email_unverified BOOLEAN NOT NULL DEFAULT false;

-- Sendable contacts are active, not deleted, and have a verified email.
CREATE INDEX IF NOT EXISTS contacts_sendable_idx
  ON contacts (status)
  WHERE deleted_at IS NULL AND email_unverified = false;
