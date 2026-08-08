-- Write-only Meta Conversions API configuration.
-- The CAPI token is encrypted in Supabase Vault and is never returned by an API.

create extension if not exists supabase_vault with schema vault;

revoke all on schema vault from public, anon, authenticated;

-- Supabase owns the Vault extension objects and does not allow project roles to
-- rewrite every helper ACL. Revoking schema usage is the supported boundary:
-- browser roles cannot resolve Vault tables or functions, while the
-- service-only security-definer function below can still use them.

create or replace function private.staff_has_permission(
  p_user_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.staff_members sm
    join app.staff_role_assignments sra on sra.user_id = sm.user_id
    join app.role_permissions rp on rp.role_id = sra.role_id
    where sm.user_id = p_user_id
      and sm.status = 'active'
      and rp.permission_code = p_permission
  );
$$;

revoke all on function private.staff_has_permission(uuid, text)
  from public, anon, authenticated;

create or replace function api.set_meta_integration_server(
  p_actor_id uuid,
  p_enabled boolean,
  p_pixel_id text,
  p_capi_token text default null,
  p_clear_token boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_secret_id uuid;
  v_token_changed boolean := false;
  v_token_configured boolean;
  v_pixel_id text := nullif(btrim(coalesce(p_pixel_id, '')), '');
begin
  if not v_is_service then
    raise exception using errcode = '42501', message = 'TRUSTED_ADMIN_SERVER_REQUIRED';
  end if;
  if p_actor_id is null
     or not private.staff_has_permission(p_actor_id, 'integrations.manage') then
    raise exception using errcode = '42501', message = 'INTEGRATIONS_MANAGE_PERMISSION_REQUIRED';
  end if;
  if p_enabled is null or p_clear_token is null then
    raise exception using errcode = '22023', message = 'META_CONFIGURATION_VALUES_REQUIRED';
  end if;
  if v_pixel_id is not null and v_pixel_id !~ '^[0-9]{5,32}$' then
    raise exception using errcode = '22023', message = 'INVALID_META_PIXEL_ID';
  end if;
  if p_capi_token is not null and (
    char_length(btrim(p_capi_token)) not between 20 and 2048
    or p_capi_token ~ '[[:space:]]'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_META_CAPI_TOKEN';
  end if;
  if p_capi_token is not null and p_clear_token then
    raise exception using errcode = '22023', message = 'META_TOKEN_ACTION_CONFLICT';
  end if;

  insert into private.integration_settings (kind, enabled, public_config)
  values (
    'meta_capi',
    false,
    jsonb_build_object('pixel_id', null, 'consent_required', true)
  )
  on conflict (kind) do nothing;

  select i.vault_secret_id
  into v_secret_id
  from private.integration_settings i
  where i.kind = 'meta_capi'
  for update;

  if p_clear_token then
    if v_secret_id is not null then
      delete from vault.secrets where id = v_secret_id;
      v_token_changed := true;
    end if;
    v_secret_id := null;
  elsif p_capi_token is not null then
    if v_secret_id is null then
      select s.id
      into v_secret_id
      from vault.secrets s
      where s.name = 'yamzo_meta_capi_token'
      for update;
    end if;

    if v_secret_id is null then
      v_secret_id := vault.create_secret(
        p_capi_token,
        'yamzo_meta_capi_token',
        'Yamzo Uttara Meta Conversions API token'
      );
    else
      perform vault.update_secret(
        v_secret_id,
        p_capi_token,
        'yamzo_meta_capi_token',
        'Yamzo Uttara Meta Conversions API token'
      );
    end if;
    v_token_changed := true;
  end if;

  v_token_configured := v_secret_id is not null;
  if p_enabled and (v_pixel_id is null or not v_token_configured) then
    raise exception using errcode = '55000', message = 'META_CONFIGURATION_INCOMPLETE';
  end if;

  update private.integration_settings
  set enabled = p_enabled,
      public_config = jsonb_build_object(
        'pixel_id', v_pixel_id,
        'consent_required', true
      ),
      vault_secret_id = v_secret_id,
      updated_by = p_actor_id
  where kind = 'meta_capi';

  perform private.write_admin_audit(
    p_actor_id,
    'integration.meta_configuration_updated',
    'integration_setting',
    'meta_capi',
    jsonb_build_object(
      'enabled', p_enabled,
      'pixel_id', v_pixel_id,
      'token_changed', v_token_changed,
      'token_configured', v_token_configured
    )
  );

  return jsonb_build_object(
    'enabled', p_enabled,
    'pixel_id', v_pixel_id,
    'token_configured', v_token_configured
  );
end;
$$;

comment on function api.set_meta_integration_server(uuid, boolean, text, text, boolean) is
  'Service-role-only, write-only Meta configuration. Never returns or audits token plaintext.';

revoke all on function api.set_meta_integration_server(
  uuid, boolean, text, text, boolean
) from public, anon, authenticated;
grant execute on function api.set_meta_integration_server(
  uuid, boolean, text, text, boolean
) to service_role;
