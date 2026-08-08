-- Protected admin read models and narrow, audited mutation contracts.
-- Browser roles never receive direct write grants on app/private tables.

create or replace function private.require_admin_permission(p_permission text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not private.current_staff_has_permission(p_permission) then
    raise exception using
      errcode = '42501',
      message = upper(replace(p_permission, '.', '_')) || '_PERMISSION_REQUIRED';
  end if;

  return v_actor;
end;
$$;

revoke all on function private.require_admin_permission(text)
  from public, anon, authenticated;

create or replace function private.write_admin_audit(
  p_actor uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into private.audit_log (
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    details
  ) values (
    'staff',
    p_actor,
    p_action,
    p_target_type,
    p_target_id,
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

revoke all on function private.write_admin_audit(uuid, text, text, text, jsonb)
  from public, anon, authenticated;

create or replace function api.get_admin_operations_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_can_manage_site boolean;
  v_can_manage_catalog boolean;
  v_can_manage_merchandising boolean;
  v_can_manage_integrations boolean;
begin
  if not private.is_active_staff() then
    raise exception using errcode = '42501', message = 'ACTIVE_STAFF_REQUIRED';
  end if;

  v_can_manage_site := private.current_staff_has_permission('site.manage');
  v_can_manage_catalog := private.current_staff_has_permission('catalog.manage');
  v_can_manage_merchandising := private.current_staff_has_permission('merchandising.manage');
  v_can_manage_integrations := private.current_staff_has_permission('integrations.manage');

  return jsonb_build_object(
    'business_hours', case when v_can_manage_site then coalesce((
      select jsonb_agg(jsonb_build_object(
        'day_of_week', h.day_of_week,
        'interval_number', h.interval_number,
        'opens_at', h.opens_at,
        'closes_at', h.closes_at,
        'is_closed', h.is_closed
      ) order by h.day_of_week, h.interval_number)
      from app.business_hours h
    ), '[]'::jsonb) else null end,
    'business_hour_exceptions', case when v_can_manage_site then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'service_date', e.service_date,
        'interval_number', e.interval_number,
        'opens_at', e.opens_at,
        'closes_at', e.closes_at,
        'is_closed', e.is_closed,
        'reason_en', e.reason_en,
        'reason_bn', e.reason_bn
      ) order by e.service_date, e.interval_number)
      from app.business_hour_exceptions e
      where e.service_date >= timezone('Asia/Dhaka', now())::date - 30
    ), '[]'::jsonb) else null end,
    'menu_categories', case when v_can_manage_catalog then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'slug', c.slug,
        'is_active', c.is_active,
        'is_featured', c.is_featured,
        'sort_order', c.sort_order,
        'name_en', en.name,
        'name_bn', bn.name,
        'description_en', en.description,
        'description_bn', bn.description
      ) order by c.sort_order, c.slug)
      from app.menu_categories c
      left join app.menu_category_translations en
        on en.category_id = c.id and en.locale = 'en'
      left join app.menu_category_translations bn
        on bn.category_id = c.id and bn.locale = 'bn'
    ), '[]'::jsonb) else null end,
    'menu_items', case when v_can_manage_catalog then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'slug', i.slug,
        'base_price_minor', i.base_price_minor,
        'compare_at_price_minor', i.compare_at_price_minor,
        'is_active', i.is_active,
        'is_available', i.is_available,
        'is_featured', i.is_featured,
        'preparation_minutes', i.preparation_minutes,
        'sort_order', i.sort_order,
        'name_en', en.name,
        'name_bn', bn.name,
        'description_en', en.description,
        'description_bn', bn.description
      ) order by i.sort_order, i.slug)
      from app.menu_items i
      left join app.menu_item_translations en
        on en.item_id = i.id and en.locale = 'en'
      left join app.menu_item_translations bn
        on bn.item_id = i.id and bn.locale = 'bn'
    ), '[]'::jsonb) else null end,
    'modifier_groups', case when v_can_manage_catalog then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'slug', g.slug,
        'minimum_selections', g.minimum_selections,
        'maximum_selections', g.maximum_selections,
        'presentation', g.presentation,
        'is_active', g.is_active,
        'sort_order', g.sort_order,
        'name_en', en.name,
        'name_bn', bn.name,
        'description_en', en.description,
        'description_bn', bn.description
      ) order by g.sort_order, g.slug)
      from app.modifier_groups g
      left join app.modifier_group_translations en
        on en.group_id = g.id and en.locale = 'en'
      left join app.modifier_group_translations bn
        on bn.group_id = g.id and bn.locale = 'bn'
    ), '[]'::jsonb) else null end,
    'modifier_options', case when v_can_manage_catalog then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'group_id', o.group_id,
        'price_delta_minor', o.price_delta_minor,
        'is_active', o.is_active,
        'sort_order', o.sort_order,
        'name_en', en.name,
        'name_bn', bn.name
      ) order by o.group_id, o.sort_order, o.id)
      from app.modifier_options o
      left join app.modifier_option_translations en
        on en.option_id = o.id and en.locale = 'en'
      left join app.modifier_option_translations bn
        on bn.option_id = o.id and bn.locale = 'bn'
    ), '[]'::jsonb) else null end,
    'banners', case when v_can_manage_merchandising then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'placement', b.placement,
        'media_id', b.media_id,
        'action_url', b.action_url,
        'is_active', b.is_active,
        'starts_at', b.starts_at,
        'ends_at', b.ends_at,
        'sort_order', b.sort_order,
        'eyebrow_en', en.eyebrow,
        'eyebrow_bn', bn.eyebrow,
        'title_en', en.title,
        'title_bn', bn.title,
        'body_en', en.body,
        'body_bn', bn.body,
        'action_label_en', en.action_label,
        'action_label_bn', bn.action_label
      ) order by b.sort_order, b.id)
      from app.banners b
      left join app.banner_translations en
        on en.banner_id = b.id and en.locale = 'en'
      left join app.banner_translations bn
        on bn.banner_id = b.id and bn.locale = 'bn'
    ), '[]'::jsonb) else null end,
    'offers', case when v_can_manage_merchandising then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'code', o.code,
        'kind', o.kind,
        'value', o.value,
        'maximum_discount_minor', o.maximum_discount_minor,
        'minimum_subtotal_minor', o.minimum_subtotal_minor,
        'is_active', o.is_active,
        'is_stackable', o.is_stackable,
        'starts_at', o.starts_at,
        'ends_at', o.ends_at,
        'priority', o.priority,
        'name_en', en.name,
        'name_bn', bn.name,
        'description_en', en.description,
        'description_bn', bn.description,
        'terms_en', en.terms,
        'terms_bn', bn.terms,
        'targets', coalesce(targets.value, '[]'::jsonb)
      ) order by o.priority desc, o.id)
      from app.offers o
      left join app.offer_translations en
        on en.offer_id = o.id and en.locale = 'en'
      left join app.offer_translations bn
        on bn.offer_id = o.id and bn.locale = 'bn'
      left join lateral (
        select jsonb_agg(jsonb_build_object(
          'target_kind', t.target_kind,
          'target_id', coalesce(t.category_id, t.item_id)
        ) order by t.target_kind, coalesce(t.category_id, t.item_id)) as value
        from app.offer_targets t
        where t.offer_id = o.id
      ) targets on true
    ), '[]'::jsonb) else null end,
    'home_sections', case when v_can_manage_merchandising then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'section_key', s.section_key,
        'kind', s.kind,
        'is_active', s.is_active,
        'sort_order', s.sort_order,
        'title_en', en.title,
        'title_bn', bn.title,
        'subtitle_en', en.subtitle,
        'subtitle_bn', bn.subtitle
      ) order by s.sort_order, s.section_key)
      from app.home_sections s
      left join app.home_section_translations en
        on en.section_id = s.id and en.locale = 'en'
      left join app.home_section_translations bn
        on bn.section_id = s.id and bn.locale = 'bn'
    ), '[]'::jsonb) else null end,
    'meta', case when v_can_manage_integrations then (
      select jsonb_build_object(
        'enabled', i.enabled,
        'pixel_id', i.public_config ->> 'pixel_id',
        'token_configured', i.vault_secret_id is not null,
        'updated_at', i.updated_at
      )
      from private.integration_settings i
      where i.kind = 'meta_capi'
    ) else null end
  );
