-- private.create_order_core predates the typed actor enum on status events.
-- Preserve its private signature, SECURITY DEFINER settings, and ACLs; only
-- make the CASE result explicit for app.order_status_events.actor_type.
create or replace function private.create_order_core(
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
    (v_order_id, null, 'placed', (case when v_user_id is null then 'customer' else 'customer' end)::app.audit_actor_type, v_user_id),
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
