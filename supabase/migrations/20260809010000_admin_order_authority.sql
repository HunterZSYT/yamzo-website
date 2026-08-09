-- Website-admin order authority.
--
-- The protected website workspace is the source of truth for web-order
-- status, line-item, discount, delivery-fee, and archive decisions. POS
-- terminals receive signed, versioned snapshots and may acknowledge printing,
-- but may not mutate an order's business state.

insert into app.permissions (code, description)
values (
  'orders.manage',
  'Independently manage website-order status, line items, pricing adjustments, and live-order archives.'
)
on conflict (code) do update
set description = excluded.description;

insert into app.role_permissions (role_id, permission_code)
select r.id, 'orders.manage'
from app.roles r
where r.code in ('owner', 'admin', 'manager')
on conflict (role_id, permission_code) do nothing;

alter table app.orders
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

create table if not exists private.order_mutation_audits (
  id bigint generated always as identity primary key,
  order_id uuid not null references app.orders(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  from_version integer not null,
  to_version integer not null,
  from_status app.order_status not null,
  to_status app.order_status not null,
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  note text,
  created_at timestamptz not null default now(),
  constraint order_mutation_audits_action_format
    check (action ~ '^order\.[a-z][a-z0-9_.-]{2,99}$'),
  constraint order_mutation_audits_version_order
    check (to_version = from_version + 1),
  constraint order_mutation_audits_before_object
    check (jsonb_typeof(before_snapshot) = 'object'),
  constraint order_mutation_audits_after_object
    check (jsonb_typeof(after_snapshot) = 'object'),
  constraint order_mutation_audits_note_length
    check (note is null or char_length(note) <= 500),
  constraint order_mutation_audits_snapshot_size
    check (
      octet_length(before_snapshot::text) <= 65536
      and octet_length(after_snapshot::text) <= 65536
    )
);

comment on table private.order_mutation_audits is
  'Append-only, non-PII evidence for website-admin order edits. Customer contact values are never stored here.';

alter table private.order_mutation_audits enable row level security;
revoke all on table private.order_mutation_audits from public, anon, authenticated;
grant all on table private.order_mutation_audits to service_role;

create index if not exists order_mutation_audits_order_recent
  on private.order_mutation_audits (order_id, created_at desc, id desc);
create index if not exists orders_website_sync_cursor
  on app.orders (updated_at, id)
  where source = 'website';

-- The original guard deliberately made all order financial values immutable and
-- accepted only state-machine transitions. Keep that protection for all normal
-- callers, but allow the narrow admin RPC below to perform one versioned,
-- transaction-local override. Browser roles have no direct table grants.
create or replace function private.guard_order_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_admin_mutation boolean :=
    coalesce(current_setting('app.allow_admin_order_mutation', true), 'off') = 'on';
  v_admin_item_mutation boolean :=
    coalesce(current_setting('app.admin_order_items_mutated', true), 'off') = 'on';
  v_mutable_changed boolean;
begin
  if row(
    new.order_reference,
    new.user_id,
    new.source,
    new.mode,
    new.fulfillment_type,
    new.payment_method,
    new.locale,
    new.delivery_area_id,
    new.offer_id,
    new.offer_code_snapshot,
    new.currency_code,
    new.placed_at
  ) is distinct from row(
    old.order_reference,
    old.user_id,
    old.source,
    old.mode,
    old.fulfillment_type,
    old.payment_method,
    old.locale,
    old.delivery_area_id,
    old.offer_id,
    old.offer_code_snapshot,
    old.currency_code,
    old.placed_at
  ) then
    raise exception using errcode = '23514', message = 'ORDER_IMMUTABLE_FIELDS_CHANGED';
  end if;

  v_mutable_changed := row(
    new.status,
    new.subtotal_minor,
    new.discount_minor,
    new.delivery_fee_minor,
    new.grand_total_minor,
    new.archived_at,
    new.archived_by
  ) is distinct from row(
    old.status,
    old.subtotal_minor,
    old.discount_minor,
    old.delivery_fee_minor,
    old.grand_total_minor,
    old.archived_at,
    old.archived_by
  );

  if v_admin_mutation then
    if (not v_mutable_changed and not v_admin_item_mutation)
       or new.version <> old.version + 1 then
      raise exception using errcode = '40001', message = 'ORDER_VERSION_MUST_INCREMENT';
    end if;
  else
    if row(
      new.subtotal_minor,
      new.discount_minor,
      new.delivery_fee_minor,
      new.grand_total_minor,
      new.archived_at,
      new.archived_by
    ) is distinct from row(
      old.subtotal_minor,
      old.discount_minor,
      old.delivery_fee_minor,
      old.grand_total_minor,
      old.archived_at,
      old.archived_by
    ) then
      raise exception using errcode = '23514', message = 'ORDER_IMMUTABLE_FIELDS_CHANGED';
    end if;
  end if;

  if new.status is distinct from old.status then
    if not v_admin_mutation and old.source = 'website' then
      raise exception using errcode = '42501', message = 'WEBSITE_ADMIN_ORDER_AUTHORITY_REQUIRED';
    end if;
    if not v_admin_mutation
       and not private.is_valid_order_transition(old.status, new.status) then
      raise exception using errcode = '23514', message = 'INVALID_ORDER_STATUS_TRANSITION';
    end if;
    if new.version <> old.version + 1 then
      raise exception using errcode = '40001', message = 'ORDER_VERSION_MUST_INCREMENT';
    end if;
    if new.status = 'accepted' and new.accepted_at is null then
      new.accepted_at := now();
    end if;
    if new.status = 'delivered' and new.completed_at is null then
      new.completed_at := now();
    end if;
    if new.status in ('rejected', 'cancelled') and new.cancelled_at is null then
      new.cancelled_at := now();
    end if;
  elsif new.version <> old.version and not v_admin_mutation then
    raise exception using errcode = '40001', message = 'ORDER_VERSION_CHANGED_WITHOUT_STATUS';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_order_update() from public, anon, authenticated;

create or replace function private.build_order_mutation_snapshot(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', o.status,
    'version', o.version,
    'subtotal_minor', o.subtotal_minor,
    'discount_minor', o.discount_minor,
    'delivery_fee_minor', o.delivery_fee_minor,
    'grand_total_minor', o.grand_total_minor,
    'archived_at', o.archived_at,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'source_item_id', oi.source_item_id,
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
    ), '[]'::jsonb)
  )
  from app.orders o
  where o.id = p_order_id;
