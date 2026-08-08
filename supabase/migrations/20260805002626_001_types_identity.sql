create type app.locale_code as enum ('en', 'bn');
create type app.staff_status as enum ('pending', 'active', 'suspended');
create type app.app_role_code as enum (
  'owner',
  'admin',
  'manager',
  'cashier',
  'kitchen',
  'content_editor'
);
create type app.terminal_status as enum ('pending', 'active', 'revoked');
create type app.order_mode as enum ('live', 'test');
create type app.order_status as enum (
  'placed',
  'pending_acceptance',
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'rejected',
  'cancelled'
);
create type app.order_source as enum ('website', 'pos', 'admin');
create type app.fulfillment_type as enum ('delivery', 'pickup');
create type app.payment_method as enum ('cash_on_delivery');
create type app.banner_placement as enum ('hero', 'announcement', 'cart');
create type app.offer_kind as enum ('percent', 'fixed', 'free_delivery');
create type app.offer_target_kind as enum ('all', 'category', 'item');
create type app.home_section_kind as enum ('banner', 'offers', 'categories', 'menu', 'reviews', 'custom');
create type app.media_kind as enum ('image', 'video');
create type app.print_job_kind as enum ('customer_receipt', 'kitchen_copy');
create type app.job_status as enum ('pending', 'claimed', 'completed', 'failed', 'cancelled');
create type app.outbox_status as enum ('pending', 'processing', 'completed', 'failed', 'discarded');
create type app.integration_kind as enum ('meta_capi', 'google_reviews', 'pos');
create type app.audit_actor_type as enum ('customer', 'staff', 'terminal', 'system');

create table app.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  preferred_locale app.locale_code not null default 'en',
  marketing_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    display_name is null or char_length(btrim(display_name)) between 1 and 120
  )
);

create table private.customer_phone_numbers (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_e164 text not null,
  label text not null default 'Primary',
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_phone_e164_format check (phone_e164 ~ '^\+8801[3-9][0-9]{8}$'),
  constraint customer_phone_label_length check (char_length(btrim(label)) between 1 and 40),
  unique (user_id, phone_e164)
);

comment on table private.customer_phone_numbers is
  'Customer PII. Never expose this table or phone values through a public view.';

create table app.roles (
  id uuid primary key default extensions.gen_random_uuid(),
  code app.app_role_code not null unique,
  name text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  constraint roles_name_length check (char_length(btrim(name)) between 1 and 80)
);

create table app.permissions (
  code text primary key,
  description text not null,
  constraint permissions_code_format check (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);

create table app.role_permissions (
  role_id uuid not null references app.roles(id) on delete cascade,
  permission_code text not null references app.permissions(code) on delete cascade,
  primary key (role_id, permission_code)
);

create table app.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  status app.staff_status not null default 'pending',
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  suspended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_display_name_length check (char_length(btrim(display_name)) between 1 and 120),
  constraint staff_approval_consistency check (
    (status = 'active' and approved_at is not null)
    or status <> 'active'
  )
);

create table app.staff_role_assignments (
  user_id uuid not null references app.staff_members(user_id) on delete cascade,
  role_id uuid not null references app.roles(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table app.pos_terminals (
  id uuid primary key default extensions.gen_random_uuid(),
  terminal_code text not null unique,
  name text not null,
  status app.terminal_status not null default 'pending',
  created_by uuid references auth.users(id) on delete set null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint terminal_code_format check (terminal_code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  constraint terminal_name_length check (char_length(btrim(name)) between 1 and 100)
);

create table private.pos_terminal_credentials (
  terminal_id uuid primary key references app.pos_terminals(id) on delete cascade,
  credential_hash bytea not null,
  credential_hint text,
  rotated_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint terminal_credential_hash_length check (octet_length(credential_hash) = 32),
  constraint terminal_credential_hint_length check (
    credential_hint is null or char_length(credential_hint) <= 12
  )
);

comment on table private.pos_terminal_credentials is
  'SHA-256 hashes only. Raw terminal credentials must be provisioned once and stored outside Postgres.';
