-- Enable RLS on every Yamzo table before granting any browser role access.
do $$
declare
  v_table record;
begin
  for v_table in
    select schemaname, tablename
    from pg_catalog.pg_tables
    where schemaname in ('app', 'private')
  loop
    execute format('alter table %I.%I enable row level security', v_table.schemaname, v_table.tablename);
  end loop;
end;
$$;

grant usage on schema api to anon, authenticated;
grant usage on schema app to anon, authenticated;

grant select on app.site_runtime, app.business_hours, app.business_hour_exceptions,
  app.delivery_areas, app.menu_categories, app.menu_category_translations,
  app.menu_items, app.menu_item_translations, app.menu_item_categories,
  app.modifier_groups, app.modifier_group_translations, app.modifier_options,
  app.modifier_option_translations, app.menu_item_modifier_groups,
  app.media_assets, app.media_asset_translations, app.menu_item_media,
  app.banners, app.banner_translations, app.offers, app.offer_translations,
  app.offer_targets, app.home_sections, app.home_section_translations,
  app.review_snapshots, app.review_items
to anon, authenticated;

grant select, update on app.profiles to authenticated;
grant select on app.orders, app.order_items, app.order_item_modifiers, app.order_status_events
  to authenticated;

grant all on all tables in schema app, private, api to service_role;
grant all on all sequences in schema app, private, api to service_role;
grant execute on all functions in schema app, private, api to service_role;

create policy "runtime is readable"
on app.site_runtime for select
to anon, authenticated
using (true);

create policy "business hours are readable"
on app.business_hours for select
to anon, authenticated
using (true);

create policy "business hour exceptions are readable"
on app.business_hour_exceptions for select
to anon, authenticated
using (true);

create policy "active delivery areas are readable"
on app.delivery_areas for select
to anon, authenticated
using (is_active);

create policy "active menu categories are readable"
on app.menu_categories for select
to anon, authenticated
using (is_active);

create policy "active category translations are readable"
on app.menu_category_translations for select
to anon, authenticated
using (
  exists (
    select 1 from app.menu_categories c
    where c.id = category_id and c.is_active
  )
);

create policy "active menu items are readable"
on app.menu_items for select
to anon, authenticated
using (is_active);

create policy "active item translations are readable"
on app.menu_item_translations for select
to anon, authenticated
using (
  exists (
    select 1 from app.menu_items i
    where i.id = item_id and i.is_active
  )
);

create policy "active item category links are readable"
on app.menu_item_categories for select
to anon, authenticated
using (
  exists (select 1 from app.menu_items i where i.id = item_id and i.is_active)
  and exists (select 1 from app.menu_categories c where c.id = category_id and c.is_active)
);

create policy "active modifier groups are readable"
on app.modifier_groups for select
to anon, authenticated
using (is_active);

create policy "active modifier group translations are readable"
on app.modifier_group_translations for select
to anon, authenticated
using (
  exists (select 1 from app.modifier_groups g where g.id = group_id and g.is_active)
);

create policy "active modifier options are readable"
on app.modifier_options for select
to anon, authenticated
using (
  is_active
  and exists (select 1 from app.modifier_groups g where g.id = group_id and g.is_active)
);

create policy "active modifier option translations are readable"
on app.modifier_option_translations for select
to anon, authenticated
using (
  exists (
    select 1
    from app.modifier_options o
    join app.modifier_groups g on g.id = o.group_id
    where o.id = option_id and o.is_active and g.is_active
  )
);

create policy "active item modifier links are readable"
on app.menu_item_modifier_groups for select
to anon, authenticated
using (
  exists (select 1 from app.menu_items i where i.id = item_id and i.is_active)
  and exists (select 1 from app.modifier_groups g where g.id = group_id and g.is_active)
);

create policy "storefront media is readable"
on app.media_assets for select
to anon, authenticated
using (
  exists (
    select 1 from app.menu_item_media im
    join app.menu_items i on i.id = im.item_id
    where im.media_id = id and i.is_active
  )
  or exists (
    select 1 from app.banners b
    where b.media_id = id and b.is_active
      and (b.starts_at is null or b.starts_at <= now())
      and (b.ends_at is null or b.ends_at > now())
  )
);

create policy "storefront media translations are readable"
on app.media_asset_translations for select
to anon, authenticated
using (
  exists (select 1 from app.media_assets m where m.id = media_id)
);

create policy "active item media links are readable"
on app.menu_item_media for select
to anon, authenticated
using (
  exists (select 1 from app.menu_items i where i.id = item_id and i.is_active)
);

create policy "scheduled banners are readable"
on app.banners for select
to anon, authenticated
using (
  is_active
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at > now())
);

create policy "scheduled banner translations are readable"
on app.banner_translations for select
to anon, authenticated
using (
  exists (
    select 1 from app.banners b
    where b.id = banner_id and b.is_active
      and (b.starts_at is null or b.starts_at <= now())
      and (b.ends_at is null or b.ends_at > now())
  )
);

create policy "scheduled offers are readable"
on app.offers for select
to anon, authenticated
using (
  is_active
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at > now())
);

create policy "scheduled offer translations are readable"
on app.offer_translations for select
to anon, authenticated
using (
  exists (
    select 1 from app.offers o
    where o.id = offer_id and o.is_active
      and (o.starts_at is null or o.starts_at <= now())
      and (o.ends_at is null or o.ends_at > now())
  )
);

create policy "scheduled offer targets are readable"
on app.offer_targets for select
to anon, authenticated
using (
  exists (
    select 1 from app.offers o
    where o.id = offer_id and o.is_active
      and (o.starts_at is null or o.starts_at <= now())
      and (o.ends_at is null or o.ends_at > now())
  )
);

create policy "active home sections are readable"
on app.home_sections for select
to anon, authenticated
using (is_active);

create policy "active home section translations are readable"
on app.home_section_translations for select
to anon, authenticated
using (
  exists (select 1 from app.home_sections s where s.id = section_id and s.is_active)
);

create policy "current rating snapshots are readable"
on app.review_snapshots for select
to anon, authenticated
using (expires_at > now());

create policy "current visible reviews are readable"
on app.review_items for select
to anon, authenticated
using (is_visible and expires_at > now());

create policy "profiles are readable by owner"
on app.profiles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "profiles are updatable by owner"
on app.profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "orders are readable by owner"
on app.orders for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "order items are readable by order owner"
on app.order_items for select
to authenticated
using (
  exists (
    select 1 from app.orders o
    where o.id = order_id and o.user_id = (select auth.uid())
  )
);

create policy "order modifiers are readable by order owner"
on app.order_item_modifiers for select
to authenticated
using (
  exists (
    select 1
    from app.order_items oi
    join app.orders o on o.id = oi.order_id
    where oi.id = order_item_id and o.user_id = (select auth.uid())
  )
);

create policy "order events are readable by order owner"
on app.order_status_events for select
to authenticated
using (
  exists (
    select 1 from app.orders o
    where o.id = order_id and o.user_id = (select auth.uid())
  )
);

create view api.storefront_categories
with (security_invoker = true)
as
select
  c.id,
  c.slug,
  c.parent_id,
  c.is_featured,
  c.sort_order,
  t.locale,
  t.name,
  t.description
