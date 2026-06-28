-- Task 4.3 — RLS audit follow-ups: auto-maintain updated_at + one hot-path index.
--
-- RLS audit itself required no changes (every public table has RLS enabled with
-- an authenticated-only policy; notifications is scoped to auth.uid(); anon has
-- no policy on any table; there are no views). This migration covers the other
-- two 4.3 items.

-- 1) updated_at trigger. Replaces the manual `updated_at = now()` the API/worker
--    set on every UPDATE. `search_path = ''` hardens against search-path hijack
--    (Supabase advisor best practice); now() is a pg_catalog built-in.
CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Only these three tables carry an updated_at column.
DROP TRIGGER IF EXISTS set_updated_at ON campaigns;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON contacts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON templates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Indexes. The four columns the task names (sends.campaign_id,
--    sends.ses_message_id, email_events.send_id, contacts.email) were already
--    indexed in 1.2. This adds sends.sent_at, which the 4.1 reputation guard
--    scans every 60s (rolling-window bounce/complaint counts) and the dashboard
--    uses for its 7/30-day windows.
CREATE INDEX IF NOT EXISTS sends_sent_at_idx ON sends (sent_at);
