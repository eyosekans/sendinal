-- templates: reusable Unlayer designs. html is the export, design is the
-- editable JSON state loaded back into the editor.
CREATE TABLE templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  html        TEXT NOT NULL,
  design      JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