from app.menu_categories c
join app.menu_category_translations t on t.category_id = c.id
where c.is_active;

create view api.storefront_items
with (security_invoker = true)
as
select
  i.id,
  i.slug,
  i.base_price_minor,
  i.compare_at_price_minor,
  i.is_available,
  i.is_featured,
  i.preparation_minutes,
  i.sort_order,
  t.locale,
  t.name,
  t.description,
  primary_category.category_id,
  media.bucket_id as image_bucket,
  media.object_path as image_path,
  media_t.alt_text as image_alt
from app.menu_items i
join app.menu_item_translations t on t.item_id = i.id
left join lateral (
  select mic.category_id
  from app.menu_item_categories mic
  where mic.item_id = i.id
  order by mic.is_primary desc, mic.sort_order, mic.category_id
  limit 1
) primary_category on true
left join lateral (
  select m.id, m.bucket_id, m.object_path
  from app.menu_item_media im
  join app.media_assets m on m.id = im.media_id and m.kind = 'image'
  where im.item_id = i.id
  order by im.sort_order, m.id
  limit 1
) media on true
left join app.media_asset_translations media_t
  on media_t.media_id = media.id and media_t.locale = t.locale
where i.is_active;

create view api.storefront_modifier_groups
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
  t.description
from app.modifier_groups g
join app.modifier_group_translations t on t.group_id = g.id
where g.is_active;

create view api.storefront_modifier_options
with (security_invoker = true)
as
select
  o.id,
  o.group_id,
  o.price_delta_minor,
  o.sort_order,
  t.locale,
  t.name
from app.modifier_options o
join app.modifier_groups g on g.id = o.group_id
join app.modifier_option_translations t on t.option_id = o.id
where o.is_active and g.is_active;

create view api.storefront_item_modifier_groups
with (security_invoker = true)
as
select item_id, group_id, sort_order
from app.menu_item_modifier_groups;

create view api.storefront_banners
with (security_invoker = true)
as
select
  b.id,
  b.placement,
  b.action_url,
  b.sort_order,
  t.locale,
  t.eyebrow,
  t.title,
  t.body,
  t.action_label,
  m.bucket_id as image_bucket,
  m.object_path as image_path,
  mt.alt_text as image_alt
from app.banners b
join app.banner_translations t on t.banner_id = b.id
left join app.media_assets m on m.id = b.media_id
left join app.media_asset_translations mt on mt.media_id = m.id and mt.locale = t.locale
where b.is_active
  and (b.starts_at is null or b.starts_at <= now())
  and (b.ends_at is null or b.ends_at > now());

create view api.storefront_offers
with (security_invoker = true)
as
select
  o.id,
  o.code,
  o.kind,
  o.value,
  o.maximum_discount_minor,
  o.minimum_subtotal_minor,
  o.starts_at,
  o.ends_at,
  o.priority,
  t.locale,
  t.name,
  t.description,
  t.terms
from app.offers o
join app.offer_translations t on t.offer_id = o.id
where o.is_active
  and (o.starts_at is null or o.starts_at <= now())
  and (o.ends_at is null or o.ends_at > now());

create view api.storefront_home_sections
with (security_invoker = true)
as
select
  s.id,
  s.section_key,
  s.kind,
  s.sort_order,
  s.config,
  t.locale,
  t.title,
  t.subtitle
from app.home_sections s
left join app.home_section_translations t on t.section_id = s.id
where s.is_active;

create view api.rating_summary
with (security_invoker = true)
as
select place_id, rating, review_count, fetched_at, expires_at
from app.review_snapshots
where expires_at > now()
order by fetched_at desc
limit 1;

create view api.five_star_reviews
with (security_invoker = true)
as
select
  source_review_id,
  author_display_name,
  author_photo_url,
  rating,
  review_text,
  review_language,
  reviewed_at,
  expires_at
from app.review_items
where is_visible and rating = 5 and expires_at > now()
order by reviewed_at desc nulls last, id;

create view api.my_order_history
with (security_invoker = true)
as
select
  o.id,
  o.order_reference,
  o.mode,
  o.status,
  o.version,
  o.grand_total_minor,
  o.currency_code,
  o.placed_at,
  o.completed_at
from app.orders o
where o.user_id = (select auth.uid());

grant select on api.storefront_categories, api.storefront_items,
  api.storefront_modifier_groups, api.storefront_modifier_options,
  api.storefront_item_modifier_groups, api.storefront_banners,
  api.storefront_offers, api.storefront_home_sections,
  api.rating_summary, api.five_star_reviews
to anon, authenticated;
grant select on api.my_order_history to authenticated;

