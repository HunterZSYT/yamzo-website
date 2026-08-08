import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "@/lib/env";

const MODERN_SECRET_KEY_PREFIX = "sb_secret_";

function isSupabaseRestRequest(input: RequestInfo | URL): boolean {
  const url =
    typeof input === "string"
      ? new URL(input)
      : input instanceof URL
        ? input
        : new URL(input.url);

  return url.pathname === "/rest/v1" || url.pathname.startsWith("/rest/v1/");
}

/**
 * Modern Supabase secret keys are accepted by the REST gateway in `apikey`,
 * but must not be sent as a bearer token. supabase-js still installs that
 * bearer token by default, so remove only that exact default header for REST
 * calls. A user/session bearer token is deliberately left intact.
 */
export function createAdminRestFetch(
  secretKey: string,
  fetchImpl: typeof fetch = fetch,
): typeof fetch {
  if (!secretKey.startsWith(MODERN_SECRET_KEY_PREFIX)) {
    return fetchImpl;
  }

  return async (input, init) => {
    if (!isSupabaseRestRequest(input)) {
      return fetchImpl(input, init);
    }

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );

    // Preserve a real user/session Authorization header. Only the SDK's
    // fallback `Bearer <sb_secret_...>` header is incompatible with modern
    // secret keys.
    if (headers.get("authorization") === `Bearer ${secretKey}`) {
      headers.delete("authorization");
    }

    // supabase-js adds this itself, but retaining it here makes the REST
    // contract explicit even if the SDK's internal header handling changes.
    if (!headers.has("apikey")) {
      headers.set("apikey", secretKey);
    }

    return fetchImpl(input, { ...init, headers });
  };
}

/**
 * Creates a privileged Supabase client for trusted server code only.
 *
 * Never import this module from a Client Component or Electron. The secret key
 * belongs in Vercel's encrypted environment and must not be logged.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error(
      "Supabase server access is not configured. Set SUPABASE_SECRET_KEY.",
    );
  }

  const { url } = getSupabaseConfig();
  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      fetch: createAdminRestFetch(secretKey),
      headers: {
        "x-client-info": "yamzo-website-server",
      },
    },
  });
}
