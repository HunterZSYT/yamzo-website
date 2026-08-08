import { randomUUID } from "node:crypto";

import {
  createOrderRequestSchema,
  createOrderRpcResponseSchema,
  idempotencyKeySchema,
} from "@/lib/orders/api-contract";
import { resolveOrderLines } from "@/lib/orders/catalog";
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
import { rateBucket } from "@/lib/security/request-identity";
import { verifyCheckoutTurnstile } from "@/lib/security/turnstile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = randomUUID();

  try {
    assertSameOrigin(request);
    const idempotency = idempotencyKeySchema.safeParse(
      request.headers.get("idempotency-key"),
    );
    if (!idempotency.success) {
      return privateJson(
        {
          error: "IDEMPOTENCY_KEY_REQUIRED",
          message: "A valid Idempotency-Key header is required.",
          requestId,
        },
        { status: 400, requestId },
      );
    }

    const body = createOrderRequestSchema.safeParse(await readJsonBody(request));
    if (!body.success) return zodErrorResponse(body.error, requestId);

    const items = resolveOrderLines(body.data.lines);

    const sessionClient = await createClient();
    const { data: claimsData, error: claimsError } =
      await sessionClient.auth.getClaims();
    const authenticated = Boolean(!claimsError && claimsData?.claims?.sub);

    if (
      !authenticated &&
      (!body.data.turnstileToken ||
        !(await verifyCheckoutTurnstile(request, body.data.turnstileToken)))
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

    const rpcArguments = {
      p_idempotency_key: idempotency.data,
      p_full_name: body.data.customer.fullName,
      p_phone: body.data.customer.phone,
      p_sector_number: body.data.customer.sector,
      p_road_number: body.data.customer.road,
      p_house_number: body.data.customer.house,
      p_flat_number: body.data.customer.flat,
      p_items: items,
      p_expected_subtotal_minor: body.data.expectedSubtotalMinor,
      p_locale: body.data.locale,
      p_customer_note: body.data.customer.notes || null,
    };
    const { data, error } = authenticated
      ? await sessionClient.schema("api").rpc("create_order_tx", rpcArguments)
      : await createAdminClient().schema("api").rpc("create_guest_order_tx", {
          ...rpcArguments,
          p_rate_bucket: rateBucket(request, "guest-order-create"),
        });

    if (error) return databaseErrorResponse(error, requestId);
    const result = createOrderRpcResponseSchema.safeParse(data);
    if (!result.success) return internalErrorResponse(requestId);

    return privateJson(
      {
        orderNumber: result.data.order_reference.slice(3),
        publicId: result.data.order_reference,
        trackingToken: result.data.tracking_token,
        mode: result.data.mode,
      },
      {
        status: 201,
        requestId,
        headers: {
          location: `/order-status?order=${encodeURIComponent(result.data.order_reference)}`,
        },
      },
    );
  } catch (error) {
    if (error instanceof RequestContractError) {
      return requestContractErrorResponse(error, requestId);
    }
    return internalErrorResponse(requestId);
  }
}
