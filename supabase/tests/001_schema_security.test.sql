begin;

create extension if not exists pgtap with schema extensions;
select plan(37);

select has_schema('app', 'app schema exists');
select has_schema('private', 'private schema exists');
select has_schema('api', 'api schema exists');

select has_table('app', 'profiles', 'profiles table exists');
select has_table('app', 'site_runtime', 'site runtime table exists');
select has_table('app', 'delivery_areas', 'delivery areas table exists');
select has_table('app', 'menu_items', 'menu items table exists');
select has_table('app', 'offers', 'offers table exists');
select has_table('app', 'orders', 'orders table exists');
select has_table('app', 'order_items', 'order items table exists');
select has_table('app', 'print_jobs', 'print jobs table exists');
select has_table('private', 'order_contacts', 'private order contacts exist');
select has_table('private', 'order_tracking_credentials', 'private tracking credentials exist');
select has_table('private', 'idempotency_keys', 'private idempotency table exists');
select has_table('private', 'integration_settings', 'private integration settings exist');

select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'app' and c.relname = 'orders'),
  'orders has RLS enabled'
);
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relname = 'order_contacts'),
  'order contacts has RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'app.orders', 'INSERT'),
  'anon cannot insert orders directly'
);
select ok(
  not has_table_privilege('authenticated', 'app.orders', 'UPDATE'),
  'authenticated cannot update orders directly'
);
select ok(
  not has_table_privilege('anon', 'private.order_contacts', 'SELECT'),
  'anon cannot read private order contacts'
);
select ok(
  not has_table_privilege('authenticated', 'private.integration_settings', 'SELECT'),
  'authenticated cannot read integration settings'
);

select ok(
  to_regprocedure('api.get_site_runtime()') is not null,
  'site runtime API exists'
);
select ok(
  to_regprocedure('api.get_current_staff_access()') is not null,
  'current staff access API exists'
);
select ok(
  to_regprocedure('api.create_order_tx(text,text,text,smallint,text,text,text,jsonb,integer,app.locale_code,text)') is not null,
  'transactional order creation API exists'
);
select ok(
  to_regprocedure('api.transition_order(uuid,app.order_status,integer,text,uuid,text)') is not null,
  'versioned order transition API exists'
);
select ok(
  to_regprocedure('api.claim_website_orders(uuid,integer,integer,boolean)') is not null,
  'website order leasing API exists'
);
select ok(
  to_regprocedure('api.claim_print_jobs(uuid,integer,integer)') is not null,
  'print job leasing API exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.create_order_tx(text,text,text,smallint,text,text,text,jsonb,integer,app.locale_code,text)',
    'EXECUTE'
  ),
  'anon cannot bypass server-mediated guest order creation'
);
select ok(
  not has_function_privilege('anon', 'api.get_current_staff_access()', 'EXECUTE'),
  'anon cannot inspect staff access'
);
select ok(
  not has_function_privilege('anon', 'api.list_staff_access()', 'EXECUTE'),
  'anon cannot list staff'
);
select ok(
  not has_function_privilege('authenticated', 'api.lookup_latest_order_status(text,text)', 'EXECUTE'),
  'browser roles cannot bypass server-side phone lookup rate identity'
);

select is((select count(*) from app.roles), 6::bigint, 'six system roles are seeded');
select is((select count(*) from app.permissions), 12::bigint, 'twelve permissions are seeded');
select is((select count(*) from app.delivery_areas), 18::bigint, 'Uttara sectors 1 through 18 are seeded');
select is((select published from app.site_runtime where singleton), false, 'site starts unpublished');
select is((select live_orders_enabled from app.site_runtime where singleton), false, 'live orders start disabled');
select is((select test_mode from app.site_runtime where singleton), true, 'test mode starts enabled');

select * from finish();
rollback;
