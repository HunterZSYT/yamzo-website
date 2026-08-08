begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(
  to_regprocedure('api.get_admin_operations_snapshot()') is not null,
  'protected admin operations snapshot exists'
);
select ok(
  has_function_privilege('authenticated', 'api.get_admin_operations_snapshot()', 'EXECUTE'),
  'authenticated staff can reach the permission-filtered admin snapshot'
);
select ok(
  not has_function_privilege('anon', 'api.get_admin_operations_snapshot()', 'EXECUTE'),
  'anonymous visitors cannot read admin operations data'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api.set_business_hour(smallint,smallint,time without time zone,time without time zone,boolean)',
    'EXECUTE'
  ),
  'authenticated staff can reach the permission-checked hours mutation'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.set_business_hour(smallint,smallint,time without time zone,time without time zone,boolean)',
    'EXECUTE'
  ),
  'anonymous visitors cannot mutate hours'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api.update_menu_item_admin(uuid,boolean,boolean,boolean,integer,integer,smallint,integer,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated staff can reach the permission-checked item mutation'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api.upsert_offer_admin(uuid,text,app.offer_kind,integer,integer,integer,boolean,boolean,timestamp with time zone,timestamp with time zone,integer,app.offer_target_kind,uuid,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated merchandising staff can reach the guarded offer mutation'
);
select ok(
  has_function_privilege(
    'service_role',
    'api.set_meta_integration_server(uuid,boolean,text,text,boolean)',
    'EXECUTE'
  ),
  'trusted server role can write Meta configuration'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'api.set_meta_integration_server(uuid,boolean,text,text,boolean)',
    'EXECUTE'
  ),
  'browser-authenticated callers cannot submit Vault secrets directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.set_meta_integration_server(uuid,boolean,text,text,boolean)',
    'EXECUTE'
  ),
  'anonymous visitors cannot submit Vault secrets'
);
select unlike(
  pg_get_functiondef(
    'api.get_admin_operations_snapshot()'::regprocedure
  ),
  '%decrypted_secrets%',
  'admin snapshot never reads decrypted Vault secrets'
);
select unlike(
  pg_get_functiondef(
    'api.set_meta_integration_server(uuid,boolean,text,text,boolean)'::regprocedure
  ),
  '%decrypted_secret%',
  'Meta mutation never reads secret plaintext back from Vault'
);
select like(
  pg_get_functiondef(
    'api.transition_order(uuid,app.order_status,integer,text,uuid,text)'::regprocedure
  ),
  '%ORDER_VERSION_CONFLICT%',
  'order operations retain optimistic version conflict protection'
);
select like(
  pg_get_functiondef(
    'api.set_staff_access(uuid,app.staff_status,app.app_role_code,text)'::regprocedure
  ),
  '%delete from app.staff_role_assignments%',
  'staff access still replaces the exact role assignment'
);

insert into auth.users (id, email)
values ('55555555-5555-4555-8555-555555555555', 'admin-operations-owner@yamzo.invalid');

insert into app.staff_members (user_id, display_name, status, approved_at)
values (
  '55555555-5555-4555-8555-555555555555',
  'Admin Operations Owner',
  'active',
  now()
);

insert into app.staff_role_assignments (user_id, role_id)
select '55555555-5555-4555-8555-555555555555', r.id
from app.roles r
where r.code = 'owner';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}',
  true
);

select lives_ok(
  $test$
    select api.set_business_hour(5, 1, '11:00', '02:00', false)
  $test$,
  'authorized owner can configure an overnight Dhaka interval'
);
select lives_ok(
  $test$
    select api.upsert_business_hour_exception(
      null, '2026-12-16', 1, null, null, true,
      'Victory Day closure', 'বিজয় দিবসে বন্ধ'
    )
  $test$,
  'authorized owner can add a bilingual closure exception'
);
select lives_ok(
  $test$
    select api.update_home_section_admin(
      s.id, true, 15, 'Offers', 'অফার', 'Fresh savings', 'নতুন সাশ্রয়'
    )
    from app.home_sections s
    where s.section_key = 'offers'
  $test$,
  'authorized owner can reorder and translate a homepage section'
);
select lives_ok(
  $test$
    select api.update_menu_item_admin(
      i.id, true, true, i.is_featured,
      i.base_price_minor, i.compare_at_price_minor,
      i.preparation_minutes, i.sort_order,
      en.name, bn.name, en.description, bn.description
    )
    from app.menu_items i
    join app.menu_item_translations en on en.item_id = i.id and en.locale = 'en'
    join app.menu_item_translations bn on bn.item_id = i.id and bn.locale = 'bn'
    order by i.id
    limit 1
  $test$,
  'authorized owner can update authoritative item availability and price data'
);
select lives_ok(
  $test$
    select api.upsert_banner_admin(
      null, 'hero', null, '/#menu', false, null, null, 90,
      'Test banner', 'পরীক্ষামূলক ব্যানার',
      'Admin contract test', 'অ্যাডমিন চুক্তি পরীক্ষা',
      null, null, 'Order now', 'অর্ডার করুন'
    )
  $test$,
  'authorized owner can create a disabled bilingual banner'
);
select lives_ok(
  $test$
    select api.upsert_offer_admin(
      null, 'SQLTEST10', 'percent', 1000, 50000, 10000,
      false, false, null, null, 0, 'all', null,
      'SQL test offer', 'এসকিউএল টেস্ট অফার',
      null, null, null, null
    )
  $test$,
  'authorized owner can create a disabled server-validated offer'
);
select ok(
  (api.get_admin_operations_snapshot() -> 'business_hours') is not null,
  'owner snapshot includes site operations data'
);
select ok(
  (api.get_admin_operations_snapshot() -> 'menu_items') is not null,
  'owner snapshot includes catalog operations data'
);
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $test$
    select api.set_meta_integration_server(
      '55555555-5555-4555-8555-555555555555',
      false,
      '123456789012345',
      'test_capi_token_1234567890',
      false
    )
  $test$,
  'trusted server can store a write-only test token in Vault'
);
reset role;

select ok(
  (select vault_secret_id is not null
   from private.integration_settings
   where kind = 'meta_capi'),
  'integration settings store only a Vault UUID reference'
);
select is(
  (select details ? 'capi_token'
   from private.audit_log
   where action = 'integration.meta_configuration_updated'
   order by id desc
   limit 1),
  false,
  'Meta audit details do not contain a token field'
);

select * from finish();
rollback;
