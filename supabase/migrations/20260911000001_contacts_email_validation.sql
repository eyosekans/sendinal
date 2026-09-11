-- CSV Import Wizard — persist the Amazon SES email-validation verdict
-- (SESv2 `GetEmailAddressInsights`) alongside each contact.
--
-- Two jobs:
--   1. Audit — why was this contact flagged `email_unverified` at import time?
--   2. Cache — SES bills per address, so a verdict younger than
--      VALIDATION_CACHE_DAYS (shared/validation.ts) is re-used instead of
--      re-purchased on the next import that mentions the same address.
--
-- Nullable/'{}' defaults: contacts imported before this feature, or imported
-- with validation switched off, simply have no verdict.
ALTER TABLE contacts
  ADD COLUMN email_validation_verdict TEXT
    CHECK (email_validation_verdict IN ('HIGH', 'MEDIUM', 'LOW')),
  -- MailboxValidation.Evaluations, camelCased (see emailValidationChecksSchema).
  ADD COLUMN email_validation_checks JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN email_validated_at TIMESTAMPTZ;

-- The cache lookup is `WHERE email IN (...) AND email_validated_at > cutoff`;
-- `email` is already UNIQUE, so this only needs to keep the freshness test off
-- the heap for the validated subset.
CREATE INDEX IF NOT EXISTS contacts_email_validated_at_idx
  ON contacts (email_validated_at)
  WHERE email_validated_at IS NOT NULL;
