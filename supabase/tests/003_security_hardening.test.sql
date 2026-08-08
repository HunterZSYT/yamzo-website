begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(
  has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated can resolve the private helper used by Storage RLS'
);
select ok(
  has_function_privilege(
    'authenticated',
    'private.current_staff_has_permission(text)',
    'EXECUTE'
  ),
  'authenticated can execute only the Storage policy permission helper'
);
select ok(
  not has_function_privilege(
    'anon',
    'private.current_staff_has_permission(text)',
    'EXECUTE'
  ),
  'anon cannot execute the staff permission helper'
);
select ok(
  to_regprocedure(
    'private.create_order_core(text,text,text,smallint,text,text,text,jsonb,app.locale_code,text)'
  ) is not null,
  'the original order implementation is private'
);
select ok(
  to_regprocedure(
    'api.create_order_tx(text,text,text,smallint,text,text,text,jsonb,app.locale_code,text)'
  ) is null,
  'the former directly callable order RPC signature is gone'
);
select ok(
  to_regprocedure(
    'api.create_order_tx(text,text,text,smallint,text,text,text,jsonb,integer,app.locale_code,text)'
  ) is not null,
  'the concurrency-safe authenticated order RPC exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.create_order_tx(text,text,text,smallint,text,text,text,jsonb,integer,app.locale_code,text)',
    'EXECUTE'
  ),
  'anon cannot call authenticated order creation directly'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api.create_order_tx(text,text,text,smallint,text,text,text,jsonb,integer,app.locale_code,text)',
    'EXECUTE'
  ),
  'signed-in customers can use the concurrency-safe order RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'api.create_guest_order_tx(text,text,text,smallint,text,text,text,jsonb,integer,text,app.locale_code,text)',
    'EXECUTE'
  ),
  'the trusted server role can create guest orders'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'api.create_guest_order_tx(text,text,text,smallint,text,text,text,jsonb,integer,text,app.locale_code,text)',
    'EXECUTE'
  ),
  'browser-authenticated callers cannot use the guest server RPC'
);
select like(
  pg_get_functiondef(
    'api.create_order_tx(text,text,text,smallint,text,text,text,jsonb,integer,app.locale_code,text)'::regprocedure
  ),
  '%order.create.v2%',
  'order idempotency uses the full-payload wrapper namespace'
);
select like(
  pg_get_functiondef(
    'api.create_order_tx(text,text,text,smallint,text,text,text,jsonb,integer,app.locale_code,text)'::regprocedure
  ),
  '%expires_at <= now()%',
  'expired order idempotency reservations are removed before replay'
);
select like(
  pg_get_functiondef(
    'api.create_order_tx(text,text,text,smallint,text,text,text,jsonb,integer,app.locale_code,text)'::regprocedure
  ),
  '%CATALOG_SUBTOTAL_CHANGED%',
  'catalog subtotal concurrency is enforced before commit'
);

select ok(
  has_column_privilege('authenticated', 'app.profiles', 'display_name', 'UPDATE'),
  'customers may update their display name'
);
select ok(
  has_column_privilege('authenticated', 'app.profiles', 'preferred_locale', 'UPDATE'),
  'customers may update their locale preference'
);
select ok(
  has_column_privilege('authenticated', 'app.profiles', 'marketing_consent_at', 'UPDATE'),
  'customers may update their marketing consent preference'
);
select ok(
  not has_column_privilege('authenticated', 'app.profiles', 'created_at', 'UPDATE'),
  'customers cannot rewrite profile creation time'
);
select ok(
  not has_column_privilege('authenticated', 'app.profiles', 'user_id', 'UPDATE'),
  'customers cannot rewrite profile ownership'
);

select ok(
  to_regprocedure('api.set_staff_access(uuid,app.staff_status,app.app_role_code,text)') is not null,
  'exact staff-access management RPC exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.set_staff_access(uuid,app.staff_status,app.app_role_code,text)',
    'EXECUTE'
  ),
  'anon cannot manage staff access'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api.set_staff_access(uuid,app.staff_status,app.app_role_code,text)',
    'EXECUTE'
  ),
  'authenticated staff can reach the permission-checked access RPC'
);
select ok(
  to_regprocedure('api.set_site_runtime_modes(boolean,boolean,boolean)') is not null,
  'narrow runtime-mode mutation RPC exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.set_site_runtime_modes(boolean,boolean,boolean)',
    'EXECUTE'
  ),
  'anon cannot mutate runtime modes'
);
select ok(
  has_function_privilege(
    'anon',
    'api.get_ordering_availability(app.locale_code)',
    'EXECUTE'
  ),
  'public storefront can read the safe ordering availability contract'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app'
      and c.relname = 'orders'
      and t.tgname = 'orders_enforce_live_website_hours'
      and not t.tgisinternal
  ),
  'live website order business-hours enforcement trigger exists'
);