$$;

revoke all on function private.build_order_mutation_snapshot(uuid)
  from public, anon, authenticated;

-- Extend the signed operations payload with lifecycle fields and explicit
-- nullable catalog identifiers. It is intentionally the one shared snapshot
-- shape consumed by the protected admin detail sheet and signed POS sync.
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
    'accepted_at', o.accepted_at,
    'completed_at', o.completed_at,
    'cancelled_at', o.cancelled_at,
    'archived_at', o.archived_at,
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
          'effective_unit_price_minor', oi.unit_price_minor + oi.modifier_unit_total_minor,
          'line_total_minor', oi.line_total_minor,
          'customer_note', oi.customer_note,
          'modifiers', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'source_option_id', om.source_option_id,
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

create or replace function api.admin_update_website_order(
  p_order_id uuid,
  p_expected_version integer,
  p_to_status app.order_status default null,
  p_items jsonb default null,
  p_discount_minor integer default null,
  p_delivery_fee_minor integer default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('orders.manage');
  v_order app.orders%rowtype;
  v_before_snapshot jsonb;
  v_after_snapshot jsonb;
  v_status app.order_status;
  v_discount integer;
  v_delivery_fee integer;
  v_subtotal bigint;
  v_grand_total bigint;
  v_item jsonb;
  v_modifier jsonb;
  v_normalized_items jsonb := '[]'::jsonb;
  v_modifiers jsonb;
  v_source_item_id uuid;
  v_source_option_id uuid;
  v_name_en text;
  v_name_bn text;
  v_quantity integer;
  v_unit_price integer;
  v_modifier_total bigint;
  v_line_total bigint;
  v_customer_note text;
  v_sort_order integer := 0;
  v_order_item_id uuid;
  v_changed boolean;
  v_status_changed boolean;
  v_items_replaced boolean := p_items is not null;
begin
  if p_order_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_UPDATE_REQUEST';
  end if;
  if p_note is not null and char_length(btrim(p_note)) > 500 then
    raise exception using errcode = '22023', message = 'ORDER_STATUS_NOTE_TOO_LONG';
  end if;
  if p_discount_minor is not null
     and p_discount_minor not between 0 and 1000000000 then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_ADJUSTMENT';
  end if;
  if p_delivery_fee_minor is not null
     and p_delivery_fee_minor not between 0 and 1000000000 then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_ADJUSTMENT';
  end if;
  if p_items is not null and (
    jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 60
    or octet_length(p_items::text) > 65536
  ) then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_ITEMS';
  end if;

  select * into v_order
  from app.orders
  where id = p_order_id and source = 'website'
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;
  if v_order.archived_at is not null then
    raise exception using errcode = '23514', message = 'ORDER_ALREADY_ARCHIVED';
  end if;
  if v_order.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'ORDER_VERSION_CONFLICT';
  end if;

  v_status := coalesce(p_to_status, v_order.status);
  v_discount := coalesce(p_discount_minor, v_order.discount_minor);
  v_delivery_fee := coalesce(p_delivery_fee_minor, v_order.delivery_fee_minor);
  v_before_snapshot := private.build_order_mutation_snapshot(p_order_id);

  if p_items is not null then
    v_subtotal := 0;
    for v_item in select value from jsonb_array_elements(p_items)
    loop
      if jsonb_typeof(v_item) <> 'object'
         or jsonb_typeof(v_item -> 'quantity') <> 'number'
         or jsonb_typeof(v_item -> 'unit_price_minor') <> 'number'
         or (v_item ->> 'quantity') !~ '^[0-9]+$'
         or (v_item ->> 'unit_price_minor') !~ '^[0-9]+$' then
        raise exception using errcode = '22023', message = 'INVALID_ORDER_ITEMS';
      end if;

      v_name_en := nullif(btrim(coalesce(v_item ->> 'item_name_en', '')), '');
      v_name_bn := nullif(btrim(coalesce(v_item ->> 'item_name_bn', '')), '');
      v_quantity := (v_item ->> 'quantity')::integer;
      v_unit_price := (v_item ->> 'unit_price_minor')::integer;
      v_customer_note := nullif(btrim(coalesce(v_item ->> 'customer_note', '')), '');
      if v_name_en is null or char_length(v_name_en) > 160
         or v_quantity not between 1 and 20
         or v_unit_price not between 0 and 1000000
         or (v_customer_note is not null and char_length(v_customer_note) > 300) then
        raise exception using errcode = '22023', message = 'INVALID_ORDER_ITEMS';
      end if;
      v_name_bn := coalesce(v_name_bn, v_name_en);
      if char_length(v_name_bn) > 160 then
        raise exception using errcode = '22023', message = 'INVALID_ORDER_ITEMS';
      end if;

      v_source_item_id := null;
      if nullif(v_item ->> 'source_item_id', '') is not null then
        if (v_item ->> 'source_item_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception using errcode = '22023', message = 'INVALID_ORDER_ITEMS';
        end if;
        v_source_item_id := (v_item ->> 'source_item_id')::uuid;
        if not exists (select 1 from app.menu_items where id = v_source_item_id) then
          raise exception using errcode = '22023', message = 'INVALID_ORDER_ITEMS';
        end if;
      end if;

      v_modifiers := coalesce(v_item -> 'modifiers', '[]'::jsonb);
      if jsonb_typeof(v_modifiers) <> 'array'
         or jsonb_array_length(v_modifiers) > 20 then
        raise exception using errcode = '22023', message = 'INVALID_ORDER_ITEMS';
      end if;
      v_modifier_total := 0;
      for v_modifier in select value from jsonb_array_elements(v_modifiers)
      loop
        if jsonb_typeof(v_modifier) <> 'object'
           or jsonb_typeof(v_modifier -> 'price_delta_minor') <> 'number'
           or (v_modifier ->> 'price_delta_minor') !~ '^[0-9]+$'
           or char_length(btrim(coalesce(v_modifier ->> 'group_name_en', ''))) not between 1 and 160
           or char_length(btrim(coalesce(v_modifier ->> 'group_name_bn', ''))) not between 1 and 160
           or char_length(btrim(coalesce(v_modifier ->> 'option_name_en', ''))) not between 1 and 160
           or char_length(btrim(coalesce(v_modifier ->> 'option_name_bn', ''))) not between 1 and 160
           or (v_modifier ->> 'price_delta_minor')::integer not between 0 and 100000 then
          raise exception using errcode = '22023', message = 'INVALID_ORDER_ITEMS';
        end if;
        if nullif(v_modifier ->> 'source_option_id', '') is not null then
          if (v_modifier ->> 'source_option_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
            raise exception using errcode = '22023', message = 'INVALID_ORDER_ITEMS';
          end if;
          v_source_option_id := (v_modifier ->> 'source_option_id')::uuid;
          if not exists (select 1 from app.modifier_options where id = v_source_option_id) then
            raise exception using errcode = '22023', message = 'INVALID_ORDER_ITEMS';
          end if;
        end if;
        v_modifier_total := v_modifier_total + (v_modifier ->> 'price_delta_minor')::integer;
      end loop;

      v_line_total := v_quantity::bigint * (v_unit_price::bigint + v_modifier_total);
      v_subtotal := v_subtotal + v_line_total;
      if v_subtotal > 1000000000 then
        raise exception using errcode = '22023', message = 'ORDER_TOTAL_TOO_LARGE';
      end if;
      v_normalized_items := v_normalized_items || jsonb_build_array(jsonb_build_object(
        'source_item_id', v_source_item_id,
        'item_name_en', v_name_en,
        'item_name_bn', v_name_bn,
        'quantity', v_quantity,
        'unit_price_minor', v_unit_price,
        'modifier_unit_total_minor', v_modifier_total,
        'line_total_minor', v_line_total,
        'customer_note', v_customer_note,
        'modifiers', v_modifiers
      ));
    end loop;
  else
    v_subtotal := v_order.subtotal_minor;
  end if;

  v_grand_total := v_subtotal + v_delivery_fee - v_discount;
  if v_discount > v_subtotal + v_delivery_fee
     or v_grand_total not between 0 and 1000000000 then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_ADJUSTMENT';
  end if;

  v_changed := v_status is distinct from v_order.status
    or v_subtotal <> v_order.subtotal_minor
    or v_discount <> v_order.discount_minor
    or v_delivery_fee <> v_order.delivery_fee_minor
    or v_items_replaced;
  if not v_changed then
    raise exception using errcode = '22023', message = 'NO_ORDER_CHANGE_REQUESTED';
  end if;
  v_status_changed := v_status is distinct from v_order.status;

  if p_items is not null then
    delete from app.order_items where order_id = p_order_id;
    for v_item in select value from jsonb_array_elements(v_normalized_items)
    loop
      insert into app.order_items (
        order_id, source_item_id, item_name_en, item_name_bn, quantity,
        unit_price_minor, modifier_unit_total_minor, line_total_minor,
        customer_note, sort_order
      ) values (
        p_order_id,
        nullif(v_item ->> 'source_item_id', '')::uuid,
        v_item ->> 'item_name_en',
        v_item ->> 'item_name_bn',
        (v_item ->> 'quantity')::smallint,
        (v_item ->> 'unit_price_minor')::integer,
        (v_item ->> 'modifier_unit_total_minor')::integer,
        (v_item ->> 'line_total_minor')::integer,
        nullif(v_item ->> 'customer_note', ''),
        v_sort_order
      ) returning id into v_order_item_id;

      for v_modifier in select value from jsonb_array_elements(v_item -> 'modifiers')
      loop
        insert into app.order_item_modifiers (
          order_item_id, source_option_id, group_name_en, group_name_bn,
          option_name_en, option_name_bn, price_delta_minor, sort_order
        ) values (
          v_order_item_id,
          nullif(v_modifier ->> 'source_option_id', '')::uuid,
          v_modifier ->> 'group_name_en',
          v_modifier ->> 'group_name_bn',
          v_modifier ->> 'option_name_en',
          v_modifier ->> 'option_name_bn',
          (v_modifier ->> 'price_delta_minor')::integer,
          v_sort_order
        );
      end loop;
      v_sort_order := v_sort_order + 1;
    end loop;
  end if;

  perform set_config('app.allow_admin_order_mutation', 'on', true);
  if v_items_replaced then
    perform set_config('app.admin_order_items_mutated', 'on', true);
  end if;
  update app.orders
  set status = v_status,
      subtotal_minor = v_subtotal::integer,
      discount_minor = v_discount,
      delivery_fee_minor = v_delivery_fee,
      grand_total_minor = v_grand_total::integer,
      version = version + 1
  where id = p_order_id;

  if v_status_changed then
    insert into app.order_status_events (
      order_id, from_status, to_status, actor_type, actor_id, note
    ) values (
      p_order_id,
      v_order.status,
      v_status,
      'staff',
      v_actor,
      nullif(btrim(coalesce(p_note, '')), '')
    );
  end if;

  if v_order.status <> 'accepted' and v_status = 'accepted' then
    insert into app.print_jobs (order_id, kind)
    values
      (p_order_id, 'customer_receipt'),
      (p_order_id, 'kitchen_copy')
    on conflict (order_id, kind) do nothing;
  end if;

  v_after_snapshot := private.build_order_mutation_snapshot(p_order_id);
  insert into private.order_mutation_audits (
    order_id, actor_id, action, from_version, to_version, from_status, to_status,
    before_snapshot, after_snapshot, note
  ) values (
    p_order_id, v_actor, 'order.admin_updated', v_order.version, v_order.version + 1,
    v_order.status, v_status, v_before_snapshot, v_after_snapshot,
    nullif(btrim(coalesce(p_note, '')), '')
  );
  perform private.write_admin_audit(
    v_actor,
    'order.admin_updated',
    'order',
    p_order_id::text,
    jsonb_build_object(
      'from_status', v_order.status,
      'to_status', v_status,
      'from_version', v_order.version,
      'to_version', v_order.version + 1,
      'items_replaced', v_items_replaced,
      'discount_minor_changed', v_discount <> v_order.discount_minor,
      'delivery_fee_minor_changed', v_delivery_fee <> v_order.delivery_fee_minor
    )
  );

  insert into private.outbox_events (
    event_kind, aggregate_type, aggregate_id, mode, payload
  ) values (
    case when v_status_changed then 'order.status_changed' else 'order.updated' end,
    'order',
    p_order_id,
    v_order.mode,
    jsonb_build_object(
      'order_id', p_order_id,
      'from_status', v_order.status,
      'to_status', v_status,
      'version', v_order.version + 1,
      'items_replaced', v_items_replaced
    )
  );

  if v_status = 'delivered' and v_order.mode = 'live' and not exists (
    select 1
    from private.outbox_events e
    where e.event_kind = 'meta.purchase'
      and e.aggregate_type = 'order'
      and e.aggregate_id = p_order_id
  ) then
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
        'value_minor', v_grand_total
      )
    );
  end if;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', v_status,
    'version', v_order.version + 1,
    'archived_at', null
  );
