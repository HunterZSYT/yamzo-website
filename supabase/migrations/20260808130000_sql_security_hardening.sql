-- Security hardening identified during the pre-launch RLS and API contract audit.
-- This migration is additive: it narrows browser ACLs, introduces guarded staff
-- access management, and enforces business hours for every live website order.

-- Storage policies execute as the authenticated caller. Allow only the schema
-- lookup and helper invocation those policies need; all private tables and all
-- other private functions remain inaccessible to authenticated users.
grant usage on schema private to authenticated;
grant execute on function private.current_staff_has_permission(text) to authenticated;

-- Move the original implementation behind the private boundary. Public RPCs
-- below wrap it with canonical idempotency and catalog-concurrency checks.
alter function api.create_order_tx(
  text, text, text, smallint, text, text, text, jsonb, app.locale_code, text
) set schema private;
alter function private.create_order_tx(
  text, text, text, smallint, text, text, text, jsonb, app.locale_code, text
) rename to create_order_core;
revoke all on function private.create_order_core(
  text, text, text, smallint, text, text, text, jsonb, app.locale_code, text
) from public, anon, authenticated, service_role;

-- A customer can edit only mutable profile preferences. Identity and audit
-- columns cannot be rewritten through a browser role.
revoke update on app.profiles from authenticated;
grant update (display_name, preferred_locale, marketing_consent_at)
  on app.profiles to authenticated;

