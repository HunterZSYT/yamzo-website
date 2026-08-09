-- Consent-first marketing operations. Contact email remains in auth.users and is
-- never returned from database RPCs or persisted in these operational tables.

insert into app.permissions (code, description)
values ('customers.manage', 'Manage consented customer audience sync and promotional email campaigns.')
on conflict (code) do update set description = excluded.description;

insert into app.role_permissions (role_id, permission_code)
select r.id, 'customers.manage'
from app.roles r
where r.code in ('owner', 'admin', 'manager')
on conflict (role_id, permission_code) do nothing;

create table private.marketing_contact_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  resend_contact_id text unique,
  consent_observed_at timestamptz,
  consent_synced_at timestamptz,
  last_sync_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_contact_link_id_safe check (
    resend_contact_id is null
    or resend_contact_id ~ '^[A-Za-z0-9_-]{3,128}$'
  ),
  constraint marketing_contact_link_error_safe check (
    last_sync_error_code is null
    or last_sync_error_code ~ '^[A-Z0-9_:-]{2,80}$'
  )
);

comment on table private.marketing_contact_links is
  'Pseudonymous link to a Resend contact. Email addresses remain in auth.users and are never copied here.';

create table private.marketing_campaigns (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  subject text not null,
  preview_text text,
  body_text text not null,
  status text not null default 'draft',
  resend_broadcast_id text unique,
  recipient_count integer not null default 0,
  delivery_attempts integer not null default 0,
  delivery_started_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  last_error_code text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_campaign_name_length check (char_length(btrim(name)) between 2 and 120),
  constraint marketing_campaign_subject_length check (char_length(btrim(subject)) between 2 and 180),
  constraint marketing_campaign_preview_length check (
    preview_text is null or char_length(btrim(preview_text)) between 1 and 250
  ),
  constraint marketing_campaign_body_length check (char_length(btrim(body_text)) between 2 and 12000),
  constraint marketing_campaign_status check (status in ('draft', 'sending', 'sent', 'failed', 'cancelled')),
  constraint marketing_campaign_broadcast_id_safe check (
    resend_broadcast_id is null or resend_broadcast_id ~ '^[A-Za-z0-9_-]{3,128}$'
  ),
  constraint marketing_campaign_recipient_count check (recipient_count >= 0),
  constraint marketing_campaign_delivery_attempts check (delivery_attempts >= 0),
  constraint marketing_campaign_error_safe check (
    last_error_code is null or last_error_code ~ '^[A-Z0-9_:-]{2,80}$'
  )
);

comment on table private.marketing_campaigns is
  'Plain-text campaign drafts and Resend delivery metadata. Never store raw API keys, addresses, phones, or HTML.';

alter table private.marketing_contact_links enable row level security;
alter table private.marketing_campaigns enable row level security;

create trigger marketing_contact_links_set_updated_at
before update on private.marketing_contact_links
for each row execute function private.set_updated_at();

create trigger marketing_campaigns_set_updated_at
before update on private.marketing_campaigns
for each row execute function private.set_updated_at();

create index marketing_contact_links_pending_sync
  on private.marketing_contact_links (consent_observed_at, updated_at desc);
create index marketing_campaigns_recent
  on private.marketing_campaigns (created_at desc, id desc);

