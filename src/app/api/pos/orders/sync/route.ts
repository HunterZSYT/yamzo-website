import { syncOrdersRequestSchema } from "@/lib/pos/api-contract";
import {
  PosSyncCursorError,
  buildBoundedPosSyncResponse,
  decodePosSyncCursor,
} from "@/lib/pos/sync-pagination";
import {
  PosRequestError,
  authenticatePosRequest,
  posErrorResponse,
  posJson,
  posRequestId,
  readPosJsonBody,
  throwPosDatabaseError,
} from "@/lib/pos/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Read-only current-state feed for local POS mirrors. This intentionally does
 * not share the legacy claim route: website admin stays the only authority for
 * a website order's status, contents, discount, or cancellation.
 */
export async function POST(request: Request) {
  const requestId = posRequestId();

  try {
    const { rawBody, value } = await readPosJsonBody(request);
    const auth = await authenticatePosRequest(request, rawBody, requestId);
    const input = syncOrdersRequestSchema.parse(value);

    let cursor: ReturnType<typeof decodePosSyncCursor>;
    try {
      cursor = decodePosSyncCursor(input.cursor);
    } catch (error) {
      if (error instanceof PosSyncCursorError) {
        throw new PosRequestError(
          400,
          "INVALID_POS_REQUEST",
          "The POS request is invalid.",
        );
      }
      throw error;
    }

    const { data, error } = await auth.admin
      .schema("api")
      .rpc("pos_sync_website_orders", {
        p_terminal_id: auth.terminalId,
        p_limit: input.limit,
        p_include_test: input.includeTest,
        p_after_updated_at: cursor?.updatedAt ?? null,
        p_after_order_id: cursor?.orderId ?? null,
      });
    if (error) throwPosDatabaseError(error);

    return posJson(
      buildBoundedPosSyncResponse(data, input.limit),
      { status: 200, requestId },
    );
  } catch (error) {
    return posErrorResponse(error, requestId);
  }
}
