-- Task 3.3 — A/B testing (subject-only).
--
-- A campaign may carry one extra subject-line variant (B). Variant A is the
-- campaign's own `subject`; `ab_variants` holds B as `[{ subject, weight }]`
-- where `weight` is B's percentage share (A gets the remainder). An empty
-- array means no A/B test. `sends.variant` records which variant each
-- recipient was assigned ('A' | 'B'), NULL for non-A/B campaigns.

alter table campaigns
  add column if not exists ab_variants jsonb not null default '[]'::jsonb;

alter table sends
  add column if not exists variant text;

-- Backs per-variant stats grouping.
create index if not exists sends_campaign_variant_idx
  on sends (campaign_id, variant);
