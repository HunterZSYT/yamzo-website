begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(
  not has_function_privilege('authenticated', signature, 'EXECUTE'),
  'authenticated cannot execute stale trusted RPC ' || signature
)
from (
  values
    ('api.claim_website_orders(uuid,integer,integer,boolean)'),
    ('api.renew_order_claim(uuid,uuid,text,integer)'),
    ('api.release_order_claim(uuid,uuid,text)'),
    ('api.claim_print_jobs(uuid,integer,integer)'),
    ('api.ack_print_job(uuid,uuid,text,boolean,text)'),
    ('api.approve_staff(uuid,app.app_role_code)')
) as stale_rpc(signature);

select ok(
  has_function_privilege('service_role', signature, 'EXECUTE'),
  'service role retains trusted RPC ' || signature
)
from (
  values
    ('api.claim_website_orders(uuid,integer,integer,boolean)'),
    ('api.renew_order_claim(uuid,uuid,text,integer)'),
    ('api.release_order_claim(uuid,uuid,text)'),
    ('api.claim_print_jobs(uuid,integer,integer)'),
    ('api.ack_print_job(uuid,uuid,text,boolean,text)'),
    ('api.approve_staff(uuid,app.app_role_code)')
) as trusted_rpc(signature);

select ok(
  not has_function_privilege(
    'anon',
    'api.get_order_by_tracking(text,text)',
    'EXECUTE'
  ),
  'anon cannot invoke the legacy tracking lookup'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'api.get_order_by_tracking(text,text)',
    'EXECUTE'
  ),
  'authenticated cannot invoke the legacy tracking lookup'
);
select ok(
  has_function_privilege(
    'service_role',
    'api.get_order_by_tracking(text,text)',
    'EXECUTE'
  ),
  'service role retains the legacy tracking lookup for trusted compatibility'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'api.get_order_by_tracking(text,text,text)',
    'EXECUTE'
  ),
  'authenticated cannot supply a tracking rate bucket directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'api.get_order_by_tracking(text,text,text)',
    'EXECUTE'
  ),
  'service role can use the rate-limited tracking lookup'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.consume_fixed_window_rate_limit(text,text,integer,integer)',
    'EXECUTE'
  ),
  'browser roles cannot invoke the internal rate limiter'
);

select ok(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relname = 'pos_request_nonces'
  ),
  'POS request nonces have RLS enabled as defense in depth'
);

select like(
  pg_get_functiondef(
    'api.create_order_tx(text,text,text,smallint,text,text,text,jsonb,integer,app.locale_code,text)'::regprocedure
  ),
  '%order.auth_create%',
  'authenticated order creation uses a server-derived user rate bucket'
);
select like(
  pg_get_functiondef('api.save_my_phone(text,text,boolean)'::regprocedure),
  '%customer.phone_save%',
  'saved-phone writes use a fixed-window limiter'
);
select like(
  pg_get_functiondef('api.save_my_phone(text,text,boolean)'::regprocedure),
  '%>= 5%',
  'saved-phone writes enforce a five-number ceiling'
);
select like(
  pg_get_functiondef('api.request_staff_access(text)'::regprocedure),
  '%staff.access_request%',
  'staff access requests use an auth.uid fixed-window limiter'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
begin
  for i in 1..120 loop
    perform api.get_order_by_tracking(
      'YZ-20260808-00000000',
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'release-test-tracking-bucket'
    );
  end loop;
end;
$$;
reset role;

select is(
  (
    select request_count
    from private.rate_limit_buckets
    where action = 'order.tracking_lookup'
      and bucket_hash = extensions.digest('release-test-tracking-bucket', 'sha256')
    order by window_started_at desc
    limit 1
  ),
  120,
  'failed high-entropy tracking lookups durably consume the opaque rate bucket'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok(
  $test$
    select api.get_order_by_tracking(
      'YZ-20260808-00000000',
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'release-test-tracking-bucket'
    )
  $test$,
  'P0001',
  'RATE_LIMITED',
  'the tracking lookup rejects requests beyond the durable fixed window'
);
reset role;

insert into app.media_assets (id, bucket_id, object_path)
values
  ('70000000-0000-4000-8000-000000000001', 'menu-media', 'release-test/menu.webp'),
  ('70000000-0000-4000-8000-000000000002', 'site-media', 'release-test/banner.webp'),
  ('70000000-0000-4000-8000-000000000003', 'site-media', 'release-test/unreferenced.webp');

insert into app.menu_item_media (item_id, media_id, sort_order)
values (
  'b07a41d7-f220-5680-9224-c307d7bd49f3',
  '70000000-0000-4000-8000-000000000001',
  999
);

insert into app.banners (id, placement, media_id, is_active)
values (
  '71000000-0000-4000-8000-000000000001',
  'hero',
  '70000000-0000-4000-8000-000000000002',
  true
);

set local role anon;
select is(
  (
    select count(*)
    from app.media_assets
    where id in (
      '70000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000002',
      '70000000-0000-4000-8000-000000000003'
    )
  ),
  2::bigint,
  'storefront RLS exposes referenced menu/banner media but not unreferenced media'
);
reset role;

insert into auth.users (id, email)
values
  ('76000000-0000-4000-8000-000000000001', 'release-phone@yamzo.invalid'),
  ('77000000-0000-4000-8000-000000000001', 'release-staff@yamzo.invalid');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"76000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
do $$
begin
  for i in 1..5 loop
    perform api.save_my_phone(
      '+880130000000' || i::text,
      'Phone ' || i::text,
      false
    );
  end loop;
end;
$$;
reset role;

select is(
  (
    select count(*)
    from private.customer_phone_numbers
    where user_id = '76000000-0000-4000-8000-000000000001'
  ),
  5::bigint,
  'a customer can save up to five distinct phone numbers'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"76000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $test$
    select api.save_my_phone('+8801300000006', 'Phone 6', false)
  $test$,
  '23514',
  'CUSTOMER_PHONE_LIMIT_REACHED',
  'a sixth distinct saved phone is rejected'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"77000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
do $$
begin
  perform api.request_staff_access('First request');
  perform api.request_staff_access('Updated request 2');
  perform api.request_staff_access('Updated request 3');
  perform api.request_staff_access('Updated request 4');
  perform api.request_staff_access('Updated request 5');
  perform api.request_staff_access('Updated request');
end;
$$;
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"77000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $test$
    select api.request_staff_access('Seventh request')
  $test$,
  'P0001',
  'RATE_LIMITED',
  'staff access writes are capped at six per ten-minute window'
);
reset role;

select is(
  (
    select count(*)
    from private.audit_log
    where actor_id = '77000000-0000-4000-8000-000000000001'
      and action = 'staff.access_requested'
  ),
  1::bigint,
  'repeated staff access requests emit only the first audit event'
);
select is(
  (
    select display_name
    from app.staff_members
    where user_id = '77000000-0000-4000-8000-000000000001'
  ),
  'Updated request',
  'a repeated pending access request may refresh only its display name'
);

select * from finish();
rollback;
