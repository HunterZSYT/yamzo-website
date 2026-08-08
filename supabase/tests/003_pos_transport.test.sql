begin;
select plan(16);

select ok(
  to_regclass('private.pos_request_nonces') is not null,
  'POS request replay nonces are persisted privately'
);
select ok(
  to_regprocedure('api.register_pos_terminal_key(text,text,text,timestamptz)') is not null,
  'terminal public-key registration and rotation RPC exists'
);
select ok(
  to_regprocedure('api.get_pos_terminal_verifier(text)') is not null,
  'server-only terminal public-key lookup RPC exists'
);
select ok(
  to_regprocedure('api.consume_pos_request_nonce(uuid,bigint,text,text)') is not null,
  'server-only terminal replay protection RPC exists'
);
select ok(
  to_regprocedure('api.pos_pull_website_orders(uuid,integer,boolean,integer,timestamptz,uuid)') is not null,
  'signed POS order pull RPC exists'
);
select ok(
  to_regprocedure('api.apply_pos_order_event(uuid,uuid,uuid,app.order_status,integer,text)') is not null,
  'idempotent POS transition RPC exists'
);
select ok(
  to_regprocedure('api.apply_pos_print_ack(uuid,uuid,uuid,app.print_job_kind,boolean,text)') is not null,
  'idempotent POS print acknowledgement RPC exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.get_pos_terminal_verifier(text)',
    'EXECUTE'
  ),
  'anon cannot read terminal verification keys'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'api.get_pos_terminal_verifier(text)',
    'EXECUTE'
  ),
  'browser users cannot read terminal verification keys'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'api.consume_pos_request_nonce(uuid,bigint,text,text)',
    'EXECUTE'
  ),
  'browser users cannot consume trusted terminal nonces'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'api.pos_pull_website_orders(uuid,integer,boolean,integer,timestamptz,uuid)',
    'EXECUTE'
  ),
  'browser users cannot pull operational orders as a terminal'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'api.apply_pos_order_event(uuid,uuid,uuid,app.order_status,integer,text)',
    'EXECUTE'
  ),
  'browser users cannot invoke the trusted POS transition bridge'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'api.apply_pos_print_ack(uuid,uuid,uuid,app.print_job_kind,boolean,text)',
    'EXECUTE'
  ),
  'browser users cannot acknowledge trusted POS print work'
);
select ok(
  has_function_privilege(
    'service_role',
    'api.get_pos_terminal_verifier(text)',
    'EXECUTE'
  ),
  'the server service role can read terminal verification keys'
);
select ok(
  has_function_privilege(
    'service_role',
    'api.consume_pos_request_nonce(uuid,bigint,text,text)',
    'EXECUTE'
  ),
  'the server service role can consume trusted terminal nonces'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api.register_pos_terminal_key(text,text,text,timestamptz)',
    'EXECUTE'
  ),
  'authenticated staff can reach the permission-gated public-key rotation RPC'
);

select * from finish();
rollback;
