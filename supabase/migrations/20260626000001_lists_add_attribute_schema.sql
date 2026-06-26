-- 3.1 Custom contact attributes — per-list attribute schema.
--
-- Each list defines the custom attribute fields its contacts are expected to
-- carry. The schema is an array of field definitions, e.g.
--   [{"key":"company","label":"Company","type":"text"},
--    {"key":"plan","label":"Plan","type":"select","options":["Free","Pro"]}]
--
-- Contact VALUES live in contacts.attributes (a global JSONB map); this column
-- only defines which keys/labels/types a list expects. It drives the dynamic
-- contact form, CSV column→attribute mapping, and (later) the 3.2 segment
-- builder. Defaults to an empty array so existing lists are unaffected.
ALTER TABLE lists
  ADD COLUMN attribute_schema JSONB NOT NULL DEFAULT '[]'::jsonb;