create or replace function api.get_site_runtime()
returns table (
  site_published boolean,
  live_orders_enabled boolean,
  test_mode_enabled boolean,
  default_locale app.locale_code,
  timezone_name text,
  currency_code text,
  minimum_order_minor integer,
  default_delivery_fee_minor integer,
  default_prep_minutes smallint,
  ordering_paused_reason_en text,
  ordering_paused_reason_bn text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.published,
    r.live_orders_enabled,
    r.test_mode,
    r.default_locale,
    r.timezone_name,
    r.currency_code,
    r.minimum_order_minor,
    r.default_delivery_fee_minor,
    r.default_prep_minutes,
    r.ordering_paused_reason_en,
    r.ordering_paused_reason_bn
  from app.site_runtime r
  where r.singleton;
$$;

revoke all on function api.get_site_runtime() from public;
grant execute on function api.get_site_runtime() to anon, authenticated;

create or replace function api.get_current_staff_access()
returns table (
  staff_id uuid,
  status app.staff_status,
  role_key app.app_role_code,
  permissions text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    sm.user_id,
    sm.status,
    (
      select r.code
      from app.staff_role_assignments sra2
      join app.roles r on r.id = sra2.role_id
      where sra2.user_id = sm.user_id
      order by case r.code
        when 'owner' then 1
        when 'admin' then 2
        when 'manager' then 3
        when 'cashier' then 4
        when 'kitchen' then 5
        when 'content_editor' then 6
      end
      limit 1
    ) as role_key,
    coalesce(
      array_agg(distinct rp.permission_code order by rp.permission_code)
        filter (where rp.permission_code is not null),
      array[]::text[]
    ) as permissions
  from app.staff_members sm
  left join app.staff_role_assignments sra on sra.user_id = sm.user_id
  left join app.role_permissions rp on rp.role_id = sra.role_id
  where sm.user_id = (select auth.uid())
  group by sm.user_id, sm.status;
$$;

revoke all on function api.get_current_staff_access() from public, anon;
grant execute on function api.get_current_staff_access() to authenticated;

create or replace function api.save_my_phone(
  p_phone text,
  p_label text default 'Primary',
  p_make_primary boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_phone text;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_label is null or char_length(btrim(p_label)) not between 1 and 40 then
    raise exception using errcode = '22023', message = 'INVALID_PHONE_LABEL';
  end if;

  v_phone := private.normalize_bd_phone(p_phone);

  if p_make_primary then
    update private.customer_phone_numbers
    set is_primary = false
    where user_id = v_user_id and is_primary;
  end if;

  insert into private.customer_phone_numbers (user_id, phone_e164, label, is_primary)
  values (v_user_id, v_phone, btrim(p_label), p_make_primary)
  on conflict (user_id, phone_e164) do update
  set label = excluded.label,
      is_primary = excluded.is_primary,
      updated_at = now()
  returning id into v_id;

  insert into private.audit_log (actor_type, actor_id, action, target_type, target_id)
  values ('customer', v_user_id, 'customer.phone_saved', 'customer_phone', v_id::text);

  return v_id;
end;
$$;

revoke all on function api.save_my_phone(text, text, boolean) from public, anon;
grant execute on function api.save_my_phone(text, text, boolean) to authenticated;

create or replace function api.create_order_tx(
  p_idempotency_key text,
  p_full_name text,
  p_phone text,
  p_sector_number smallint,
  p_road_number text,
  p_house_number text,
  p_flat_number text,
  p_items jsonb,
  p_locale app.locale_code default 'en',
  p_customer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime app.site_runtime%rowtype;
  v_delivery app.delivery_areas%rowtype;
  v_mode app.order_mode;
  v_is_staff boolean;
  v_user_id uuid := auth.uid();
  v_phone text;
  v_key_hash bytea;
  v_actor_hash bytea;
  v_existing_actor_hash bytea;
  v_existing_response jsonb;
  v_normalized_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_options jsonb;
  v_modifier_payload jsonb;
  v_modifier jsonb;
  v_item_id uuid;
  v_order_item_id uuid;
  v_quantity smallint;
  v_name_en text;
  v_name_bn text;
  v_unit_price integer;
  v_modifier_unit_total integer;
  v_line_total integer;
  v_subtotal integer := 0;
  v_delivery_fee integer;
  v_minimum_order integer;
  v_discount integer := 0;
  v_offer app.offers%rowtype;
  v_order_id uuid;
  v_order_reference text;
  v_tracking_token text;
  v_response jsonb;
  v_item_count integer;
  v_selected_count integer;
  v_valid_selected_count integer;
begin
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception using errcode = '22023', message = 'INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'ITEMS_MUST_BE_ARRAY';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count not between 1 and 30 then
    raise exception using errcode = '22023', message = 'INVALID_ITEM_COUNT';
  end if;

  if p_full_name is null or char_length(btrim(p_full_name)) not between 2 and 120
     or p_road_number is null or char_length(btrim(p_road_number)) not between 1 and 40
     or p_house_number is null or char_length(btrim(p_house_number)) not between 1 and 40
     or p_flat_number is null or char_length(btrim(p_flat_number)) not between 1 and 40
     or (p_customer_note is not null and char_length(p_customer_note) > 500) then
    raise exception using errcode = '22023', message = 'INVALID_CHECKOUT_DETAILS';
  end if;

  v_phone := private.normalize_bd_phone(p_phone);
  v_is_staff := private.is_active_staff();

  select * into v_runtime
  from app.site_runtime
  where singleton
  for share;

  if not found then
    raise exception using errcode = '55000', message = 'SITE_RUNTIME_NOT_CONFIGURED';
  end if;

  if v_runtime.test_mode then
    if not v_is_staff then
      raise exception using errcode = '42501', message = 'TEST_MODE_REQUIRES_APPROVED_STAFF';
    end if;
    v_mode := 'test';
  else
    if not v_runtime.published or not v_runtime.live_orders_enabled then
      raise exception using errcode = '55000', message = 'ORDERING_NOT_AVAILABLE';
    end if;
    v_mode := 'live';
  end if;

  select * into v_delivery
  from app.delivery_areas
  where sector_number = p_sector_number and is_active;

  if not found then
    raise exception using errcode = '22023', message = 'SECTOR_NOT_AVAILABLE';
  end if;

  v_delivery_fee := v_delivery.delivery_fee_minor;
  v_minimum_order := greatest(v_runtime.minimum_order_minor, v_delivery.minimum_order_minor);
  v_key_hash := extensions.digest(p_idempotency_key, 'sha256');
  v_actor_hash := extensions.digest(v_phone, 'sha256');

  insert into private.idempotency_keys (
    operation,
    key_hash,
    actor_fingerprint_hash,
    expires_at
  )
  values (
    'order.create',
    v_key_hash,
    v_actor_hash,
    now() + interval '24 hours'
  )
  on conflict (operation, key_hash) do nothing;

  select actor_fingerprint_hash, response_payload
  into v_existing_actor_hash, v_existing_response
  from private.idempotency_keys
  where operation = 'order.create' and key_hash = v_key_hash
  for update;

  if v_existing_actor_hash is distinct from v_actor_hash then
    raise exception using errcode = '23505', message = 'IDEMPOTENCY_KEY_REUSED';
  end if;
  if v_existing_response is not null then
    return v_existing_response;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'item_id', '') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(v_item ->> 'quantity', '') !~ '^[0-9]{1,2}$' then
      raise exception using errcode = '22023', message = 'INVALID_ITEM_SHAPE';
    end if;

    v_item_id := (v_item ->> 'item_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::smallint;
    if v_quantity not between 1 and 20 then
      raise exception using errcode = '22023', message = 'INVALID_ITEM_QUANTITY';
    end if;
    if v_item ? 'note' and char_length(coalesce(v_item ->> 'note', '')) > 300 then
      raise exception using errcode = '22023', message = 'ITEM_NOTE_TOO_LONG';
    end if;

    select
      i.base_price_minor,
      coalesce(en.name, bn.name, i.slug),
      coalesce(bn.name, en.name, i.slug)
    into v_unit_price, v_name_en, v_name_bn
    from app.menu_items i
    left join app.menu_item_translations en on en.item_id = i.id and en.locale = 'en'
    left join app.menu_item_translations bn on bn.item_id = i.id and bn.locale = 'bn'
    where i.id = v_item_id and i.is_active and i.is_available;

    if not found then
      raise exception using errcode = '22023', message = 'ITEM_NOT_AVAILABLE';
    end if;

    v_options := coalesce(v_item -> 'modifier_option_ids', '[]'::jsonb);
    if jsonb_typeof(v_options) <> 'array' then
      raise exception using errcode = '22023', message = 'MODIFIERS_MUST_BE_ARRAY';
    end if;
    if jsonb_array_length(v_options) > 40 then
      raise exception using errcode = '22023', message = 'TOO_MANY_MODIFIERS';
    end if;
    if exists (
      select 1
      from jsonb_array_elements_text(v_options) selected(option_id_text)
      where selected.option_id_text !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    ) then
      raise exception using errcode = '22023', message = 'INVALID_MODIFIER_ID';
    end if;

    select count(*), count(distinct option_id_text)
    into v_selected_count, v_valid_selected_count
    from jsonb_array_elements_text(v_options) selected(option_id_text);
    if v_selected_count <> v_valid_selected_count then
      raise exception using errcode = '22023', message = 'DUPLICATE_MODIFIER';
    end if;

    select count(*) into v_valid_selected_count
    from jsonb_array_elements_text(v_options) selected(option_id_text)
    join app.modifier_options o on o.id = selected.option_id_text::uuid and o.is_active
    join app.modifier_groups g on g.id = o.group_id and g.is_active
    join app.menu_item_modifier_groups img
      on img.item_id = v_item_id and img.group_id = g.id;

    if v_selected_count <> v_valid_selected_count then
      raise exception using errcode = '22023', message = 'MODIFIER_NOT_AVAILABLE_FOR_ITEM';
    end if;

    if exists (
      select 1
      from app.menu_item_modifier_groups img
      join app.modifier_groups g on g.id = img.group_id and g.is_active
      left join lateral (
        select count(*)::integer as selected_count
        from jsonb_array_elements_text(v_options) selected(option_id_text)
        join app.modifier_options o
          on o.id = selected.option_id_text::uuid and o.group_id = g.id and o.is_active
      ) selection on true
      where img.item_id = v_item_id
        and (selection.selected_count < g.minimum_selections
          or selection.selected_count > g.maximum_selections)
    ) then
      raise exception using errcode = '22023', message = 'MODIFIER_SELECTION_REQUIREMENTS_NOT_MET';
    end if;

    select
      coalesce(sum(o.price_delta_minor), 0)::integer,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'option_id', o.id,
            'group_name_en', coalesce(gen.name, gbn.name, g.slug),
            'group_name_bn', coalesce(gbn.name, gen.name, g.slug),
            'option_name_en', coalesce(oen.name, obn.name, o.id::text),
            'option_name_bn', coalesce(obn.name, oen.name, o.id::text),
            'price_delta_minor', o.price_delta_minor,
            'sort_order', o.sort_order
          ) order by img.sort_order, o.sort_order, o.id
        ),
        '[]'::jsonb
      )
    into v_modifier_unit_total, v_modifier_payload
    from jsonb_array_elements_text(v_options) selected(option_id_text)
    join app.modifier_options o on o.id = selected.option_id_text::uuid
    join app.modifier_groups g on g.id = o.group_id
    join app.menu_item_modifier_groups img
      on img.item_id = v_item_id and img.group_id = g.id
    left join app.modifier_group_translations gen on gen.group_id = g.id and gen.locale = 'en'
    left join app.modifier_group_translations gbn on gbn.group_id = g.id and gbn.locale = 'bn'
    left join app.modifier_option_translations oen on oen.option_id = o.id and oen.locale = 'en'
    left join app.modifier_option_translations obn on obn.option_id = o.id and obn.locale = 'bn';

    v_line_total := v_quantity * (v_unit_price + v_modifier_unit_total);
    v_subtotal := v_subtotal + v_line_total;
    if v_subtotal > 100000000 then
      raise exception using errcode = '22003', message = 'ORDER_TOTAL_TOO_LARGE';
    end if;

    v_normalized_items := v_normalized_items || jsonb_build_array(
      jsonb_build_object(
        'item_id', v_item_id,
        'quantity', v_quantity,
        'name_en', v_name_en,
        'name_bn', v_name_bn,
        'unit_price_minor', v_unit_price,
        'modifier_unit_total_minor', v_modifier_unit_total,
        'line_total_minor', v_line_total,
        'note', nullif(btrim(coalesce(v_item ->> 'note', '')), ''),
        'modifiers', v_modifier_payload
      )
    );
  end loop;

  if v_subtotal < v_minimum_order then
    raise exception using errcode = '22023', message = 'MINIMUM_ORDER_NOT_MET';
  end if;

  select o.* into v_offer
  from app.offers o
  where o.is_active
    and (o.starts_at is null or o.starts_at <= now())
    and (o.ends_at is null or o.ends_at > now())
    and v_subtotal >= o.minimum_subtotal_minor
    and exists (
      select 1
      from app.offer_targets ot
      where ot.offer_id = o.id
        and (
          ot.target_kind = 'all'
          or (
            ot.target_kind = 'item'
            and exists (
              select 1 from jsonb_array_elements(v_normalized_items) ni
              where (ni ->> 'item_id')::uuid = ot.item_id
            )
          )
          or (
            ot.target_kind = 'category'
            and exists (
              select 1
              from jsonb_array_elements(v_normalized_items) ni
              join app.menu_item_categories mic
                on mic.item_id = (ni ->> 'item_id')::uuid
              where mic.category_id = ot.category_id
            )
          )
        )
    )
  order by o.priority desc, o.id
  limit 1;

  if found then
    v_discount := case v_offer.kind
      when 'percent' then floor(v_subtotal::numeric * v_offer.value / 10000)::integer
      when 'fixed' then least(v_offer.value, v_subtotal)
      when 'free_delivery' then v_delivery_fee
    end;
    if v_offer.maximum_discount_minor is not null then
      v_discount := least(v_discount, v_offer.maximum_discount_minor);
    end if;
  end if;

  v_order_reference := private.generate_order_reference();
  v_tracking_token := private.generate_url_token();

  insert into app.orders (
    order_reference,
    user_id,
    source,
    mode,
    status,
    fulfillment_type,
    payment_method,
    locale,
    delivery_area_id,
    offer_id,
    offer_code_snapshot,
    subtotal_minor,
    discount_minor,
    delivery_fee_minor,
    grand_total_minor,
    currency_code,
    customer_note
  )
  values (
    v_order_reference,
    v_user_id,
    'website',
    v_mode,
    'pending_acceptance',
    'delivery',
    'cash_on_delivery',
    p_locale,
    v_delivery.id,
    v_offer.id,
    v_offer.code,
    v_subtotal,
    v_discount,
    v_delivery_fee,
    v_subtotal + v_delivery_fee - v_discount,
    'BDT',
    nullif(btrim(coalesce(p_customer_note, '')), '')
  )
  returning id into v_order_id;

  insert into private.order_contacts (
    order_id,
    full_name,
    phone_e164,
    sector_number,
    road_number,
    house_number,
    flat_number
  )
  values (
    v_order_id,
    btrim(p_full_name),
    v_phone,
    p_sector_number,
    btrim(p_road_number),
    btrim(p_house_number),
    btrim(p_flat_number)
  );

  insert into private.order_tracking_credentials (order_id, token_hash)
  values (v_order_id, extensions.digest(v_tracking_token, 'sha256'));

  for v_item in
    select value from jsonb_array_elements(v_normalized_items)
  loop
    insert into app.order_items (
      order_id,
      source_item_id,
      item_name_en,
      item_name_bn,
      quantity,
      unit_price_minor,
      modifier_unit_total_minor,
      line_total_minor,
      customer_note
    )
    values (
      v_order_id,
      (v_item ->> 'item_id')::uuid,
      v_item ->> 'name_en',
      v_item ->> 'name_bn',
      (v_item ->> 'quantity')::smallint,
      (v_item ->> 'unit_price_minor')::integer,
      (v_item ->> 'modifier_unit_total_minor')::integer,
      (v_item ->> 'line_total_minor')::integer,
      v_item ->> 'note'
    )
    returning id into v_order_item_id;

    for v_modifier in
      select value from jsonb_array_elements(v_item -> 'modifiers')
    loop
      insert into app.order_item_modifiers (
        order_item_id,
        source_option_id,
        group_name_en,
        group_name_bn,
        option_name_en,
        option_name_bn,
        price_delta_minor,
        sort_order
      )
      values (
        v_order_item_id,
        (v_modifier ->> 'option_id')::uuid,
        v_modifier ->> 'group_name_en',
        v_modifier ->> 'group_name_bn',
        v_modifier ->> 'option_name_en',
        v_modifier ->> 'option_name_bn',
        (v_modifier ->> 'price_delta_minor')::integer,
        (v_modifier ->> 'sort_order')::integer
      );
    end loop;
  end loop;

  insert into app.order_status_events (
    order_id, from_status, to_status, actor_type, actor_id
  ) values
    (v_order_id, null, 'placed', case when v_user_id is null then 'customer' else 'customer' end, v_user_id),
    (v_order_id, 'placed', 'pending_acceptance', 'system', null);

  insert into private.outbox_events (
    event_kind, aggregate_type, aggregate_id, mode, payload
  ) values (
    'order.created',
    'order',
    v_order_id,
    v_mode,
    jsonb_build_object('order_id', v_order_id, 'order_reference', v_order_reference, 'mode', v_mode)
  );

  v_response := jsonb_build_object(
    'order_id', v_order_id,
    'order_reference', v_order_reference,
    'tracking_token', v_tracking_token,
    'mode', v_mode,
    'status', 'pending_acceptance',
    'version', 1,
    'grand_total_minor', v_subtotal + v_delivery_fee - v_discount,
    'currency_code', 'BDT'
  );

  update private.idempotency_keys
  set resource_id = v_order_id,
      response_payload = v_response
  where operation = 'order.create' and key_hash = v_key_hash;

  return v_response;
end;
$$;

revoke all on function api.create_order_tx(
  text, text, text, smallint, text, text, text, jsonb, app.locale_code, text
) from public;
grant execute on function api.create_order_tx(
  text, text, text, smallint, text, text, text, jsonb, app.locale_code, text
) to anon, authenticated;

create or replace function api.get_order_by_tracking(
  p_order_reference text,
  p_tracking_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_result jsonb;
begin
  if p_order_reference is null or p_order_reference !~ '^YZ-[0-9]{8}-[0-9]{8}$'
     or p_tracking_token is null or char_length(p_tracking_token) not between 32 and 80 then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;

  select o.id into v_order_id
  from app.orders o
  join private.order_tracking_credentials tc on tc.order_id = o.id
  where o.order_reference = p_order_reference
    and tc.revoked_at is null
    and extensions.digest(p_tracking_token, 'sha256') = tc.token_hash;

  if not found then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;

  update private.order_tracking_credentials
  set last_used_at = now()
  where order_id = v_order_id;

  select jsonb_build_object(
    'order_id', o.id,
    'order_reference', o.order_reference,
    'mode', o.mode,
    'status', o.status,
    'version', o.version,
    'subtotal_minor', o.subtotal_minor,
    'discount_minor', o.discount_minor,
    'delivery_fee_minor', o.delivery_fee_minor,
    'grand_total_minor', o.grand_total_minor,
    'currency_code', o.currency_code,
    'placed_at', o.placed_at,
    'accepted_at', o.accepted_at,
    'completed_at', o.completed_at,
    'cancelled_at', o.cancelled_at,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'name_en', oi.item_name_en,
          'name_bn', oi.item_name_bn,
          'quantity', oi.quantity,
          'unit_price_minor', oi.unit_price_minor,
          'modifier_unit_total_minor', oi.modifier_unit_total_minor,
          'line_total_minor', oi.line_total_minor,
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
      where oi.order_id = o.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'status', e.to_status,
          'created_at', e.created_at
        ) order by e.created_at, e.id
      )
      from app.order_status_events e
      where e.order_id = o.id
    ), '[]'::jsonb)
  ) into v_result
  from app.orders o
  where o.id = v_order_id;

  return v_result;
