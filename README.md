# Yamzo Uttara Website

Production-oriented, bilingual ordering website for Yamzo Uttara. The application is a Next.js App Router frontend backed by Supabase, with a guarded public launch mode and an authenticated operations area.

## Current release posture

- Public visitors see the coming-soon gate until `site_runtime.published` is enabled.
- Active staff can preview the storefront and access `/admin` while the public gate is closed.
- Checkout totals are recalculated against the authoritative database catalog.
- Guest order tracking uses a high-entropy per-order token; a phone number alone is not authorization.
- Live and test orders are isolated. Test orders do not count toward live revenue or reporting.
- POS credentials and privileged Supabase keys must remain server/main-process only.

## Stack

- Next.js 16, React 19, TypeScript, Tailwind CSS
- Supabase Auth, Postgres, RLS, Realtime, Storage, and Vault references
- Vercel deployment and environment configuration
- Cloudflare DNS for `yamzouttara.com`
- Resend for authenticated sending and inbound mail
- Google Places API for live rating and review attribution
- Yamzo POS desktop integration through authenticated server endpoints

## Local setup

1. Install dependencies:

   ```powershell
   npm ci
   ```

2. Copy `.env.example` to `.env.development.local` and fill only local values. Never commit `.env*` files.

3. Start the application:

   ```powershell
   npm run dev
   ```

4. Open `http://localhost:3000`.

## Required configuration

Browser-safe:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` when guest checkout protection is enabled

Server-only:

- `SUPABASE_SECRET_KEY` (dedicated Vercel server secret for trusted POS and
  write-only admin integration RPCs)
- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_PLACES_PLACE_ID`
- `TURNSTILE_SECRET_KEY`
- POS terminal public keys are registered in Supabase; private signing keys remain only in each Electron main process

The trusted POS routes are `/api/pos/orders/claim`,
`/api/pos/orders/transition`, and `/api/pos/print/ack`. Every request uses a
timestamp, single-use nonce, body hash, and Ed25519 signature. The server
verifies the terminal's rotatable public key before using
`SUPABASE_SECRET_KEY`; neither privileged key is ever returned to browser code.
The packaged Windows POS provisions its Ed25519 key through Electron
`safeStorage` (DPAPI) and exports public registration material only.

If Vercel cannot be provisioned with a separate Supabase secret key, the same
route contract can be hosted as a Supabase Edge Function using its built-in
server credential. That is an alternative deployment surface, not a reason to
expose a privileged key to Next.js client code or Electron.

Meta CAPI tokens and other integration secrets belong in Supabase Vault or an equivalent server-only secret store. They must never be prefixed with `NEXT_PUBLIC_` or returned to an admin browser. Migration `20260808160523_meta_vault_write_only.sql` requires the `supabase_vault` extension, removes browser-role access to the Vault schema, and exposes only a `service_role` write contract. The admin form never pre-fills a saved token and application code never logs form values or RPC arguments.

## Verification

Run the full application gate:

```powershell
npm run check
```

That runs ESLint, TypeScript, Vitest, and a production Next.js build. Browser tests are separate:

```powershell
npx playwright test
```

SQL syntax verification:

```powershell
node supabase\tools\verify-sql-syntax.mjs node_modules\pg-query-emscripten\pg_query.js
```

Syntax parsing is not a replacement for executing the pgTAP suite against a disposable Supabase database.

## Supabase safety

- Migrations in `supabase/migrations` are append-only after deployment.
- Inspect and parse every migration before applying it.
- Apply hosted migrations only after explicit approval and with launch defaults remaining closed.
- Run security and performance advisors after hosted application.
- Do not run `supabase config push` from this repository until hosted Auth URLs/providers have been reconciled; local configuration contains localhost values.
- The Data API must expose only the intended `api` schema.

See [supabase/README.md](./supabase/README.md) for schema and test details.

## Deployment sequence

1. Pass local code, SQL, and browser gates.
2. Apply reviewed additive migrations to the intended Supabase project.
3. Verify RLS, grants, Auth providers, SMTP, Data API schemas, and advisors.
4. Configure Vercel environment variables without printing secrets.
5. Deploy a preview and verify the coming-soon gate, staff preview, checkout, order tracking, and POS transport.
6. Promote only after domain/TLS, Cloudflare DNS, Resend authentication, and rollback checks pass.

Cloudflare proxying is intentionally record-specific: web records may be proxied only when compatible with Vercel's ownership/TLS flow, while MX, SPF, DKIM, and DMARC records always remain DNS-only.

## Repository map

- `src/app` — routes, server-rendered pages, and HTTP endpoints
- `src/components/site` — storefront, checkout, launch gate, and legal UI
- `src/components/admin` — protected operations UI
- `src/lib/orders` — validated order contracts and catalog mapping
- `src/lib/supabase` — browser/server Supabase clients
- `supabase/migrations` — additive schema, RLS, functions, and seed data
- `supabase/tests` — database contract tests
- `tests` — application tests

## Operational boundaries

- Never place a Supabase service-role key in the browser or Electron renderer.
- Never identify order history by phone number alone.
- Never count test orders in live reporting or Meta Purchase events.
- Never proxy mail/authentication DNS records through Cloudflare.
- Never enable public ordering before business-hours enforcement, active POS menu reconciliation, and end-to-end order tests pass.
