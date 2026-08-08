import { z } from "zod";

import {
  rawClaimedOrderSchema,
  type PosOrderSnapshot,
  type RawClaimedOrder,
} from "@/lib/pos/api-contract";
import {
  mapClaimedOrder,
  PosOrderMappingError,
} from "@/lib/pos/order-mapper";

/** Kept below the Electron transport's 1 MiB response ceiling. */
export const MAX_POS_CLAIM_RESPONSE_BYTES = 900 * 1024;

const cursorPayloadSchema = z
  .object({
    modeRank: z.union([z.literal(0), z.literal(1)]),
    placedAt: z.string().datetime({ offset: true }),
    orderId: z.string().uuid(),
  })
  .strict();

export type PosClaimCursor = z.infer<typeof cursorPayloadSchema>;

export interface PosClaimResponse {
  orders: PosOrderSnapshot[];
  nextCursor: string | null;
}

export function decodePosClaimCursor(value: string | null | undefined): PosClaimCursor | null {
  if (!value) return null;
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(value)) {
    throw new PosOrderMappingError("The POS claim cursor is invalid.");
  }
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    return cursorPayloadSchema.parse(JSON.parse(decoded) as unknown);
  } catch {
    throw new PosOrderMappingError("The POS claim cursor is invalid.");
  }
}

export function encodePosClaimCursor(order: RawClaimedOrder): string {
  const value = Buffer.from(
    JSON.stringify({
      modeRank: order.mode === "live" ? 0 : 1,
      placedAt: order.placed_at,
      orderId: order.order_id,
    } satisfies PosClaimCursor),
    "utf8",
  ).toString("base64url");
  if (value.length > 200) {
    throw new PosOrderMappingError("The POS claim cursor is invalid.");
  }
  return value;
}

/**
 * Returns the largest ordered prefix that fits below the desktop response cap.
 * The cursor points at the last included order, so claimed-but-omitted rows are
 * delivered on the next poll instead of being lost or starving behind page one.
 */
export function buildBoundedPosClaimResponse(
  value: unknown,
  requestLimit: number,
  maxBytes = MAX_POS_CLAIM_RESPONSE_BYTES,
): PosClaimResponse {
  const rawOrders = z.array(rawClaimedOrderSchema).max(10).parse(value);
  const included: PosOrderSnapshot[] = [];
  let response: PosClaimResponse = { orders: [], nextCursor: null };

  for (let index = 0; index < rawOrders.length; index += 1) {
    const order = rawOrders[index];
    const candidateOrders = [...included, mapClaimedOrder(order)];
    const hasMore = index < rawOrders.length - 1 || rawOrders.length === requestLimit;
    const candidate: PosClaimResponse = {
      orders: candidateOrders,
      nextCursor: hasMore ? encodePosClaimCursor(order) : null,
    };
    if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > maxBytes) {
      if (included.length === 0) {
        throw new PosOrderMappingError(
          "A claimed order exceeds the bounded POS response size.",
        );
      }
      break;
    }
    included.push(candidate.orders[candidate.orders.length - 1]);
    response = candidate;
  }

  return response;
}
