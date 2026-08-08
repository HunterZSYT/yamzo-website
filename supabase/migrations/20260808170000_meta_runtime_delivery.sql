-- Runtime delivery for the existing write-only Meta Pixel/CAPI configuration.
--
-- Browser code can retrieve only the public Pixel ID through a service-role
-- server component. CAPI workers claim live delivered-order events with a
-- short-lived opaque token; Vault plaintext and order PII never enter public
-- schemas, browser roles, audit rows, or the durable outbox payload.

alter table private.outbox_events
  add column processing_token_hash bytea,
  add column processing_expires_at timestamptz;

alter table private.outbox_events
  add constraint outbox_processing_token_hash_length
  check (
    processing_token_hash is null
    or octet_length(processing_token_hash) = 32
  ),
  add constraint outbox_processing_lease_consistent
  check (
    (
      processing_token_hash is null
      and processing_expires_at is null
    )
    or (
      processing_token_hash is not null
      and claimed_at is not null
      and processing_expires_at is not null
      and processing_expires_at > claimed_at
    )
  );

create unique index outbox_meta_purchase_order_unique
  on private.outbox_events (aggregate_id)
  where event_kind = 'meta.purchase' and mode = 'live';

create index outbox_meta_processing_lease
  on private.outbox_events (processing_expires_at, id)
  where event_kind = 'meta.purchase'
    and mode = 'live'
    and status = 'processing';

create or replace function api.get_meta_pixel_runtime_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enabled boolean := false;
  v_pixel_id text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  select
    i.enabled
      and i.vault_secret_id is not null
      and coalesce(i.public_config ->> 'pixel_id', '') ~ '^[0-9]{5,32}$',
    i.public_config ->> 'pixel_id'
  into v_enabled, v_pixel_id
  from private.integration_settings i
  where i.kind = 'meta_capi';

  if not coalesce(v_enabled, false) then
    return jsonb_build_object(
      'enabled', false,
      'pixel_id', null,
      'consent_required', true
    );
  end if;

  return jsonb_build_object(
    'enabled', true,
    'pixel_id', v_pixel_id,
    'consent_required', true
  );
end;
$$;

comment on function api.get_meta_pixel_runtime_config() is
  'Service-only read of public Pixel runtime state. Never reads or returns Vault plaintext.';

revoke all on function api.get_meta_pixel_runtime_config()
  from public, anon, authenticated;
grant execute on function api.get_meta_pixel_runtime_config()
  to service_role;

create or replace function api.claim_meta_purchase_events(
  p_limit integer default 5,
  p_claim_seconds integer default 120
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pixel_id text;
  v_access_token text;
  v_event record;
  v_claim_token text;
  v_result jsonb := '[]'::jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_limit not between 1 and 10
     or p_claim_seconds not between 30 and 300 then
    raise exception using errcode = '22023', message = 'INVALID_META_CLAIM_LIMIT';
  end if;

  select i.public_config ->> 'pixel_id', d.decrypted_secret
  into v_pixel_id, v_access_token
  from private.integration_settings i
  join vault.decrypted_secrets d on d.id = i.vault_secret_id
  where i.kind = 'meta_capi'
    and i.enabled
    and i.vault_secret_id is not null;

  -- Disabled or incomplete configuration is deliberately fail-closed. Events
  -- stay pending so enabling the integration later can resume delivery.
  if coalesce(v_pixel_id, '') !~ '^[0-9]{5,32}$'
     or char_length(coalesce(v_access_token, '')) not between 20 and 2048
     or v_access_token ~ '[[:space:]]' then
    return v_result;
  end if;

  -- Meta accepts server events for at most seven days. Stop retrying just
  -- before that boundary rather than repeatedly sending a known-invalid event.
  update private.outbox_events e
  set status = 'discarded',
      completed_at = now(),
      processing_token_hash = null,
      processing_expires_at = null,
      last_error_code = 'META_EVENT_EXPIRED'
  where e.event_kind = 'meta.purchase'
    and e.mode = 'live'
    and e.status in ('pending', 'failed', 'processing')
    and e.created_at < now() - interval '6 days 23 hours';

  update private.outbox_events e
  set status = 'discarded',
      completed_at = now(),
      processing_token_hash = null,
      processing_expires_at = null,
      last_error_code = 'META_MAX_ATTEMPTS'
  where e.event_kind = 'meta.purchase'
    and e.mode = 'live'
    and (
      e.status in ('pending', 'failed')
      or (
        e.status = 'processing'
        and coalesce(
          e.processing_expires_at,
          e.claimed_at + make_interval(secs => p_claim_seconds)
        ) <= now()
      )
    )
    and e.attempts >= 7;

  for v_event in
    select
      e.id as outbox_id,
      e.attempts,
      o.order_reference,
      o.user_id,
      o.grand_total_minor,
      o.currency_code,
      o.completed_at,
      c.full_name,
      c.phone_e164,
      coalesce(items.contents, '[]'::jsonb) as contents,
      coalesce(items.num_items, 0) as num_items
    from private.outbox_events e
    join app.orders o on o.id = e.aggregate_id
    join private.order_contacts c on c.order_id = o.id
    left join lateral (
      select
        jsonb_agg(
          jsonb_build_object(
            'id', mi.public_key,
            'quantity', oi.quantity,
            'item_price_minor', oi.unit_price_minor + oi.modifier_unit_total_minor
          ) order by oi.sort_order, oi.id
        ) filter (where mi.public_key is not null) as contents,
        sum(oi.quantity)::integer as num_items
      from app.order_items oi
      left join app.menu_items mi on mi.id = oi.source_item_id
      where oi.order_id = o.id
    ) items on true
    where e.event_kind = 'meta.purchase'
      and e.mode = 'live'
      and o.mode = 'live'
      and o.status = 'delivered'
      and o.completed_at is not null
      and e.attempts < 7
      and e.available_at <= now()
      and (
        e.status in ('pending', 'failed')
        or (
          e.status = 'processing'
          and coalesce(
            e.processing_expires_at,
            e.claimed_at + make_interval(secs => p_claim_seconds)
          ) <= now()
        )
      )
    order by e.available_at, e.id
    limit p_limit
    for update of e skip locked
  loop
    v_claim_token := private.generate_url_token();

    update private.outbox_events
    set status = 'processing',
        attempts = attempts + 1,
        claimed_at = now(),
        completed_at = null,
        processing_token_hash = extensions.digest(v_claim_token, 'sha256'),
        processing_expires_at = now() + make_interval(secs => p_claim_seconds),
        last_error_code = null
    where id = v_event.outbox_id;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'outbox_id', v_event.outbox_id,
      'claim_token', v_claim_token,
      'attempt', v_event.attempts + 1,
      'pixel_id', v_pixel_id,
      'access_token', v_access_token,
      'event_id', 'purchase-' || v_event.order_reference,
      'event_time', floor(extract(epoch from v_event.completed_at))::bigint,
      'order_reference', v_event.order_reference,
      'user_id', v_event.user_id,
      'grand_total_minor', v_event.grand_total_minor,
      'currency_code', v_event.currency_code,
      'full_name', v_event.full_name,
      'phone_e164', v_event.phone_e164,
      'contents', v_event.contents,
      'num_items', v_event.num_items
    ));
  end loop;

  return v_result;
