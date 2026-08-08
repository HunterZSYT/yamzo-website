begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(
  lower(pg_get_functiondef(
    'private.create_order_core(text,text,text,smallint,text,text,text,jsonb,app.locale_code,text)'::regprocedure
  )) like '%security definer%',
  'private order core remains security definer'
);
select ok(
  pg_get_functiondef(
    'private.create_order_core(text,text,text,smallint,text,text,text,jsonb,app.locale_code,text)'::regprocedure
  ) like '%::app.audit_actor_type%',
  'private order core preserves the typed order-event actor cast'
);

select throws_ok(
  $test$
    select private.create_order_core(
      'numeric-road-test-key',
      'Valid Customer',
      '+8801712345678',
      1,
      '20abc',
      '80',
      '3A',
      '[{}]'::jsonb,
      'en',
      null
    )
  $test$,
  '22023',
  'INVALID_CHECKOUT_DETAILS',
  'order core rejects non-numeric road input before any order write'
);
select throws_ok(
  $test$
    select private.create_order_core(
      'numeric-house-test-key',
      'Valid Customer',
      '+8801712345678',
      1,
      '20',
      '80abc',
      '3A',
      '[{}]'::jsonb,
      'en',
      null
    )
  $test$,
  '22023',
  'INVALID_CHECKOUT_DETAILS',
  'order core rejects non-numeric house input before any order write'
);
select throws_ok(
  $test$
    select private.create_order_core(
      'numeric-phone-test-key',
      'Valid Customer',
      '+880171234567a',
      1,
      '20',
      '80',
      '3A',
      '[{}]'::jsonb,
      'en',
      null
    )
  $test$,
  '22023',
  'INVALID_CHECKOUT_DETAILS',
  'order core rejects phone input containing letters before normalization'
);

select * from finish();
rollback;
