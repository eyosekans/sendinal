-- Task 3.4 — template categories.
--
-- Adds an optional category to templates so the library can group/filter them
-- (Newsletter, Promotion, Announcement, Transactional, Seasonal). NULL means
-- "Uncategorized". Templates saved from the campaign builder start NULL and can
-- be categorised from the Template Library preview.

alter table templates add column if not exists category text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'templates_category_check'
  ) then
    alter table templates
      add constraint templates_category_check
      check (
        category is null
        or category in (
          'Newsletter', 'Promotion', 'Announcement', 'Transactional', 'Seasonal'
        )
      );
  end if;
end $$;
