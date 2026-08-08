import { randomUUID } from "node:crypto";

import {
  orderReferenceSchema,
  trackedOrderRpcResponseSchema,
  trackingTokenSchema,
} from "@/lib/orders/api-contract";
import {
  databaseErrorResponse,
  internalErrorResponse,
  privateJson,
} from "@/lib/orders/http";
import { presentTrackedOrder } from "@/lib/orders/presenters";
import { rateBucket } from "@/lib/security/request-identity";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  const requestId = randomUUID();
  const { reference: rawReference } = await params;
  const reference = orderReferenceSchema.safeParse(rawReference);
  const token = trackingTokenSchema.safeParse(
    request.headers.get("x-yamzo-tracking-token"),
  );

  // Keep malformed references and missing/invalid tokens indistinguishable from
  // unknown orders so this endpoint cannot be used to enumerate references.
  if (!reference.success || !token.success) {
    return privateJson(
      {
        error: "ORDER_NOT_FOUND",
        message: "We could not find that order.",
        requestId,
      },
      { status: 404, requestId },
    );
  }

  try {
    const { data, error } = await createAdminClient()
      .schema("api")
      .rpc("get_order_by_tracking", {
        p_order_reference: reference.data,
        p_tracking_token: token.data,
        p_rate_bucket: rateBucket(request, "order.tracking_lookup"),
      });

    if (error) return databaseErrorResponse(error, requestId);
    if (data === null) {
      return databaseErrorResponse(
        { code: "P0002", message: "ORDER_NOT_FOUND" },
        requestId,
      );
    }
    const result = trackedOrderRpcResponseSchema.safeParse(data);
    if (!result.success) return internalErrorResponse(requestId);

    return privateJson(
      {
        order: presentTrackedOrder(result.data),
        items: result.data.items,
        events: result.data.events,
      },
      { status: 200, requestId },
    );
  } catch {
    return internalErrorResponse(requestId);
  }
}
