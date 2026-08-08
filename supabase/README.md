# Yamzo local Supabase foundation

This directory is local-only until the migration review is approved. It does
not contain credentials and has not been applied to the connected project.

## Architecture

- `api`: the only PostgREST-exposed schema; narrow security-invoker views and
  validated RPCs.
- `app`: identities, runtime, delivery, catalog, merchandising, and operational
  order records.
- `private`: phone/address PII, terminal credential hashes, tracking hashes,
  abuse controls, idempotency, integration Vault references, outbox, and audit.
- `public`: locked and intentionally unused by Yamzo.
- `vault`: supplied by the `supabase_vault` extension and reachable only from
  trusted security-definer code. Browser roles have no schema/table/function
  access; admin reads expose only whether a token reference exists.

Runtime defaults are safe: `site_published=false`,
`live_orders_enabled=false`, and `test_mode_enabled=true`. Store hours seed as
closed because verified hours have not been supplied. Uttara sectors 1-18 are
seeded with zero placeholder delivery/minimum values that an approved operator
must review before live launch.

## Local verification

Requires Node.js 22+ and a working Docker engine:

```powershell
npx --yes supabase@2.111.0 start
npx --yes supabase@2.111.0 db reset --local
npx --yes supabase@2.111.0 test db
npx --yes supabase@2.111.0 db lint --local --level error
npx --yes supabase@2.111.0 migration list --local
```

The CLI is invoked at a pinned version. Do not use `service_role`/secret keys in
Next public environment variables or the Electron application.

The write-only Meta admin flow requires `SUPABASE_SECRET_KEY` in the Vercel
server environment. The authenticated browser action authorizes the current
staff session first, then the trusted server calls the service-only Vault RPC.
Saved secret plaintext is never returned to the browser or included in Yamzo
application/audit logs.

## External launch blockers

- Google OAuth client ID/secret must be created in the correct Google project
  and configured out-of-band.
- The first owner must authenticate, request staff access, and then be approved
  through a one-time trusted server/dashboard bootstrap. No email address or
  user UUID is hardcoded into seed data.
- Delivery fees, minimums, and verified business hours must be reviewed.
- Google Places place ID/API secret, Meta CAPI token, and POS terminal secret
  must be provisioned. Secrets belong in Supabase Vault or server-only platform
  secret storage; only their references belong in tables.
- Private Realtime Broadcast is a later additive migration. This foundation
  uses leased polling as the reliable baseline and does not modify Supabase's
  locked `realtime` schema.