end;
$$;

revoke all on function api.get_order_by_tracking(text, text) from public;
grant execute on function api.get_order_by_tracking(text, text) to anon, authenticated;

create or replace function api.lookup_latest_order_status(
  p_phone text,
  p_rate_bucket text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_bucket_hash bytea;
  v_window timestamptz;
  v_count integer;
  v_result jsonb;
begin
  if p_rate_bucket is null or char_length(p_rate_bucket) not between 16 and 200 then
    raise exception using errcode = '22023', message = 'INVALID_RATE_BUCKET';
  end if;

  v_phone := private.normalize_bd_phone(p_phone);
  v_bucket_hash := extensions.digest(p_rate_bucket, 'sha256');
  v_window := date_trunc('hour', now())
    + ((extract(minute from now())::integer / 10) * interval '10 minutes');

  insert into private.rate_limit_buckets (
    action, bucket_hash, window_started_at, request_count, expires_at
  ) values (
    'order.phone_lookup', v_bucket_hash, v_window, 1, v_window + interval '20 minutes'
  )
  on conflict (action, bucket_hash, window_started_at) do update
  set request_count = private.rate_limit_buckets.request_count + 1
  returning request_count into v_count;

  if v_count > 5 then
    raise exception using errcode = 'P0001', message = 'RATE_LIMITED';
  end if;

  select jsonb_build_object(
    'found', true,
    'reference_hint', right(o.order_reference, 4),
    'status', o.status,
    'mode', o.mode,
    'placed_at', date_trunc('minute', o.placed_at)
  ) into v_result
  from private.order_contacts c
  join app.orders o on o.id = c.order_id
  where c.phone_e164 = v_phone
  order by o.placed_at desc
  limit 1;

  return coalesce(v_result, jsonb_build_object('found', false));
end;
$$;

revoke all on function api.lookup_latest_order_status(text, text) from public, anon, authenticated;
grant execute on function api.lookup_latest_order_status(text, text) to service_role;

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
          'name_en', oi.item_name_en,
          'name_bn', oi.item_name_bn,
          'quantity', oi.quantity,
          'unit_price_minor', oi.unit_price_minor,
          'modifier_unit_total_minor', oi.modifier_unit_total_minor,
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
      where oi.order_id = o.id
    ), '[]'::jsonb)
  )
  from app.orders o
  join private.order_contacts c on c.order_id = o.id
  where o.id = p_order_id;
