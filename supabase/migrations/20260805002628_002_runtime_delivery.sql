create table app.site_runtime (
  singleton boolean primary key default true,
  published boolean not null default false,
  live_orders_enabled boolean not null default false,
  test_mode boolean not null default true,
  default_locale app.locale_code not null default 'en',
  timezone_name text not null default 'Asia/Dhaka',
  currency_code text not null default 'BDT',
  minimum_order_minor integer not null default 0,
  default_delivery_fee_minor integer not null default 0,
  default_prep_minutes smallint not null default 30,
  ordering_paused_reason_en text,
  ordering_paused_reason_bn text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint site_runtime_singleton check (singleton),
  constraint site_runtime_timezone check (timezone_name = 'Asia/Dhaka'),
  constraint site_runtime_currency check (currency_code = 'BDT'),
  constraint site_runtime_minimum_order_nonnegative check (minimum_order_minor >= 0),
  constraint site_runtime_delivery_fee_nonnegative check (default_delivery_fee_minor >= 0),
  constraint site_runtime_prep_range check (default_prep_minutes between 5 and 240),
  constraint site_runtime_mode_consistency check (not (live_orders_enabled and test_mode))
);

comment on table app.site_runtime is
  'Single-row launch and ordering controls. Defaults keep the public site closed and orders in test mode.';

create table app.business_hours (
  id uuid primary key default extensions.gen_random_uuid(),
  day_of_week smallint not null,
  interval_number smallint not null default 1,
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_hours_day check (day_of_week between 0 and 6),
  constraint business_hours_interval check (interval_number between 1 and 4),
  constraint business_hours_time_consistency check (
    (is_closed and opens_at is null and closes_at is null)
    or (not is_closed and opens_at is not null and closes_at is not null and opens_at <> closes_at)
  ),
  unique (day_of_week, interval_number)
);

create table app.business_hour_exceptions (
  id uuid primary key default extensions.gen_random_uuid(),
  service_date date not null,
  interval_number smallint not null default 1,
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  reason_en text,
  reason_bn text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_hour_exceptions_interval check (interval_number between 1 and 4),
  constraint business_hour_exceptions_time_consistency check (
    (is_closed and opens_at is null and closes_at is null)
    or (not is_closed and opens_at is not null and closes_at is not null and opens_at <> closes_at)
  ),
  unique (service_date, interval_number)
);

create table app.delivery_areas (
  id uuid primary key default extensions.gen_random_uuid(),
  sector_number smallint not null unique,
  name_en text not null,
  name_bn text not null,
  delivery_fee_minor integer not null default 0,
  minimum_order_minor integer not null default 0,
  estimated_minutes smallint not null default 45,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_area_sector_range check (sector_number between 1 and 99),
  constraint delivery_area_fee_nonnegative check (delivery_fee_minor >= 0),
  constraint delivery_area_minimum_nonnegative check (minimum_order_minor >= 0),
  constraint delivery_area_eta_range check (estimated_minutes between 10 and 240)
);

create table private.preview_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references app.staff_members(user_id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint preview_token_hash_length check (octet_length(token_hash) = 32),
  constraint preview_expiry_after_creation check (expires_at > created_at)
);

comment on table private.preview_sessions is
  'Hashed, short-lived coming-soon bypass credentials for approved staff only.';