create or replace function api.set_staff_access(
  p_user_id uuid,
  p_status app.staff_status,
  p_role_key app.app_role_code,
  p_suspended_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_old_status app.staff_status;
  v_role_id uuid;
  v_was_active_owner boolean;
  v_will_be_active_owner boolean;
  v_other_active_owners integer;
  v_reason text;
begin
  if not v_is_service and not private.current_staff_has_permission('staff.manage') then
    raise exception using errcode = '42501', message = 'STAFF_MANAGE_PERMISSION_REQUIRED';
  end if;
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'STAFF_USER_REQUIRED';
  end if;
  if p_status is null
     or p_status not in ('active'::app.staff_status, 'suspended'::app.staff_status) then
    raise exception using errcode = '22023', message = 'INVALID_MANAGED_STAFF_STATUS';
  end if;
  if p_role_key is null then
    raise exception using errcode = '22023', message = 'EXACT_STAFF_ROLE_REQUIRED';
  end if;

  v_reason := nullif(btrim(coalesce(p_suspended_reason, '')), '');
  if p_status = 'suspended' and (
    v_reason is null or char_length(v_reason) not between 2 and 240
  ) then
    raise exception using errcode = '22023', message = 'SUSPENSION_REASON_REQUIRED';
  end if;

  select sm.status
  into v_old_status
  from app.staff_members sm
  where sm.user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_REQUEST_NOT_FOUND';
  end if;

  select r.id
  into v_role_id
  from app.roles r
  where r.code = p_role_key;

  if not found then
    raise exception using errcode = '22023', message = 'INVALID_ROLE';
  end if;

  -- Serialize every API-driven owner-role mutation so two owners cannot both
  -- demote or suspend themselves after observing the other as active.
  perform 1
  from app.roles r
  where r.code = 'owner'
  for update;

  select exists (
    select 1
    from app.staff_role_assignments sra
    join app.roles r on r.id = sra.role_id
    where sra.user_id = p_user_id
      and r.code = 'owner'
      and v_old_status = 'active'
  ) into v_was_active_owner;

  v_will_be_active_owner := p_status = 'active' and p_role_key = 'owner';

  if v_was_active_owner and not v_will_be_active_owner then
    select count(*)::integer
    into v_other_active_owners
    from app.staff_members sm
    join app.staff_role_assignments sra on sra.user_id = sm.user_id
    join app.roles r on r.id = sra.role_id
    where sm.status = 'active'
      and r.code = 'owner'
      and sm.user_id <> p_user_id;

    if v_other_active_owners = 0 then
      raise exception using errcode = '23514', message = 'LAST_ACTIVE_OWNER_REQUIRED';
    end if;
  end if;

  update app.staff_members
  set status = p_status,
      approved_by = case when p_status = 'active' then v_actor else approved_by end,
      approved_at = case when p_status = 'active' then now() else approved_at end,
      suspended_reason = case when p_status = 'suspended' then v_reason else null end
  where user_id = p_user_id;

  -- Replace the exact assignment instead of accumulating privileges across
  -- repeated approvals or demotions.
  delete from app.staff_role_assignments
  where user_id = p_user_id;

  insert into app.staff_role_assignments (user_id, role_id, assigned_by)
  values (p_user_id, v_role_id, v_actor);

  insert into private.audit_log (
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    details
  ) values (
    case when v_is_service then 'system' else 'staff' end,
    v_actor,
    'staff.access_updated',
    'staff_member',
    p_user_id::text,
    jsonb_build_object('status', p_status, 'role_key', p_role_key)
  );

  return jsonb_build_object(
    'staff_id', p_user_id,
    'status', p_status,
    'role_key', p_role_key
  );
end;
$$;

revoke all on function api.set_staff_access(
  uuid, app.staff_status, app.app_role_code, text
) from public, anon;
grant execute on function api.set_staff_access(
  uuid, app.staff_status, app.app_role_code, text
) to authenticated, service_role;

-- Keep the existing approval contract while changing it to exact-role
-- replacement and applying the same last-owner protection.
create or replace function api.approve_staff(
  p_user_id uuid,
  p_role_key app.app_role_code
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform api.set_staff_access(p_user_id, 'active', p_role_key, null);
  return true;
end;
$$;

revoke all on function api.approve_staff(uuid, app.app_role_code) from public, anon;
grant execute on function api.approve_staff(uuid, app.app_role_code)
  to authenticated, service_role;

-- A schedule exception replaces the weekly schedule for that service date.
-- Overnight intervals are evaluated against both the local date and the
-- previous local date. No matching interval means closed (fail closed).
create or replace function private.is_ordering_open_at(p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with local_context as (
    select timezone('Asia/Dhaka', p_at) as local_timestamp
    where p_at is not null
  ),
  candidate_dates as (
    select
      local_timestamp::date as schedule_date,
      local_timestamp::time as local_time,
      false as carry_from_previous
    from local_context
    union all
    select
      local_timestamp::date - 1 as schedule_date,
      local_timestamp::time as local_time,
      true as carry_from_previous
    from local_context
  ),
  effective_intervals as (
    select
      d.local_time,
      d.carry_from_previous,
      schedule.opens_at,
      schedule.closes_at,
      schedule.is_closed
    from candidate_dates d
    cross join lateral (
      select e.opens_at, e.closes_at, e.is_closed
      from app.business_hour_exceptions e
      where e.service_date = d.schedule_date

      union all

      select h.opens_at, h.closes_at, h.is_closed
      from app.business_hours h
      where h.day_of_week = extract(dow from d.schedule_date)::smallint
        and not exists (
          select 1
          from app.business_hour_exceptions override
          where override.service_date = d.schedule_date
        )
    ) schedule
  )
  select coalesce(bool_or(
    not is_closed
    and opens_at is not null
    and closes_at is not null
    and (
      (
        opens_at < closes_at
        and not carry_from_previous
        and local_time >= opens_at
        and local_time < closes_at
      )
      or (
        opens_at > closes_at
        and (
          (not carry_from_previous and local_time >= opens_at)
          or (carry_from_previous and local_time < closes_at)
        )
      )
    )
  ), false)
  from effective_intervals;
$$;

revoke all on function private.is_ordering_open_at(timestamptz)
  from public, anon, authenticated;

create or replace function private.enforce_live_website_ordering_hours()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source = 'website'
     and new.mode = 'live'
     and not private.is_ordering_open_at(statement_timestamp()) then
    raise exception using
      errcode = '55000',
      message = 'ORDERING_OUTSIDE_BUSINESS_HOURS';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_live_website_ordering_hours()
  from public, anon, authenticated;

drop trigger if exists orders_enforce_live_website_hours on app.orders;
create trigger orders_enforce_live_website_hours
before insert on app.orders
for each row execute function private.enforce_live_website_ordering_hours();

-- Signed-in checkout retains auth.uid() through this wrapper. The expected
-- subtotal excludes offer discounts and delivery fees and is compared against
-- the authoritative catalog snapshot before the transaction can commit.
create or replace function api.create_order_tx(
  p_idempotency_key text,
  p_full_name text,
  p_phone text,
  p_sector_number smallint,
  p_road_number text,
  p_house_number text,
  p_flat_number text,
  p_items jsonb,
  p_expected_subtotal_minor integer,
  p_locale app.locale_code default 'en',
  p_customer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key_hash bytea;
  v_payload jsonb;
  v_payload_hash bytea;
  v_existing_payload_hash bytea;
  v_existing_response jsonb;
  v_internal_key text;
  v_internal_key_hash bytea;
  v_response jsonb;
  v_actual_subtotal_minor integer;
begin
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception using errcode = '22023', message = 'INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_expected_subtotal_minor is null or p_expected_subtotal_minor < 0 then
    raise exception using errcode = '22023', message = 'INVALID_EXPECTED_SUBTOTAL';
  end if;
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or octet_length(p_items::text) > 65536 then
    raise exception using errcode = '22023', message = 'INVALID_ITEMS_PAYLOAD';
  end if;

  v_payload := jsonb_build_object(
    'user_id', auth.uid(),
    'full_name', nullif(btrim(coalesce(p_full_name, '')), ''),
    'phone_e164', private.normalize_bd_phone(p_phone),
    'sector_number', p_sector_number,
    'road_number', nullif(btrim(coalesce(p_road_number, '')), ''),
    'house_number', nullif(btrim(coalesce(p_house_number, '')), ''),
    'flat_number', nullif(btrim(coalesce(p_flat_number, '')), ''),
    'items', p_items,
    'expected_subtotal_minor', p_expected_subtotal_minor,
    'locale', p_locale,
    'customer_note', nullif(btrim(coalesce(p_customer_note, '')), '')
  );
  v_key_hash := extensions.digest(p_idempotency_key, 'sha256');
  v_payload_hash := extensions.digest(v_payload::text, 'sha256');
  v_internal_key := pg_catalog.encode(
    extensions.digest(
      p_idempotency_key || ':' || pg_catalog.encode(v_payload_hash, 'hex'),
      'sha256'
    ),
    'hex'
  );
  v_internal_key_hash := extensions.digest(v_internal_key, 'sha256');

  -- Expired reservations are deleted before conflict handling so neither the
  -- public wrapper nor the private legacy core can replay a stale response.
  delete from private.idempotency_keys
  where operation = 'order.create.v2'
    and key_hash = v_key_hash
    and expires_at <= now();

  delete from private.idempotency_keys
  where operation = 'order.create'
    and key_hash = v_internal_key_hash
    and expires_at <= now();

  insert into private.idempotency_keys (
    operation,
    key_hash,
    actor_fingerprint_hash,
    expires_at
  ) values (
    'order.create.v2',
    v_key_hash,
    v_payload_hash,
    now() + interval '24 hours'
  )
  on conflict (operation, key_hash) do nothing;

  select actor_fingerprint_hash, response_payload
  into v_existing_payload_hash, v_existing_response
  from private.idempotency_keys
  where operation = 'order.create.v2'
    and key_hash = v_key_hash
  for update;

  if v_existing_payload_hash is distinct from v_payload_hash then
    raise exception using errcode = '23505', message = 'IDEMPOTENCY_KEY_REUSED';
  end if;
  if v_existing_response is not null then
    return v_existing_response;
  end if;

  v_response := private.create_order_core(
    v_internal_key,
    p_full_name,
    p_phone,
    p_sector_number,
    p_road_number,
    p_house_number,
    p_flat_number,
    p_items,
    p_locale,
    p_customer_note
  );

  select o.subtotal_minor
  into v_actual_subtotal_minor
  from app.orders o
  where o.id = (v_response ->> 'order_id')::uuid;

  if v_actual_subtotal_minor is distinct from p_expected_subtotal_minor then
    raise exception using errcode = '40001', message = 'CATALOG_SUBTOTAL_CHANGED';
  end if;

  update private.idempotency_keys
  set resource_id = (v_response ->> 'order_id')::uuid,
      response_payload = v_response
  where operation = 'order.create.v2'
    and key_hash = v_key_hash;

  return v_response;
end;
$$;

revoke all on function api.create_order_tx(
  text, text, text, smallint, text, text, text, jsonb, integer,
  app.locale_code, text
) from public, anon;
grant execute on function api.create_order_tx(
  text, text, text, smallint, text, text, text, jsonb, integer,
  app.locale_code, text
) to authenticated, service_role;

-- Guest checkout can be reached only through a trusted server holding the
-- secret/service key. The opaque bucket is derived server-side (for example,
-- from IP plus a short-lived session identifier); its raw value is never kept.
create or replace function api.create_guest_order_tx(
  p_idempotency_key text,
  p_full_name text,
  p_phone text,
  p_sector_number smallint,
  p_road_number text,
  p_house_number text,
  p_flat_number text,
  p_items jsonb,
  p_expected_subtotal_minor integer,
  p_rate_bucket text,
  p_locale app.locale_code default 'en',
  p_customer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket_hash bytea;
  v_window timestamptz;
  v_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TRUSTED_ORDER_SERVER_REQUIRED';
  end if;
  if p_rate_bucket is null or char_length(p_rate_bucket) not between 16 and 200 then
    raise exception using errcode = '22023', message = 'INVALID_RATE_BUCKET';
  end if;

  v_bucket_hash := extensions.digest(p_rate_bucket, 'sha256');
  v_window := date_trunc('hour', now())
    + ((extract(minute from now())::integer / 10) * interval '10 minutes');

  insert into private.rate_limit_buckets (
    action,
    bucket_hash,
    window_started_at,
    request_count,
    expires_at
  ) values (
    'order.guest_create',
    v_bucket_hash,
    v_window,
    1,
    v_window + interval '20 minutes'
  )
  on conflict (action, bucket_hash, window_started_at) do update
  set request_count = private.rate_limit_buckets.request_count + 1
  returning request_count into v_count;

  if v_count > 5 then
    raise exception using errcode = 'P0001', message = 'RATE_LIMITED';
  end if;

  return api.create_order_tx(
    p_idempotency_key,
    p_full_name,
    p_phone,
    p_sector_number,
    p_road_number,
    p_house_number,
    p_flat_number,
    p_items,
    p_expected_subtotal_minor,
    p_locale,
    p_customer_note
  );
end;
$$;

revoke all on function api.create_guest_order_tx(
  text, text, text, smallint, text, text, text, jsonb, integer, text,
  app.locale_code, text
) from public, anon, authenticated;
grant execute on function api.create_guest_order_tx(
  text, text, text, smallint, text, text, text, jsonb, integer, text,
  app.locale_code, text
) to service_role;

create or replace function private.next_ordering_opening_after(p_at timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  with local_context as (
    select timezone('Asia/Dhaka', p_at) as local_timestamp
    where p_at is not null
  ),
  candidate_dates as (
    select generate_series(
      local_timestamp::date,
      local_timestamp::date + 14,
      interval '1 day'
    )::date as schedule_date
    from local_context
  ),
  effective_intervals as (
    select
      d.schedule_date,
      schedule.opens_at,
      schedule.closes_at,
      schedule.is_closed
    from candidate_dates d
    cross join lateral (
      select e.opens_at, e.closes_at, e.is_closed
      from app.business_hour_exceptions e
      where e.service_date = d.schedule_date

      union all

      select h.opens_at, h.closes_at, h.is_closed
      from app.business_hours h
      where h.day_of_week = extract(dow from d.schedule_date)::smallint
        and not exists (
          select 1
          from app.business_hour_exceptions override
          where override.service_date = d.schedule_date
        )
    ) schedule
  ),
  openings as (
    select
      (schedule_date + opens_at) at time zone 'Asia/Dhaka' as opens_at_utc
    from effective_intervals
    where not is_closed
      and opens_at is not null
      and closes_at is not null
  )
  select min(opens_at_utc)
  from openings
  where opens_at_utc > p_at;
$$;

revoke all on function private.next_ordering_opening_after(timestamptz)
  from public, anon, authenticated;

-- Public, PII-free availability contract. `ordering_open` is the single UI
-- submit gate: true for live ordering during business hours or for an approved
-- staff member while test mode is enabled.
create or replace function api.get_ordering_availability(
  p_locale app.locale_code default 'en'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_runtime app.site_runtime%rowtype;
  v_schedule_open boolean;
  v_accepting_live boolean;
  v_accepting_test boolean;
  v_ordering_open boolean;
  v_closed_reason text;
  v_next_opening timestamptz;
begin
  select *
  into v_runtime
  from app.site_runtime
  where singleton;

  if not found then
    return jsonb_build_object(
      'ordering_open', false,
      'schedule_open', false,
      'accepting_live_orders', false,
      'accepting_test_orders', false,
      'closed_reason', case when p_locale = 'bn'
        then 'অনলাইন অর্ডার এখন উপলভ্য নয়।'
        else 'Online ordering is not available right now.'
      end,
      'next_opening_at', null
    );
  end if;

  v_schedule_open := private.is_ordering_open_at(now());
  v_accepting_live := v_runtime.published
    and v_runtime.live_orders_enabled
    and not v_runtime.test_mode
    and v_schedule_open;
  v_accepting_test := v_runtime.test_mode and private.is_active_staff();
  v_ordering_open := v_accepting_live or v_accepting_test;

  if not v_ordering_open then
    v_closed_reason := case
      when not v_runtime.published then
        case when p_locale = 'bn'
          then coalesce(
            nullif(v_runtime.ordering_paused_reason_bn, ''),
            'অনলাইন অর্ডার শিগগিরই চালু হবে।'
          )
          else coalesce(
            nullif(v_runtime.ordering_paused_reason_en, ''),
            'Online ordering will be available soon.'
          )
        end
      when v_runtime.test_mode then
        case when p_locale = 'bn'
          then 'অনলাইন অর্ডার এখন পরীক্ষামূলক মোডে রয়েছে।'
          else 'Online ordering is currently in test mode.'
        end
      when not v_runtime.live_orders_enabled then
        case when p_locale = 'bn'
          then coalesce(
            nullif(v_runtime.ordering_paused_reason_bn, ''),
            'অনলাইন অর্ডার সাময়িকভাবে বন্ধ রয়েছে।'
          )
          else coalesce(
            nullif(v_runtime.ordering_paused_reason_en, ''),
            'Online ordering is temporarily paused.'
          )
        end
      else
        case when p_locale = 'bn'
          then 'ইয়ামজো উত্তরা এখন বন্ধ। পরবর্তী খোলার সময় দেখুন।'
          else 'Yamzo Uttara is currently closed. Please check the next opening time.'
        end
    end;
  end if;

  if not v_schedule_open then
    v_next_opening := private.next_ordering_opening_after(now());
  end if;

  return jsonb_build_object(
    'ordering_open', v_ordering_open,
    'schedule_open', v_schedule_open,
    'accepting_live_orders', v_accepting_live,
    'accepting_test_orders', v_accepting_test,
    'closed_reason', v_closed_reason,
    'next_opening_at', v_next_opening
  );
end;
$$;

revoke all on function api.get_ordering_availability(app.locale_code) from public;
grant execute on function api.get_ordering_availability(app.locale_code)
  to anon, authenticated;

-- Narrow admin mutation for the launch/test toggles. It deliberately leaves
-- pricing, delivery, preparation, and pause-copy values unchanged.
create or replace function api.set_site_runtime_modes(
  p_published boolean,
  p_live_orders_enabled boolean,
  p_test_mode boolean
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
  if p_published is null or p_live_orders_enabled is null or p_test_mode is null then
    raise exception using errcode = '22023', message = 'RUNTIME_MODE_VALUES_REQUIRED';
  end if;
  if p_live_orders_enabled and p_test_mode then
    raise exception using errcode = '22023', message = 'LIVE_AND_TEST_MODE_ARE_MUTUALLY_EXCLUSIVE';
  end if;

  update app.site_runtime r
  set published = p_published,
      live_orders_enabled = p_live_orders_enabled,
      test_mode = p_test_mode,
      updated_by = v_actor
  where r.singleton;

  if not found then
    raise exception using errcode = '55000', message = 'SITE_RUNTIME_NOT_CONFIGURED';
  end if;

  insert into private.audit_log (
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    details
  ) values (
    case when v_is_service then 'system' else 'staff' end,
    v_actor,
    'site.runtime_modes_updated',
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

revoke all on function api.set_site_runtime_modes(boolean, boolean, boolean)
  from public, anon;
grant execute on function api.set_site_runtime_modes(boolean, boolean, boolean)
  to authenticated, service_role;

-- Dashboard metrics are returned only to roles holding the permission for the
-- corresponding data. Public runtime values remain visible to active staff.
create or replace function api.get_admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day_start timestamptz;
  v_can_read_orders boolean;
  v_can_read_reports boolean;
  v_can_manage_staff boolean;
  v_can_manage_catalog boolean;
  v_result jsonb;
begin
  if not private.is_active_staff() then
    raise exception using errcode = '42501', message = 'ACTIVE_STAFF_REQUIRED';
  end if;

  v_can_read_orders := private.current_staff_has_permission('orders.read');
  v_can_read_reports := private.current_staff_has_permission('reports.read');
  v_can_manage_staff := private.current_staff_has_permission('staff.manage');
  v_can_manage_catalog := private.current_staff_has_permission('catalog.manage');
  v_day_start := timezone('Asia/Dhaka', now())::date::timestamp
    at time zone 'Asia/Dhaka';

  select jsonb_build_object(
    'runtime', jsonb_build_object(
      'site_published', r.published,
      'live_orders_enabled', r.live_orders_enabled,
      'test_mode_enabled', r.test_mode
    ),
    'capabilities', jsonb_build_object(
      'orders_read', v_can_read_orders,
      'reports_read', v_can_read_reports,
      'staff_manage', v_can_manage_staff,
      'catalog_manage', v_can_manage_catalog
    ),
    'pending_live_orders', case when v_can_read_orders then (
      select count(*) from app.orders o
      where o.mode = 'live' and o.status = 'pending_acceptance'
    ) else null end,
    'pending_test_orders', case when v_can_read_orders then (
      select count(*) from app.orders o
      where o.mode = 'test' and o.status = 'pending_acceptance'
    ) else null end,
    'live_orders_today', case when v_can_read_reports then (
      select count(*) from app.orders o
      where o.mode = 'live' and o.created_at >= v_day_start
    ) else null end,
    'live_revenue_today_minor', case when v_can_read_reports then (
      select coalesce(sum(o.grand_total_minor), 0) from app.orders o
      where o.mode = 'live'
        and o.status = 'delivered'
        and o.completed_at >= v_day_start
    ) else null end,
    'pending_staff_requests', case when v_can_manage_staff then (
      select count(*) from app.staff_members sm where sm.status = 'pending'
    ) else null end,
    'unavailable_menu_items', case when v_can_manage_catalog then (
      select count(*) from app.menu_items i
      where i.is_active and not i.is_available
    ) else null end
  ) into v_result
  from app.site_runtime r
  where r.singleton;

  return v_result;
end;
$$;

revoke all on function api.get_admin_dashboard() from public, anon;
grant execute on function api.get_admin_dashboard() to authenticated;
