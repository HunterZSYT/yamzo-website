create sequence private.order_reference_seq;
revoke all on sequence private.order_reference_seq from public, anon, authenticated;

create table app.orders (
  id uuid primary key default extensions.gen_random_uuid(),
  order_reference text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  source app.order_source not null default 'website',
  mode app.order_mode not null,
  status app.order_status not null default 'placed',
  version integer not null default 1,
  fulfillment_type app.fulfillment_type not null default 'delivery',
  payment_method app.payment_method not null default 'cash_on_delivery',
  locale app.locale_code not null default 'en',
  delivery_area_id uuid references app.delivery_areas(id) on delete set null,
  offer_id uuid references app.offers(id) on delete set null,
  offer_code_snapshot text,
  subtotal_minor integer not null,
  discount_minor integer not null default 0,
  delivery_fee_minor integer not null default 0,
  grand_total_minor integer not null,
  currency_code text not null default 'BDT',
  customer_note text,
  placed_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_reference_format check (order_reference ~ '^YZ-[0-9]{8}-[0-9]{8}$'),
  constraint order_version_positive check (version >= 1),
  constraint order_money_nonnegative check (
    subtotal_minor >= 0
    and discount_minor >= 0
    and delivery_fee_minor >= 0
    and grand_total_minor >= 0
  ),
  constraint order_total_consistency check (
    grand_total_minor = subtotal_minor + delivery_fee_minor - discount_minor
    and discount_minor <= subtotal_minor + delivery_fee_minor
  ),
  constraint order_currency check (currency_code = 'BDT'),
  constraint order_customer_note_length check (customer_note is null or char_length(customer_note) <= 500)
);

create table private.order_contacts (
  order_id uuid primary key references app.orders(id) on delete cascade,
  full_name text not null,
  phone_e164 text not null,
  sector_number smallint not null,
  road_number text not null,
  house_number text not null,
  flat_number text not null,
  created_at timestamptz not null default now(),
  constraint order_contact_name_length check (char_length(btrim(full_name)) between 2 and 120),
  constraint order_contact_phone_format check (phone_e164 ~ '^\+8801[3-9][0-9]{8}$'),
  constraint order_contact_sector_range check (sector_number between 1 and 99),
  constraint order_contact_road_length check (char_length(btrim(road_number)) between 1 and 40),
  constraint order_contact_house_length check (char_length(btrim(house_number)) between 1 and 40),
  constraint order_contact_flat_length check (char_length(btrim(flat_number)) between 1 and 40)
);

comment on table private.order_contacts is
  'Order PII. Excluded from realtime payloads, analytics, public views, and audit details.';

create table private.order_tracking_credentials (
  order_id uuid primary key references app.orders(id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint tracking_token_hash_length check (octet_length(token_hash) = 32)
);

create table app.order_items (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references app.orders(id) on delete cascade,
  source_item_id uuid references app.menu_items(id) on delete set null,
  item_name_en text not null,
  item_name_bn text not null,
  quantity smallint not null,
  unit_price_minor integer not null,
  modifier_unit_total_minor integer not null default 0,
  line_total_minor integer not null,
  customer_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint order_item_name_en_length check (char_length(btrim(item_name_en)) between 1 and 160),
  constraint order_item_name_bn_length check (char_length(btrim(item_name_bn)) between 1 and 160),
  constraint order_item_quantity_range check (quantity between 1 and 20),
  constraint order_item_money_nonnegative check (
    unit_price_minor >= 0 and modifier_unit_total_minor >= 0 and line_total_minor >= 0
  ),
  constraint order_item_total_consistency check (
    line_total_minor = quantity * (unit_price_minor + modifier_unit_total_minor)
  ),
  constraint order_item_note_length check (customer_note is null or char_length(customer_note) <= 300)
);

create table app.order_item_modifiers (
  id uuid primary key default extensions.gen_random_uuid(),
  order_item_id uuid not null references app.order_items(id) on delete cascade,
  source_option_id uuid references app.modifier_options(id) on delete set null,
  group_name_en text not null,
  group_name_bn text not null,
  option_name_en text not null,
  option_name_bn text not null,
  price_delta_minor integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint order_modifier_price_nonnegative check (price_delta_minor >= 0)
);

create table app.order_status_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references app.orders(id) on delete cascade,
  from_status app.order_status,
  to_status app.order_status not null,
  actor_type app.audit_actor_type not null,
  actor_id uuid,
  note text,
  created_at timestamptz not null default now(),
  constraint order_status_event_note_length check (note is null or char_length(note) <= 500),
  constraint order_status_event_changed check (from_status is null or from_status <> to_status)
);

