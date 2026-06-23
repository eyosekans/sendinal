-- Row-Level Security for an internal tool: no per-user isolation. Any
-- authenticated team member can read/write everything; anonymous requests are
-- blocked. Tracking routes and the SES webhook never use these tables through
-- the user-facing client -- they go through the service-role key, which bypasses
-- RLS entirely.
--
-- One permissive ALL policy per table, scoped to the `authenticated` role and
-- additionally asserting auth.uid() IS NOT NULL (belt-and-suspenders).

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'contacts',
    'lists',
    'list_contacts',
    'campaigns',
    'templates',
    'sends',
    'email_events',
    'tracking_tokens'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated '
      'USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);',
      tbl || '_authenticated_all', tbl
    );
  END LOOP;
END $$;
