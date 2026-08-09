-- Customer account journey: keep mutable customer preferences private and
-- expose them only through narrow, authenticated RPCs. Order records remain
-- the operational/legal record if an account is deleted.

create table private.customer_delivery_addresses (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Home',
  sector_number smallint not null,
  road_number text not null,
  house_number text not null,
  flat_number text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_delivery_address_label_length check (
    char_length(btrim(label)) between 1 and 40
  ),
  constraint customer_delivery_address_sector_range check (
    sector_number between 1 and 99
  ),
  constraint customer_delivery_address_road_numeric check (
    road_number ~ '^[0-9]{1,40}$'
  ),
  constraint customer_delivery_address_house_numeric check (
    house_number ~ '^[0-9]{1,40}$'
  ),
  constraint customer_delivery_address_flat_length check (
    char_length(btrim(flat_number)) between 1 and 40
  )
);

comment on table private.customer_delivery_addresses is
  'Customer delivery-address PII. It is accessible only through authenticated self-service RPCs.';

alter table private.customer_delivery_addresses enable row level security;

create trigger customer_delivery_addresses_set_updated_at
before update on private.customer_delivery_addresses
for each row execute function private.set_updated_at();

create unique index customer_delivery_address_one_default_per_user
  on private.customer_delivery_addresses (user_id)
  where is_default;
create index customer_delivery_addresses_by_user
  on private.customer_delivery_addresses (user_id, created_at desc);

create table private.account_deletion_tombstones (
  id bigint generated always as identity primary key,
  user_id_hash bytea not null unique,
  deleted_at timestamptz not null default now(),
  source text not null default 'self_service',
  constraint account_deletion_tombstone_hash_length check (
    octet_length(user_id_hash) = 32
  ),
  constraint account_deletion_tombstone_source_safe check (
    source ~ '^[a-z][a-z0-9_.-]{2,79}$'
  )
);

comment on table private.account_deletion_tombstones is
  'Pseudonymous proof of a completed account deletion. It deliberately contains no email, phone, address, or order PII.';

alter table private.account_deletion_tombstones enable row level security;

create or replace function api.get_my_account_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select jsonb_build_object(
    'display_name', profile.display_name,
    'preferred_locale', coalesce(profile.preferred_locale::text, 'en'),
    'marketing_consent_at', profile.marketing_consent_at,
    'phones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', phone.id,
        'phone_e164', phone.phone_e164,
        'label', phone.label,
        'is_primary', phone.is_primary,
        'verified_at', phone.verified_at,
        'created_at', phone.created_at
      ) order by phone.is_primary desc, phone.created_at asc, phone.id)
      from private.customer_phone_numbers phone
      where phone.user_id = v_user_id
    ), '[]'::jsonb),
    'addresses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', address.id,
        'label', address.label,
        'sector_number', address.sector_number,
        'road_number', address.road_number,
        'house_number', address.house_number,
        'flat_number', address.flat_number,
        'is_default', address.is_default,
        'created_at', address.created_at
      ) order by address.is_default desc, address.created_at asc, address.id)
      from private.customer_delivery_addresses address
      where address.user_id = v_user_id
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'order_reference', source.order_reference,
        'mode', source.mode,
        'status', source.status,
        'version', source.version,
        'grand_total_minor', source.grand_total_minor,
        'currency_code', source.currency_code,
        'placed_at', source.placed_at,
        'completed_at', source.completed_at,
        'item_count', source.item_count
      ) order by source.placed_at desc, source.order_reference desc)
      from (
        select
          order_row.order_reference,
          order_row.mode,
          order_row.status,
          order_row.version,
          order_row.grand_total_minor,
          order_row.currency_code,
          order_row.placed_at,
          order_row.completed_at,
          coalesce((
            select sum(item.quantity)::integer
            from app.order_items item
            where item.order_id = order_row.id
          ), 0) as item_count
        from app.orders order_row
        where order_row.user_id = v_user_id
        order by order_row.placed_at desc, order_row.id desc
        limit 100
      ) source
    ), '[]'::jsonb)
  ) into v_snapshot
  from (select 1) singleton
  left join app.profiles profile on profile.user_id = v_user_id;

  return v_snapshot;
end;
$$;

