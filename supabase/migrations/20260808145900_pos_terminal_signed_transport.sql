-- Trusted website <-> POS transport.
--
-- The desktop keeps an Ed25519 private key. Vercel keeps the Supabase secret
-- key. Postgres stores only the terminal public key and its SHA-256 fingerprint.
-- Vercel verifies each timestamped signature before Postgres consumes the
-- single-use nonce and returns the terminal UUID to privileged RPCs.

alter table private.pos_terminal_credentials
  add column signature_public_key bytea;

alter table private.pos_terminal_credentials
  add constraint terminal_signature_public_key_length check (
    signature_public_key is null
    or octet_length(signature_public_key) between 32 and 128
  );

comment on column private.pos_terminal_credentials.signature_public_key is
  'Ed25519 SubjectPublicKeyInfo DER. The corresponding private key must remain only on the POS host.';

create table private.pos_request_nonces (
  terminal_id uuid not null references app.pos_terminals(id) on delete cascade,
  nonce_hash bytea not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (terminal_id, nonce_hash),
  constraint pos_request_nonce_hash_length check (octet_length(nonce_hash) = 32),
  constraint pos_request_nonce_expiry check (expires_at > created_at)
);

create index pos_request_nonces_expiry
  on private.pos_request_nonces (expires_at);

revoke all on table private.pos_request_nonces
  from public, anon, authenticated;

create or replace function private.secure_equals_32(
  p_left bytea,
  p_right bytea
)
returns boolean
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_difference integer := 0;
  v_index integer;
