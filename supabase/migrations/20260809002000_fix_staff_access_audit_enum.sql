-- Keep the staff-access audit insert type-safe. This is the same PostgreSQL
-- enum coercion correction as the launch-toggle fix, preserving all owner and
-- permission invariants for the first approved administrator.
create or replace function api.set_staff_access(
  p_user_id uuid,
  p_status app.staff_status,
  p_role_key app.app_role_code,
  p_suspended_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_old_status app.staff_status;
  v_role_id uuid;
  v_was_active_owner boolean;
  v_will_be_active_owner boolean;
  v_other_active_owners integer;
  v_reason text;
begin
  if not v_is_service and not private.current_staff_has_permission('staff.manage') then
    raise exception using errcode = '42501', message = 'STAFF_MANAGE_PERMISSION_REQUIRED';
  end if;
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'STAFF_USER_REQUIRED';
  end if;
  if p_status is null
     or p_status not in ('active'::app.staff_status, 'suspended'::app.staff_status) then
    raise exception using errcode = '22023', message = 'INVALID_MANAGED_STAFF_STATUS';
  end if;
  if p_role_key is null then
    raise exception using errcode = '22023', message = 'EXACT_STAFF_ROLE_REQUIRED';
  end if;

  v_reason := nullif(btrim(coalesce(p_suspended_reason, '')), '');
  if p_status = 'suspended' and (
    v_reason is null or char_length(v_reason) not between 2 and 240
  ) then
    raise exception using errcode = '22023', message = 'SUSPENSION_REASON_REQUIRED';
  end if;

  select sm.status
  into v_old_status
  from app.staff_members sm
  where sm.user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_REQUEST_NOT_FOUND';
  end if;

  select r.id
  into v_role_id
  from app.roles r
  where r.code = p_role_key;

  if not found then
    raise exception using errcode = '22023', message = 'INVALID_ROLE';
  end if;

  perform 1
  from app.roles r
  where r.code = 'owner'
  for update;

  select exists (
    select 1
    from app.staff_role_assignments sra
    join app.roles r on r.id = sra.role_id
    where sra.user_id = p_user_id
      and r.code = 'owner'
      and v_old_status = 'active'
  ) into v_was_active_owner;

  v_will_be_active_owner := p_status = 'active' and p_role_key = 'owner';

  if v_was_active_owner and not v_will_be_active_owner then
    select count(*)::integer
    into v_other_active_owners
    from app.staff_members sm
    join app.staff_role_assignments sra on sra.user_id = sm.user_id
    join app.roles r on r.id = sra.role_id
    where sm.status = 'active'
      and r.code = 'owner'
      and sm.user_id <> p_user_id;

    if v_other_active_owners = 0 then
      raise exception using errcode = '23514', message = 'LAST_ACTIVE_OWNER_REQUIRED';
    end if;
  end if;

  update app.staff_members
  set status = p_status,
      approved_by = case when p_status = 'active' then v_actor else approved_by end,
      approved_at = case when p_status = 'active' then now() else approved_at end,
      suspended_reason = case when p_status = 'suspended' then v_reason else null end
  where user_id = p_user_id;

  delete from app.staff_role_assignments
  where user_id = p_user_id;

  insert into app.staff_role_assignments (user_id, role_id, assigned_by)
  values (p_user_id, v_role_id, v_actor);

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
    'staff.access_updated',
    'staff_member',
    p_user_id::text,
    jsonb_build_object('status', p_status, 'role_key', p_role_key)
  );

  return jsonb_build_object(
    'staff_id', p_user_id,
    'status', p_status,
    'role_key', p_role_key
  );
end;
$$;

revoke all on function api.set_staff_access(
  uuid, app.staff_status, app.app_role_code, text
) from public, anon;
grant execute on function api.set_staff_access(
  uuid, app.staff_status, app.app_role_code, text
) to authenticated, service_role;
