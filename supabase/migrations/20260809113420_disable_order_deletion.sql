-- Website orders are operational/audit records. They may be cancelled and
-- edited through the audited admin contract, but neither live nor test orders
-- may be deleted. This supersedes the former confirmed test-order delete path.

create or replace function private.guard_order_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'ORDER_DELETION_DISABLED';
  return old;
end;
$$;

revoke all on function private.guard_order_delete() from public, anon, authenticated;

-- Any website-order cancellation needs an explanatory status-event note. The
-- existing admin RPC first updates the order and then appends this event, so a
-- trigger failure rolls the entire transaction back.
create or replace function private.guard_website_order_cancellation_reason()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.to_status = 'cancelled'::app.order_status
     and new.from_status is distinct from 'cancelled'::app.order_status
     and exists (
       select 1
       from app.orders order_row
       where order_row.id = new.order_id
         and order_row.source = 'website'::app.order_source
     )
     and char_length(btrim(coalesce(new.note, ''))) not between 2 and 500 then
    raise exception using errcode = '22023', message = 'CANCELLATION_REASON_REQUIRED';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_website_order_cancellation_reason()
  from public, anon, authenticated;

create trigger order_status_events_guard_website_cancellation_reason
before insert on app.order_status_events
for each row execute function private.guard_website_order_cancellation_reason();

-- Keep the old API name only as a deterministic compatibility stub so stale
-- clients cannot create a tombstone/audit row before a delete attempt fails.
create or replace function api.hard_delete_test_order(
  p_order_id uuid,
  p_expected_reference text,
  p_reason_code text,
  p_confirmation text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'ORDER_DELETION_DISABLED';
  return false;
end;
$$;

revoke all on function api.hard_delete_test_order(uuid, text, text, text)
  from public, anon, authenticated, service_role;

comment on function api.hard_delete_test_order(uuid, text, text, text) is
  'Compatibility stub. All app.orders deletion is disabled; use audited cancellation instead.';

-- Retire the permission from every role. Historical tombstones remain intact
-- for audit purposes, but no new tombstone can be created because no order can
-- be hard-deleted.
delete from app.role_permissions where permission_code = 'orders.test_delete';

delete from app.permissions where code = 'orders.test_delete';

comment on table private.deleted_test_order_tombstones is
  'Historical non-PII evidence from the retired test-order deletion workflow. No new rows are written.';
