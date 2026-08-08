create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger profiles_set_updated_at before update on app.profiles
for each row execute function private.set_updated_at();
create trigger customer_phones_set_updated_at before update on private.customer_phone_numbers
for each row execute function private.set_updated_at();
create trigger staff_members_set_updated_at before update on app.staff_members
for each row execute function private.set_updated_at();
create trigger pos_terminals_set_updated_at before update on app.pos_terminals
for each row execute function private.set_updated_at();
create trigger site_runtime_set_updated_at before update on app.site_runtime
for each row execute function private.set_updated_at();
create trigger business_hours_set_updated_at before update on app.business_hours
for each row execute function private.set_updated_at();
create trigger business_hour_exceptions_set_updated_at before update on app.business_hour_exceptions
for each row execute function private.set_updated_at();
create trigger delivery_areas_set_updated_at before update on app.delivery_areas
for each row execute function private.set_updated_at();
create trigger menu_categories_set_updated_at before update on app.menu_categories
for each row execute function private.set_updated_at();
create trigger menu_items_set_updated_at before update on app.menu_items
for each row execute function private.set_updated_at();
create trigger modifier_groups_set_updated_at before update on app.modifier_groups
for each row execute function private.set_updated_at();
create trigger modifier_options_set_updated_at before update on app.modifier_options
for each row execute function private.set_updated_at();
create trigger banners_set_updated_at before update on app.banners
for each row execute function private.set_updated_at();
create trigger offers_set_updated_at before update on app.offers
for each row execute function private.set_updated_at();
create trigger home_sections_set_updated_at before update on app.home_sections
for each row execute function private.set_updated_at();
create trigger orders_set_updated_at before update on app.orders
for each row execute function private.set_updated_at();
create trigger print_jobs_set_updated_at before update on app.print_jobs
for each row execute function private.set_updated_at();
create trigger integration_settings_set_updated_at before update on private.integration_settings
for each row execute function private.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');
  if v_name is not null then
    v_name := left(v_name, 120);
  end if;

  insert into app.profiles (user_id, display_name)
  values (new.id, v_name)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_yamzo on auth.users;
create trigger on_auth_user_created_yamzo
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create or replace function private.normalize_bd_phone(p_phone text)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_digits text;
  v_normalized text;
begin
  v_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');

  if v_digits ~ '^01[3-9][0-9]{8}$' then
    v_normalized := '+88' || v_digits;
  elsif v_digits ~ '^8801[3-9][0-9]{8}$' then
    v_normalized := '+' || v_digits;
  else
    raise exception using errcode = '22023', message = 'INVALID_PHONE_NUMBER';
  end if;

  return v_normalized;
end;
$$;

revoke all on function private.normalize_bd_phone(text) from public, anon, authenticated;

create or replace function private.current_staff_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.staff_members sm
    join app.staff_role_assignments sra on sra.user_id = sm.user_id
    join app.role_permissions rp on rp.role_id = sra.role_id
    where sm.user_id = (select auth.uid())
      and sm.status = 'active'
      and rp.permission_code = p_permission
  );
$$;

revoke all on function private.current_staff_has_permission(text) from public, anon, authenticated;

create or replace function private.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.staff_members sm
    where sm.user_id = (select auth.uid())
      and sm.status = 'active'
  );
$$;

revoke all on function private.is_active_staff() from public, anon, authenticated;

create or replace function private.generate_order_reference()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'YZ-'
    || to_char(timezone('Asia/Dhaka', clock_timestamp()), 'YYYYMMDD')
    || '-'
    || lpad(nextval('private.order_reference_seq')::text, 8, '0');
$$;

revoke all on function private.generate_order_reference() from public, anon, authenticated;

create or replace function private.generate_url_token()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
$$;

revoke all on function private.generate_url_token() from public, anon, authenticated;

create or replace function private.is_valid_order_transition(
  p_from app.order_status,
  p_to app.order_status
)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select case p_from
    when 'placed' then p_to in ('pending_acceptance', 'cancelled')
    when 'pending_acceptance' then p_to in ('accepted', 'rejected', 'cancelled')
    when 'accepted' then p_to in ('preparing', 'cancelled')
    when 'preparing' then p_to in ('ready', 'cancelled')
    when 'ready' then p_to in ('out_for_delivery', 'delivered', 'cancelled')
    when 'out_for_delivery' then p_to in ('delivered', 'cancelled')
    else false
  end;
$$;

revoke all on function private.is_valid_order_transition(app.order_status, app.order_status)
  from public, anon, authenticated;