select ok(
  not private.is_ordering_open_at('2026-08-09 12:00:00+06'::timestamptz),
  'the seeded closed schedule fails closed'
);

insert into app.business_hour_exceptions (
  service_date, interval_number, opens_at, closes_at, is_closed
) values
  ('2026-08-10', 1, '10:00', '22:00', false),
  ('2026-08-11', 1, '18:00', '02:00', false),
  ('2026-08-13', 1, null, null, true);

select ok(
  private.is_ordering_open_at('2026-08-10 10:00:00+06'::timestamptz),
  'a daytime interval opens inclusively in Dhaka time'
);
select ok(
  private.is_ordering_open_at('2026-08-10 21:59:59+06'::timestamptz),
  'a daytime interval remains open before its closing time'
);
select ok(
  not private.is_ordering_open_at('2026-08-10 22:00:00+06'::timestamptz),
  'a daytime interval closes exclusively at its closing time'
);
select ok(
  private.is_ordering_open_at('2026-08-11 23:00:00+06'::timestamptz),
  'an overnight interval is open on its starting date'
);
select ok(
  private.is_ordering_open_at('2026-08-12 01:00:00+06'::timestamptz),
  'an overnight interval carries into the next Dhaka date'
);
select ok(
  not private.is_ordering_open_at('2026-08-13 12:00:00+06'::timestamptz),
  'a closed exception overrides the weekly schedule'
);
select is(
  private.next_ordering_opening_after('2026-08-10 08:00:00+06'::timestamptz),
  '2026-08-10 10:00:00+06'::timestamptz,
  'the next-opening helper returns a Dhaka-aware instant'
);

select throws_ok(
  $test$
    insert into app.orders (
      id, order_reference, source, mode, status,
      subtotal_minor, discount_minor, delivery_fee_minor, grand_total_minor
    ) values (
      'aaaaaaaa-0000-4000-8000-000000000001',
      'YZ-20990101-99999991',
      'website',
      'live',
      'pending_acceptance',
      0, 0, 0, 0
    )
  $test$,
  '55000',
  'ORDERING_OUTSIDE_BUSINESS_HOURS',
  'a live website order cannot bypass the closed schedule'
);
select lives_ok(
  $test$
    insert into app.orders (
      id, order_reference, source, mode, status,
      subtotal_minor, discount_minor, delivery_fee_minor, grand_total_minor
    ) values (
      'aaaaaaaa-0000-4000-8000-000000000002',
      'YZ-20990101-99999992',
      'website',
      'test',
      'pending_acceptance',
      0, 0, 0, 0
    )
  $test$,
  'staff test orders bypass business hours without weakening live orders'
);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'sql-owner-one@yamzo.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'sql-owner-two@yamzo.invalid'),
  ('33333333-3333-4333-8333-333333333333', 'sql-content@yamzo.invalid'),
  ('44444444-4444-4444-8444-444444444444', 'sql-cashier@yamzo.invalid');

insert into app.staff_members (user_id, display_name, status, approved_at)
values
  ('11111111-1111-4111-8111-111111111111', 'Owner One', 'active', now()),
  ('22222222-2222-4222-8222-222222222222', 'Owner Two', 'active', now()),
  ('33333333-3333-4333-8333-333333333333', 'Content Editor', 'active', now()),
  ('44444444-4444-4444-8444-444444444444', 'Cashier', 'active', now());

insert into app.staff_role_assignments (user_id, role_id)
select assigned.user_id, r.id
from (
  values
    ('11111111-1111-4111-8111-111111111111'::uuid, 'owner'::app.app_role_code),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'owner'::app.app_role_code),
    ('33333333-3333-4333-8333-333333333333'::uuid, 'content_editor'::app.app_role_code),
    ('44444444-4444-4444-8444-444444444444'::uuid, 'cashier'::app.app_role_code)
) as assigned(user_id, role_key)
join app.roles r on r.code = assigned.role_key;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $test$
    select api.set_staff_access(
      '22222222-2222-4222-8222-222222222222',
      'active',
      'manager',
      null
    )
  $test$,
  'an additional owner can be demoted through exact-role replacement'
);
reset role;

