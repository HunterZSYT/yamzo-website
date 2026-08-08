begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(
  to_regprocedure('api.get_meta_pixel_runtime_config()') is not null,
  'service-only Meta Pixel runtime config exists'
);
select ok(
  to_regprocedure('api.claim_meta_purchase_events(integer,integer)') is not null,
  'service-only Meta purchase claim exists'
);
select ok(
  to_regprocedure('api.finish_meta_purchase_event(bigint,text,boolean,text)') is not null,
  'claim-token-guarded Meta purchase finish exists'
);
select ok(
  has_function_privilege(
    'service_role',
    'api.claim_meta_purchase_events(integer,integer)',
    'EXECUTE'
  ),
  'service role can claim Meta purchase events'
);
select ok(
  has_function_privilege(
    'service_role',
    'api.finish_meta_purchase_event(bigint,text,boolean,text)',
    'EXECUTE'
  ),
  'service role can finish a claimed Meta purchase event'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'api.claim_meta_purchase_events(integer,integer)',
    'EXECUTE'
  ),
  'browser-authenticated users cannot claim Meta purchase events or Vault secrets'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'api.finish_meta_purchase_event(bigint,text,boolean,text)',
    'EXECUTE'
  ),
  'browser-authenticated users cannot finish Meta purchase claims'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.get_meta_pixel_runtime_config()',
    'EXECUTE'
  ),
  'anonymous browsers cannot call the service-only runtime config contract'
);
select unlike(
  pg_get_functiondef('api.get_meta_pixel_runtime_config()'::regprocedure),
  '%decrypted_secret%',
  'public Pixel config function never reads Vault plaintext'
);
select like(
  pg_get_functiondef(
    'api.claim_meta_purchase_events(integer,integer)'::regprocedure
  ),
  '%vault.decrypted_secrets%',
  'CAPI worker resolves its access token from Vault only inside the service function'
);
select like(
  pg_get_functiondef(
    'api.claim_meta_purchase_events(integer,integer)'::regprocedure
  ),
  '%o.mode = ''live''%o.status = ''delivered''%',
  'CAPI claims only delivered production orders'
);
select like(
  pg_get_functiondef(
    'api.finish_meta_purchase_event(bigint,text,boolean,text)'::regprocedure
  ),
  '%processing_token_hash%',
  'CAPI completion requires the short-lived claim token hash'
);
select like(
  pg_get_functiondef(
    'api.finish_meta_purchase_event(bigint,text,boolean,text)'::regprocedure
  ),
  '%processing_expires_at > now()%',
  'CAPI completion rejects expired claim tokens'
);
select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'outbox_events'
      and column_name in ('full_name', 'phone_e164', 'access_token')
  ),
  'durable outbox columns contain neither order-contact PII nor CAPI plaintext'
);
select unlike(
  pg_get_functiondef(
    'api.transition_order(uuid,app.order_status,integer,text,uuid,text)'::regprocedure
  ),
  '%phone_e164%',
  'durable Meta enqueue never copies phone PII into its payload'
);
select like(
  pg_get_functiondef(
    'api.transition_order(uuid,app.order_status,integer,text,uuid,text)'::regprocedure
  ),
  '%p_to_status = ''delivered'' and v_order.mode = ''live''%',
  'test and non-delivered orders never enqueue Meta purchase events'
);
select is(
  (
    select count(*)::integer
    from pg_indexes
    where schemaname = 'private'
      and indexname = 'outbox_meta_purchase_order_unique'
  ),
  1,
  'each live order has at most one durable Meta purchase event'
);
select is(
  (
    select count(*)::integer
    from pg_indexes
    where schemaname = 'private'
      and indexname = 'outbox_meta_processing_lease'
  ),
  1,
  'expired Meta claims have a bounded lease queue index'
);

select * from finish();
rollback;
