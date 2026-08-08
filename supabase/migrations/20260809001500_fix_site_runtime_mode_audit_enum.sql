-- The original runtime-mode function stored a text CASE expression in the
-- app.audit_actor_type enum column. Cast it explicitly so service launch
-- changes remain auditable and the narrow toggle RPC can complete.
create or replace function api.set_site_runtime_modes(
  p_published boolean,
  p_live_orders_enabled boolean,
  p_test_mode boolean
)
returns table (
  published boolean,
  live_orders_enabled boolean,
  test_mode boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
begin
  if not v_is_service and not private.current_staff_has_permission('site.manage') then
    raise exception using errcode = '42501', message = 'SITE_MANAGE_PERMISSION_REQUIRED';
  end if;
  if p_published is null or p_live_orders_enabled is null or p_test_mode is null then
    raise exception using errcode = '22023', message = 'RUNTIME_MODE_VALUES_REQUIRED';
  end if;
  if p_live_orders_enabled and p_test_mode then
    raise exception using errcode = '22023', message = 'LIVE_AND_TEST_MODE_ARE_MUTUALLY_EXCLUSIVE';
  end if;

  update app.site_runtime r
  set published = p_published,
      live_orders_enabled = p_live_orders_enabled,
      test_mode = p_test_mode,
      updated_by = v_actor
  where r.singleton;

  if not found then
    raise exception using errcode = '55000', message = 'SITE_RUNTIME_NOT_CONFIGURED';
  end if;

  insert into private.audit_log (
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    details
  ) values (
    (case when v_is_service then 'system' else 'staff' end)::app.audit_actor_type,
    v_actor,
    'site.runtime_modes_updated',
    'site_runtime',
    'singleton',
    jsonb_build_object(
      'published', p_published,
      'live_orders_enabled', p_live_orders_enabled,
      'test_mode', p_test_mode
    )
  );

  return query
  select r.published, r.live_orders_enabled, r.test_mode, r.updated_at
  from app.site_runtime r
  where r.singleton;
end;
$$;

revoke all on function api.set_site_runtime_modes(boolean, boolean, boolean)
  from public, anon;
grant execute on function api.set_site_runtime_modes(boolean, boolean, boolean)
  to authenticated, service_role;