$$;

revoke all on function private.build_order_operations_payload(uuid) from public, anon, authenticated;

create or replace function api.get_order_for_operations(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_payload jsonb;
begin
  if not v_is_service and not private.current_staff_has_permission('orders.read') then
    raise exception using errcode = '42501', message = 'ORDER_READ_PERMISSION_REQUIRED';
  end if;

  v_payload := private.build_order_operations_payload(p_order_id);
  if v_payload is null then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;
  return v_payload;
end;
$$;

revoke all on function api.get_order_for_operations(uuid) from public, anon;
grant execute on function api.get_order_for_operations(uuid) to authenticated, service_role;

create or replace function api.request_staff_access(p_display_name text)
returns app.staff_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status app.staff_status;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_DISPLAY_NAME';
  end if;

  insert into app.staff_members (user_id, display_name, status)
  values (v_user_id, btrim(p_display_name), 'pending')
  on conflict (user_id) do update
  set display_name = excluded.display_name
  returning status into v_status;

  insert into private.audit_log (actor_type, actor_id, action, target_type, target_id)
  values ('staff', v_user_id, 'staff.access_requested', 'staff_member', v_user_id::text);

  return v_status;
end;
$$;

revoke all on function api.request_staff_access(text) from public, anon;
grant execute on function api.request_staff_access(text) to authenticated;

create or replace function api.approve_staff(
  p_user_id uuid,
  p_role_key app.app_role_code
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_role_id uuid;
begin
  if not v_is_service and not private.current_staff_has_permission('staff.manage') then
    raise exception using errcode = '42501', message = 'STAFF_MANAGE_PERMISSION_REQUIRED';
  end if;

  select id into v_role_id from app.roles where code = p_role_key;
  if not found then
    raise exception using errcode = '22023', message = 'INVALID_ROLE';
  end if;

  update app.staff_members
  set status = 'active',
      approved_by = v_actor,
      approved_at = now(),
      suspended_reason = null
  where user_id = p_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_REQUEST_NOT_FOUND';
  end if;

  insert into app.staff_role_assignments (user_id, role_id, assigned_by)
  values (p_user_id, v_role_id, v_actor)
  on conflict (user_id, role_id) do nothing;

  insert into private.audit_log (
    actor_type, actor_id, action, target_type, target_id, details
  ) values (
    case when v_is_service then 'system' else 'staff' end,
    v_actor,
    'staff.approved',
    'staff_member',
    p_user_id::text,
    jsonb_build_object('role_key', p_role_key)
  );

  return true;
end;
$$;

revoke all on function api.approve_staff(uuid, app.app_role_code) from public, anon;
grant execute on function api.approve_staff(uuid, app.app_role_code) to authenticated, service_role;

create or replace function api.set_site_runtime(
  p_published boolean,
  p_live_orders_enabled boolean,
  p_test_mode boolean,
  p_minimum_order_minor integer,
  p_default_delivery_fee_minor integer,
  p_default_prep_minutes smallint,
  p_ordering_paused_reason_en text default null,
  p_ordering_paused_reason_bn text default null
)
returns table (
  published boolean,
  live_orders_enabled boolean,
  test_mode boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
begin
  if not v_is_service and not private.current_staff_has_permission('site.manage') then
    raise exception using errcode = '42501', message = 'SITE_MANAGE_PERMISSION_REQUIRED';
  end if;
  if p_live_orders_enabled and p_test_mode then
    raise exception using errcode = '22023', message = 'LIVE_AND_TEST_MODE_ARE_MUTUALLY_EXCLUSIVE';
  end if;
  if p_minimum_order_minor < 0 or p_default_delivery_fee_minor < 0
     or p_default_prep_minutes not between 5 and 240 then
    raise exception using errcode = '22023', message = 'INVALID_RUNTIME_VALUES';
  end if;

  update app.site_runtime r
  set published = p_published,
      live_orders_enabled = p_live_orders_enabled,
      test_mode = p_test_mode,
      minimum_order_minor = p_minimum_order_minor,
      default_delivery_fee_minor = p_default_delivery_fee_minor,
      default_prep_minutes = p_default_prep_minutes,
      ordering_paused_reason_en = nullif(btrim(coalesce(p_ordering_paused_reason_en, '')), ''),
      ordering_paused_reason_bn = nullif(btrim(coalesce(p_ordering_paused_reason_bn, '')), ''),
      updated_by = v_actor
  where r.singleton;

  insert into private.audit_log (
    actor_type, actor_id, action, target_type, target_id, details
  ) values (
    case when v_is_service then 'system' else 'staff' end,
    v_actor,
    'site.runtime_updated',
    'site_runtime',
    'singleton',
    jsonb_build_object(
      'published', p_published,
      'live_orders_enabled', p_live_orders_enabled,
      'test_mode', p_test_mode
    )
  );

  return query
  select r.published, r.live_orders_enabled, r.test_mode, r.updated_at
  from app.site_runtime r
  where r.singleton;
end;
$$;

revoke all on function api.set_site_runtime(
  boolean, boolean, boolean, integer, integer, smallint, text, text
) from public, anon;
grant execute on function api.set_site_runtime(
  boolean, boolean, boolean, integer, integer, smallint, text, text
) to authenticated, service_role;

create or replace function api.claim_website_orders(
  p_terminal_id uuid,
  p_limit integer default 20,
  p_lease_seconds integer default 90,
  p_include_test boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_order record;
  v_token text;
  v_result jsonb := '[]'::jsonb;
begin
  if not v_is_service and not private.current_staff_has_permission('orders.claim') then
    raise exception using errcode = '42501', message = 'ORDER_CLAIM_PERMISSION_REQUIRED';
  end if;
  if p_limit not between 1 and 50 or p_lease_seconds not between 30 and 300 then
    raise exception using errcode = '22023', message = 'INVALID_CLAIM_LIMIT_OR_LEASE';
  end if;
  if not exists (
    select 1 from app.pos_terminals t
    where t.id = p_terminal_id and t.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'TERMINAL_NOT_ACTIVE';
  end if;

  for v_order in
    select o.id, o.order_reference, o.mode
    from app.orders o
    left join app.order_claims c on c.order_id = o.id
    where o.source = 'website'
      and o.status = 'pending_acceptance'
      and (o.mode = 'live' or p_include_test)
      and (c.order_id is null or c.released_at is not null or c.lease_expires_at <= now())
    order by case o.mode when 'live' then 0 else 1 end, o.created_at, o.id
    for update of o skip locked
    limit p_limit
  loop
    v_token := private.generate_url_token();

    insert into app.order_claims (
      order_id, terminal_id, claim_token_hash, claimed_at, lease_expires_at, renewed_at, released_at
    ) values (
      v_order.id,
      p_terminal_id,
      extensions.digest(v_token, 'sha256'),
      now(),
      now() + make_interval(secs => p_lease_seconds),
      null,
      null
    )
    on conflict (order_id) do update
    set terminal_id = excluded.terminal_id,
        claim_token_hash = excluded.claim_token_hash,
        claimed_at = excluded.claimed_at,
        lease_expires_at = excluded.lease_expires_at,
        renewed_at = null,
        released_at = null;

    v_result := v_result || jsonb_build_array(
      private.build_order_operations_payload(v_order.id)
        || jsonb_build_object(
          'claim_token', v_token,
          'claim_expires_at', now() + make_interval(secs => p_lease_seconds)
        )
    );
  end loop;

  update app.pos_terminals
  set last_seen_at = now()
  where id = p_terminal_id;

  return v_result;
end;
$$;

revoke all on function api.claim_website_orders(uuid, integer, integer, boolean)
  from public, anon;
grant execute on function api.claim_website_orders(uuid, integer, integer, boolean)
  to authenticated, service_role;

create or replace function api.renew_order_claim(
  p_order_id uuid,
  p_terminal_id uuid,
  p_claim_token text,
  p_lease_seconds integer default 90
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_expires timestamptz;
begin
  if not v_is_service and not private.current_staff_has_permission('orders.claim') then
    raise exception using errcode = '42501', message = 'ORDER_CLAIM_PERMISSION_REQUIRED';
  end if;
  if p_lease_seconds not between 30 and 300 then
    raise exception using errcode = '22023', message = 'INVALID_CLAIM_LEASE';
  end if;

  update app.order_claims
  set lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      renewed_at = now()
  where order_id = p_order_id
    and terminal_id = p_terminal_id
    and released_at is null
    and lease_expires_at > now()
    and claim_token_hash = extensions.digest(p_claim_token, 'sha256')
  returning lease_expires_at into v_expires;

  if not found then
    raise exception using errcode = '42501', message = 'INVALID_OR_EXPIRED_ORDER_CLAIM';
  end if;
  return v_expires;
end;
$$;

revoke all on function api.renew_order_claim(uuid, uuid, text, integer) from public, anon;
grant execute on function api.renew_order_claim(uuid, uuid, text, integer)
  to authenticated, service_role;

create or replace function api.release_order_claim(
  p_order_id uuid,
  p_terminal_id uuid,
  p_claim_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
begin
  if not v_is_service and not private.current_staff_has_permission('orders.claim') then
    raise exception using errcode = '42501', message = 'ORDER_CLAIM_PERMISSION_REQUIRED';
  end if;

  update app.order_claims
  set released_at = now()
  where order_id = p_order_id
    and terminal_id = p_terminal_id
    and released_at is null
    and claim_token_hash = extensions.digest(p_claim_token, 'sha256');

  return found;
end;
$$;

revoke all on function api.release_order_claim(uuid, uuid, text) from public, anon;
grant execute on function api.release_order_claim(uuid, uuid, text)
  to authenticated, service_role;

create or replace function api.transition_order(
  p_order_id uuid,
  p_to_status app.order_status,
  p_expected_version integer,
  p_note text default null,
  p_terminal_id uuid default null,
  p_claim_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_order app.orders%rowtype;
  v_actor_type app.audit_actor_type;
begin
  if p_note is not null and char_length(p_note) > 500 then
    raise exception using errcode = '22023', message = 'ORDER_STATUS_NOTE_TOO_LONG';
  end if;

  if p_terminal_id is not null then
    if p_claim_token is null or not exists (
      select 1
      from app.order_claims c
      join app.pos_terminals t on t.id = c.terminal_id
      where c.order_id = p_order_id
        and c.terminal_id = p_terminal_id
        and t.status = 'active'
        and c.released_at is null
        and c.lease_expires_at > now()
        and c.claim_token_hash = extensions.digest(p_claim_token, 'sha256')
    ) then
      raise exception using errcode = '42501', message = 'VALID_ORDER_CLAIM_REQUIRED';
    end if;
    v_actor_type := 'terminal';
  else
    if not v_is_service and not private.current_staff_has_permission('orders.transition') then
      raise exception using errcode = '42501', message = 'ORDER_TRANSITION_PERMISSION_REQUIRED';
    end if;
    v_actor_type := case when v_is_service then 'system' else 'staff' end;
  end if;

  select * into v_order
  from app.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;
  if v_order.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'ORDER_VERSION_CONFLICT';
  end if;
  if not private.is_valid_order_transition(v_order.status, p_to_status) then
    raise exception using errcode = '23514', message = 'INVALID_ORDER_STATUS_TRANSITION';
  end if;

  update app.orders
  set status = p_to_status,
      version = version + 1
  where id = p_order_id;

  insert into app.order_status_events (
    order_id, from_status, to_status, actor_type, actor_id, note
  ) values (
    p_order_id,
    v_order.status,
    p_to_status,
    v_actor_type,
    coalesce(p_terminal_id, v_actor),
    nullif(btrim(coalesce(p_note, '')), '')
  );

  if p_to_status = 'accepted' then
    insert into app.print_jobs (order_id, kind)
    values
      (p_order_id, 'customer_receipt'),
      (p_order_id, 'kitchen_copy')
    on conflict (order_id, kind) do nothing;
  end if;

  insert into private.outbox_events (
    event_kind, aggregate_type, aggregate_id, mode, payload
  ) values (
    'order.status_changed',
    'order',
    p_order_id,
    v_order.mode,
    jsonb_build_object(
      'order_id', p_order_id,
      'from_status', v_order.status,
      'to_status', p_to_status,
      'version', p_expected_version + 1,
      'mode', v_order.mode
    )
  );

  if p_to_status = 'delivered' and v_order.mode = 'live' then
    insert into private.outbox_events (
      event_kind, aggregate_type, aggregate_id, mode, payload
    ) values (
      'meta.purchase',
      'order',
      p_order_id,
      'live',
      jsonb_build_object(
        'order_id', p_order_id,
        'event_id', 'purchase-' || p_order_id::text,
        'currency', v_order.currency_code,
        'value_minor', v_order.grand_total_minor
      )
    );
  end if;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', p_to_status,
    'version', p_expected_version + 1
  );
end;
$$;

revoke all on function api.transition_order(
  uuid, app.order_status, integer, text, uuid, text
) from public, anon;
grant execute on function api.transition_order(
  uuid, app.order_status, integer, text, uuid, text
) to authenticated, service_role;

create or replace function api.claim_print_jobs(
  p_terminal_id uuid,
  p_limit integer default 10,
  p_lease_seconds integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_job record;
  v_token text;
  v_result jsonb := '[]'::jsonb;
begin
  if not v_is_service and not private.current_staff_has_permission('pos.operate') then
    raise exception using errcode = '42501', message = 'POS_OPERATE_PERMISSION_REQUIRED';
  end if;
  if p_limit not between 1 and 25 or p_lease_seconds not between 30 and 300 then
    raise exception using errcode = '22023', message = 'INVALID_PRINT_LIMIT_OR_LEASE';
  end if;
  if not exists (
    select 1 from app.pos_terminals t
    where t.id = p_terminal_id and t.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'TERMINAL_NOT_ACTIVE';
  end if;

  for v_job in
    select j.id, j.order_id, j.kind, j.copies
    from app.print_jobs j
    where j.status in ('pending', 'failed')
      or (j.status = 'claimed' and j.lease_expires_at <= now())
    order by j.created_at, j.id
    for update skip locked
    limit p_limit
  loop
    v_token := private.generate_url_token();
    update app.print_jobs
    set status = 'claimed',
        terminal_id = p_terminal_id,
        claim_token_hash = extensions.digest(v_token, 'sha256'),
        claimed_at = now(),
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        attempts = attempts + 1,
        last_error_code = null
    where id = v_job.id;

    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'job_id', v_job.id,
        'kind', v_job.kind,
        'copies', v_job.copies,
        'claim_token', v_token,
        'claim_expires_at', now() + make_interval(secs => p_lease_seconds),
        'order', private.build_order_operations_payload(v_job.order_id)
      )
    );
  end loop;

  return v_result;
end;
$$;

revoke all on function api.claim_print_jobs(uuid, integer, integer) from public, anon;
grant execute on function api.claim_print_jobs(uuid, integer, integer)
  to authenticated, service_role;

create or replace function api.ack_print_job(
  p_job_id uuid,
  p_terminal_id uuid,
  p_claim_token text,
  p_succeeded boolean,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
begin
  if not v_is_service and not private.current_staff_has_permission('pos.operate') then
    raise exception using errcode = '42501', message = 'POS_OPERATE_PERMISSION_REQUIRED';
  end if;
  if not p_succeeded and (
    p_error_code is null or p_error_code !~ '^[A-Z0-9_:-]{1,80}$'
  ) then
    raise exception using errcode = '22023', message = 'SAFE_PRINT_ERROR_CODE_REQUIRED';
  end if;

  update app.print_jobs
  set status = case when p_succeeded then 'completed' else 'failed' end,
      completed_at = case when p_succeeded then now() else null end,
      lease_expires_at = null,
      claim_token_hash = null,
      last_error_code = case when p_succeeded then null else p_error_code end
  where id = p_job_id
    and terminal_id = p_terminal_id
    and status = 'claimed'
    and lease_expires_at > now()
    and claim_token_hash = extensions.digest(p_claim_token, 'sha256');

  if not found then
    raise exception using errcode = '42501', message = 'INVALID_OR_EXPIRED_PRINT_CLAIM';
  end if;
  return true;
end;
$$;

revoke all on function api.ack_print_job(uuid, uuid, text, boolean, text) from public, anon;
grant execute on function api.ack_print_job(uuid, uuid, text, boolean, text)
  to authenticated, service_role;

create or replace function api.hard_delete_test_order(
  p_order_id uuid,
  p_expected_reference text,
  p_reason_code text,
  p_confirmation text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_order app.orders%rowtype;
begin
  if not private.current_staff_has_permission('orders.test_delete') then
    raise exception using errcode = '42501', message = 'TEST_ORDER_DELETE_PERMISSION_REQUIRED';
  end if;
  if p_reason_code is null or p_reason_code !~ '^[A-Z0-9_:-]{2,80}$' then
    raise exception using errcode = '22023', message = 'SAFE_DELETE_REASON_REQUIRED';
  end if;

  select * into v_order
  from app.orders
  where id = p_order_id
  for update;

  if not found or v_order.mode <> 'test' or v_order.order_reference <> p_expected_reference then
    raise exception using errcode = 'P0002', message = 'TEST_ORDER_NOT_FOUND';
  end if;
  if p_confirmation <> 'DELETE ' || v_order.order_reference then
    raise exception using errcode = '22023', message = 'DELETE_CONFIRMATION_MISMATCH';
  end if;

  insert into private.deleted_test_order_tombstones (
    order_reference_hash, deleted_by, reason_code
  ) values (
    extensions.digest(v_order.order_reference, 'sha256'),
    v_actor,
    p_reason_code
  );

  insert into private.audit_log (
    actor_type, actor_id, action, target_type, target_id, details
  ) values (
    'staff',
    v_actor,
    'order.test_hard_deleted',
    'test_order',
    pg_catalog.encode(extensions.digest(v_order.order_reference, 'sha256'), 'hex'),
    jsonb_build_object('reason_code', p_reason_code)
  );

  perform set_config('app.allow_test_order_delete', 'on', true);
  delete from app.orders where id = p_order_id;
  return true;
end;
$$;

revoke all on function api.hard_delete_test_order(uuid, text, text, text)
  from public, anon;
grant execute on function api.hard_delete_test_order(uuid, text, text, text)
  to authenticated;

create or replace function api.get_admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day_start timestamptz;
  v_result jsonb;
begin
  if not private.is_active_staff() then
    raise exception using errcode = '42501', message = 'ACTIVE_STAFF_REQUIRED';
  end if;

  v_day_start := (timezone('Asia/Dhaka', now())::date::timestamp at time zone 'Asia/Dhaka');

  select jsonb_build_object(
    'runtime', jsonb_build_object(
      'site_published', r.published,
      'live_orders_enabled', r.live_orders_enabled,
      'test_mode_enabled', r.test_mode
    ),
    'pending_live_orders', (
      select count(*) from app.orders o
      where o.mode = 'live' and o.status = 'pending_acceptance'
    ),
    'pending_test_orders', (
      select count(*) from app.orders o
      where o.mode = 'test' and o.status = 'pending_acceptance'
    ),
    'live_orders_today', (
      select count(*) from app.orders o
      where o.mode = 'live' and o.created_at >= v_day_start
    ),
    'live_revenue_today_minor', (
      select coalesce(sum(o.grand_total_minor), 0) from app.orders o
      where o.mode = 'live' and o.status = 'delivered' and o.completed_at >= v_day_start
    ),
    'pending_staff_requests', (
      select count(*) from app.staff_members sm where sm.status = 'pending'
    ),
    'unavailable_menu_items', (
      select count(*) from app.menu_items i where i.is_active and not i.is_available
    )
  ) into v_result
  from app.site_runtime r
  where r.singleton;

  return v_result;
end;
$$;

revoke all on function api.get_admin_dashboard() from public, anon;
grant execute on function api.get_admin_dashboard() to authenticated;

create or replace function api.list_staff_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.current_staff_has_permission('staff.manage') then
    raise exception using errcode = '42501', message = 'STAFF_MANAGE_PERMISSION_REQUIRED';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'staff_id', sm.user_id,
        'email', u.email,
        'display_name', sm.display_name,
        'status', sm.status,
        'role_keys', coalesce(roles.role_keys, '[]'::jsonb),
        'approved_at', sm.approved_at,
        'created_at', sm.created_at
      ) order by
        case sm.status when 'pending' then 0 when 'active' then 1 else 2 end,
        sm.created_at
    )
    from app.staff_members sm
    join auth.users u on u.id = sm.user_id
    left join lateral (
      select jsonb_agg(r.code order by r.code) as role_keys
      from app.staff_role_assignments sra
      join app.roles r on r.id = sra.role_id
      where sra.user_id = sm.user_id
    ) roles on true
  ), '[]'::jsonb);
end;
$$;

revoke all on function api.list_staff_access() from public, anon;
grant execute on function api.list_staff_access() to authenticated;

create or replace function api.list_orders_for_operations(
  p_status app.order_status default null,
  p_mode app.order_mode default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.current_staff_has_permission('orders.read') then
    raise exception using errcode = '42501', message = 'ORDER_READ_PERMISSION_REQUIRED';
  end if;
  if p_limit not between 1 and 200 then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_LIST_LIMIT';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'order_id', q.id,
        'order_reference', q.order_reference,
        'mode', q.mode,
        'status', q.status,
        'version', q.version,
        'grand_total_minor', q.grand_total_minor,
        'currency_code', q.currency_code,
        'placed_at', q.placed_at,
        'accepted_at', q.accepted_at,
        'completed_at', q.completed_at
      ) order by q.placed_at desc, q.id
    )
    from (
      select o.*
      from app.orders o
      where (p_status is null or o.status = p_status)
        and (p_mode is null or o.mode = p_mode)
      order by o.placed_at desc, o.id
      limit p_limit
    ) q
  ), '[]'::jsonb);
end;
$$;

revoke all on function api.list_orders_for_operations(
  app.order_status, app.order_mode, integer
) from public, anon;
grant execute on function api.list_orders_for_operations(
  app.order_status, app.order_mode, integer
) to authenticated;
