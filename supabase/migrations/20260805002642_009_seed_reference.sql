insert into app.permissions (code, description)
values
  ('site.manage', 'Publish the storefront and change runtime ordering controls.'),
  ('staff.manage', 'Approve, suspend, and assign roles to staff accounts.'),
  ('orders.read', 'Read operational order data, including fulfillment details.'),
  ('orders.transition', 'Advance or stop orders through the fulfillment state machine.'),
  ('orders.claim', 'Claim website orders for a POS terminal lease.'),
  ('orders.test_delete', 'Permanently delete confirmed test orders only.'),
  ('catalog.manage', 'Manage categories, items, modifiers, prices, availability, and menu media.'),
  ('merchandising.manage', 'Manage offers, banners, home sections, and site media.'),
  ('reviews.manage', 'Refresh and moderate cached supported review content.'),
  ('integrations.manage', 'Manage server-side integrations and their Vault references.'),
  ('reports.read', 'Read live-order operational and revenue reports.'),
  ('pos.operate', 'Operate website-order and print-job flows from a POS terminal.')
on conflict (code) do update set description = excluded.description;

insert into app.roles (code, name, description, is_system)
values
  ('owner', 'Owner', 'Full operational and security administration.', true),
  ('admin', 'Administrator', 'Full day-to-day administration.', true),
  ('manager', 'Manager', 'Store operations, catalog, merchandising, reviews, and reports.', true),
  ('cashier', 'Cashier', 'Website order intake, status handling, and POS printing.', true),
  ('kitchen', 'Kitchen', 'Kitchen fulfillment status and print operations.', true),
  ('content_editor', 'Content editor', 'Menu, merchandising, and review content.', true)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    is_system = excluded.is_system;

insert into app.role_permissions (role_id, permission_code)
select r.id, p.code
from app.roles r
cross join app.permissions p
where r.code in ('owner', 'admin')
   or (
     r.code = 'manager'
     and p.code in (
       'site.manage', 'orders.read', 'orders.transition', 'orders.claim',
       'catalog.manage', 'merchandising.manage', 'reviews.manage',
       'reports.read', 'pos.operate'
     )
   )
   or (
     r.code = 'cashier'
     and p.code in ('orders.read', 'orders.transition', 'orders.claim', 'pos.operate')
   )
   or (
     r.code = 'kitchen'
     and p.code in ('orders.read', 'orders.transition', 'pos.operate')
   )
   or (
     r.code = 'content_editor'
     and p.code in ('catalog.manage', 'merchandising.manage', 'reviews.manage')
   )
on conflict (role_id, permission_code) do nothing;

insert into app.site_runtime (
  singleton,
  published,
  live_orders_enabled,
  test_mode,
  default_locale,
  timezone_name,
  currency_code,
  minimum_order_minor,
  default_delivery_fee_minor,
  default_prep_minutes,
  ordering_paused_reason_en,
  ordering_paused_reason_bn
)
values (
  true,
  false,
  false,
  true,
  'en',
  'Asia/Dhaka',
  'BDT',
  0,
  0,
  30,
  'Online ordering is being prepared.',
  'অনলাইন অর্ডার প্রস্তুত করা হচ্ছে।'
)
on conflict (singleton) do nothing;

insert into app.business_hours (
  day_of_week, interval_number, opens_at, closes_at, is_closed
)
select day_number, 1, null, null, true
from generate_series(0, 6) as days(day_number)
on conflict (day_of_week, interval_number) do nothing;

insert into app.delivery_areas (
  sector_number,
  name_en,
  name_bn,
  delivery_fee_minor,
  minimum_order_minor,
  estimated_minutes,
  is_active,
  sort_order
)
select
  sector_number,
  'Uttara Sector ' || sector_number,
  'উত্তরা সেক্টর ' || sector_number,
  0,
  0,
  45,
  true,
  sector_number
from generate_series(1, 18) as sectors(sector_number)
on conflict (sector_number) do update
set name_en = excluded.name_en,
    name_bn = excluded.name_bn,
    sort_order = excluded.sort_order;

insert into private.integration_settings (kind, enabled, public_config)
values
  (
    'meta_capi',
    false,
    jsonb_build_object('pixel_id', null, 'consent_required', true)
  ),
  (
    'google_reviews',
    false,
    jsonb_build_object('place_id', null, 'cache_ttl_seconds', 21600)
  ),
  (
    'pos',
    false,
    jsonb_build_object('poll_interval_seconds', 5, 'lease_seconds', 90)
  )
on conflict (kind) do nothing;

insert into app.home_sections (section_key, kind, is_active, sort_order, config)
values
  ('hero', 'banner', true, 10, '{}'::jsonb),
  ('offers', 'offers', true, 20, '{}'::jsonb),
  ('categories', 'categories', true, 30, '{}'::jsonb),
  ('menu', 'menu', true, 40, '{}'::jsonb),
  ('reviews', 'reviews', true, 50, '{}'::jsonb)
on conflict (section_key) do update
set kind = excluded.kind,
    sort_order = excluded.sort_order;

insert into app.home_section_translations (section_id, locale, title, subtitle)
select s.id, translated.locale, translated.title, translated.subtitle
from app.home_sections s
join (
  values
    ('hero', 'en'::app.locale_code, null::text, null::text),
    ('hero', 'bn'::app.locale_code, null::text, null::text),
    ('offers', 'en'::app.locale_code, 'Offers', 'A little extra joy with your order.'),
    ('offers', 'bn'::app.locale_code, 'অফার', 'আপনার অর্ডারের সাথে একটু বাড়তি আনন্দ।'),
    ('categories', 'en'::app.locale_code, 'Explore the menu', null::text),
    ('categories', 'bn'::app.locale_code, 'মেনু দেখুন', null::text),
    ('menu', 'en'::app.locale_code, 'Made for Uttara', 'Freshly prepared by Yamzo Uttara.'),
    ('menu', 'bn'::app.locale_code, 'উত্তরার জন্য তৈরি', 'ইয়ামজো উত্তরা থেকে সতেজভাবে প্রস্তুত।'),
    ('reviews', 'en'::app.locale_code, 'Loved by our guests', 'Recent five-star Google reviews.'),
    ('reviews', 'bn'::app.locale_code, 'অতিথিদের ভালোবাসা', 'সাম্প্রতিক পাঁচ তারকা গুগল রিভিউ।')
) as translated(section_key, locale, title, subtitle)
  on translated.section_key = s.section_key
on conflict (section_id, locale) do update
set title = excluded.title,
    subtitle = excluded.subtitle;