end;
$$;

revoke all on function api.admin_update_website_order(
  uuid, integer, app.order_status, jsonb, integer, integer, text
) from public, anon;
grant execute on function api.admin_update_website_order(
  uuid, integer, app.order_status, jsonb, integer, integer, text
) to authenticated, service_role;

create or replace function api.archive_live_website_order(
  p_order_id uuid,
  p_expected_version integer,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('orders.manage');
  v_order app.orders%rowtype;
  v_before_snapshot jsonb;
  v_after_snapshot jsonb;
  v_status app.order_status;
  v_status_changed boolean;
begin
  if p_order_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_ARCHIVE_REQUEST';
  end if;
  if p_note is not null and char_length(btrim(p_note)) not between 2 and 500 then
    raise exception using errcode = '22023', message = 'LIVE_ARCHIVE_NOTE_REQUIRED';
  end if;

  select * into v_order
  from app.orders
  where id = p_order_id and source = 'website' and mode = 'live'
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'LIVE_ORDER_NOT_FOUND';
  end if;
  if v_order.archived_at is not null then
    raise exception using errcode = '23514', message = 'ORDER_ALREADY_ARCHIVED';
  end if;
  if v_order.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'ORDER_VERSION_CONFLICT';
  end if;

  v_status := case
    when v_order.status in ('delivered', 'rejected', 'cancelled') then v_order.status
    else 'cancelled'::app.order_status
  end;
  v_status_changed := v_status is distinct from v_order.status;
  v_before_snapshot := private.build_order_mutation_snapshot(p_order_id);

  perform set_config('app.allow_admin_order_mutation', 'on', true);
  update app.orders
  set status = v_status,
      archived_at = now(),
      archived_by = v_actor,
      version = version + 1
  where id = p_order_id;

  if v_status_changed then
    insert into app.order_status_events (
      order_id, from_status, to_status, actor_type, actor_id, note
    ) values (
      p_order_id,
      v_order.status,
      v_status,
      'staff',
      v_actor,
      nullif(btrim(coalesce(p_note, '')), '')
    );
  end if;

  update app.print_jobs
  set status = 'cancelled',
      lease_expires_at = null,
      claim_token_hash = null
  where order_id = p_order_id
    and status <> 'completed';

  v_after_snapshot := private.build_order_mutation_snapshot(p_order_id);
  insert into private.order_mutation_audits (
    order_id, actor_id, action, from_version, to_version, from_status, to_status,
    before_snapshot, after_snapshot, note
  ) values (
    p_order_id, v_actor, 'order.live_archived', v_order.version, v_order.version + 1,
    v_order.status, v_status, v_before_snapshot, v_after_snapshot,
    nullif(btrim(coalesce(p_note, '')), '')
  );
  perform private.write_admin_audit(
    v_actor,
    'order.live_archived',
    'order',
    p_order_id::text,
    jsonb_build_object(
      'from_status', v_order.status,
      'to_status', v_status,
      'from_version', v_order.version,
      'to_version', v_order.version + 1
    )
  );

  insert into private.outbox_events (
    event_kind, aggregate_type, aggregate_id, mode, payload
  ) values (
    'order.archived',
    'order',
    p_order_id,
    'live',
    jsonb_build_object(
      'order_id', p_order_id,
      'status', v_status,
      'version', v_order.version + 1
    )
  );

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', v_status,
    'version', v_order.version + 1,
    'archived_at', (select archived_at from app.orders where id = p_order_id)
  );
