import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "@/lib/env";

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
      headers: {
        "x-client-info": "yamzo-website-server",
      },
    },
  });
}