create or replace function private.guard_order_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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
    new.subtotal_minor,
    new.discount_minor,
    new.delivery_fee_minor,
    new.grand_total_minor,
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
    old.subtotal_minor,
    old.discount_minor,
    old.delivery_fee_minor,
    old.grand_total_minor,
    old.currency_code,
    old.placed_at
  ) then
    raise exception using errcode = '23514', message = 'ORDER_IMMUTABLE_FIELDS_CHANGED';
  end if;

  if new.status is distinct from old.status then
    if not private.is_valid_order_transition(old.status, new.status) then
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
  elsif new.version <> old.version then
    raise exception using errcode = '40001', message = 'ORDER_VERSION_CHANGED_WITHOUT_STATUS';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_order_update() from public, anon, authenticated;

create trigger orders_guard_update
before update on app.orders
for each row execute function private.guard_order_update();

create or replace function private.guard_order_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.mode <> 'test' then
    raise exception using errcode = '23514', message = 'PRODUCTION_ORDERS_CANNOT_BE_HARD_DELETED';
  end if;
  if coalesce(current_setting('app.allow_test_order_delete', true), 'off') <> 'on' then
    raise exception using errcode = '42501', message = 'TEST_ORDER_DELETE_REQUIRES_CONFIRMED_RPC';
  end if;
  return old;
end;
$$;

revoke all on function private.guard_order_delete() from public, anon, authenticated;

create trigger orders_guard_delete
before delete on app.orders
for each row execute function private.guard_order_delete();

create unique index customer_phone_one_primary_per_user
  on private.customer_phone_numbers (user_id) where is_primary;
create index customer_phone_by_user on private.customer_phone_numbers (user_id, created_at desc);
create index staff_members_status on app.staff_members (status, created_at);
create index staff_role_assignments_role on app.staff_role_assignments (role_id, user_id);
create index pos_terminals_status on app.pos_terminals (status, last_seen_at desc);
create index preview_sessions_active on private.preview_sessions (user_id, expires_at)
  where revoked_at is null;
create index business_hour_exceptions_date on app.business_hour_exceptions (service_date);
create index delivery_areas_active_sort on app.delivery_areas (sort_order, sector_number)
  where is_active;
create index menu_categories_active_sort on app.menu_categories (sort_order, id)
  where is_active;
create index menu_categories_parent on app.menu_categories (parent_id, sort_order);
create index menu_items_active_sort on app.menu_items (sort_order, id)
  where is_active;
create index menu_item_categories_category on app.menu_item_categories (category_id, sort_order, item_id);
create unique index menu_item_one_primary_category
  on app.menu_item_categories (item_id) where is_primary;
create index modifier_options_group_sort on app.modifier_options (group_id, sort_order)
  where is_active;
create index item_modifier_groups_item_sort on app.menu_item_modifier_groups (item_id, sort_order);
create index menu_item_media_item_sort on app.menu_item_media (item_id, sort_order);
create index banners_active_schedule on app.banners (placement, sort_order, starts_at, ends_at)
  where is_active;
create index offers_active_schedule on app.offers (priority desc, starts_at, ends_at)
  where is_active;
create index home_sections_active_sort on app.home_sections (sort_order, id)
  where is_active;
create index review_snapshots_current on app.review_snapshots (fetched_at desc);
create index review_items_visible_five_star on app.review_items (reviewed_at desc)
  where is_visible and rating = 5;
create index orders_user_recent on app.orders (user_id, created_at desc) where user_id is not null;
create index orders_operational_queue on app.orders (mode, status, created_at)
  where status in ('pending_acceptance', 'accepted', 'preparing', 'ready', 'out_for_delivery');
create index orders_live_reporting on app.orders (created_at, status) where mode = 'live';
create index order_contacts_phone_recent on private.order_contacts (phone_e164, created_at desc);
create index order_items_order_sort on app.order_items (order_id, sort_order, id);
create index order_item_modifiers_item_sort on app.order_item_modifiers (order_item_id, sort_order, id);
create index order_status_events_order_recent on app.order_status_events (order_id, created_at desc, id desc);
create index order_claims_available on app.order_claims (lease_expires_at) where released_at is null;
create index print_jobs_queue on app.print_jobs (status, created_at)
  where status in ('pending', 'claimed', 'failed');
create index idempotency_expiry on private.idempotency_keys (expires_at);
create index rate_limit_expiry on private.rate_limit_buckets (expires_at);
create index outbox_delivery_queue on private.outbox_events (available_at, id)
  where status in ('pending', 'failed');
create index audit_log_target_recent on private.audit_log (target_type, target_id, occurred_at desc);
