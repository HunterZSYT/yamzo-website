create table app.menu_categories (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  parent_id uuid references app.menu_categories(id) on delete set null,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_category_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint menu_category_not_own_parent check (parent_id is null or parent_id <> id)
);

create table app.menu_category_translations (
  category_id uuid not null references app.menu_categories(id) on delete cascade,
  locale app.locale_code not null,
  name text not null,
  description text,
  primary key (category_id, locale),
  constraint menu_category_name_length check (char_length(btrim(name)) between 1 and 100),
  constraint menu_category_description_length check (
    description is null or char_length(description) <= 500
  )
);

create table app.menu_items (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  sku text unique,
  base_price_minor integer not null,
  compare_at_price_minor integer,
  is_active boolean not null default true,
  is_available boolean not null default true,
  is_featured boolean not null default false,
  preparation_minutes smallint,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_item_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint menu_item_sku_format check (sku is null or sku ~ '^[A-Z0-9][A-Z0-9_-]{1,39}$'),
  constraint menu_item_price_nonnegative check (base_price_minor >= 0),
  constraint menu_item_compare_price check (
    compare_at_price_minor is null or compare_at_price_minor > base_price_minor
  ),
  constraint menu_item_prep_range check (
    preparation_minutes is null or preparation_minutes between 1 and 240
  )
);

create table app.menu_item_translations (
  item_id uuid not null references app.menu_items(id) on delete cascade,
  locale app.locale_code not null,
  name text not null,
  description text,
  primary key (item_id, locale),
  constraint menu_item_name_length check (char_length(btrim(name)) between 1 and 160),
  constraint menu_item_description_length check (
    description is null or char_length(description) <= 1200
  )
);

create table app.menu_item_categories (
  item_id uuid not null references app.menu_items(id) on delete cascade,
  category_id uuid not null references app.menu_categories(id) on delete cascade,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  primary key (item_id, category_id)
);

create table app.modifier_groups (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  minimum_selections smallint not null default 0,
  maximum_selections smallint not null default 1,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modifier_group_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint modifier_group_selection_range check (
    minimum_selections between 0 and 20
    and maximum_selections between 1 and 20
    and minimum_selections <= maximum_selections
  )
);

create table app.modifier_group_translations (
  group_id uuid not null references app.modifier_groups(id) on delete cascade,
  locale app.locale_code not null,
  name text not null,
  description text,
  primary key (group_id, locale),
  constraint modifier_group_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint modifier_group_description_length check (
    description is null or char_length(description) <= 500
  )
);

create table app.modifier_options (
  id uuid primary key default extensions.gen_random_uuid(),
  group_id uuid not null references app.modifier_groups(id) on delete cascade,
  price_delta_minor integer not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modifier_option_price_floor check (price_delta_minor >= 0)
);

create table app.modifier_option_translations (
  option_id uuid not null references app.modifier_options(id) on delete cascade,
  locale app.locale_code not null,
  name text not null,
  primary key (option_id, locale),
  constraint modifier_option_name_length check (char_length(btrim(name)) between 1 and 120)
);

create table app.menu_item_modifier_groups (
  item_id uuid not null references app.menu_items(id) on delete cascade,
  group_id uuid not null references app.modifier_groups(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (item_id, group_id)
);

create table app.media_assets (
  id uuid primary key default extensions.gen_random_uuid(),
  kind app.media_kind not null default 'image',
  bucket_id text not null,
  object_path text not null,
  width integer,
  height integer,
  blur_data_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint media_bucket_allowed check (bucket_id in ('menu-media', 'site-media')),
  constraint media_object_path_safe check (
    char_length(object_path) between 1 and 500
    and object_path !~ '(^|/)\.\.(/|$)'
    and object_path !~ '^/'
  ),
  constraint media_dimensions_positive check (
    (width is null and height is null)
    or (width > 0 and height > 0)
  ),
  unique (bucket_id, object_path)
);

create table app.media_asset_translations (
  media_id uuid not null references app.media_assets(id) on delete cascade,
  locale app.locale_code not null,
  alt_text text not null,
  primary key (media_id, locale),
  constraint media_alt_text_length check (char_length(btrim(alt_text)) between 1 and 240)
);

create table app.menu_item_media (
  item_id uuid not null references app.menu_items(id) on delete cascade,
  media_id uuid not null references app.media_assets(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (item_id, media_id)
);