create or replace function api.set_my_marketing_consent(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_consent_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  insert into app.profiles (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  update app.profiles
  set marketing_consent_at = case when p_enabled then now() else null end
  where user_id = v_user_id
  returning marketing_consent_at into v_consent_at;

  insert into private.audit_log (
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    details
  ) values (
    'customer'::app.audit_actor_type,
    v_user_id,
    'marketing.consent_changed',
    'profile',
    v_user_id::text,
    jsonb_build_object('enabled', p_enabled)
  );

  return jsonb_build_object(
    'enabled', p_enabled,
    'consent_at', v_consent_at
  );
end;
$$;

create or replace function api.get_marketing_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('customers.manage');
begin
  return jsonb_build_object(
    'consented_account_count', (
      select count(*)::integer
      from app.profiles p
      where p.marketing_consent_at is not null
    ),
    'synced_contact_count', (
      select count(*)::integer
      from private.marketing_contact_links l
      join app.profiles p on p.user_id = l.user_id
      where p.marketing_consent_at is not null
        and l.consent_observed_at is not distinct from p.marketing_consent_at
        and l.last_sync_error_code is null
    ),
    'pending_sync_count', (
      select count(*)::integer
      from app.profiles p
      left join private.marketing_contact_links l on l.user_id = p.user_id
      where (p.marketing_consent_at is not null and (
        l.user_id is null
        or l.consent_observed_at is distinct from p.marketing_consent_at
        or l.last_sync_error_code is not null
      ))
      or (p.marketing_consent_at is null and l.resend_contact_id is not null
        and (l.consent_observed_at is distinct from p.marketing_consent_at or l.last_sync_error_code is not null))
    ),
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'subject', c.subject,
        'preview_text', c.preview_text,
        'body_text', c.body_text,
        'status', c.status,
        'resend_broadcast_id', c.resend_broadcast_id,
        'recipient_count', c.recipient_count,
        'delivery_attempts', c.delivery_attempts,
        'delivery_started_at', c.delivery_started_at,
        'sent_at', c.sent_at,
        'failed_at', c.failed_at,
        'last_error_code', c.last_error_code,
        'created_at', c.created_at,
        'updated_at', c.updated_at
      ) order by c.created_at desc, c.id desc)
      from (
        select *
        from private.marketing_campaigns
        order by created_at desc, id desc
        limit 50
      ) c
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function api.create_marketing_campaign(
  p_name text,
  p_subject text,
  p_preview_text text,
  p_body_text text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('customers.manage');
  v_campaign_id uuid;
  v_name text := btrim(p_name);
  v_subject text := btrim(p_subject);
  v_preview_text text := nullif(btrim(p_preview_text), '');
  v_body_text text := btrim(p_body_text);
begin
  if char_length(v_name) not between 2 and 120
     or char_length(v_subject) not between 2 and 180
     or char_length(v_body_text) not between 2 and 12000
     or (v_preview_text is not null and char_length(v_preview_text) > 250) then
    raise exception using errcode = '22023', message = 'INVALID_MARKETING_CAMPAIGN';
  end if;

  insert into private.marketing_campaigns (
    name, subject, preview_text, body_text, created_by, updated_by
  ) values (
    v_name, v_subject, v_preview_text, v_body_text, v_actor, v_actor
  ) returning id into v_campaign_id;

  perform private.write_admin_audit(
    v_actor,
    'marketing.campaign_created',
    'marketing_campaign',
    v_campaign_id::text,
    jsonb_build_object('status', 'draft')
  );

  return v_campaign_id;
end;
$$;

create or replace function api.update_marketing_campaign(
  p_campaign_id uuid,
  p_name text,
  p_subject text,
  p_preview_text text,
  p_body_text text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('customers.manage');
  v_name text := btrim(p_name);
  v_subject text := btrim(p_subject);
  v_preview_text text := nullif(btrim(p_preview_text), '');
  v_body_text text := btrim(p_body_text);
begin
  if char_length(v_name) not between 2 and 120
     or char_length(v_subject) not between 2 and 180
     or char_length(v_body_text) not between 2 and 12000
     or (v_preview_text is not null and char_length(v_preview_text) > 250) then
    raise exception using errcode = '22023', message = 'INVALID_MARKETING_CAMPAIGN';
  end if;

  update private.marketing_campaigns
  set name = v_name,
      subject = v_subject,
      preview_text = v_preview_text,
      body_text = v_body_text,
      updated_by = v_actor
  where id = p_campaign_id and status = 'draft';

  if not found then
    if not exists (select 1 from private.marketing_campaigns where id = p_campaign_id) then
      raise exception using errcode = 'P0002', message = 'MARKETING_CAMPAIGN_NOT_FOUND';
    end if;
    raise exception using errcode = '23514', message = 'MARKETING_CAMPAIGN_NOT_EDITABLE';
  end if;

  perform private.write_admin_audit(
    v_actor,
    'marketing.campaign_updated',
    'marketing_campaign',
    p_campaign_id::text,
    '{}'::jsonb
  );
end;
$$;

create or replace function api.begin_marketing_campaign_send(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('customers.manage');
  v_campaign private.marketing_campaigns%rowtype;
  v_recipient_count integer;
  v_pending_sync_count integer;
begin
  select * into v_campaign
  from private.marketing_campaigns
  where id = p_campaign_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'MARKETING_CAMPAIGN_NOT_FOUND';
  end if;
  if v_campaign.status not in ('draft', 'failed') then
    raise exception using errcode = '23514', message = 'MARKETING_CAMPAIGN_NOT_SENDABLE';
  end if;

  select count(*)::integer into v_recipient_count
  from app.profiles
  where marketing_consent_at is not null;

  -- Sending is server-mediated, but this guard also keeps a direct RPC caller
  -- from mailing an audience whose Resend consent state has not been reconciled.
  select count(*)::integer into v_pending_sync_count
  from app.profiles p
  left join private.marketing_contact_links l on l.user_id = p.user_id
  where (p.marketing_consent_at is not null and (
    l.user_id is null
    or l.consent_observed_at is distinct from p.marketing_consent_at
    or l.last_sync_error_code is not null
  ))
  or (p.marketing_consent_at is null and l.resend_contact_id is not null
    and (
      l.consent_observed_at is distinct from p.marketing_consent_at
      or l.last_sync_error_code is not null
    ));

  if v_pending_sync_count > 0 then
    raise exception using errcode = '23514', message = 'MARKETING_AUDIENCE_SYNC_REQUIRED';
  end if;

  update private.marketing_campaigns
  set status = 'sending',
      recipient_count = v_recipient_count,
      delivery_attempts = delivery_attempts + 1,
      delivery_started_at = now(),
      failed_at = null,
      last_error_code = null,
      updated_by = v_actor
  where id = p_campaign_id
  returning * into v_campaign;

  perform private.write_admin_audit(
    v_actor,
    'marketing.campaign_delivery_started',
    'marketing_campaign',
    p_campaign_id::text,
    jsonb_build_object('recipient_count', v_recipient_count)
  );

  return jsonb_build_object(
    'id', v_campaign.id,
    'name', v_campaign.name,
    'subject', v_campaign.subject,
    'preview_text', v_campaign.preview_text,
    'body_text', v_campaign.body_text,
    'resend_broadcast_id', v_campaign.resend_broadcast_id,
    'recipient_count', v_campaign.recipient_count
  );
end;
$$;

create or replace function api.record_marketing_campaign_broadcast(
  p_campaign_id uuid,
  p_resend_broadcast_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('customers.manage');
  v_broadcast_id text := btrim(p_resend_broadcast_id);
begin
  if v_broadcast_id !~ '^[A-Za-z0-9_-]{3,128}$' then
    raise exception using errcode = '22023', message = 'INVALID_RESEND_BROADCAST_ID';
  end if;

  update private.marketing_campaigns
  set resend_broadcast_id = v_broadcast_id,
      updated_by = v_actor
  where id = p_campaign_id
    and status = 'sending'
    and (resend_broadcast_id is null or resend_broadcast_id = v_broadcast_id);

  if not found then
    raise exception using errcode = '23514', message = 'MARKETING_CAMPAIGN_DELIVERY_STATE_CHANGED';
  end if;
end;
$$;

create or replace function api.finish_marketing_campaign_send(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('customers.manage');
begin
  update private.marketing_campaigns
  set status = 'sent',
      sent_at = now(),
      failed_at = null,
      last_error_code = null,
      updated_by = v_actor
  where id = p_campaign_id
    and status = 'sending'
    and resend_broadcast_id is not null;

  if not found then
    raise exception using errcode = '23514', message = 'MARKETING_CAMPAIGN_DELIVERY_STATE_CHANGED';
  end if;

  perform private.write_admin_audit(
    v_actor,
    'marketing.campaign_sent',
    'marketing_campaign',
    p_campaign_id::text,
    '{}'::jsonb
  );
end;
$$;

create or replace function api.fail_marketing_campaign_send(
  p_campaign_id uuid,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('customers.manage');
  v_error_code text := upper(btrim(p_error_code));
begin
  if v_error_code !~ '^[A-Z0-9_:-]{2,80}$' then
    raise exception using errcode = '22023', message = 'INVALID_MARKETING_ERROR_CODE';
  end if;

  update private.marketing_campaigns
  set status = 'failed',
      failed_at = now(),
      last_error_code = v_error_code,
      updated_by = v_actor
  where id = p_campaign_id and status = 'sending';

  if not found then
    raise exception using errcode = '23514', message = 'MARKETING_CAMPAIGN_DELIVERY_STATE_CHANGED';
  end if;

  perform private.write_admin_audit(
    v_actor,
    'marketing.campaign_delivery_failed',
    'marketing_campaign',
    p_campaign_id::text,
    jsonb_build_object('error_code', v_error_code)
  );
end;
$$;

create or replace function api.cancel_marketing_campaign(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('customers.manage');
begin
  update private.marketing_campaigns
  set status = 'cancelled',
      updated_by = v_actor
  where id = p_campaign_id and status in ('draft', 'failed');

  if not found then
    if not exists (select 1 from private.marketing_campaigns where id = p_campaign_id) then
      raise exception using errcode = 'P0002', message = 'MARKETING_CAMPAIGN_NOT_FOUND';
    end if;
    raise exception using errcode = '23514', message = 'MARKETING_CAMPAIGN_NOT_CANCELLABLE';
  end if;

  perform private.write_admin_audit(
    v_actor,
    'marketing.campaign_cancelled',
    'marketing_campaign',
    p_campaign_id::text,
    '{}'::jsonb
  );
end;
$$;

create or replace function api.list_marketing_sync_candidates(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_limit not between 1 and 250 then
    raise exception using errcode = '22023', message = 'INVALID_SYNC_LIMIT';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', source.user_id,
      'display_name', source.display_name,
      'marketing_consent_at', source.marketing_consent_at,
      'resend_contact_id', source.resend_contact_id,
      'consent_observed_at', source.consent_observed_at
    ) order by source.updated_at, source.user_id)
    from (
      select p.user_id,
             p.display_name,
             p.marketing_consent_at,
             l.resend_contact_id,
             l.consent_observed_at,
             greatest(p.updated_at, coalesce(l.updated_at, p.updated_at)) as updated_at
      from app.profiles p
      left join private.marketing_contact_links l on l.user_id = p.user_id
      where (p.marketing_consent_at is not null and (
          l.user_id is null
          or l.consent_observed_at is distinct from p.marketing_consent_at
          or l.last_sync_error_code is not null
        ))
        or (p.marketing_consent_at is null and l.resend_contact_id is not null
          and (l.consent_observed_at is distinct from p.marketing_consent_at or l.last_sync_error_code is not null))
      order by greatest(p.updated_at, coalesce(l.updated_at, p.updated_at)), p.user_id
      limit p_limit
    ) source
  ), '[]'::jsonb);
end;
$$;

create or replace function api.mark_marketing_contact_sync_error(
  p_user_id uuid,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_error_code text := upper(btrim(p_error_code));
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if v_error_code !~ '^[A-Z0-9_:-]{2,80}$' then
    raise exception using errcode = '22023', message = 'INVALID_MARKETING_ERROR_CODE';
  end if;

  update private.marketing_contact_links
  set last_sync_error_code = v_error_code
  where user_id = p_user_id;

  if not found then
    insert into private.marketing_contact_links (
      user_id,
      resend_contact_id,
      consent_observed_at,
      last_sync_error_code
    )
    select p.user_id,
           null,
           null,
           v_error_code
    from app.profiles p
    where p.user_id = p_user_id;
  end if;
end;
$$;

create or replace function api.upsert_marketing_contact_link(
  p_user_id uuid,
  p_resend_contact_id text,
  p_consent_observed_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact_id text := btrim(p_resend_contact_id);
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if v_contact_id !~ '^[A-Za-z0-9_-]{3,128}$' then
    raise exception using errcode = '22023', message = 'INVALID_RESEND_CONTACT_ID';
  end if;

  insert into private.marketing_contact_links (
    user_id,
    resend_contact_id,
    consent_observed_at,
    consent_synced_at,
    last_sync_error_code
  ) values (
    p_user_id,
    v_contact_id,
    p_consent_observed_at,
    now(),
    null
  ) on conflict (user_id) do update
  set resend_contact_id = excluded.resend_contact_id,
      consent_observed_at = excluded.consent_observed_at,
      consent_synced_at = excluded.consent_synced_at,
      last_sync_error_code = null;
end;
$$;

revoke all on function api.set_my_marketing_consent(boolean) from public, anon;
revoke all on function api.get_marketing_snapshot() from public, anon;
revoke all on function api.create_marketing_campaign(text, text, text, text) from public, anon;
revoke all on function api.update_marketing_campaign(uuid, text, text, text, text) from public, anon;
revoke all on function api.begin_marketing_campaign_send(uuid) from public, anon;
revoke all on function api.record_marketing_campaign_broadcast(uuid, text) from public, anon;
revoke all on function api.finish_marketing_campaign_send(uuid) from public, anon;
revoke all on function api.fail_marketing_campaign_send(uuid, text) from public, anon;
revoke all on function api.cancel_marketing_campaign(uuid) from public, anon;
revoke all on function api.list_marketing_sync_candidates(integer) from public, anon, authenticated;
revoke all on function api.upsert_marketing_contact_link(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function api.mark_marketing_contact_sync_error(uuid, text) from public, anon, authenticated;

grant execute on function api.set_my_marketing_consent(boolean) to authenticated, service_role;
grant execute on function api.get_marketing_snapshot() to authenticated, service_role;
grant execute on function api.create_marketing_campaign(text, text, text, text) to authenticated, service_role;
grant execute on function api.update_marketing_campaign(uuid, text, text, text, text) to authenticated, service_role;
grant execute on function api.begin_marketing_campaign_send(uuid) to authenticated, service_role;
grant execute on function api.record_marketing_campaign_broadcast(uuid, text) to authenticated, service_role;
grant execute on function api.finish_marketing_campaign_send(uuid) to authenticated, service_role;
grant execute on function api.fail_marketing_campaign_send(uuid, text) to authenticated, service_role;
grant execute on function api.cancel_marketing_campaign(uuid) to authenticated, service_role;
grant execute on function api.list_marketing_sync_candidates(integer) to service_role;
grant execute on function api.upsert_marketing_contact_link(uuid, text, timestamptz) to service_role;
grant execute on function api.mark_marketing_contact_sync_error(uuid, text) to service_role;
