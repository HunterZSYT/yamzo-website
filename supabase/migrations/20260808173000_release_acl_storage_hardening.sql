-- Final release-boundary hardening.
--
-- Browser sessions never need the legacy POS leasing functions or the old
-- approval alias. Tracking credentials are now resolved only by trusted
-- server code, with a durable fixed-window limiter keyed by a server-generated
-- opaque bucket. No raw IP address, customer phone, or tracking token is kept
-- in the limiter table.

create or replace function private.consume_fixed_window_rate_limit(
  p_action text,
  p_bucket_value text,
  p_limit integer,
  p_window_minutes integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_window timestamptz;
  v_count integer;
begin
  if p_action is null
     or p_action !~ '^[a-z][a-z0-9_.-]{2,79}$'
     or p_bucket_value is null
     or char_length(p_bucket_value) not between 1 and 512
     or p_limit not between 1 and 10000
     or p_window_minutes not between 1 and 60
     or mod(60, p_window_minutes) <> 0 then
    raise exception using errcode = '22023', message = 'INVALID_RATE_LIMIT_CONFIGURATION';
  end if;

  v_window := date_trunc('hour', v_now)
    + make_interval(
        mins => (extract(minute from v_now)::integer / p_window_minutes)
          * p_window_minutes
      );

  -- Keep the shared ledger bounded without turning request handling into an
  -- unbounded maintenance job. rate_limit_expiry supports this batch.
  delete from private.rate_limit_buckets b
  using (
    select expired.action, expired.bucket_hash, expired.window_started_at
    from private.rate_limit_buckets expired
    where expired.expires_at <= v_now
    order by expired.expires_at
    limit 100
  ) expired
  where b.action = expired.action
    and b.bucket_hash = expired.bucket_hash
    and b.window_started_at = expired.window_started_at;

  insert into private.rate_limit_buckets (
    action,
    bucket_hash,
    window_started_at,
    request_count,
    expires_at
  ) values (
    p_action,
    extensions.digest(p_bucket_value, 'sha256'),
    v_window,
    1,
    v_window + make_interval(mins => p_window_minutes * 2)
  )
  on conflict (action, bucket_hash, window_started_at) do update
  set request_count = private.rate_limit_buckets.request_count + 1
  returning request_count into v_count;

  if v_count > p_limit then
    raise exception using errcode = 'P0001', message = 'RATE_LIMITED';
  end if;
end;
$$;

revoke all on function private.consume_fixed_window_rate_limit(
  text, text, integer, integer
) from public, anon, authenticated, service_role;

-- The signed Vercel bridge replaced these direct browser-reachable POS RPCs.
revoke all on function api.claim_website_orders(uuid, integer, integer, boolean)
  from public, anon, authenticated, service_role;
grant execute on function api.claim_website_orders(uuid, integer, integer, boolean)
  to service_role;

revoke all on function api.renew_order_claim(uuid, uuid, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.renew_order_claim(uuid, uuid, text, integer)
  to service_role;

revoke all on function api.release_order_claim(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function api.release_order_claim(uuid, uuid, text)
  to service_role;

revoke all on function api.claim_print_jobs(uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.claim_print_jobs(uuid, integer, integer)
  to service_role;

revoke all on function api.ack_print_job(uuid, uuid, text, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function api.ack_print_job(uuid, uuid, text, boolean, text)
  to service_role;

-- api.set_staff_access is the audited current contract. Keep the stale alias
-- only for trusted bootstrap/maintenance compatibility.
revoke all on function api.approve_staff(uuid, app.app_role_code)
  from public, anon, authenticated, service_role;
grant execute on function api.approve_staff(uuid, app.app_role_code)
  to service_role;

-- The two-argument compatibility function is no longer browser callable.
revoke all on function api.get_order_by_tracking(text, text)
  from public, anon, authenticated, service_role;
grant execute on function api.get_order_by_tracking(text, text)
  to service_role;

-- Trusted routes use this overload. ORDER_NOT_FOUND is represented as SQL
-- NULL so a failed credential check can still commit its limiter increment;
-- the route converts NULL back to the existing indistinguishable 404.
create or replace function api.get_order_by_tracking(
  p_order_reference text,
  p_tracking_token text,
  p_rate_bucket text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TRUSTED_ORDER_SERVER_REQUIRED';
  end if;
  if p_rate_bucket is null or char_length(p_rate_bucket) not between 16 and 200 then
    raise exception using errcode = '22023', message = 'INVALID_RATE_BUCKET';
  end if;

  perform private.consume_fixed_window_rate_limit(
    'order.tracking_lookup',
    p_rate_bucket,
    120,
    10
  );

  begin
    v_result := api.get_order_by_tracking(p_order_reference, p_tracking_token);
  exception
    when sqlstate 'P0002' then
      if sqlerrm = 'ORDER_NOT_FOUND' then
        return null;
      end if;
      raise;
  end;

  return v_result;
end;
$$;

revoke all on function api.get_order_by_tracking(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function api.get_order_by_tracking(text, text, text)
  to service_role;

comment on function api.get_order_by_tracking(text, text, text) is
  'Server-only tracking lookup. The rate bucket is an HMAC identity generated by the website server and stored only as SHA-256.';

-- Preserve the authenticated checkout signature and idempotency/catalog
-- semantics while limiting distinct successful creation attempts per auth.uid.
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
  v_user_id uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
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
  if not v_is_service and v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
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
    'user_id', v_user_id,
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

  if not v_is_service then
    perform private.consume_fixed_window_rate_limit(
      'order.auth_create',
      v_user_id::text,
      10,
      10
    );
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
) from public, anon, authenticated, service_role;
grant execute on function api.create_order_tx(
  text, text, text, smallint, text, text, text, jsonb, integer,
  app.locale_code, text
) to authenticated, service_role;

-- A customer may keep at most five distinct phone numbers. The advisory lock
-- makes the count-and-insert decision safe under concurrent requests.
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
  perform private.consume_fixed_window_rate_limit(
    'customer.phone_save',
    v_user_id::text,
    12,
    10
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer.phone:' || v_user_id::text, 0)
  );

  if not exists (
    select 1
    from private.customer_phone_numbers p
    where p.user_id = v_user_id
      and p.phone_e164 = v_phone
  ) and (
    select count(*)
    from private.customer_phone_numbers p
    where p.user_id = v_user_id
  ) >= 5 then
    raise exception using errcode = '23514', message = 'CUSTOMER_PHONE_LIMIT_REACHED';
  end if;

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

revoke all on function api.save_my_phone(text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function api.save_my_phone(text, text, boolean)
  to authenticated;

-- Only the first access request emits an audit event. Repeated requests are
-- rate-limited, may refresh a changed display name, and cannot reset the staff
-- status or spam the append-only audit log.
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

  perform private.consume_fixed_window_rate_limit(
    'staff.access_request',
    v_user_id::text,
    6,
    10
  );

  insert into app.staff_members (user_id, display_name, status)
  values (v_user_id, btrim(p_display_name), 'pending')
  on conflict (user_id) do nothing
  returning status into v_status;

  if v_status is not null then
    insert into private.audit_log (actor_type, actor_id, action, target_type, target_id)
    values ('staff', v_user_id, 'staff.access_requested', 'staff_member', v_user_id::text);
    return v_status;
  end if;

  update app.staff_members
  set display_name = btrim(p_display_name)
  where user_id = v_user_id
    and display_name is distinct from btrim(p_display_name)
  returning status into v_status;

  if v_status is null then
    select sm.status into v_status
    from app.staff_members sm
    where sm.user_id = v_user_id;
  end if;

  return v_status;
end;
$$;

revoke all on function api.request_staff_access(text)
  from public, anon, authenticated, service_role;
grant execute on function api.request_staff_access(text)
  to authenticated;

-- Defense in depth for the replay-protection ledger. Its trusted functions
-- continue to work as SECURITY DEFINER; browser roles have neither grants nor
-- policies.
alter table private.pos_request_nonces enable row level security;
revoke all on table private.pos_request_nonces
  from public, anon, authenticated;

-- Qualify the outer RLS row explicitly. The previous unqualified `id` could
-- bind to the inner menu item/banner row and deny the intended media asset.
drop policy if exists "storefront media is readable" on app.media_assets;
create policy "storefront media is readable"
on app.media_assets for select
to anon, authenticated
using (
  exists (
    select 1
    from app.menu_item_media im
    join app.menu_items i on i.id = im.item_id
    where im.media_id = app.media_assets.id
      and i.is_active
  )
  or exists (
    select 1
    from app.banners b
    where b.media_id = app.media_assets.id
      and b.is_active
      and (b.starts_at is null or b.starts_at <= now())
      and (b.ends_at is null or b.ends_at > now())
  )
);
