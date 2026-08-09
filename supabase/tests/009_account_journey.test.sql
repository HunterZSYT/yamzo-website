begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(
  'private',
  'customer_delivery_addresses',
  'delivery addresses remain in the private schema'
);
select has_table(
  'private',
  'account_deletion_tombstones',
  'account-deletion proof remains private'
);

select ok(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname = 'customer_delivery_addresses'
  ),
  'customer delivery addresses have RLS enabled'
);
select ok(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname = 'account_deletion_tombstones'
  ),
  'account-deletion tombstones have RLS enabled'
);

select has_function_privilege(
  'authenticated',
  'api.get_my_account_snapshot()',
  'EXECUTE',
  'an authenticated customer can read only their account snapshot'
);
select has_function_privilege(
  'authenticated',
  'api.update_my_account_profile(text,app.locale_code)',
  'EXECUTE',
  'an authenticated customer can update their own profile'
);
select has_function_privilege(
  'authenticated',
  'api.save_my_delivery_address(uuid,text,smallint,text,text,text,boolean)',
  'EXECUTE',
  'an authenticated customer can save their own delivery address'
);
select has_function_privilege(
  'authenticated',
  'api.confirm_my_account_deletion(text,text)',
  'EXECUTE',
  'an authenticated customer can begin the guarded deletion flow'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.get_my_account_snapshot()',
    'EXECUTE'
  ),
  'anonymous visitors cannot read account snapshots'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.save_my_delivery_address(uuid,text,smallint,text,text,text,boolean)',
    'EXECUTE'
  ),
  'anonymous visitors cannot save delivery addresses'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'api.record_account_deletion_completion(uuid)',
    'EXECUTE'
  ),
  'browser sessions cannot record an account-deletion completion'
);
select has_function_privilege(
  'service_role',
  'api.record_account_deletion_completion(uuid)',
  'EXECUTE',
  'only trusted server code can record completed account deletion'
);

select * from finish();
rollback;
