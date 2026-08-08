import { printAckRequestSchema } from "@/lib/pos/api-contract";
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

export async function POST(request: Request) {
  const requestId = posRequestId();
  try {
    const { rawBody, value } = await readPosJsonBody(request);
    const auth = await authenticatePosRequest(request, rawBody, requestId);
    const input = printAckRequestSchema.parse(value);

    const { data, error } = await auth.admin
      .schema("api")
      .rpc("apply_pos_print_ack", {
        p_terminal_id: auth.terminalId,
        p_event_key: input.eventKey,
        p_order_id: input.orderId,
        p_kind: input.kind,
        p_succeeded: input.succeeded,
        p_error_code: input.errorCode ?? null,
      });
    if (error) throwPosDatabaseError(error);

    return posJson({ accepted: true, result: data }, { status: 200, requestId });
  } catch (error) {
    return posErrorResponse(error, requestId);
  }
}
