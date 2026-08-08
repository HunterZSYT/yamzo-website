# Yamzo Supabase API contract

The Supabase Data API exposes only the `api` schema. `app` is the business-data
schema and `private` contains PII, credentials, idempotency, rate limits,
outboxes, and audit records. Browser clients must not address either base schema.

All money values are integer BDT minor units. Timestamps are UTC
`timestamptz`; restaurant-day reporting converts at the boundary using
`Asia/Dhaka`.

## Storefront reads

- `api.get_site_runtime()` returns one row with `site_published`,
  `live_orders_enabled`, `test_mode_enabled`, `default_locale`,
  `timezone_name`, `currency_code`, `minimum_order_minor`,
  `default_delivery_fee_minor`, `default_prep_minutes`, and localized paused
  reasons.
- Security-invoker views: `storefront_categories`, `storefront_items`,
  `storefront_modifier_groups`, `storefront_modifier_options`,
  `storefront_item_modifier_groups`, `storefront_banners`, `storefront_offers`,
  `storefront_home_sections`, `rating_summary`, and `five_star_reviews`.
- `api.my_order_history` is authenticated and RLS-limited to `auth.uid()`; it
  includes a PII-free `item_count` for account-history summaries.

## Customer operations

### `api.create_order_tx`

Signature:

```text
(p_idempotency_key text,
 p_full_name text,
 p_phone text,
 p_sector_number smallint,
 p_road_number text,
 p_house_number text,
 p_flat_number text,
 p_items jsonb,
 p_locale app.locale_code = 'en',
 p_customer_note text = null) -> jsonb
```

Each item is `{item_id, quantity, modifier_option_ids?, note?}`. The database
validates availability and modifier cardinality, recalculates every price and
eligible offer, snapshots bilingual labels, selects live/test mode from the
runtime row, and returns the tracking token only in the successful response.

- `api.get_order_by_tracking(order_reference, tracking_token, rate_bucket) ->
  jsonb` is `service_role`-only, durably rate-limited by the server-generated
  opaque bucket, and returns status, totals, immutable line snapshots, and
  status events without address or phone. The two-argument overload is retained
  only as a trusted compatibility contract and is also `service_role`-only.
- `api.save_my_phone(phone, label = 'Primary', make_primary = true) -> uuid`
  stores an unverified saved number for the authenticated user, with a maximum
  of five distinct numbers and a fixed-window write limit. It does not claim
  prior orders.
- `api.lookup_latest_order_status(phone, rate_bucket) -> jsonb` is
  `service_role`-only. The web server must derive a stable abuse-control bucket;
  the response contains only a reference hint and latest status.

## Staff and administration

- `api.get_current_staff_access() -> (staff_id, status, role_key, permissions[])`
  is authenticated-only and always derives identity from `auth.uid()`.
- `api.request_staff_access(display_name) -> staff_status` creates a pending
  request; repeats are fixed-window rate-limited, may refresh only the display
  name, and do not emit duplicate audit events or grant a role.
- `api.approve_staff(user_id, role_key) -> boolean` is a service-only legacy
  alias. Staff management uses the audited `api.set_staff_access` contract.
- `api.get_admin_dashboard() -> jsonb` returns runtime state and PII-free counts.
- `api.list_staff_access() -> jsonb` requires `staff.manage`.
- `api.list_orders_for_operations(status?, mode?, limit = 50) -> jsonb` requires
  `orders.read` and is PII-free.
- `api.get_order_for_operations(order_id) -> jsonb` requires `orders.read` and
  is the deliberately privileged full fulfillment payload.
- `api.set_site_runtime(...)` requires `site.manage` and audits launch/mode
  changes.
- `api.set_site_runtime_modes(published, live_orders_enabled, test_mode)` is the
  narrow launch/test toggle used by the admin UI; live and test modes are
  mutually exclusive.
- `api.set_staff_access(user_id, status, role_key, suspended_reason)` replaces
  the target staff member's exact role, supports suspension, and protects the
  final active owner.
- `api.get_admin_operations_snapshot() -> jsonb` returns only the operation
  sections allowed by the current active staff member. It includes inactive
  catalog/merchandising rows for management, but no customer PII or secret
  plaintext.
