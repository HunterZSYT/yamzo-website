begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(
  'private',
  'order_mutation_audits',
  'website-admin order mutations have a dedicated private audit table'
);
select has_column(
  'app',
  'orders',
  'archived_at',
  'live-order archival is represented without hard deletion'
);
select ok(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname = 'order_mutation_audits'
  ),
  'order mutation audits have RLS enabled'
);
select ok(
  exists (select 1 from app.permissions where code = 'orders.manage'),
  'independent website-order management permission exists'
);
select ok(
  exists (
    select 1
    from app.role_permissions rp
    join app.roles r on r.id = rp.role_id
    where r.code = 'owner' and rp.permission_code = 'orders.manage'
  ),
  'owners receive website-order management permission'
);

select ok(
  to_regprocedure(
    'api.admin_update_website_order(uuid,integer,app.order_status,jsonb,integer,integer,text)'
  ) is not null,
  'versioned website-admin update RPC exists'
);
select ok(
  to_regprocedure('api.archive_live_website_order(uuid,integer,text)') is not null,
  'safe live-order archive RPC exists'
);
select ok(
  to_regprocedure('api.get_admin_order_detail(uuid)') is not null,
  'on-demand privileged detail RPC exists'
);
select ok(
  to_regprocedure(
    'api.list_website_orders_for_operations(app.order_status,app.order_mode,boolean,timestamp with time zone,uuid,integer)'
  ) is not null,
  'bounded website-history RPC exists'
);
select ok(
  to_regprocedure(
    'api.pos_sync_website_orders(uuid,integer,boolean,timestamp with time zone,uuid)'
  ) is not null,
  'read-only POS snapshot feed exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api.admin_update_website_order(uuid,integer,app.order_status,jsonb,integer,integer,text)',
    'EXECUTE'
  ),
  'authenticated staff reach the permission-checked website-admin update RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.admin_update_website_order(uuid,integer,app.order_status,jsonb,integer,integer,text)',
    'EXECUTE'
  ),
  'anonymous callers cannot mutate a website order'
);
select ok(
  has_function_privilege(
    'service_role',
    'api.pos_sync_website_orders(uuid,integer,boolean,timestamp with time zone,uuid)',
    'EXECUTE'
  ),
  'service role can pull the POS snapshot feed'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'api.pos_sync_website_orders(uuid,integer,boolean,timestamp with time zone,uuid)',
    'EXECUTE'
  ),
  'browser roles cannot pull POS snapshots'
);
select like(
  pg_get_functiondef(
    'api.apply_pos_order_event(uuid,uuid,uuid,app.order_status,integer,text)'::regprocedure
  ),
  '%POS_STATUS_MUTATION_DISABLED%',
  'POS status mutation endpoint is fail-closed'
);
select unlike(
  pg_get_functiondef('private.build_order_mutation_snapshot(uuid)'::regprocedure),
  '%phone_e164%',
  'order mutation snapshots do not include phone PII'
);
select unlike(
  pg_get_functiondef('private.build_order_mutation_snapshot(uuid)'::regprocedure),
  '%full_name%',
  'order mutation snapshots do not include customer-name PII'
);

insert into auth.users (id, email)
values ('66666666-6666-4666-8666-666666666666', 'order-authority-owner@yamzo.invalid');

insert into app.staff_members (user_id, display_name, status, approved_at)
values (
  '66666666-6666-4666-8666-666666666666',
  'Order Authority Owner',
  'active',
  now()
);

insert into app.staff_role_assignments (user_id, role_id)
select '66666666-6666-4666-8666-666666666666', r.id
from app.roles r
where r.code = 'owner';

insert into app.orders (
  id, order_reference, source, mode, status, version,
  subtotal_minor, discount_minor, delivery_fee_minor, grand_total_minor
) values (
  '77777777-7777-4777-8777-777777777777',
  'YZ-20260809-00000077',
  'website',
  'test',
  'pending_acceptance',
  1,
  10000,
  0,
  0,
  10000
);

insert into private.order_contacts (
  order_id, full_name, phone_e164, sector_number, road_number, house_number, flat_number
) values (
  '77777777-7777-4777-8777-777777777777',
  'Test Customer',
  '+8801712345678',
  11,
  '20',
  '80',
  '4B'
);

insert into app.order_items (
  order_id, item_name_en, item_name_bn, quantity,
  unit_price_minor, modifier_unit_total_minor, line_total_minor
) values (
  '77777777-7777-4777-8777-777777777777',
  'Test momo',
  'Test momo',
  1,
  10000,
  0,
  10000
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}',
  true
);

select lives_ok(
  $test$
    select api.admin_update_website_order(
      '77777777-7777-4777-8777-777777777777',
      1,
      'ready',
      null,
      500,
      0,
      'Manager confirmed readiness'
    )
  $test$,
  'owner can independently move a website order to a non-sequential status'
);
select is(
  (select status::text from app.orders where id = '77777777-7777-4777-8777-777777777777'),
  'ready',
  'independent status is persisted'
);
select is(
  (select version from app.orders where id = '77777777-7777-4777-8777-777777777777'),
  2,
  'status/discount update increments version exactly once'
);
select is(
  (select grand_total_minor from app.orders where id = '77777777-7777-4777-8777-777777777777'),
  9500,
  'server recalculates the total after a discount adjustment'
);
select is(
  (select count(*)::integer from private.order_mutation_audits where order_id = '77777777-7777-4777-8777-777777777777'),
  1,
  'admin status/discount change is append-only audited'
);
select is(
  (select count(*)::integer from app.print_jobs where order_id = '77777777-7777-4777-8777-777777777777'),
  0,
  'skipping directly to ready never creates acceptance print jobs'
);

select lives_ok(
  $test$
    select api.admin_update_website_order(
      '77777777-7777-4777-8777-777777777777',
      2,
      null,
      '[{
        "source_item_id": null,
        "item_name_en": "Corrected momo",
        "item_name_bn": "Corrected momo",
        "quantity": 1,
        "unit_price_minor": 10000,
        "customer_note": null,
        "modifiers": []
      }]'::jsonb,
      null,
      null,
      'Corrected item name after customer call'
    )
  $test$,
  'item-only adjustment with an unchanged total is a valid versioned mutation'
);
select is(
  (select version from app.orders where id = '77777777-7777-4777-8777-777777777777'),
  3,
  'item-only adjustment increments the version'
);
select is(
  (select item_name_en from app.order_items where order_id = '77777777-7777-4777-8777-777777777777'),
  'Corrected momo',
  'item replacement is applied under the staff-authorized RPC'
);
reset role;

insert into app.pos_terminals (id, terminal_code, name, status)
values (
  '88888888-8888-4888-8888-888888888888',
  'TEST_SYNC_TERMINAL',
  'Test sync terminal',
  'active'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (
    select (api.pos_sync_website_orders(
      '88888888-8888-4888-8888-888888888888',
      10,
      true,
      null,
      null
    ) -> 0 ->> 'version')::integer
  ),
  3,
  'POS receives the latest website-owned snapshot version after admin edits'
);
select throws_ok(
  $test$
    select api.apply_pos_order_event(
      '88888888-8888-4888-8888-888888888888',
      '99999999-9999-4999-8999-999999999999',
      '77777777-7777-4777-8777-777777777777',
      'delivered',
      3,
      'POS must not mutate status'
    )
  $test$,
  '42501',
  'POS_STATUS_MUTATION_DISABLED',
  'POS write endpoint is disabled even for a trusted terminal transport'
);
reset role;

select * from finish();
rollback;