create or replace function api.update_my_account_profile(
  p_display_name text,
  p_preferred_locale app.locale_code
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := nullif(btrim(p_display_name), '');
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if v_display_name is null or char_length(v_display_name) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'INVALID_DISPLAY_NAME';
  end if;
  if p_preferred_locale is null then
    raise exception using errcode = '22023', message = 'INVALID_PREFERRED_LOCALE';
  end if;

  perform private.consume_fixed_window_rate_limit(
    'customer.profile_update',
    v_user_id::text,
    12,
    10
  );

  insert into app.profiles (user_id, display_name, preferred_locale)
  values (v_user_id, v_display_name, p_preferred_locale)
  on conflict (user_id) do update
  set display_name = excluded.display_name,
      preferred_locale = excluded.preferred_locale,
      updated_at = now()
  returning jsonb_build_object(
    'display_name', display_name,
    'preferred_locale', preferred_locale::text
  ) into v_result;

  insert into private.audit_log (
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    details
  ) values (
    'customer'::app.audit_actor_type,
    v_user_id,
    'customer.profile_updated',
    'profile',
    v_user_id::text,
    jsonb_build_object('preferred_locale', p_preferred_locale::text)
  );

  return v_result;
end;
$$;

create or replace function api.remove_my_phone(p_phone_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_was_primary boolean;
  v_replacement_phone_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_phone_id is null then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_PHONE';
  end if;

  perform private.consume_fixed_window_rate_limit(
    'customer.phone_remove',
    v_user_id::text,
    12,
    10
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer.phone:' || v_user_id::text, 0)
  );

  delete from private.customer_phone_numbers phone
  where phone.id = p_phone_id
    and phone.user_id = v_user_id
  returning phone.is_primary into v_was_primary;

  if not found then
    raise exception using errcode = 'P0002', message = 'CUSTOMER_PHONE_NOT_FOUND';
  end if;

  if v_was_primary then
    select phone.id into v_replacement_phone_id
    from private.customer_phone_numbers phone
    where phone.user_id = v_user_id
    order by phone.created_at asc, phone.id
    limit 1;

    if v_replacement_phone_id is not null then
      update private.customer_phone_numbers
      set is_primary = true
      where id = v_replacement_phone_id;
    end if;
  end if;

  insert into private.audit_log (
    actor_type,
    actor_id,
    action,
    target_type,
    target_id
  ) values (
    'customer'::app.audit_actor_type,
    v_user_id,
    'customer.phone_removed',
    'customer_phone',
    p_phone_id::text
  );
end;
$$;

create or replace function api.save_my_delivery_address(
  p_address_id uuid,
  p_label text,
  p_sector_number smallint,
  p_road_number text,
  p_house_number text,
  p_flat_number text,
  p_make_default boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_address_id uuid;
  v_label text := btrim(p_label);
  v_road_number text := btrim(p_road_number);
  v_house_number text := btrim(p_house_number);
  v_flat_number text := btrim(p_flat_number);
  v_make_default boolean := coalesce(p_make_default, false);
  v_existing_default boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if v_label is null
     or char_length(v_label) not between 1 and 40
     or p_sector_number is null
     or p_sector_number not between 1 and 99
     or v_road_number is null
     or v_road_number !~ '^[0-9]{1,40}$'
     or v_house_number is null
     or v_house_number !~ '^[0-9]{1,40}$'
     or v_flat_number is null
     or char_length(v_flat_number) not between 1 and 40 then
    raise exception using errcode = '22023', message = 'INVALID_DELIVERY_ADDRESS';
  end if;

  perform private.consume_fixed_window_rate_limit(
    'customer.address_save',
    v_user_id::text,
    12,
    10
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer.address:' || v_user_id::text, 0)
  );

  if p_address_id is null then
    if (
      select count(*)
      from private.customer_delivery_addresses address
      where address.user_id = v_user_id
    ) >= 5 then
      raise exception using errcode = '23514', message = 'CUSTOMER_ADDRESS_LIMIT_REACHED';
    end if;

    if not exists (
      select 1
      from private.customer_delivery_addresses address
      where address.user_id = v_user_id and address.is_default
    ) then
      v_make_default := true;
    end if;

    if v_make_default then
      update private.customer_delivery_addresses
      set is_default = false
      where user_id = v_user_id and is_default;
    end if;

    insert into private.customer_delivery_addresses (
      user_id,
      label,
      sector_number,
      road_number,
      house_number,
      flat_number,
      is_default
    ) values (
      v_user_id,
      v_label,
      p_sector_number,
      v_road_number,
      v_house_number,
      v_flat_number,
      v_make_default
    ) returning id into v_address_id;
  else
    select address.is_default into v_existing_default
    from private.customer_delivery_addresses address
    where address.id = p_address_id
      and address.user_id = v_user_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'CUSTOMER_ADDRESS_NOT_FOUND';
    end if;

    if v_make_default then
      update private.customer_delivery_addresses
      set is_default = false
      where user_id = v_user_id
        and is_default
        and id <> p_address_id;
    elsif v_existing_default and not exists (
      select 1
      from private.customer_delivery_addresses address
      where address.user_id = v_user_id
        and address.is_default
        and address.id <> p_address_id
    ) then
      -- Retain a usable default address rather than allowing an accidental
      -- edit to leave the customer without one.
      v_make_default := true;
    end if;

    update private.customer_delivery_addresses
    set label = v_label,
        sector_number = p_sector_number,
        road_number = v_road_number,
        house_number = v_house_number,
        flat_number = v_flat_number,
        is_default = v_make_default
    where id = p_address_id
      and user_id = v_user_id
    returning id into v_address_id;
  end if;

  insert into private.audit_log (
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    details
  ) values (
    'customer'::app.audit_actor_type,
    v_user_id,
    case when p_address_id is null then 'customer.address_saved' else 'customer.address_updated' end,
    'customer_delivery_address',
    v_address_id::text,
    jsonb_build_object('is_default', v_make_default)
  );

  return v_address_id;
end;
$$;

create or replace function api.remove_my_delivery_address(p_address_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_was_default boolean;
  v_replacement_address_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_address_id is null then
    raise exception using errcode = '22023', message = 'INVALID_DELIVERY_ADDRESS';
  end if;

  perform private.consume_fixed_window_rate_limit(
    'customer.address_remove',
    v_user_id::text,
    12,
    10
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer.address:' || v_user_id::text, 0)
  );

  delete from private.customer_delivery_addresses address
  where address.id = p_address_id
    and address.user_id = v_user_id
  returning address.is_default into v_was_default;

  if not found then
    raise exception using errcode = 'P0002', message = 'CUSTOMER_ADDRESS_NOT_FOUND';
  end if;

  if v_was_default then
    select address.id into v_replacement_address_id
    from private.customer_delivery_addresses address
    where address.user_id = v_user_id
    order by address.created_at asc, address.id
    limit 1;

    if v_replacement_address_id is not null then
      update private.customer_delivery_addresses
      set is_default = true
      where id = v_replacement_address_id;
    end if;
  end if;

  insert into private.audit_log (
    actor_type,
    actor_id,
    action,
    target_type,
    target_id
  ) values (
    'customer'::app.audit_actor_type,
    v_user_id,
    'customer.address_removed',
    'customer_delivery_address',
    p_address_id::text
  );
end;
$$;

create or replace function api.confirm_my_account_deletion(
  p_confirmation_email text,
  p_confirmation_phrase text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_email text := lower(nullif(btrim(auth.jwt() ->> 'email'), ''));
  v_confirmation_email text := lower(nullif(btrim(p_confirmation_email), ''));
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  -- A deletion attempt is intentionally expensive and irreversible; cap both
  -- valid and invalid confirmations before evaluating the typed safeguard.
  perform private.consume_fixed_window_rate_limit(
    'customer.account_deletion_confirmation',
    v_user_id::text,
    3,
    60
  );

  if v_account_email is null
     or v_confirmation_email is null
     or v_account_email <> v_confirmation_email
     or p_confirmation_phrase <> 'DELETE' then
    raise exception using errcode = '22023', message = 'ACCOUNT_DELETION_CONFIRMATION_INVALID';
  end if;
  if private.is_active_staff() then
    raise exception using errcode = '42501', message = 'STAFF_ACCOUNT_DELETION_REQUIRES_OWNER_TRANSFER';
  end if;

  insert into private.audit_log (
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    details
  ) values (
    'customer'::app.audit_actor_type,
    v_user_id,
    'customer.account_deletion_confirmed',
    'account',
    v_user_id::text,
    jsonb_build_object('source', 'self_service')
  );
end;
$$;

create or replace function api.record_account_deletion_completion(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id_hash bytea;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'INVALID_ACCOUNT_IDENTIFIER';
  end if;

  v_user_id_hash := extensions.digest(p_user_id::text, 'sha256');

  insert into private.account_deletion_tombstones (user_id_hash)
  values (v_user_id_hash)
  on conflict (user_id_hash) do nothing;

  insert into private.audit_log (
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    details
  ) values (
    'system'::app.audit_actor_type,
    null,
    'customer.account_deleted',
    'account',
    pg_catalog.encode(v_user_id_hash, 'hex'),
    jsonb_build_object('source', 'self_service')
  );
end;
$$;

revoke all on function api.get_my_account_snapshot() from public, anon;
revoke all on function api.update_my_account_profile(text, app.locale_code) from public, anon;
revoke all on function api.remove_my_phone(uuid) from public, anon;
revoke all on function api.save_my_delivery_address(uuid, text, smallint, text, text, text, boolean) from public, anon;
revoke all on function api.remove_my_delivery_address(uuid) from public, anon;
revoke all on function api.confirm_my_account_deletion(text, text) from public, anon;
revoke all on function api.record_account_deletion_completion(uuid) from public, anon, authenticated;

grant execute on function api.get_my_account_snapshot() to authenticated;
grant execute on function api.update_my_account_profile(text, app.locale_code) to authenticated;
grant execute on function api.remove_my_phone(uuid) to authenticated;
grant execute on function api.save_my_delivery_address(uuid, text, smallint, text, text, text, boolean) to authenticated;
grant execute on function api.remove_my_delivery_address(uuid) to authenticated;
grant execute on function api.confirm_my_account_deletion(text, text) to authenticated;
grant execute on function api.record_account_deletion_completion(uuid) to service_role;
