-- Keep POS terminal credential rotation compatible with the typed audit log.
-- A CASE expression resolves to text, so cast it explicitly to the enum.
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
    (case when v_is_service or v_is_database_admin then 'system' else 'staff' end)::app.audit_actor_type,
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
