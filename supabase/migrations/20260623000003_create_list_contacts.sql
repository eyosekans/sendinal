-- list_contacts: many-to-many junction between lists and contacts.
-- Composite PK prevents duplicate membership; cascade keeps it clean on delete.
CREATE TABLE list_contacts (
  list_id     UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (list_id, contact_id)
);

-- Reverse lookups ("which lists is this contact in?") hit contact_id directly.
CREATE INDEX list_contacts_contact_id_idx ON list_contacts (contact_id);