select is(
  (select count(*) from app.staff_role_assignments
   where user_id = '22222222-2222-4222-8222-222222222222'),
  1::bigint,
  'demotion leaves exactly one role assignment'
);
select is(
  (select r.code from app.staff_role_assignments sra
   join app.roles r on r.id = sra.role_id
   where sra.user_id = '22222222-2222-4222-8222-222222222222'),
  'manager'::app.app_role_code,
  'demotion removes the former owner privilege'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $test$
    select api.set_staff_access(
      '22222222-2222-4222-8222-222222222222',
      'suspended',
      'manager',
      'Security test suspension'
    )
  $test$,
  'staff can be suspended with an explicit reason'
);
select throws_ok(
  $test$
    select api.set_staff_access(
      '11111111-1111-4111-8111-111111111111',
      'suspended',
      'owner',
      'Would remove final owner'
    )
  $test$,
  '23514',
  'LAST_ACTIVE_OWNER_REQUIRED',
  'the final active owner cannot be suspended'
);
reset role;

select is(
  (select status from app.staff_members
   where user_id = '22222222-2222-4222-8222-222222222222'),
  'suspended'::app.staff_status,
  'suspension changes the staff status'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
select ok(
  private.current_staff_has_permission('catalog.manage'),
  'Storage policy helper executes under the authenticated content editor role'
);
select ok(
  not private.current_staff_has_permission('staff.manage'),
  'Storage policy helper does not grant unrelated permissions'
);
select lives_ok(
  $test$
    insert into storage.objects (bucket_id, name)
    values ('menu-media', 'security-test/catalog.png')
  $test$,
  'authorized staff can insert a Storage object under RLS'
);
select lives_ok(
  $test$
    update storage.objects
    set name = 'security-test/catalog-updated.png'
    where bucket_id = 'menu-media'
      and name = 'security-test/catalog.png'
  $test$,
  'authorized staff can update a Storage object under RLS'
);
select lives_ok(
  $test$
    delete from storage.objects
    where bucket_id = 'menu-media'
      and name = 'security-test/catalog-updated.png'
  $test$,
  'authorized staff can delete a Storage object under RLS'
);
select lives_ok(
  $test$
    update app.profiles
    set display_name = 'Updated Content Editor'
    where user_id = '33333333-3333-4333-8333-333333333333'
  $test$,
  'an authenticated customer can update an allowed profile column'
);
select ok(
  (api.get_admin_dashboard() -> 'capabilities' ->> 'catalog_manage')::boolean,
  'content editor dashboard exposes the catalog capability'
);
select is(
  api.get_admin_dashboard() ->> 'pending_staff_requests',
  null,
  'content editor dashboard does not expose staff-management counts'
);
select is(
  api.get_admin_dashboard() ->> 'live_revenue_today_minor',
  null,
  'content editor dashboard does not expose revenue'
);
select throws_ok(
  $test$
    select * from api.set_site_runtime_modes(true, false, true)
  $test$,
  '42501',
  'SITE_MANAGE_PERMISSION_REQUIRED',
  'content editor cannot mutate launch modes'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',
  true
);
select ok(
  (api.get_admin_dashboard() -> 'capabilities' ->> 'orders_read')::boolean,
  'cashier dashboard exposes operational order capability'
);
select ok(
  not (api.get_admin_dashboard() -> 'capabilities' ->> 'reports_read')::boolean,
  'cashier dashboard does not gain reporting permission'
);
select is(
  api.get_admin_dashboard() ->> 'live_revenue_today_minor',
  null,
  'cashier dashboard does not expose revenue'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select ok(
  api.get_admin_dashboard() ->> 'pending_staff_requests' is not null,
  'owner dashboard may read pending staff counts'
);
select lives_ok(
  $test$
    select * from api.set_site_runtime_modes(true, false, true)
  $test$,
  'owner can update only the launch-mode controls'
);
reset role;

select is(
  (select minimum_order_minor from app.site_runtime where singleton),
  0,
  'narrow runtime mutation preserves minimum order value'
);
select is(
  (select default_delivery_fee_minor from app.site_runtime where singleton),
  0,
  'narrow runtime mutation preserves delivery fee value'
);
select is(
  (select default_prep_minutes from app.site_runtime where singleton),
  30::smallint,
  'narrow runtime mutation preserves preparation time'
);

select * from finish();
rollback;
