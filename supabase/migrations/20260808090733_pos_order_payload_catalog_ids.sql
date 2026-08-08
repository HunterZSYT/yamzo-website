-- Preserve the website/POS catalog identity separately from the database UUID.
-- Seeded keys match src/data/menu.ts (for example menu_item_chicken_momo).
alter table app.menu_items
  add column public_key text;

update app.menu_items
set public_key = 'menu_item_' || replace(slug, '-', '_')
where public_key is null;

alter table app.menu_items
  alter column public_key set default (
    'catalog_' || replace(extensions.gen_random_uuid()::text, '-', '')
  ),
  alter column public_key set not null,
  add constraint menu_item_public_key_format
    check (public_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  add constraint menu_item_public_key_unique unique (public_key);

create or replace function private.build_order_operations_payload(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_id', o.id,
    'order_reference', o.order_reference,
    'mode', o.mode,
    'status', o.status,
    'version', o.version,
    'locale', o.locale,
    'subtotal_minor', o.subtotal_minor,
    'discount_minor', o.discount_minor,
    'delivery_fee_minor', o.delivery_fee_minor,
    'grand_total_minor', o.grand_total_minor,
    'currency_code', o.currency_code,
    'customer_note', o.customer_note,
    'placed_at', o.placed_at,
    'updated_at', o.updated_at,
    'contact', jsonb_build_object(
      'full_name', c.full_name,
      'phone_e164', c.phone_e164,
      'sector_number', c.sector_number,
      'road_number', c.road_number,
      'house_number', c.house_number,
      'flat_number', c.flat_number
    ),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'source_item_id', oi.source_item_id,
          'source_item_public_key', mi.public_key,
          'source_item_slug', mi.slug,
          'name_en', oi.item_name_en,
          'name_bn', oi.item_name_bn,
          'quantity', oi.quantity,
          'unit_price_minor', oi.unit_price_minor,
          'modifier_unit_total_minor', oi.modifier_unit_total_minor,
          'effective_unit_price_minor',
            oi.unit_price_minor + oi.modifier_unit_total_minor,
          'line_total_minor', oi.line_total_minor,
          'customer_note', oi.customer_note,
          'modifiers', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'group_name_en', om.group_name_en,
                'group_name_bn', om.group_name_bn,
                'option_name_en', om.option_name_en,
                'option_name_bn', om.option_name_bn,
                'price_delta_minor', om.price_delta_minor
              ) order by om.sort_order, om.id
            )
            from app.order_item_modifiers om
            where om.order_item_id = oi.id
          ), '[]'::jsonb)
        ) order by oi.sort_order, oi.id
      )
      from app.order_items oi
      left join app.menu_items mi on mi.id = oi.source_item_id
      where oi.order_id = o.id
    ), '[]'::jsonb)
  )
  from app.orders o
  join private.order_contacts c on c.order_id = o.id
  where o.id = p_order_id;
$$;

revoke all on function private.build_order_operations_payload(uuid)
  from public, anon, authenticated;
