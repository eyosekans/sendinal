-- Soft-delete for contacts: a non-null deleted_at hides the row from normal
-- listings without losing history (sends/email_events keep their FK). status is
-- left to mean "send eligibility" only.
ALTER TABLE contacts ADD COLUMN deleted_at TIMESTAMPTZ;

-- The default contacts listing filters deleted_at IS NULL and orders by recency.
CREATE INDEX contacts_active_created_idx
  ON contacts (created_at DESC)
  WHERE deleted_at IS NULL;
