import { after } from "next/server";

import { dispatchPendingMetaPurchases } from "@/lib/meta/capi-server";
import { transitionOrderRequestSchema } from "@/lib/pos/api-contract";
import {
  authenticatePosRequest,
  posErrorResponse,
  posJson,
  posRequestId,
  readPosJsonBody,
  throwPosDatabaseError,
} from "@/lib/pos/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(request: Request) {
  const requestId = posRequestId();
  try {
    const { rawBody, value } = await readPosJsonBody(request);
    const auth = await authenticatePosRequest(request, rawBody, requestId);
    const input = transitionOrderRequestSchema.parse(value);

    const { data, error } = await auth.admin
      .schema("api")
      .rpc("apply_pos_order_event", {
        p_terminal_id: auth.terminalId,
        p_event_key: input.eventKey,
        p_order_id: input.orderId,
        p_to_status: input.toStatus,
        p_expected_version: input.expectedVersion,
        p_note: input.note ?? null,
    });
    if (error) throwPosDatabaseError(error);

    if (input.toStatus === "delivered") {
      after(async () => {
        await dispatchPendingMetaPurchases({ limit: 1 });
      });
    }

    return posJson({ accepted: true, result: data }, { status: 200, requestId });
  } catch (error) {
    return posErrorResponse(error, requestId);
  }
}