end;
$$;

revoke all on function api.archive_live_website_order(uuid, integer, text)
  from public, anon;
grant execute on function api.archive_live_website_order(uuid, integer, text)
  to authenticated, service_role;

create or replace function api.get_admin_order_detail(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
begin
  perform private.require_admin_permission('orders.read');
  if not exists (
    select 1
    from app.orders o
    where o.id = p_order_id and o.source = 'website'
  ) then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;
  v_payload := private.build_order_operations_payload(p_order_id);
  if v_payload is null then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'order', v_payload,
    'status_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'from_status', e.from_status,
        'to_status', e.to_status,
        'actor_type', e.actor_type,
        'note', e.note,
        'created_at', e.created_at
      ) order by e.created_at desc, e.id desc)
      from app.order_status_events e
      where e.order_id = p_order_id
    ), '[]'::jsonb),
    'mutation_audits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'action', a.action,
        'from_version', a.from_version,
        'to_version', a.to_version,
        'from_status', a.from_status,
        'to_status', a.to_status,
        'note', a.note,
        'created_at', a.created_at
      ) order by a.created_at desc, a.id desc)
      from private.order_mutation_audits a
      where a.order_id = p_order_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function api.get_admin_order_detail(uuid) from public, anon;
grant execute on function api.get_admin_order_detail(uuid) to authenticated, service_role;

