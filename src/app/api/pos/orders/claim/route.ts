import { claimOrdersRequestSchema } from "@/lib/pos/api-contract";
import {
  buildBoundedPosClaimResponse,
  decodePosClaimCursor,
} from "@/lib/pos/claim-pagination";
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
    const input = claimOrdersRequestSchema.parse(value);
    const cursor = decodePosClaimCursor(input.cursor);

    const { data, error } = await auth.admin
      .schema("api")
      .rpc("pos_pull_website_orders", {
        p_terminal_id: auth.terminalId,
        p_limit: input.limit,
        p_include_test: input.includeTest,
        p_after_mode_rank: cursor?.modeRank ?? null,
        p_after_placed_at: cursor?.placedAt ?? null,
        p_after_order_id: cursor?.orderId ?? null,
      });
    if (error) throwPosDatabaseError(error);

    return posJson(
      buildBoundedPosClaimResponse(data, input.limit),
      { status: 200, requestId },
    );
  } catch (error) {
    return posErrorResponse(error, requestId);
  }
}
