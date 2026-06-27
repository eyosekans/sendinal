-- Track the source template a campaign was created from.
--
-- When a campaign is built from a template (either seeded via
-- /campaigns/new?template=:id or applied through the builder's "Load template"
-- modal) we record the template id here. The campaign still carries its own
-- copied html/design, so the link is informational — ON DELETE SET NULL keeps
-- the campaign intact if the template is later deleted. Backs a future
-- "used in N campaigns" stat on the template library.

alter table campaigns
  add column if not exists template_id uuid
    references templates (id) on delete set null;

create index if not exists campaigns_template_id_idx
  on campaigns (template_id);