create or replace function api.list_order_arrivals_for_operations(
  p_after_placed_at timestamptz default null,
  p_after_order_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_permission('orders.read');
  if p_limit not between 1 and 50
     or (p_after_placed_at is null) <> (p_after_order_id is null) then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_ARRIVAL_CURSOR';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'order_id', q.id,
      'order_reference', q.order_reference,
      'mode', q.mode,
      'status', q.status,
      'version', q.version,
      'grand_total_minor', q.grand_total_minor,
      'currency_code', q.currency_code,
      'placed_at', q.placed_at,
      'accepted_at', q.accepted_at,
      'completed_at', q.completed_at,
      'archived_at', q.archived_at
    ) order by q.placed_at, q.id)
    from (
      select o.*
      from app.orders o
      where o.source = 'website'
        and o.status = 'pending_acceptance'
        and o.archived_at is null
        and (
          p_after_placed_at is null
          or (o.placed_at, o.id) > (p_after_placed_at, p_after_order_id)
        )
      order by o.placed_at, o.id
      limit p_limit
    ) q
  ), '[]'::jsonb);
end;
$$;

revoke all on function api.list_order_arrivals_for_operations(timestamptz, uuid, integer)
  from public, anon;
grant execute on function api.list_order_arrivals_for_operations(timestamptz, uuid, integer)
  to authenticated, service_role;

