-- Allow 'unsubscribe' tracking tokens (2.5). Open/click were the original two
-- types (migration 20260623000008); unsubscribe links use the same table so the
-- /t/u/:token route can resolve a token back to its send → contact.
ALTER TABLE tracking_tokens DROP CONSTRAINT IF EXISTS tracking_tokens_type_check;
ALTER TABLE tracking_tokens
  ADD CONSTRAINT tracking_tokens_type_check
  CHECK (type IN ('open', 'click', 'unsubscribe'));
