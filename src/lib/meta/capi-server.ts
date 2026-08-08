import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  metaPixelRuntimeConfigSchema,
  metaPurchaseClaimsSchema,
} from "@/lib/meta/contracts";
import {
  metaDispatchErrorCode,
  sendMetaPurchaseEvent,
} from "@/lib/meta/capi-core";
import { createAdminClient } from "@/lib/supabase/admin";

const META_DATABASE_TIMEOUT_MS = 2_000;

export type MetaDispatchSummary = {
  claimed: number;
  sent: number;
  failed: number;
};

export async function getMetaPixelId(): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .schema("api")
      .rpc("get_meta_pixel_runtime_config")
      .abortSignal(AbortSignal.timeout(META_DATABASE_TIMEOUT_MS));
    if (error) return null;
    const parsed = metaPixelRuntimeConfigSchema.safeParse(data);
    if (!parsed.success || !parsed.data.enabled) return null;
    return parsed.data.pixel_id;
  } catch {
    return null;
  }
}

export async function dispatchPendingMetaPurchases(options?: {
  admin?: SupabaseClient;
  limit?: number;
  timeoutMs?: number;
}): Promise<MetaDispatchSummary> {
  const summary: MetaDispatchSummary = { claimed: 0, sent: 0, failed: 0 };

  try {
    const admin = options?.admin ?? createAdminClient();
    const limit = Math.min(10, Math.max(1, options?.limit ?? 5));
    const { data, error } = await admin
      .schema("api")
      .rpc("claim_meta_purchase_events", {
        p_limit: limit,
        p_claim_seconds: 120,
      })
      .abortSignal(AbortSignal.timeout(META_DATABASE_TIMEOUT_MS));
    if (error) return summary;

    const claims = metaPurchaseClaimsSchema.safeParse(data);
    if (!claims.success) return summary;
    summary.claimed = claims.data.length;
    if (claims.data.length === 0) return summary;

    const eventSourceUrl = resolveEventSourceUrl();
    await Promise.all(
      claims.data.map(async (claim) => {
        try {
          await sendMetaPurchaseEvent(claim, {
            eventSourceUrl,
            timeoutMs: options?.timeoutMs,
          });
          const finished = await finishMetaPurchase(
            admin,
            claim.outbox_id,
            claim.claim_token,
            true,
            null,
          );
          if (!finished) {
            summary.failed += 1;
            return;
          }
          summary.sent += 1;
        } catch (error) {
          await finishMetaPurchase(
            admin,
            claim.outbox_id,
            claim.claim_token,
            false,
            metaDispatchErrorCode(error),
          );
          summary.failed += 1;
        }
      }),
    );
  } catch {
    // Meta, Vault, network, and claim failures must never affect order state.
  }

  return summary;
}

async function finishMetaPurchase(
  admin: SupabaseClient,
  outboxId: number,
  claimToken: string,
  succeeded: boolean,
  errorCode: string | null,
): Promise<boolean> {
  try {
    const { error } = await admin
      .schema("api")
      .rpc("finish_meta_purchase_event", {
        p_outbox_id: outboxId,
        p_claim_token: claimToken,
        p_succeeded: succeeded,
        p_error_code: errorCode,
      })
      .abortSignal(AbortSignal.timeout(META_DATABASE_TIMEOUT_MS));
    return !error;
  } catch {
    return false;
  }
}

function resolveEventSourceUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  try {
    const site = new URL(configured || "https://yamzouttara.com");
    if (site.protocol !== "https:") throw new Error("HTTPS_REQUIRED");
    return new URL("/order-status", site.origin).toString();
  } catch {
    return "https://yamzouttara.com/order-status";
  }
}