end;
$$;

comment on function api.claim_meta_purchase_events(integer, integer) is
  'Service-only CAPI outbox claim. Vault token and PII are returned only to the trusted server worker and are never persisted in the payload or audit log.';

revoke all on function api.claim_meta_purchase_events(integer, integer)
  from public, anon, authenticated;
grant execute on function api.claim_meta_purchase_events(integer, integer)
  to service_role;

create or replace function api.finish_meta_purchase_event(
  p_outbox_id bigint,
  p_claim_token text,
  p_succeeded boolean,
  p_error_code text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event private.outbox_events%rowtype;
  v_next_status app.outbox_status;
  v_retry_seconds integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_outbox_id is null
     or p_claim_token is null
     or char_length(p_claim_token) not between 32 and 128
     or p_succeeded is null
     or (
       not p_succeeded
       and coalesce(p_error_code, '') !~ '^[A-Z0-9_:-]{1,80}$'
     ) then
    raise exception using errcode = '22023', message = 'INVALID_META_FINISH_REQUEST';
  end if;

  select * into v_event
  from private.outbox_events e
  where e.id = p_outbox_id
    and e.event_kind = 'meta.purchase'
    and e.mode = 'live'
    and e.status = 'processing'
    and e.processing_expires_at > now()
    and private.secure_equals_32(
      e.processing_token_hash,
      extensions.digest(p_claim_token, 'sha256')
    )
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'INVALID_META_OUTBOX_CLAIM';
  end if;

  if p_succeeded then
    update private.outbox_events
    set status = 'completed',
        completed_at = now(),
        processing_token_hash = null,
        processing_expires_at = null,
        last_error_code = null
    where id = p_outbox_id;

    return jsonb_build_object('status', 'completed');
  end if;

  if v_event.attempts >= 7
     or v_event.created_at < now() - interval '6 days 23 hours' then
    v_next_status := 'discarded';
    v_retry_seconds := 0;
  else
    v_next_status := 'failed';
    v_retry_seconds := least(
      21600,
      60 * power(2, greatest(v_event.attempts - 1, 0))::integer
    );
  end if;

  update private.outbox_events
  set status = v_next_status,
      available_at = case
        when v_next_status = 'failed'
          then now() + make_interval(secs => v_retry_seconds)
        else available_at
      end,
      completed_at = case when v_next_status = 'discarded' then now() else null end,
      processing_token_hash = null,
      processing_expires_at = null,
      last_error_code = p_error_code
  where id = p_outbox_id;

  return jsonb_build_object(
    'status', v_next_status,
    'retry_after_seconds', v_retry_seconds
  );
end;
$$;

comment on function api.finish_meta_purchase_event(bigint, text, boolean, text) is
  'Service-only claim-token-guarded completion for Meta CAPI outbox attempts.';

revoke all on function api.finish_meta_purchase_event(bigint, text, boolean, text)
  from public, anon, authenticated;
grant execute on function api.finish_meta_purchase_event(bigint, text, boolean, text)
  to service_role;
