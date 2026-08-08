create or replace view api.my_order_history
with (security_invoker = true)
as
select
  o.id,
  o.order_reference,
  o.mode,
  o.status,
  o.version,
  o.grand_total_minor,
  o.currency_code,
  o.placed_at,
  o.completed_at,
  coalesce((
    select sum(oi.quantity)::integer
    from app.order_items oi
    where oi.order_id = o.id
  ), 0) as item_count
from app.orders o
where o.user_id = (select auth.uid());

grant select on api.my_order_history to authenticated;
