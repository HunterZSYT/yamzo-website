begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

select is(private.normalize_bd_phone('01712-345678'), '+8801712345678', 'local BD phone normalizes');
select is(private.normalize_bd_phone('+880 1712 345678'), '+8801712345678', 'international BD phone normalizes');

select ok(private.is_valid_order_transition('placed', 'pending_acceptance'), 'placed can become pending');
select ok(private.is_valid_order_transition('pending_acceptance', 'accepted'), 'pending can be accepted');
select ok(private.is_valid_order_transition('accepted', 'preparing'), 'accepted can be prepared');
select ok(private.is_valid_order_transition('preparing', 'ready'), 'preparing can become ready');
select ok(private.is_valid_order_transition('ready', 'out_for_delivery'), 'ready can leave for delivery');
select ok(private.is_valid_order_transition('out_for_delivery', 'delivered'), 'delivery can complete');
select ok(not private.is_valid_order_transition('pending_acceptance', 'delivered'), 'pending cannot skip to delivered');
select ok(not private.is_valid_order_transition('delivered', 'cancelled'), 'delivered is terminal');

select ok(
  (select reloptions @> array['security_invoker=true']
   from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'api' and c.relname = 'storefront_items'),
  'storefront items view is security invoker'
);
select ok(
  (select reloptions @> array['security_invoker=true']
   from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'api' and c.relname = 'my_order_history'),
  'order history view is security invoker'
);

select is(
  (select count(*) from app.role_permissions rp
   join app.roles r on r.id = rp.role_id where r.code = 'owner'),
  12::bigint,
  'owner receives all permissions'
);
select is(
  (select count(*) from app.role_permissions rp
   join app.roles r on r.id = rp.role_id
   where r.code = 'content_editor' and rp.permission_code = 'staff.manage'),
  0::bigint,
  'content editor cannot manage staff'
);
select is(
  (select count(*) from app.permissions where code = 'orders.test_delete'),
  0::bigint,
  'the retired test-order deletion permission is absent'
);

select is(
  (select count(*) from private.integration_settings where vault_secret_id is not null),
  0::bigint,
  'no invented Vault secret references are seeded'
);
select is(
  (select enabled from private.integration_settings where kind = 'meta_capi'),
  false,
  'Meta CAPI starts disabled'
);
select is(
  (select enabled from private.integration_settings where kind = 'google_reviews'),
  false,
  'Google Reviews starts disabled'
);
select is(
  (select count(*) from app.business_hours where is_closed),
  7::bigint,
  'hours remain closed until verified store hours are entered'
);
select is(
  (select count(*) from app.orders where mode = 'test'),
  0::bigint,
  'reference seed creates no test orders'
);

select is(
  (select count(*) from app.menu_categories),
  9::bigint,
  'the canonical storefront categories are seeded'
);
select is(
  (select count(*) from app.menu_items),
  46::bigint,
  'the complete direct-price Yamzo menu is seeded'
);
select is(
  (select count(*) from app.menu_items where public_key is null),
  0::bigint,
  'every menu item has a stable website and POS public key'
);
select is(
  (select public_key from app.menu_items where slug = 'chicken-momo'),
  'menu_item_chicken_momo',
  'catalog public keys match the website dataset'
);
select ok(
  pg_get_functiondef('private.build_order_operations_payload(uuid)'::regprocedure)
    like '%source_item_public_key%',
  'POS order payloads include stable catalog public keys'
);
select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'api'
      and table_name = 'my_order_history'
      and column_name = 'item_count'
  ),
  'authenticated order history exposes a PII-free item count'
);

select * from finish();
rollback;