-- Keep archived live orders out of the active operations list. Their record,
-- audit, customer tracking, and POS mirror remain intact; only test orders use
-- the separate, confirmed hard-delete tombstone path.
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
        'completed_at', q.completed_at,
        'archived_at', q.archived_at
      ) order by q.placed_at desc, q.id
    )
    from (
      select o.*
      from app.orders o
      where o.source = 'website'
        and o.archived_at is null
        and (p_status is null or o.status = p_status)
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

-- The dashboard uses the compact active queue above. The separate protected
-- orders workspace needs a bounded history that can include archived live
-- orders without ever exposing contacts in the list response.
create or replace function api.list_website_orders_for_operations(
  p_status app.order_status default null,
  p_mode app.order_mode default null,
  p_include_archived boolean default false,
  p_before_placed_at timestamptz default null,
  p_before_order_id uuid default null,
  p_limit integer default 100
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
  if p_limit not between 1 and 200
     or (p_before_placed_at is null) <> (p_before_order_id is null) then
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
        'completed_at', q.completed_at,
        'archived_at', q.archived_at
      ) order by q.placed_at desc, q.id
    )
    from (
      select o.*
      from app.orders o
      where o.source = 'website'
        and (p_include_archived or o.archived_at is null)
        and (p_status is null or o.status = p_status)
        and (p_mode is null or o.mode = p_mode)
        and (
          p_before_placed_at is null
          or (o.placed_at, o.id) < (p_before_placed_at, p_before_order_id)
        )
      order by o.placed_at desc, o.id
      limit p_limit
    ) q
  ), '[]'::jsonb);
