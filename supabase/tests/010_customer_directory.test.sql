begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'api',
  'get_customer_directory',
  array['text', 'integer', 'integer'],
  'protected customer directory RPC exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.get_customer_directory(text, integer, integer)',
    'execute'
  ),
  'anonymous callers cannot browse customer data'
);

select ok(
  has_function_privilege(
    'authenticated',
    'api.get_customer_directory(text, integer, integer)',
    'execute'
  ),
  'authenticated callers use the permission-checked directory RPC'
);

select ok(
  (select prosecdef
   from pg_catalog.pg_proc
   where oid = 'api.get_customer_directory(text, integer, integer)'::regprocedure),
  'customer directory remains a guarded security-definer RPC'
);

select * from finish();
rollback;
