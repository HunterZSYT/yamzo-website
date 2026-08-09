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
- `api.get_my_account_snapshot() -> jsonb` is authenticated-only and returns
  the caller's profile preferences, saved phones, saved Uttara addresses, and
  up to 100 of their PII-free website-order summaries. It is the only account
  read contract for private contact/address values.
- `api.update_my_account_profile(display_name, preferred_locale) -> jsonb`,
  `api.remove_my_phone(phone_id)`, `api.save_my_delivery_address(...)`, and
  `api.remove_my_delivery_address(address_id)` are authenticated self-service
  mutations. Phone/address data remains private, is capped at five rows per
  account, and each write is rate-limited and audited without copying PII into
  audit details.
- `api.confirm_my_account_deletion(email, 'DELETE')` is an authenticated,
  rate-limited preflight that blocks active staff accounts. A trusted server
  must then delete the authenticated Supabase user and call the service-only
  `api.record_account_deletion_completion(user_id)`. The auth-user foreign-key
  policy preserves order records while cascades remove account preferences and
  saved contact data; the completion record contains only a one-way user-ID
  hash.
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
- `api.list_orders_for_operations(status?, mode?, limit = 50) -> jsonb` is the
  compact active website-arrivals list for the dashboard. It requires
  `orders.read`, excludes archived orders, and is PII-free.
- `api.list_website_orders_for_operations(status?, mode?, include_archived =
  false, before_placed_at?, before_order_id?, limit = 100) -> jsonb` is the
  bounded, newest-first PII-free history list used by `/admin/orders`. It uses
  an explicit `(placed_at, id)` keyset cursor so the workspace can load the full
  growing history without an unbounded response. It contains website orders
  only; archived live orders are included only when explicitly requested.
- `api.get_admin_order_detail(order_id) -> jsonb` requires `orders.read` and
  returns the deliberately privileged website-order fulfillment payload only
  after a staff member explicitly opens an order. It includes contact/address,
  immutable item snapshots, status events, and non-PII mutation-audit metadata.
- `api.admin_update_website_order(order_id, expected_version, to_status?,
  items?, discount_minor?, delivery_fee_minor?, note?) -> jsonb` requires
  `orders.manage`. It is the sole website-admin mutation for independent status
  selection, full line-item replacement, discount/delivery adjustments, and
  optimistic versioning. The server recalculates totals, appends a non-PII
  before/after audit, records a status event when appropriate, and publishes a
  new website snapshot. It creates receipt/KOT print jobs only when an order
  first enters `accepted`.
- `api.archive_live_website_order(order_id, expected_version, note) -> jsonb`
  requires `orders.manage`. It cancels non-terminal live orders as needed and
  archives them without deleting their fulfillment or audit record. It is the
  only live-order delete semantic.
- `api.list_order_arrivals_for_operations(after_placed_at?, after_order_id?,
  limit = 20) -> jsonb` requires `orders.read` and returns a compact PII-free
  keyset feed of `pending_acceptance` website orders for the website-admin
  audible arrival queue. It is intentionally independent of POS activity.
- `api.get_order_for_operations(order_id) -> jsonb` is a legacy privileged
  payload retained for trusted compatibility; new admin code uses
  `api.get_admin_order_detail`.
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

- `api.pos_sync_website_orders(terminal_id, limit = 50, include_test = false,
  after_updated_at?, after_order_id?) -> jsonb` is service-role only and is the
  read-only current-state feed for local POS mirrors. It returns current website
  snapshots in ascending `(updated_at, id)` order and never creates a claim or
  changes an order.
- `api.apply_pos_order_event(...)` is deliberately disabled and always raises
  `POS_STATUS_MUTATION_DISABLED`. A POS must never accept, reject, edit, or
  change a website-order status; website admin is authoritative.
- The legacy `api.transition_order(...)` path is also trigger-blocked for
  website-source orders with `WEBSITE_ADMIN_ORDER_AUTHORITY_REQUIRED`; it
  remains only for non-website compatibility data.
- `api.apply_pos_print_ack(terminal_id, event_key, order_id, kind, succeeded,
  error_code?) -> jsonb` is the remaining signed terminal write. It records
  print acknowledgement only; it cannot change an order.
- `api.claim_print_jobs(terminal_id, limit = 10, lease_seconds = 90) -> jsonb`
  and `api.ack_print_job(...)` remain internal print-queue compatibility
  contracts. New terminal traffic uses the signed print acknowledgement route.
- `api.hard_delete_test_order(order_id, expected_reference, reason_code,
  confirmation) -> boolean` requires `orders.test_delete`, exact confirmation,
  and writes a non-PII tombstone. Production orders are trigger-protected from
  hard deletion.

POS device secrets are not stored in application code or seeded here. A trusted
server transport must authenticate the terminal before using the `service_role`
RPC grants; never embed a Supabase secret/service key in Electron or browser
bundles.

Legacy claim/renew/release routes remain only during client migration and must
not be used by the current POS. Browser-authenticated staff cannot invoke the
direct terminal service contracts. Production POS traffic uses the signed,
read-only transport below.

### POS transport mapping

`POST /api/pos/orders/sync` is the production terminal pull route. It accepts a
signed JSON body:

```json
{ "cursor": "opaque-or-null", "limit": 1, "includeTest": false }
```

`limit` is `1..50`; `cursor` is an opaque base64url value owned by the server.
Each request must include the usual Yamzo terminal signature headers
(`x-yamzo-terminal`, `x-yamzo-timestamp`, `x-yamzo-nonce`,
`x-yamzo-body-sha256`, and `x-yamzo-signature`). The route verifies terminal
status and nonce replay protection, then returns:

```text
{ orders: WebsiteOrderSnapshot[], nextCursor: string | null }
```

The cursor advances only to the final returned snapshot and is based on
`(updated_at, order_id)`, so a terminal retries safely after an interrupted
pull. Responses are private, no-store, bounded below the Electron transport
ceiling, and include no claim token.

Every `WebsiteOrderSnapshot` contains `order_id`, `order_reference`, `mode`,
`status`, monotonic `version`, `locale`, `subtotal_minor`, `discount_minor`,
`delivery_fee_minor`, `grand_total_minor`, `currency_code`, `customer_note`,
`placed_at`, `accepted_at`, `completed_at`, `cancelled_at`, `archived_at`,
`updated_at`, `contact`, and `items`. Each item includes `id`,
`source_item_id?`, `source_item_public_key?`, `source_item_slug?`, immutable
bilingual names, quantities/prices, note, and structured modifiers.

The sync and print-job payloads share
`private.build_order_operations_payload`. Each item contains
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

Status mapping is read-only at the transport boundary. The POS displays the
website snapshot status (`pending_acceptance`, `accepted`, `preparing`, `ready`,
`out_for_delivery`, `delivered`, `rejected`, or `cancelled`) and moves a local
card/history entry accordingly. It never maps local UI actions back into a
website mutation.

The POS `remoteCreatedAt` field uses `placed_at`; `remoteUpdatedAt` uses
`updated_at`. `order_id`, `order_reference`, and `version` map to the POS
`remoteId`, `orderCode`, and `remoteVersion` fields respectively.