create table app.order_claims (
  order_id uuid primary key references app.orders(id) on delete cascade,
  terminal_id uuid not null references app.pos_terminals(id) on delete cascade,
  claim_token_hash bytea not null unique,
  claimed_at timestamptz not null default now(),
  lease_expires_at timestamptz not null,
  renewed_at timestamptz,
  released_at timestamptz,
  constraint order_claim_token_hash_length check (octet_length(claim_token_hash) = 32),
  constraint order_claim_lease_future check (lease_expires_at > claimed_at)
);

create table app.print_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references app.orders(id) on delete cascade,
  kind app.print_job_kind not null,
  status app.job_status not null default 'pending',
  copies smallint not null default 1,
  terminal_id uuid references app.pos_terminals(id) on delete set null,
  claim_token_hash bytea,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  attempts smallint not null default 0,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint print_job_copies_range check (copies between 1 and 3),
  constraint print_job_attempts_nonnegative check (attempts >= 0),
  constraint print_job_claim_hash_length check (
    claim_token_hash is null or octet_length(claim_token_hash) = 32
  ),
  constraint print_job_error_code_safe check (
    last_error_code is null or last_error_code ~ '^[A-Z0-9_:-]{1,80}$'
  ),
  unique (order_id, kind)
);

create table private.idempotency_keys (
  operation text not null,
  key_hash bytea not null,
  actor_fingerprint_hash bytea,
  resource_id uuid,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (operation, key_hash),
  constraint idempotency_operation_format check (operation ~ '^[a-z][a-z0-9_.-]{2,79}$'),
  constraint idempotency_key_hash_length check (octet_length(key_hash) = 32),
  constraint idempotency_actor_hash_length check (
    actor_fingerprint_hash is null or octet_length(actor_fingerprint_hash) = 32
  ),
  constraint idempotency_expiry check (expires_at > created_at),
  constraint idempotency_response_size check (
    response_payload is null or octet_length(response_payload::text) <= 16384
  )
);

create table private.rate_limit_buckets (
  action text not null,
  bucket_hash bytea not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1,
  expires_at timestamptz not null,
  primary key (action, bucket_hash, window_started_at),
  constraint rate_limit_action_format check (action ~ '^[a-z][a-z0-9_.-]{2,79}$'),
  constraint rate_limit_bucket_hash_length check (octet_length(bucket_hash) = 32),
  constraint rate_limit_count_positive check (request_count >= 1),
  constraint rate_limit_expiry check (expires_at > window_started_at)
);

create table private.outbox_events (
  id bigint generated always as identity primary key,
  event_kind text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  mode app.order_mode,
  payload jsonb not null default '{}'::jsonb,
  status app.outbox_status not null default 'pending',
  attempts smallint not null default 0,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  constraint outbox_event_kind_format check (event_kind ~ '^[a-z][a-z0-9_.-]{2,99}$'),
  constraint outbox_aggregate_type_format check (aggregate_type ~ '^[a-z][a-z0-9_.-]{2,79}$'),
  constraint outbox_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint outbox_payload_size check (octet_length(payload::text) <= 65536),
  constraint outbox_attempts_nonnegative check (attempts >= 0),
  constraint outbox_error_code_safe check (
    last_error_code is null or last_error_code ~ '^[A-Z0-9_:-]{1,80}$'
  )
);

create table private.integration_settings (
  kind app.integration_kind primary key,
  enabled boolean not null default false,
  public_config jsonb not null default '{}'::jsonb,
  vault_secret_id uuid,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint integration_public_config_object check (jsonb_typeof(public_config) = 'object'),
  constraint integration_public_config_size check (octet_length(public_config::text) <= 8192)
);

comment on column private.integration_settings.vault_secret_id is
  'Reference to a Supabase Vault secret. Secret plaintext must never be stored in this table.';

create table private.audit_log (
  id bigint generated always as identity primary key,
  actor_type app.audit_actor_type not null,
  actor_id uuid,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint audit_action_format check (action ~ '^[a-z][a-z0-9_.-]{2,99}$'),
  constraint audit_target_type_format check (target_type ~ '^[a-z][a-z0-9_.-]{2,79}$'),
  constraint audit_details_object check (jsonb_typeof(details) = 'object'),
  constraint audit_details_size check (octet_length(details::text) <= 16384)
);

comment on table private.audit_log is
  'Security and operations audit events. The details object must never contain address, phone, tokens, or secrets.';

create table private.deleted_test_order_tombstones (
  id bigint generated always as identity primary key,
  order_reference_hash bytea not null,
  deleted_by uuid not null references auth.users(id) on delete restrict,
  reason_code text not null,
  deleted_at timestamptz not null default now(),
  constraint deleted_order_hash_length check (octet_length(order_reference_hash) = 32),
  constraint deleted_order_reason_safe check (reason_code ~ '^[A-Z0-9_:-]{2,80}$')
);

comment on table private.deleted_test_order_tombstones is
  'Non-PII proof that a test order was deliberately hard-deleted.';