begin
  if octet_length(p_left) <> 32 or octet_length(p_right) <> 32 then
    return false;
  end if;

  for v_index in 0..31 loop
    v_difference := v_difference
      | (get_byte(p_left, v_index) # get_byte(p_right, v_index));
  end loop;
  return v_difference = 0;
end;
$$;

revoke all on function private.secure_equals_32(bytea, bytea)
  from public, anon, authenticated;

create or replace function api.register_pos_terminal_key(
  p_terminal_code text,
  p_name text,
  p_public_key_base64 text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_is_database_admin boolean := session_user in ('postgres', 'supabase_admin');
  v_terminal_id uuid;
  v_public_key bytea;
  v_fingerprint bytea;
  v_expiry timestamptz := coalesce(p_expires_at, now() + interval '180 days');
begin
  if not v_is_service
     and not v_is_database_admin
     and not private.current_staff_has_permission('integrations.manage') then
    raise exception using errcode = '42501', message = 'INTEGRATIONS_MANAGE_PERMISSION_REQUIRED';
  end if;
  if p_terminal_code is null
     or p_terminal_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'
     or p_name is null
     or char_length(btrim(p_name)) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'INVALID_TERMINAL_DETAILS';
  end if;
  if v_expiry < now() + interval '1 day'
     or v_expiry > now() + interval '366 days' then
    raise exception using errcode = '22023', message = 'INVALID_TERMINAL_EXPIRY';
  end if;

  if p_public_key_base64 is null
     or p_public_key_base64 !~ '^[A-Za-z0-9_-]{50,120}$' then
    raise exception using errcode = '22023', message = 'INVALID_TERMINAL_PUBLIC_KEY';
  end if;
  begin
    v_public_key := decode(
      translate(p_public_key_base64, '-_', '+/')
        || repeat('=', (4 - char_length(p_public_key_base64) % 4) % 4),
      'base64'
    );
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_TERMINAL_PUBLIC_KEY';
  end;
  -- Ed25519 SubjectPublicKeyInfo is a 12-byte algorithm prefix followed by the
  -- 32-byte public key. Reject other key algorithms and malformed encodings.
  if octet_length(v_public_key) <> 44
     or substring(v_public_key from 1 for 12)
       <> decode('302a300506032b6570032100', 'hex') then
    raise exception using errcode = '22023', message = 'INVALID_TERMINAL_PUBLIC_KEY';
  end if;
  v_fingerprint := extensions.digest(v_public_key, 'sha256');

  insert into app.pos_terminals (
    terminal_code, name, status, created_by
  ) values (
    p_terminal_code,
    btrim(p_name),
    'active',
    case when v_is_service or v_is_database_admin then null else v_actor end
  )
  on conflict (terminal_code) do update
  set name = excluded.name,
      status = 'active'
  returning id into v_terminal_id;

  insert into private.pos_terminal_credentials (
    terminal_id,
    credential_hash,
    credential_hint,
    signature_public_key,
    rotated_at,
    expires_at,
    revoked_at
  ) values (
    v_terminal_id,
    v_fingerprint,
    left(encode(v_fingerprint, 'hex'), 12),
    v_public_key,
    now(),
    v_expiry,
    null
  )
  on conflict (terminal_id) do update
  set credential_hash = excluded.credential_hash,
      credential_hint = excluded.credential_hint,
      signature_public_key = excluded.signature_public_key,
      rotated_at = excluded.rotated_at,
      expires_at = excluded.expires_at,
      revoked_at = null;

  insert into private.audit_log (
    actor_type, actor_id, action, target_type, target_id, details
  ) values (
    case when v_is_service or v_is_database_admin then 'system' else 'staff' end,
    v_actor,
    'pos.terminal_credential_rotated',
    'pos_terminal',
    v_terminal_id::text,
    jsonb_build_object(
      'terminal_code', p_terminal_code,
      'expires_at', v_expiry
    )
  );

  return jsonb_build_object(
    'terminal_id', v_terminal_id,
    'terminal_code', p_terminal_code,
    'public_key_fingerprint', encode(v_fingerprint, 'hex'),
    'expires_at', v_expiry
  );
end;
$$;

revoke all on function api.register_pos_terminal_key(text, text, text, timestamptz)
  from public, anon;
grant execute on function api.register_pos_terminal_key(text, text, text, timestamptz)
  to authenticated, service_role;

create or replace function api.get_pos_terminal_verifier(
  p_terminal_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal_id uuid;
  v_public_key bytea;
  v_fingerprint bytea;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_terminal_code is null
     or p_terminal_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' then
    raise exception using errcode = '42501', message = 'POS_SIGNATURE_INVALID';
  end if;

  select t.id, c.signature_public_key, c.credential_hash
  into v_terminal_id, v_public_key, v_fingerprint
  from app.pos_terminals t
  join private.pos_terminal_credentials c on c.terminal_id = t.id
  where t.terminal_code = p_terminal_code
    and t.status = 'active'
    and c.signature_public_key is not null
    and private.secure_equals_32(
      extensions.digest(c.signature_public_key, 'sha256'),
      c.credential_hash
    )
    and c.revoked_at is null
    and (c.expires_at is null or c.expires_at > now());

  if not found then
    raise exception using errcode = '42501', message = 'POS_SIGNATURE_INVALID';
  end if;

  return jsonb_build_object(
    'terminal_id', v_terminal_id,
    'public_key', rtrim(
      translate(encode(v_public_key, 'base64'), '+/', '-_'),
      '='
    ),
    'public_key_fingerprint', encode(v_fingerprint, 'hex')
  );
end;
$$;

revoke all on function api.get_pos_terminal_verifier(text)
  from public, anon, authenticated;
grant execute on function api.get_pos_terminal_verifier(text)
  to service_role;

create or replace function api.consume_pos_request_nonce(
  p_terminal_id uuid,
  p_timestamp bigint,
  p_nonce text,
  p_public_key_fingerprint text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_terminal_id is null
     or p_timestamp is null
     or abs(extract(epoch from clock_timestamp())::bigint - p_timestamp) > 300
     or p_nonce is null
     or p_nonce !~ '^[A-Za-z0-9_-]{22,64}$'
     or p_public_key_fingerprint is null
     or p_public_key_fingerprint !~ '^[a-f0-9]{64}$'
     or not exists (
       select 1
       from app.pos_terminals t
       join private.pos_terminal_credentials c on c.terminal_id = t.id
       where t.id = p_terminal_id
         and t.status = 'active'
         and c.signature_public_key is not null
         and private.secure_equals_32(
           extensions.digest(c.signature_public_key, 'sha256'),
           c.credential_hash
         )
         and encode(c.credential_hash, 'hex') = p_public_key_fingerprint
         and c.revoked_at is null
         and (c.expires_at is null or c.expires_at > now())
     ) then
    raise exception using errcode = '42501', message = 'POS_SIGNATURE_INVALID';
  end if;

  delete from private.pos_request_nonces
  where terminal_id = p_terminal_id
    and expires_at <= now();

  insert into private.pos_request_nonces (
    terminal_id, nonce_hash, expires_at
  ) values (
    p_terminal_id,
    extensions.digest(p_nonce, 'sha256'),
    now() + interval '10 minutes'
  )
  on conflict do nothing;

  if not found then
    raise exception using errcode = '23505', message = 'POS_REQUEST_REPLAYED';
  end if;

  update app.pos_terminals
  set last_seen_at = now()
  where id = p_terminal_id;
  return true;
end;
$$;

revoke all on function api.consume_pos_request_nonce(uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function api.consume_pos_request_nonce(uuid, bigint, text, text)
  to service_role;

create or replace function api.pos_pull_website_orders(
  p_terminal_id uuid,
  p_limit integer default 10,
  p_include_test boolean default false,
  p_after_mode_rank integer default null,
  p_after_placed_at timestamptz default null,
  p_after_order_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_claim_secret text;
  v_result jsonb := '[]'::jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_limit is null or p_limit not between 1 and 10 then
    raise exception using errcode = '22023', message = 'INVALID_CLAIM_LIMIT';
  end if;
  if (p_after_mode_rank is null) <> (p_after_placed_at is null)
     or (p_after_mode_rank is null) <> (p_after_order_id is null)
     or (p_after_mode_rank is not null and p_after_mode_rank not in (0, 1)) then
    raise exception using errcode = '22023', message = 'INVALID_CLAIM_CURSOR';
  end if;
  if not exists (
    select 1
    from app.pos_terminals t
    where t.id = p_terminal_id
      and t.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'TERMINAL_NOT_ACTIVE';
  end if;

  for v_order in
    select o.id
    from app.orders o
    left join app.order_claims c on c.order_id = o.id
    where o.source = 'website'
      and o.status = 'pending_acceptance'
      and (o.mode = 'live' or p_include_test)
      and (
        p_after_mode_rank is null
        or (
          case o.mode when 'live' then 0 else 1 end,
          o.placed_at,
          o.id
        ) > (
          p_after_mode_rank,
          p_after_placed_at,
          p_after_order_id
        )
      )
      and (
        c.order_id is null
        or c.terminal_id = p_terminal_id
        or c.released_at is not null
        or c.lease_expires_at <= now()
      )
    order by case o.mode when 'live' then 0 else 1 end, o.placed_at, o.id
    for update of o skip locked
    limit p_limit
  loop
    v_claim_secret := private.generate_url_token();
    insert into app.order_claims (
      order_id,
      terminal_id,
      claim_token_hash,
      claimed_at,
      lease_expires_at,
      renewed_at,
      released_at
    ) values (
      v_order.id,
      p_terminal_id,
      extensions.digest(v_claim_secret, 'sha256'),
      now(),
      now() + interval '5 minutes',
      now(),
      null
    )
    on conflict (order_id) do update
    set terminal_id = excluded.terminal_id,
        claim_token_hash = excluded.claim_token_hash,
        claimed_at = excluded.claimed_at,
        lease_expires_at = excluded.lease_expires_at,
        renewed_at = excluded.renewed_at,
        released_at = null;

    v_result := v_result || jsonb_build_array(
      private.build_order_operations_payload(v_order.id)
    );
  end loop;

  update app.pos_terminals
  set last_seen_at = now()
  where id = p_terminal_id;

  return v_result;
end;
$$;

revoke all on function api.pos_pull_website_orders(
  uuid, integer, boolean, integer, timestamptz, uuid
)
  from public, anon, authenticated;
grant execute on function api.pos_pull_website_orders(
  uuid, integer, boolean, integer, timestamptz, uuid
)
  to service_role;

create or replace function api.apply_pos_order_event(
  p_terminal_id uuid,
  p_event_key uuid,
  p_order_id uuid,
  p_to_status app.order_status,
  p_expected_version integer,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key_hash bytea;
  v_request_hash bytea;
  v_existing private.idempotency_keys%rowtype;
  v_order app.orders%rowtype;
  v_claim_secret text;
  v_response jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_terminal_id is null
     or p_event_key is null
     or p_order_id is null
     or p_to_status is null then
    raise exception using errcode = '22023', message = 'INVALID_POS_ORDER_EVENT';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_VERSION';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception using errcode = '22023', message = 'ORDER_NOTE_TOO_LONG';
  end if;
  if not exists (
    select 1
    from app.pos_terminals t
    where t.id = p_terminal_id
      and t.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'TERMINAL_NOT_ACTIVE';
  end if;

  v_key_hash := extensions.digest(
    p_terminal_id::text || ':' || p_event_key::text,
    'sha256'
  );
  v_request_hash := extensions.digest(
    jsonb_build_object(
      'order_id', p_order_id,
      'to_status', p_to_status,
      'expected_version', p_expected_version,
      'note', nullif(btrim(coalesce(p_note, '')), '')
    )::text,
    'sha256'
  );

  delete from private.idempotency_keys
  where operation = 'pos.order_event'
    and key_hash = v_key_hash
    and expires_at <= now();

  -- Reserve the idempotency key before mutating the order. ON CONFLICT waits
  -- for an in-flight owner, so concurrent identical requests return the one
  -- committed response instead of racing into a late unique violation.
  insert into private.idempotency_keys (
    operation,
    key_hash,
    actor_fingerprint_hash,
    resource_id,
    response_payload,
    expires_at
  ) values (
    'pos.order_event',
    v_key_hash,
    v_request_hash,
    p_order_id,
    null,
    now() + interval '180 days'
  )
  on conflict (operation, key_hash) do nothing;

  if not found then
    select * into v_existing
    from private.idempotency_keys
    where operation = 'pos.order_event'
      and key_hash = v_key_hash
      and expires_at > now()
    for update;

    if not found or v_existing.response_payload is null then
      raise exception using errcode = '40001', message = 'POS_EVENT_IN_PROGRESS';
    end if;
    if not coalesce(private.secure_equals_32(
      v_existing.actor_fingerprint_hash,
      v_request_hash
    ), false) then
      raise exception using errcode = '23505', message = 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return v_existing.response_payload;
  end if;

  select * into v_order
  from app.orders
  where id = p_order_id
    and source = 'website'
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;

  if v_order.status = p_to_status
     and v_order.version = p_expected_version + 1 then
    if not exists (
      select 1
      from app.order_claims c
      where c.order_id = p_order_id
        and c.terminal_id = p_terminal_id
    ) then
      raise exception using errcode = '42501', message = 'ORDER_CLAIMED_BY_ANOTHER_TERMINAL';
    end if;
    v_response := jsonb_build_object(
      'order_id', p_order_id,
      'status', p_to_status,
      'version', p_expected_version + 1
    );
  else
    if exists (
      select 1
      from app.order_claims c
      where c.order_id = p_order_id
        and c.terminal_id <> p_terminal_id
        and c.released_at is null
        and c.lease_expires_at > now()
    ) then
      raise exception using errcode = '42501', message = 'ORDER_CLAIMED_BY_ANOTHER_TERMINAL';
    end if;

    v_claim_secret := private.generate_url_token();
    insert into app.order_claims (
      order_id,
      terminal_id,
      claim_token_hash,
      claimed_at,
      lease_expires_at,
      renewed_at,
      released_at
    ) values (
      p_order_id,
      p_terminal_id,
      extensions.digest(v_claim_secret, 'sha256'),
      now(),
      now() + interval '5 minutes',
      now(),
      null
    )
    on conflict (order_id) do update
    set terminal_id = excluded.terminal_id,
        claim_token_hash = excluded.claim_token_hash,
        claimed_at = excluded.claimed_at,
        lease_expires_at = excluded.lease_expires_at,
        renewed_at = excluded.renewed_at,
        released_at = null;

    select api.transition_order(
      p_order_id,
      p_to_status,
      p_expected_version,
      p_note,
      p_terminal_id,
      v_claim_secret
    ) into v_response;

    if p_to_status in ('delivered', 'rejected', 'cancelled') then
      update app.order_claims
      set released_at = now()
      where order_id = p_order_id
        and terminal_id = p_terminal_id;
    end if;
  end if;

  update private.idempotency_keys
  set response_payload = v_response
  where operation = 'pos.order_event'
    and key_hash = v_key_hash;

  update app.pos_terminals
  set last_seen_at = now()
  where id = p_terminal_id;

  return v_response;
end;
$$;

revoke all on function api.apply_pos_order_event(
  uuid, uuid, uuid, app.order_status, integer, text
) from public, anon, authenticated;
grant execute on function api.apply_pos_order_event(
  uuid, uuid, uuid, app.order_status, integer, text
) to service_role;

create or replace function api.apply_pos_print_ack(
  p_terminal_id uuid,
  p_event_key uuid,
  p_order_id uuid,
  p_kind app.print_job_kind,
  p_succeeded boolean,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key_hash bytea;
  v_request_hash bytea;
  v_existing private.idempotency_keys%rowtype;
  v_job app.print_jobs%rowtype;
  v_response jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_terminal_id is null
     or p_event_key is null
     or p_order_id is null
     or p_kind is null
     or p_succeeded is null then
    raise exception using errcode = '22023', message = 'INVALID_PRINT_ACK';
  end if;
  if not p_succeeded and (
    p_error_code is null or p_error_code !~ '^[A-Z0-9_:-]{1,80}$'
  ) then
    raise exception using errcode = '22023', message = 'SAFE_PRINT_ERROR_CODE_REQUIRED';
  end if;
  -- Print retries can complete after a terminal transition releases its order
  -- lease, but only the same terminal that previously owned the claim may ack.
  if not exists (
    select 1
    from app.pos_terminals t
    where t.id = p_terminal_id
      and t.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'TERMINAL_NOT_ACTIVE';
  end if;
  if not exists (
    select 1
    from app.order_claims c
    where c.order_id = p_order_id
      and c.terminal_id = p_terminal_id
  ) then
    raise exception using errcode = '42501', message = 'ORDER_CLAIMED_BY_ANOTHER_TERMINAL';
  end if;

  v_key_hash := extensions.digest(
    p_terminal_id::text || ':' || p_event_key::text,
    'sha256'
  );
  v_request_hash := extensions.digest(
    jsonb_build_object(
      'order_id', p_order_id,
      'kind', p_kind,
      'succeeded', p_succeeded,
      'error_code', case when p_succeeded then null else p_error_code end
    )::text,
    'sha256'
  );

  delete from private.idempotency_keys
  where operation = 'pos.print_ack'
    and key_hash = v_key_hash
    and expires_at <= now();

  insert into private.idempotency_keys (
    operation,
    key_hash,
    actor_fingerprint_hash,
    resource_id,
    response_payload,
    expires_at
  ) values (
    'pos.print_ack',
    v_key_hash,
    v_request_hash,
    p_order_id,
    null,
    now() + interval '180 days'
  )
  on conflict (operation, key_hash) do nothing;

  if not found then
    select * into v_existing
    from private.idempotency_keys
    where operation = 'pos.print_ack'
      and key_hash = v_key_hash
      and expires_at > now()
    for update;

    if not found or v_existing.response_payload is null then
      raise exception using errcode = '40001', message = 'POS_EVENT_IN_PROGRESS';
    end if;
    if not coalesce(private.secure_equals_32(
      v_existing.actor_fingerprint_hash,
      v_request_hash
    ), false) then
      raise exception using errcode = '23505', message = 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return v_existing.response_payload;
  end if;

  select * into v_job
  from app.print_jobs
  where order_id = p_order_id
    and kind = p_kind
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PRINT_JOB_NOT_FOUND';
  end if;
  if v_job.status = 'cancelled' then
    raise exception using errcode = '23514', message = 'PRINT_JOB_ALREADY_CANCELLED';
  end if;

  if p_succeeded then
    update app.print_jobs
    set status = 'completed',
        terminal_id = p_terminal_id,
        completed_at = coalesce(completed_at, now()),
        lease_expires_at = null,
        claim_token_hash = null,
        attempts = greatest(attempts, 1),
        last_error_code = null
    where id = v_job.id;
  elsif v_job.status <> 'completed' then
    update app.print_jobs
    set status = 'failed',
        terminal_id = p_terminal_id,
        completed_at = null,
        lease_expires_at = null,
        claim_token_hash = null,
        attempts = greatest(attempts, 1),
        last_error_code = p_error_code
    where id = v_job.id;
  end if;

  select jsonb_build_object(
    'job_id', j.id,
    'order_id', j.order_id,
    'kind', j.kind,
    'status', j.status
  ) into v_response
  from app.print_jobs j
  where j.id = v_job.id;

  update private.idempotency_keys
  set response_payload = v_response
  where operation = 'pos.print_ack'
    and key_hash = v_key_hash;

  update app.pos_terminals
  set last_seen_at = now()
  where id = p_terminal_id;

  return v_response;
end;
$$;

revoke all on function api.apply_pos_print_ack(
  uuid, uuid, uuid, app.print_job_kind, boolean, text
) from public, anon, authenticated;
grant execute on function api.apply_pos_print_ack(
  uuid, uuid, uuid, app.print_job_kind, boolean, text
) to service_role;
