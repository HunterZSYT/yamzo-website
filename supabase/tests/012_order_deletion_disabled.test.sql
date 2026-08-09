begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(
  not exists (select 1 from app.permissions where code = 'orders.test_delete'),
  'the retired test-order deletion permission is absent'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'api.hard_delete_test_order(uuid,text,text,text)',
    'EXECUTE'
  ),
  'browser roles cannot invoke the retired delete RPC'
);
select ok(
  not has_function_privilege(
    'service_role',
    'api.hard_delete_test_order(uuid,text,text,text)',
    'EXECUTE'
  ),
  'service role cannot invoke the retired delete RPC'
);
select like(
  pg_get_functiondef('private.guard_order_delete()'::regprocedure),
  '%ORDER_DELETION_DISABLED%',
  'order delete trigger is globally fail-closed'
);
select like(
  pg_get_functiondef('api.hard_delete_test_order(uuid,text,text,text)'::regprocedure),
  '%ORDER_DELETION_DISABLED%',
  'the retained delete RPC is a deterministic fail-closed stub'
);
select like(
  pg_get_functiondef('private.guard_website_order_cancellation_reason()'::regprocedure),
  '%CANCELLATION_REASON_REQUIRED%',
  'website-order cancellation requires an explanatory audit note'
);

insert into auth.users (id, email)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'order-retention-owner@yamzo.invalid');

insert into app.staff_members (user_id, display_name, status, approved_at)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Order Retention Owner',
  'active',
  now()
);

insert into app.staff_role_assignments (user_id, role_id)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', r.id
from app.roles r
where r.code = 'owner';

insert into app.orders (
  id, order_reference, source, mode, status, version,
  subtotal_minor, discount_minor, delivery_fee_minor, grand_total_minor
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'YZ-20260809-00000088',
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
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'Retention Test Customer',
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
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'Retention momo',
  'Retention momo',
  1,
  10000,
  0,
  10000
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

select throws_ok(
  $test$
    select api.admin_update_website_order(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      1,
      'cancelled',
      null,
      null,
      null,
      null
    )
  $test$,
  '22023',
  'CANCELLATION_REASON_REQUIRED',
  'a website-order cancellation without a reason is rejected'
);
select lives_ok(
  $test$
    select api.admin_update_website_order(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      1,
      'cancelled',
      null,
      null,
      null,
      'Cancelled test order is retained'
    )
  $test$,
  'authorized staff can cancel a test order without deleting it'
);
select is(
  (select status::text from app.orders where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'cancelled',
  'cancellation status is retained on the order record'
);
reset role;

select throws_ok(
  $test$
    delete from app.orders
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  $test$,
  '42501',
  'ORDER_DELETION_DISABLED',
  'direct deletion is blocked even for a test order'
);
select throws_ok(
  $test$
    select api.hard_delete_test_order(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'YZ-20260809-00000088',
      'ADMIN_TEST_CLEANUP',
      'DELETE YZ-20260809-00000088'
    )
  $test$,
  '42501',
  'ORDER_DELETION_DISABLED',
  'the retired delete RPC cannot remove a test order'
);
select is(
  (select count(*)::integer from app.orders where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  1,
  'the cancelled test order remains stored after delete attempts'
);
select is(
  (
    select count(*)::integer
    from private.deleted_test_order_tombstones
    where order_reference_hash = extensions.digest('YZ-20260809-00000088', 'sha256')
  ),
  0,
  'the disabled RPC writes no new deletion tombstone'
);

select * from finish();
rollback;
