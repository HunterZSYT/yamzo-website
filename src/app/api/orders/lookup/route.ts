import { randomUUID } from "node:crypto";

import {
  orderHistoryRowSchema,
  orderLookupRequestSchema,
  phoneLookupRpcResponseSchema,
  trackedOrderRpcResponseSchema,
} from "@/lib/orders/api-contract";
import {
  assertSameOrigin,
  databaseErrorResponse,
  internalErrorResponse,
  privateJson,
  readJsonBody,
  RequestContractError,
  requestContractErrorResponse,
  zodErrorResponse,
} from "@/lib/orders/http";
import {
  presentHistoryOrder,
  presentTrackedOrder,
} from "@/lib/orders/presenters";
import type { OrderSummary } from "@/lib/orders/types";
import { rateBucket } from "@/lib/security/request-identity";
import { verifyTurnstileAction } from "@/lib/security/turnstile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = randomUUID();

  try {
    assertSameOrigin(request);
    const body = orderLookupRequestSchema.safeParse(await readJsonBody(request));
    if (!body.success) return zodErrorResponse(body.error, requestId);

    const sessionClient = await createClient();
    const trackingClient = createAdminClient();
    const byReference = new Map<string, OrderSummary>();
    const { data: claimsData, error: claimsError } =
      await sessionClient.auth.getClaims();
    const authenticated = Boolean(!claimsError && claimsData?.claims?.sub);
    let latest: {
      referenceHint: string;
      status: string;
      mode: "test" | "live";
      placedAt: string;
    } | null = null;

    if (authenticated) {
      const { data, error } = await sessionClient
        .schema("api")
        .from("my_order_history")
        .select(
          "id,order_reference,mode,status,version,grand_total_minor,currency_code,placed_at,completed_at,item_count",
        )
        .order("placed_at", { ascending: false })
        .limit(50);

      if (error) return databaseErrorResponse(error, requestId);
      const history = orderHistoryRowSchema.array().safeParse(data);
      if (!history.success) return internalErrorResponse(requestId);
      for (const order of history.data) {
        byReference.set(order.order_reference, presentHistoryOrder(order));
      }
    }

    const credentials = Array.from(
      new Map(
        body.data.trackingTokens.map((credential) => [
          credential.publicId,
          credential,
        ]),
      ).values(),
    );
    const trackingRateBucket = credentials.length
      ? rateBucket(request, "order.tracking_lookup")
      : null;
    const trackedResults = await Promise.all(
      credentials.map(async (credential) => ({
        credential,
        result: await trackingClient
          .schema("api")
          .rpc("get_order_by_tracking", {
            p_order_reference: credential.publicId,
            p_tracking_token: credential.token,
            p_rate_bucket: trackingRateBucket!,
          }),
      })),
    );

    for (const { result } of trackedResults) {
      if (result.error) {
        // A stale or mistyped per-order credential reveals nothing and does not
        // prevent other authorized history from loading.
        if (result.error.message === "ORDER_NOT_FOUND") continue;
        return databaseErrorResponse(result.error, requestId);
      }
      if (result.data === null) continue;
      const tracked = trackedOrderRpcResponseSchema.safeParse(result.data);
      if (!tracked.success) return internalErrorResponse(requestId);
      byReference.set(
        tracked.data.order_reference,
        presentTrackedOrder(tracked.data),
      );
    }

    if (!authenticated) {
      if (
        !body.data.turnstileToken ||
        !(await verifyTurnstileAction(
          request,
          body.data.turnstileToken,
          "order_lookup",
        ))
      ) {
        return privateJson(
          {
            error: "SECURITY_VERIFICATION_FAILED",
            message: "Complete the security check and try again.",
            requestId,
          },
          { status: 403, requestId },
        );
      }

      const { data, error } = await createAdminClient()
        .schema("api")
        .rpc("lookup_latest_order_status", {
          p_phone: body.data.phone,
          p_rate_bucket: rateBucket(request, "order.phone_lookup"),
        });
      if (error) return databaseErrorResponse(error, requestId);

      const phoneLookup = phoneLookupRpcResponseSchema.safeParse(data);
      if (!phoneLookup.success) return internalErrorResponse(requestId);
      if (phoneLookup.data.found) {
        latest = {
          referenceHint: phoneLookup.data.reference_hint,
          status: phoneLookup.data.status,
          mode: phoneLookup.data.mode,
          placedAt: phoneLookup.data.placed_at,
        };
      }
    }

    const orders = Array.from(byReference.values()).sort(
      (left, right) =>
        new Date(right.placedAt).getTime() - new Date(left.placedAt).getTime(),
    );

    return privateJson(
      { orders, latest },
      { status: 200, requestId },
    );
  } catch (error) {
    if (error instanceof RequestContractError) {
      return requestContractErrorResponse(error, requestId);
    }
    return internalErrorResponse(requestId);
  }
}
