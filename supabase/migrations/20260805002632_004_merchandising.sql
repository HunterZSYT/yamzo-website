create table app.banners (
  id uuid primary key default extensions.gen_random_uuid(),
  placement app.banner_placement not null default 'hero',
  media_id uuid references app.media_assets(id) on delete set null,
  action_url text,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banner_schedule_order check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint banner_action_url_safe check (
    action_url is null
    or action_url ~ '^/[A-Za-z0-9/_?&=#.%+-]*$'
    or action_url ~ '^https://[A-Za-z0-9.-]+(?:/[A-Za-z0-9/_?&=#.%+-]*)?$'
  )
);

create table app.banner_translations (
  banner_id uuid not null references app.banners(id) on delete cascade,
  locale app.locale_code not null,
  eyebrow text,
  title text not null,
  body text,
  action_label text,
  primary key (banner_id, locale),
  constraint banner_title_length check (char_length(btrim(title)) between 1 and 160),
  constraint banner_body_length check (body is null or char_length(body) <= 600),
  constraint banner_action_label_length check (action_label is null or char_length(action_label) <= 80)
);

create table app.offers (
  id uuid primary key default extensions.gen_random_uuid(),
  code text unique,
  kind app.offer_kind not null,
  value integer not null,
  maximum_discount_minor integer,
  minimum_subtotal_minor integer not null default 0,
  is_active boolean not null default true,
  is_stackable boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offer_code_format check (code is null or code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  constraint offer_value_valid check (
    (kind = 'percent' and value between 1 and 10000)
    or (kind = 'fixed' and value >= 0)
    or (kind = 'free_delivery' and value = 0)
  ),
  constraint offer_max_discount_nonnegative check (
    maximum_discount_minor is null or maximum_discount_minor >= 0
  ),
  constraint offer_minimum_nonnegative check (minimum_subtotal_minor >= 0),
  constraint offer_schedule_order check (ends_at is null or starts_at is null or ends_at > starts_at)
);

comment on column app.offers.value is
  'Basis points for percent offers; integer minor currency units for fixed offers; zero for free delivery.';

create table app.offer_translations (
  offer_id uuid not null references app.offers(id) on delete cascade,
  locale app.locale_code not null,
  name text not null,
  description text,
  terms text,
  primary key (offer_id, locale),
  constraint offer_name_length check (char_length(btrim(name)) between 1 and 160),
  constraint offer_description_length check (description is null or char_length(description) <= 800),
  constraint offer_terms_length check (terms is null or char_length(terms) <= 2000)
);

create table app.offer_targets (
  offer_id uuid not null references app.offers(id) on delete cascade,
  target_kind app.offer_target_kind not null,
  category_id uuid references app.menu_categories(id) on delete cascade,
  item_id uuid references app.menu_items(id) on delete cascade,
  constraint offer_target_shape check (
    (target_kind = 'all' and category_id is null and item_id is null)
    or (target_kind = 'category' and category_id is not null and item_id is null)
    or (target_kind = 'item' and category_id is null and item_id is not null)
  )
);

create unique index offer_targets_unique_all
  on app.offer_targets (offer_id) where target_kind = 'all';
create unique index offer_targets_unique_category
  on app.offer_targets (offer_id, category_id) where target_kind = 'category';
create unique index offer_targets_unique_item
  on app.offer_targets (offer_id, item_id) where target_kind = 'item';

create table app.home_sections (
  id uuid primary key default extensions.gen_random_uuid(),
  section_key text not null unique,
  kind app.home_section_kind not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_section_key_format check (section_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint home_section_config_object check (jsonb_typeof(config) = 'object'),
  constraint home_section_config_size check (octet_length(config::text) <= 16384)
);

create table app.home_section_translations (
  section_id uuid not null references app.home_sections(id) on delete cascade,
  locale app.locale_code not null,
  title text,
  subtitle text,
  primary key (section_id, locale),
  constraint home_section_title_length check (title is null or char_length(title) <= 160),
  constraint home_section_subtitle_length check (subtitle is null or char_length(subtitle) <= 400)
);

create table app.review_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  source text not null default 'google_places',
  place_id text not null,
  rating numeric(2,1) not null,
  review_count integer not null,
  fetched_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint review_snapshot_source check (source = 'google_places'),
  constraint review_snapshot_rating_range check (rating between 0 and 5),
  constraint review_snapshot_count_nonnegative check (review_count >= 0),
  constraint review_snapshot_expiry check (expires_at > fetched_at)
);

create table app.review_items (
  id uuid primary key default extensions.gen_random_uuid(),
  source text not null default 'google_places',
  source_review_id text not null,
  author_display_name text not null,
  author_photo_url text,
  rating smallint not null,
  review_text text,
  review_language text,
  reviewed_at timestamptz,
  cached_at timestamptz not null default now(),
  expires_at timestamptz not null,
  is_visible boolean not null default true,
  constraint review_item_source check (source = 'google_places'),
  constraint review_item_rating_range check (rating between 1 and 5),
  constraint review_author_name_length check (char_length(btrim(author_display_name)) between 1 and 160),
  constraint review_text_length check (review_text is null or char_length(review_text) <= 4000),
  constraint review_photo_https check (author_photo_url is null or author_photo_url ~ '^https://'),
  constraint review_item_expiry check (expires_at > cached_at),
  unique (source, source_review_id)
);
