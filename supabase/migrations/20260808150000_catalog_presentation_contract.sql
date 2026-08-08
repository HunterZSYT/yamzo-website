-- Explicit storefront presentation metadata for database-native catalog groups.
-- The ordering transaction remains authoritative for item availability, prices,
-- modifier membership, and selection counts.

alter table app.modifier_groups
  add column presentation text not null default 'modifier';

alter table app.modifier_groups
  add constraint modifier_group_presentation_allowed
    check (presentation in ('modifier', 'variant')),
  add constraint modifier_group_variant_requires_single_selection
    check (
      presentation <> 'variant'
      or (minimum_selections = 1 and maximum_selections = 1)
    );

-- These deterministic groups were seeded as the explicit pack-size selectors.
-- Stable IDs are used deliberately; runtime code never infers behavior from slugs.
update app.modifier_groups
set presentation = 'variant'
where id in (
  '26ab40b4-f4c4-5213-9cc0-7fbef38900d1'::uuid,
  'aa6aa615-c47e-5152-84a2-c4ea0f446f8c'::uuid,
  '2c44c8ac-79e6-5fdd-b5a2-9cc9e27a5858'::uuid,
  '0b63b1d0-4524-594a-b8c9-249dccd8777a'::uuid
);

create or replace view api.storefront_modifier_groups
with (security_invoker = true)
as
select
  g.id,
  g.slug,
  g.minimum_selections,
  g.maximum_selections,
  g.sort_order,
  t.locale,
  t.name,
  t.description,
  g.presentation
from app.modifier_groups g
join app.modifier_group_translations t on t.group_id = g.id
where g.is_active;

grant select on api.storefront_modifier_groups to anon, authenticated;

comment on column app.modifier_groups.presentation is
  'Storefront control type: modifier choices or a required price variant selector.';
