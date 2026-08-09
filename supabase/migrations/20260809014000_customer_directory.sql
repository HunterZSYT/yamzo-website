-- Protected customer directory. It deliberately keeps delivery addresses and
-- phone values out of browseable lists; staff can open the relevant order when
-- fulfilment details are needed.

create or replace function api.get_customer_directory(
  p_search text default null,
  p_limit integer default 40,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('customers.manage');
  v_search text := lower(nullif(btrim(p_search), ''));
begin
  if p_limit not between 1 and 100
     or p_offset not between 0 and 10000
     or (v_search is not null and char_length(v_search) > 120) then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_DIRECTORY_QUERY';
  end if;

  return jsonb_build_object(
    'total_count', (
      select count(*)::integer
      from app.profiles profile
      join auth.users account on account.id = profile.user_id
      where v_search is null
        or lower(coalesce(account.email, '')) like '%' || v_search || '%'
        or lower(coalesce(profile.display_name, '')) like '%' || v_search || '%'
    ),
    'customers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', source.user_id,
        'email', source.email,
        'email_confirmed', source.email_confirmed,
        'display_name', source.display_name,
        'preferred_locale', source.preferred_locale,
        'marketing_consent_at', source.marketing_consent_at,
        'contact_sync_state', source.contact_sync_state,
        'order_count', source.order_count,
        'last_order_at', source.last_order_at,
        'last_order_status', source.last_order_status,
        'phone_count', source.phone_count,
        'address_count', source.address_count,
        'created_at', source.created_at,
        'last_sign_in_at', source.last_sign_in_at
      ) order by source.last_order_at desc nulls last, source.created_at desc, source.user_id)
      from (
        select
          profile.user_id,
          account.email,
          account.email_confirmed_at is not null as email_confirmed,
          profile.display_name,
          profile.preferred_locale::text as preferred_locale,
          profile.marketing_consent_at,
          case
            when profile.marketing_consent_at is null then 'not_opted_in'
            when link.last_sync_error_code is not null then 'attention'
            when link.resend_contact_id is null then 'pending'
            when link.consent_observed_at is distinct from profile.marketing_consent_at then 'pending'
            else 'synced'
          end as contact_sync_state,
          order_counts.order_count,
          order_counts.last_order_at,
          last_order.last_order_status,
          phone_counts.phone_count,
          address_counts.address_count,
          account.created_at,
          account.last_sign_in_at
        from app.profiles profile
        join auth.users account on account.id = profile.user_id
        left join private.marketing_contact_links link on link.user_id = profile.user_id
        left join lateral (
          select count(*)::integer as order_count,
                 max(order_row.placed_at) as last_order_at
          from app.orders order_row
          where order_row.user_id = profile.user_id
        ) order_counts on true
        left join lateral (
          select order_row.status::text as last_order_status
          from app.orders order_row
          where order_row.user_id = profile.user_id
          order by order_row.placed_at desc, order_row.id desc
          limit 1
        ) last_order on true
        left join lateral (
          select count(*)::integer as phone_count
          from private.customer_phone_numbers phone
          where phone.user_id = profile.user_id
        ) phone_counts on true
        left join lateral (
          select count(*)::integer as address_count
          from private.customer_delivery_addresses address
          where address.user_id = profile.user_id
        ) address_counts on true
        where v_search is null
          or lower(coalesce(account.email, '')) like '%' || v_search || '%'
          or lower(coalesce(profile.display_name, '')) like '%' || v_search || '%'
        order by order_counts.last_order_at desc nulls last, account.created_at desc, profile.user_id
        limit p_limit
        offset p_offset
      ) source
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function api.get_customer_directory(text, integer, integer) from public, anon;
grant execute on function api.get_customer_directory(text, integer, integer) to authenticated, service_role;