- `api.set_business_hour(...)`, `api.upsert_business_hour_exception(...)`, and
  `api.delete_business_hour_exception(...)` require `site.manage`; all values
  use restaurant-local Asia/Dhaka semantics.
- `api.update_menu_category_admin(...)`, `api.update_menu_item_admin(...)`,
  `api.update_modifier_group_admin(...)`, and
  `api.update_modifier_option_admin(...)` require `catalog.manage`. Stable
  catalog IDs/slugs are not changed by these controls.
- `api.upsert_banner_admin(...)`, `api.upsert_offer_admin(...)`, and
  `api.update_home_section_admin(...)` require `merchandising.manage`, validate
  schedules/targets, and audit mutations.
- `api.set_meta_integration_server(actor_id, enabled, pixel_id, capi_token,
  clear_token)` is `service_role`-only. It re-validates that `actor_id` is an
  active staff member with `integrations.manage`, stores the token through
  Supabase Vault, and returns only `token_configured` status. The token is
  never selected, returned, or added to audit details.

## POS operations

- `api.claim_website_orders(terminal_id, limit = 20, lease_seconds = 90,
  include_test = false) -> jsonb` uses `FOR UPDATE SKIP LOCKED`, returns one-time
  lease tokens, and excludes test orders unless explicitly requested.
- `api.renew_order_claim(order_id, terminal_id, claim_token,
  lease_seconds = 90) -> timestamptz`.
- `api.release_order_claim(order_id, terminal_id, claim_token) -> boolean`.
- `api.transition_order(order_id, to_status, expected_version, note = null,
  terminal_id = null, claim_token = null) -> jsonb` enforces optimistic
  concurrency and the database state machine. Accepting creates one receipt and
  one kitchen-copy job idempotently.
- `api.claim_print_jobs(terminal_id, limit = 10, lease_seconds = 90) -> jsonb`.
- `api.ack_print_job(job_id, terminal_id, claim_token, succeeded,
  error_code = null) -> boolean`.
- `api.hard_delete_test_order(order_id, expected_reference, reason_code,
  confirmation) -> boolean` requires `orders.test_delete`, exact confirmation,
  and writes a non-PII tombstone. Production orders are trigger-protected from
  hard deletion.

POS device secrets are not stored in application code or seeded here. A trusted
server transport must authenticate the terminal before using the `service_role`
RPC grants; never embed a Supabase secret/service key in Electron or browser
bundles.

The legacy claim/renew/release and print claim/ack RPCs above are
`service_role`-only. Production POS traffic uses the signed transport mapping
below; browser-authenticated staff cannot invoke these direct leasing APIs.

### POS transport mapping

`claim_website_orders`, `get_order_for_operations`, and print-job order payloads
share `private.build_order_operations_payload`. Each item contains
`source_item_id` (the Supabase catalog UUID), `source_item_public_key` (the
stable website/POS key such as `menu_item_chicken_momo`), `source_item_slug`,
the immutable bilingual names, modifier display labels, and
`effective_unit_price_minor`. The POS adapter must use
`source_item_public_key` for `menuItemPublicId`; the UUID is an audit/recovery
identifier and must not replace the public key.

Supabase money is integer BDT minor units. The POS adapter converts every money
field by dividing by 100 and rejects any value not divisible by 100 while the
desktop contract remains whole-BDT. `effective_unit_price_minor`—not the base
price alone—maps to a POS line's unit price so modifier charges stay in the
subtotal. Modifier labels can be appended to the POS item note until its local
snapshot type carries structured modifiers.

Status mapping is explicit at the transport boundary:

- Supabase `pending_acceptance` -> POS incoming `pending`.
- Supabase `accepted`, `preparing`, `ready`, and `out_for_delivery` retain their
  names for outbound transitions.
- POS completion -> Supabase `delivered`; a Supabase `delivered` readback maps
  to the POS completed terminal state.
- `rejected` and `cancelled` retain their names.

The POS `remoteCreatedAt` field uses `placed_at`; `remoteUpdatedAt` uses
`updated_at`. `order_id`, `order_reference`, and `version` map to the POS
`remoteId`, `orderCode`, and `remoteVersion` fields respectively.
