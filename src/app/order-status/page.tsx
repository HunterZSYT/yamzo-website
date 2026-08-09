import type { Metadata } from "next";

import { OrderStatusClient } from "@/components/orders/order-status-client";
import { hasSupabaseConfig, isGoogleAuthEnabled } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Order status",
  description: "Track a Yamzo Uttara order from the kitchen to delivery.",
  robots: { index: false, follow: false },
};

export default async function OrderStatusPage({ searchParams }: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  let authenticated = false;

  if (hasSupabaseConfig()) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    authenticated = Boolean(!error && data?.claims?.sub);
  }

  return (
    <OrderStatusClient
      initialOrder={order?.slice(0, 100) ?? null}
      authenticated={authenticated}
      googleAuthEnabled={hasSupabaseConfig() && isGoogleAuthEnabled()}
      turnstileSiteKey={
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? null
      }
    />
  );
}