end;
$$;

revoke all on function api.get_admin_operations_snapshot() from public, anon;
grant execute on function api.get_admin_operations_snapshot() to authenticated;

create or replace function api.set_business_hour(
  p_day_of_week smallint,
  p_interval_number smallint,
  p_opens_at time,
  p_closes_at time,
  p_is_closed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('site.manage');
begin
  if p_day_of_week not between 0 and 6
     or p_interval_number not between 1 and 4
     or p_is_closed is null
     or (not p_is_closed and (
       p_opens_at is null or p_closes_at is null or p_opens_at = p_closes_at
     )) then
    raise exception using errcode = '22023', message = 'INVALID_BUSINESS_HOUR';
  end if;

  insert into app.business_hours (
    day_of_week, interval_number, opens_at, closes_at, is_closed
  ) values (
    p_day_of_week,
    p_interval_number,
    case when p_is_closed then null else p_opens_at end,
    case when p_is_closed then null else p_closes_at end,
    p_is_closed
  )
  on conflict (day_of_week, interval_number) do update
  set opens_at = excluded.opens_at,
      closes_at = excluded.closes_at,
      is_closed = excluded.is_closed;

  perform private.write_admin_audit(
    v_actor,
    'site.business_hour_updated',
    'business_hour',
    p_day_of_week::text || ':' || p_interval_number::text,
    jsonb_build_object('is_closed', p_is_closed)
  );

  return jsonb_build_object(
    'day_of_week', p_day_of_week,
    'interval_number', p_interval_number,
    'is_closed', p_is_closed
  );
end;
$$;

revoke all on function api.set_business_hour(smallint, smallint, time, time, boolean)
  from public, anon;
grant execute on function api.set_business_hour(smallint, smallint, time, time, boolean)
  to authenticated, service_role;

create or replace function api.upsert_business_hour_exception(
  p_id uuid,
  p_service_date date,
  p_interval_number smallint,
  p_opens_at time,
  p_closes_at time,
  p_is_closed boolean,
  p_reason_en text default null,
  p_reason_bn text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('site.manage');
  v_id uuid;
begin
  if p_service_date is null
     or p_interval_number not between 1 and 4
     or p_is_closed is null
     or char_length(coalesce(p_reason_en, '')) > 240
     or char_length(coalesce(p_reason_bn, '')) > 240
     or (not p_is_closed and (
       p_opens_at is null or p_closes_at is null or p_opens_at = p_closes_at
     )) then
    raise exception using errcode = '22023', message = 'INVALID_BUSINESS_HOUR_EXCEPTION';
  end if;

  if p_id is null then
    insert into app.business_hour_exceptions (
      service_date, interval_number, opens_at, closes_at, is_closed,
      reason_en, reason_bn
    ) values (
      p_service_date,
      p_interval_number,
      case when p_is_closed then null else p_opens_at end,
      case when p_is_closed then null else p_closes_at end,
      p_is_closed,
      nullif(btrim(coalesce(p_reason_en, '')), ''),
      nullif(btrim(coalesce(p_reason_bn, '')), '')
    )
    on conflict (service_date, interval_number) do update
    set opens_at = excluded.opens_at,
        closes_at = excluded.closes_at,
        is_closed = excluded.is_closed,
        reason_en = excluded.reason_en,
        reason_bn = excluded.reason_bn
    returning id into v_id;
  else
    update app.business_hour_exceptions
    set service_date = p_service_date,
        interval_number = p_interval_number,
        opens_at = case when p_is_closed then null else p_opens_at end,
        closes_at = case when p_is_closed then null else p_closes_at end,
        is_closed = p_is_closed,
        reason_en = nullif(btrim(coalesce(p_reason_en, '')), ''),
        reason_bn = nullif(btrim(coalesce(p_reason_bn, '')), '')
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception using errcode = 'P0002', message = 'BUSINESS_HOUR_EXCEPTION_NOT_FOUND';
    end if;
  end if;

  perform private.write_admin_audit(
    v_actor,
    'site.business_hour_exception_saved',
    'business_hour_exception',
    v_id::text,
    jsonb_build_object('service_date', p_service_date, 'is_closed', p_is_closed)
  );

  return v_id;
end;
$$;

revoke all on function api.upsert_business_hour_exception(
  uuid, date, smallint, time, time, boolean, text, text
) from public, anon;
grant execute on function api.upsert_business_hour_exception(
  uuid, date, smallint, time, time, boolean, text, text
) to authenticated, service_role;

create or replace function api.delete_business_hour_exception(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('site.manage');
begin
  delete from app.business_hour_exceptions where id = p_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'BUSINESS_HOUR_EXCEPTION_NOT_FOUND';
  end if;

  perform private.write_admin_audit(
    v_actor,
    'site.business_hour_exception_deleted',
    'business_hour_exception',
    p_id::text
  );
  return true;
end;
$$;

revoke all on function api.delete_business_hour_exception(uuid) from public, anon;
grant execute on function api.delete_business_hour_exception(uuid)
  to authenticated, service_role;

create or replace function api.update_menu_category_admin(
  p_category_id uuid,
  p_is_active boolean,
  p_is_featured boolean,
  p_sort_order integer,
  p_name_en text,
  p_name_bn text,
  p_description_en text default null,
  p_description_bn text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('catalog.manage');
begin
  if p_category_id is null
     or p_is_active is null
     or p_is_featured is null
     or p_sort_order not between -100000 and 100000
     or char_length(btrim(coalesce(p_name_en, ''))) not between 1 and 100
     or char_length(btrim(coalesce(p_name_bn, ''))) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'INVALID_MENU_CATEGORY_VALUES';
  end if;

  update app.menu_categories
  set is_active = p_is_active,
      is_featured = p_is_featured,
      sort_order = p_sort_order
  where id = p_category_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'MENU_CATEGORY_NOT_FOUND';
  end if;

  insert into app.menu_category_translations (category_id, locale, name, description)
  values
    (p_category_id, 'en', btrim(p_name_en), nullif(btrim(coalesce(p_description_en, '')), '')),
    (p_category_id, 'bn', btrim(p_name_bn), nullif(btrim(coalesce(p_description_bn, '')), ''))
  on conflict (category_id, locale) do update
  set name = excluded.name, description = excluded.description;

  perform private.write_admin_audit(
    v_actor, 'catalog.category_updated', 'menu_category', p_category_id::text,
    jsonb_build_object('is_active', p_is_active, 'sort_order', p_sort_order)
  );
  return true;
end;
$$;

revoke all on function api.update_menu_category_admin(
  uuid, boolean, boolean, integer, text, text, text, text
) from public, anon;
grant execute on function api.update_menu_category_admin(
  uuid, boolean, boolean, integer, text, text, text, text
) to authenticated, service_role;

create or replace function api.update_menu_item_admin(
  p_item_id uuid,
  p_is_active boolean,
  p_is_available boolean,
  p_is_featured boolean,
  p_base_price_minor integer,
  p_compare_at_price_minor integer,
  p_preparation_minutes smallint,
  p_sort_order integer,
  p_name_en text,
  p_name_bn text,
  p_description_en text default null,
  p_description_bn text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('catalog.manage');
begin
  if p_item_id is null
     or p_is_active is null
     or p_is_available is null
     or p_is_featured is null
     or p_base_price_minor < 0
     or (p_compare_at_price_minor is not null and p_compare_at_price_minor <= p_base_price_minor)
     or (p_preparation_minutes is not null and p_preparation_minutes not between 1 and 240)
     or p_sort_order not between -100000 and 100000
     or char_length(btrim(coalesce(p_name_en, ''))) not between 1 and 160
     or char_length(btrim(coalesce(p_name_bn, ''))) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'INVALID_MENU_ITEM_VALUES';
  end if;

  update app.menu_items
  set is_active = p_is_active,
      is_available = p_is_available,
      is_featured = p_is_featured,
      base_price_minor = p_base_price_minor,
      compare_at_price_minor = p_compare_at_price_minor,
      preparation_minutes = p_preparation_minutes,
      sort_order = p_sort_order
  where id = p_item_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'MENU_ITEM_NOT_FOUND';
  end if;

  insert into app.menu_item_translations (item_id, locale, name, description)
  values
    (p_item_id, 'en', btrim(p_name_en), nullif(btrim(coalesce(p_description_en, '')), '')),
    (p_item_id, 'bn', btrim(p_name_bn), nullif(btrim(coalesce(p_description_bn, '')), ''))
  on conflict (item_id, locale) do update
  set name = excluded.name, description = excluded.description;

  perform private.write_admin_audit(
    v_actor, 'catalog.item_updated', 'menu_item', p_item_id::text,
    jsonb_build_object(
      'is_active', p_is_active,
      'is_available', p_is_available,
      'base_price_minor', p_base_price_minor,
      'sort_order', p_sort_order
    )
  );
  return true;
end;
$$;

revoke all on function api.update_menu_item_admin(
  uuid, boolean, boolean, boolean, integer, integer, smallint, integer,
  text, text, text, text
) from public, anon;
grant execute on function api.update_menu_item_admin(
  uuid, boolean, boolean, boolean, integer, integer, smallint, integer,
  text, text, text, text
) to authenticated, service_role;

create or replace function api.update_modifier_group_admin(
  p_group_id uuid,
  p_is_active boolean,
  p_minimum_selections smallint,
  p_maximum_selections smallint,
  p_presentation text,
  p_sort_order integer,
  p_name_en text,
  p_name_bn text,
  p_description_en text default null,
  p_description_bn text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('catalog.manage');
begin
  if p_group_id is null
     or p_is_active is null
     or p_minimum_selections not between 0 and 20
     or p_maximum_selections not between 1 and 20
     or p_minimum_selections > p_maximum_selections
     or p_presentation not in ('modifier', 'variant')
     or (p_presentation = 'variant' and (
       p_minimum_selections <> 1 or p_maximum_selections <> 1
     ))
     or p_sort_order not between -100000 and 100000
     or char_length(btrim(coalesce(p_name_en, ''))) not between 1 and 120
     or char_length(btrim(coalesce(p_name_bn, ''))) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'INVALID_MODIFIER_GROUP_VALUES';
  end if;

  update app.modifier_groups
  set is_active = p_is_active,
      minimum_selections = p_minimum_selections,
      maximum_selections = p_maximum_selections,
      presentation = p_presentation,
      sort_order = p_sort_order
  where id = p_group_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'MODIFIER_GROUP_NOT_FOUND';
  end if;

  insert into app.modifier_group_translations (group_id, locale, name, description)
  values
    (p_group_id, 'en', btrim(p_name_en), nullif(btrim(coalesce(p_description_en, '')), '')),
    (p_group_id, 'bn', btrim(p_name_bn), nullif(btrim(coalesce(p_description_bn, '')), ''))
  on conflict (group_id, locale) do update
  set name = excluded.name, description = excluded.description;

  perform private.write_admin_audit(
    v_actor, 'catalog.modifier_group_updated', 'modifier_group', p_group_id::text,
    jsonb_build_object(
      'is_active', p_is_active,
      'minimum_selections', p_minimum_selections,
      'maximum_selections', p_maximum_selections,
      'presentation', p_presentation
    )
  );
  return true;
end;
$$;

revoke all on function api.update_modifier_group_admin(
  uuid, boolean, smallint, smallint, text, integer, text, text, text, text
) from public, anon;
grant execute on function api.update_modifier_group_admin(
  uuid, boolean, smallint, smallint, text, integer, text, text, text, text
) to authenticated, service_role;

create or replace function api.update_modifier_option_admin(
  p_option_id uuid,
  p_is_active boolean,
  p_price_delta_minor integer,
  p_sort_order integer,
  p_name_en text,
  p_name_bn text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('catalog.manage');
begin
  if p_option_id is null
     or p_is_active is null
     or p_price_delta_minor < 0
     or p_sort_order not between -100000 and 100000
     or char_length(btrim(coalesce(p_name_en, ''))) not between 1 and 120
     or char_length(btrim(coalesce(p_name_bn, ''))) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'INVALID_MODIFIER_OPTION_VALUES';
  end if;

  update app.modifier_options
  set is_active = p_is_active,
      price_delta_minor = p_price_delta_minor,
      sort_order = p_sort_order
  where id = p_option_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'MODIFIER_OPTION_NOT_FOUND';
  end if;

  insert into app.modifier_option_translations (option_id, locale, name)
  values
    (p_option_id, 'en', btrim(p_name_en)),
    (p_option_id, 'bn', btrim(p_name_bn))
  on conflict (option_id, locale) do update set name = excluded.name;

  perform private.write_admin_audit(
    v_actor, 'catalog.modifier_option_updated', 'modifier_option', p_option_id::text,
    jsonb_build_object(
      'is_active', p_is_active,
      'price_delta_minor', p_price_delta_minor,
      'sort_order', p_sort_order
    )
  );
  return true;
end;
$$;

revoke all on function api.update_modifier_option_admin(
  uuid, boolean, integer, integer, text, text
) from public, anon;
grant execute on function api.update_modifier_option_admin(
  uuid, boolean, integer, integer, text, text
) to authenticated, service_role;

create or replace function api.upsert_banner_admin(
  p_id uuid,
  p_placement app.banner_placement,
  p_media_id uuid,
  p_action_url text,
  p_is_active boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_sort_order integer,
  p_eyebrow_en text,
  p_eyebrow_bn text,
  p_title_en text,
  p_title_bn text,
  p_body_en text,
  p_body_bn text,
  p_action_label_en text,
  p_action_label_bn text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('merchandising.manage');
  v_id uuid;
begin
  if p_placement is null
     or p_is_active is null
     or p_sort_order not between -100000 and 100000
     or (p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at)
     or char_length(btrim(coalesce(p_title_en, ''))) not between 1 and 160
     or char_length(btrim(coalesce(p_title_bn, ''))) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'INVALID_BANNER_VALUES';
  end if;

  if p_media_id is not null and not exists (
    select 1 from app.media_assets m
    where m.id = p_media_id and m.bucket_id = 'site-media'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_BANNER_MEDIA';
  end if;

  if p_id is null then
    insert into app.banners (
      placement, media_id, action_url, is_active, starts_at, ends_at, sort_order
    ) values (
      p_placement,
      p_media_id,
      nullif(btrim(coalesce(p_action_url, '')), ''),
      p_is_active,
      p_starts_at,
      p_ends_at,
      p_sort_order
    ) returning id into v_id;
  else
    update app.banners
    set placement = p_placement,
        media_id = p_media_id,
        action_url = nullif(btrim(coalesce(p_action_url, '')), ''),
        is_active = p_is_active,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        sort_order = p_sort_order
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception using errcode = 'P0002', message = 'BANNER_NOT_FOUND';
    end if;
  end if;

  insert into app.banner_translations (
    banner_id, locale, eyebrow, title, body, action_label
  ) values
    (
      v_id, 'en', nullif(btrim(coalesce(p_eyebrow_en, '')), ''), btrim(p_title_en),
      nullif(btrim(coalesce(p_body_en, '')), ''),
      nullif(btrim(coalesce(p_action_label_en, '')), '')
    ),
    (
      v_id, 'bn', nullif(btrim(coalesce(p_eyebrow_bn, '')), ''), btrim(p_title_bn),
      nullif(btrim(coalesce(p_body_bn, '')), ''),
      nullif(btrim(coalesce(p_action_label_bn, '')), '')
    )
  on conflict (banner_id, locale) do update
  set eyebrow = excluded.eyebrow,
      title = excluded.title,
      body = excluded.body,
      action_label = excluded.action_label;

  perform private.write_admin_audit(
    v_actor, 'merchandising.banner_saved', 'banner', v_id::text,
    jsonb_build_object('placement', p_placement, 'is_active', p_is_active)
  );
  return v_id;
end;
$$;

revoke all on function api.upsert_banner_admin(
  uuid, app.banner_placement, uuid, text, boolean, timestamptz, timestamptz,
  integer, text, text, text, text, text, text, text, text
) from public, anon;
grant execute on function api.upsert_banner_admin(
  uuid, app.banner_placement, uuid, text, boolean, timestamptz, timestamptz,
  integer, text, text, text, text, text, text, text, text
) to authenticated, service_role;

create or replace function api.upsert_offer_admin(
  p_id uuid,
  p_code text,
  p_kind app.offer_kind,
  p_value integer,
  p_maximum_discount_minor integer,
  p_minimum_subtotal_minor integer,
  p_is_active boolean,
  p_is_stackable boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_priority integer,
  p_target_kind app.offer_target_kind,
  p_target_id uuid,
  p_name_en text,
  p_name_bn text,
  p_description_en text,
  p_description_bn text,
  p_terms_en text,
  p_terms_bn text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('merchandising.manage');
  v_id uuid;
  v_code text := nullif(upper(btrim(coalesce(p_code, ''))), '');
begin
  if p_kind is null
     or p_is_active is null
     or p_is_stackable is null
     or p_minimum_subtotal_minor < 0
     or (p_maximum_discount_minor is not null and p_maximum_discount_minor < 0)
     or (p_kind = 'percent' and p_value not between 1 and 10000)
     or (p_kind = 'fixed' and p_value < 0)
     or (p_kind = 'free_delivery' and p_value <> 0)
     or (p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at)
     or p_priority not between -100000 and 100000
     or char_length(btrim(coalesce(p_name_en, ''))) not between 1 and 160
     or char_length(btrim(coalesce(p_name_bn, ''))) not between 1 and 160
     or (p_target_kind = 'all' and p_target_id is not null)
     or (p_target_kind in ('category', 'item') and p_target_id is null) then
    raise exception using errcode = '22023', message = 'INVALID_OFFER_VALUES';
  end if;

  if p_target_kind = 'category' and not exists (
    select 1 from app.menu_categories c where c.id = p_target_id
  ) then
    raise exception using errcode = '22023', message = 'OFFER_CATEGORY_NOT_FOUND';
  end if;
  if p_target_kind = 'item' and not exists (
    select 1 from app.menu_items i where i.id = p_target_id
  ) then
    raise exception using errcode = '22023', message = 'OFFER_ITEM_NOT_FOUND';
  end if;

  if p_id is null then
    insert into app.offers (
      code, kind, value, maximum_discount_minor, minimum_subtotal_minor,
      is_active, is_stackable, starts_at, ends_at, priority
    ) values (
      v_code, p_kind, p_value, p_maximum_discount_minor, p_minimum_subtotal_minor,
      p_is_active, p_is_stackable, p_starts_at, p_ends_at, p_priority
    ) returning id into v_id;
  else
    update app.offers
    set code = v_code,
        kind = p_kind,
        value = p_value,
        maximum_discount_minor = p_maximum_discount_minor,
        minimum_subtotal_minor = p_minimum_subtotal_minor,
        is_active = p_is_active,
        is_stackable = p_is_stackable,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        priority = p_priority
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception using errcode = 'P0002', message = 'OFFER_NOT_FOUND';
    end if;
  end if;

  insert into app.offer_translations (offer_id, locale, name, description, terms)
  values
    (
      v_id, 'en', btrim(p_name_en),
      nullif(btrim(coalesce(p_description_en, '')), ''),
      nullif(btrim(coalesce(p_terms_en, '')), '')
    ),
    (
      v_id, 'bn', btrim(p_name_bn),
      nullif(btrim(coalesce(p_description_bn, '')), ''),
      nullif(btrim(coalesce(p_terms_bn, '')), '')
    )
  on conflict (offer_id, locale) do update
  set name = excluded.name,
      description = excluded.description,
      terms = excluded.terms;

  delete from app.offer_targets where offer_id = v_id;
  insert into app.offer_targets (offer_id, target_kind, category_id, item_id)
  values (
    v_id,
    p_target_kind,
    case when p_target_kind = 'category' then p_target_id else null end,
    case when p_target_kind = 'item' then p_target_id else null end
  );

  perform private.write_admin_audit(
    v_actor, 'merchandising.offer_saved', 'offer', v_id::text,
    jsonb_build_object(
      'kind', p_kind,
      'is_active', p_is_active,
      'target_kind', p_target_kind
    )
  );
  return v_id;
end;
$$;

revoke all on function api.upsert_offer_admin(
  uuid, text, app.offer_kind, integer, integer, integer, boolean, boolean,
  timestamptz, timestamptz, integer, app.offer_target_kind, uuid,
  text, text, text, text, text, text
) from public, anon;
grant execute on function api.upsert_offer_admin(
  uuid, text, app.offer_kind, integer, integer, integer, boolean, boolean,
  timestamptz, timestamptz, integer, app.offer_target_kind, uuid,
  text, text, text, text, text, text
) to authenticated, service_role;

create or replace function api.update_home_section_admin(
  p_section_id uuid,
  p_is_active boolean,
  p_sort_order integer,
  p_title_en text,
  p_title_bn text,
  p_subtitle_en text,
  p_subtitle_bn text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin_permission('merchandising.manage');
begin
  if p_section_id is null
     or p_is_active is null
     or p_sort_order not between -100000 and 100000
     or char_length(coalesce(p_title_en, '')) > 160
     or char_length(coalesce(p_title_bn, '')) > 160
     or char_length(coalesce(p_subtitle_en, '')) > 400
     or char_length(coalesce(p_subtitle_bn, '')) > 400 then
    raise exception using errcode = '22023', message = 'INVALID_HOME_SECTION_VALUES';
  end if;

  update app.home_sections
  set is_active = p_is_active,
      sort_order = p_sort_order
  where id = p_section_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'HOME_SECTION_NOT_FOUND';
  end if;

  insert into app.home_section_translations (
    section_id, locale, title, subtitle
  ) values
    (
      p_section_id, 'en', nullif(btrim(coalesce(p_title_en, '')), ''),
      nullif(btrim(coalesce(p_subtitle_en, '')), '')
    ),
    (
      p_section_id, 'bn', nullif(btrim(coalesce(p_title_bn, '')), ''),
      nullif(btrim(coalesce(p_subtitle_bn, '')), '')
    )
  on conflict (section_id, locale) do update
  set title = excluded.title, subtitle = excluded.subtitle;

  perform private.write_admin_audit(
    v_actor, 'merchandising.home_section_updated', 'home_section', p_section_id::text,
    jsonb_build_object('is_active', p_is_active, 'sort_order', p_sort_order)
  );
  return true;
end;
$$;

revoke all on function api.update_home_section_admin(
  uuid, boolean, integer, text, text, text, text
) from public, anon;
grant execute on function api.update_home_section_admin(
  uuid, boolean, integer, text, text, text, text
) to authenticated, service_role;
