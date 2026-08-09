begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('private', 'marketing_contact_links', 'customer contact links are private');
select has_table('private', 'marketing_campaigns', 'campaign drafts are private');

select ok(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname = 'marketing_contact_links'
  ),
  'marketing contact links have RLS enabled'
);
select ok(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname = 'marketing_campaigns'
  ),
  'campaign drafts have RLS enabled'
);

select ok(
  exists (select 1 from app.permissions where code = 'customers.manage'),
  'customer operations permission exists'
);
select ok(
  has_function_privilege('authenticated', 'api.set_my_marketing_consent(boolean)', 'EXECUTE'),
  'authenticated customers can change their own consent'
);
select ok(
  not has_function_privilege('anon', 'api.set_my_marketing_consent(boolean)', 'EXECUTE'),
  'anonymous visitors cannot change customer consent'
);
select ok(
  has_function_privilege('authenticated', 'api.get_marketing_snapshot()', 'EXECUTE'),
  'staff dashboard can invoke the permission-checked customer snapshot'
);
select ok(
  not has_function_privilege('authenticated', 'api.list_marketing_sync_candidates(integer)', 'EXECUTE'),
  'browser roles cannot list customer synchronization candidates'
);
select ok(
  has_function_privilege('service_role', 'api.list_marketing_sync_candidates(integer)', 'EXECUTE'),
  'trusted server can list synchronization candidates'
);
select ok(
  not has_function_privilege('authenticated', 'api.upsert_marketing_contact_link(uuid,text,timestamp with time zone)', 'EXECUTE'),
  'browser roles cannot write external contact links'
);

select * from finish();
rollback;