end;
$$;

revoke all on function api.list_website_orders_for_operations(
  app.order_status, app.order_mode, boolean, timestamptz, uuid, integer
) from public, anon;
grant execute on function api.list_website_orders_for_operations(
  app.order_status, app.order_mode, boolean, timestamptz, uuid, integer
) to authenticated, service_role;

-- Signed POS mirrors use an update-keyset feed. The endpoint returns current
-- snapshots, never claim tokens, so a terminal can safely upsert local print
-- copies by `(order_id, version)` and move cards to history when the website
-- marks a terminal status.
create or replace function api.pos_sync_website_orders(
  p_terminal_id uuid,
  p_limit integer default 50,
  p_include_test boolean default false,
  p_after_updated_at timestamptz default null,
  p_after_order_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_terminal_id is null
     or p_limit not between 1 and 50
     or (p_after_updated_at is null) <> (p_after_order_id is null) then
    raise exception using errcode = '22023', message = 'INVALID_POS_SYNC_CURSOR';
  end if;
  if not exists (
    select 1 from app.pos_terminals t
    where t.id = p_terminal_id and t.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'TERMINAL_NOT_ACTIVE';
  end if;

  update app.pos_terminals
  set last_seen_at = now()
  where id = p_terminal_id;

  return coalesce((
    select jsonb_agg(private.build_order_operations_payload(q.id)
      order by q.updated_at, q.id)
    from (
      select o.id, o.updated_at
      from app.orders o
      where o.source = 'website'
        and (o.mode = 'live' or p_include_test)
        and (
          p_after_updated_at is null
          or (o.updated_at, o.id) > (p_after_updated_at, p_after_order_id)
        )
      order by o.updated_at, o.id
      limit p_limit
    ) q
  ), '[]'::jsonb);
end;
$$;

revoke all on function api.pos_sync_website_orders(
  uuid, integer, boolean, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function api.pos_sync_website_orders(
  uuid, integer, boolean, timestamptz, uuid
) to service_role;

-- Deliberately retain the function signature for signed-route compatibility,
-- but fail every write attempt before it can mutate a website order. Printing
-- acknowledgements remain handled by api.apply_pos_print_ack.
create or replace function api.apply_pos_order_event(
  p_terminal_id uuid,
  p_event_key uuid,
  p_order_id uuid,
  p_to_status app.order_status,
  p_expected_version integer,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'POS_STATUS_MUTATION_DISABLED';
end;
$$;

revoke all on function api.apply_pos_order_event(
  uuid, uuid, uuid, app.order_status, integer, text
) from public, anon, authenticated;
grant execute on function api.apply_pos_order_event(
  uuid, uuid, uuid, app.order_status, integer, text
) to service_role;
