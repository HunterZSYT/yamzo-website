import { z } from "zod";

import {
  rawSyncedOrderSchema,
  type RawSyncedOrder,
} from "@/lib/pos/api-contract";

/** Kept below the Electron transport's 1 MiB response ceiling. */
export const MAX_POS_SYNC_RESPONSE_BYTES = 900 * 1024;

const cursorPayloadSchema = z
  .object({
    updatedAt: z.string().datetime({ offset: true }),
    orderId: z.string().uuid(),
  })
  .strict();

export type PosSyncCursor = z.infer<typeof cursorPayloadSchema>;

export interface PosSyncResponse {
  orders: RawSyncedOrder[];
  nextCursor: string | null;
}

export class PosSyncCursorError extends Error {
  constructor() {
    super("The POS sync cursor is invalid.");
    this.name = "PosSyncCursorError";
  }
}

export function decodePosSyncCursor(
  value: string | null | undefined,
): PosSyncCursor | null {
  if (!value) return null;
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(value)) {
    throw new PosSyncCursorError();
  }

  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    return cursorPayloadSchema.parse(JSON.parse(decoded) as unknown);
  } catch {
    throw new PosSyncCursorError();
  }
}

export function encodePosSyncCursor(order: RawSyncedOrder): string {
  const value = Buffer.from(
    JSON.stringify({
      updatedAt: order.updated_at,
      orderId: order.order_id,
    } satisfies PosSyncCursor),
    "utf8",
  ).toString("base64url");

  if (value.length > 200) {
    throw new PosSyncCursorError();
  }

  return value;
}

/**
 * Returns the largest ordered snapshot prefix that stays safe for the local
 * Electron transport. The cursor always points to the final returned row, so
 * a local mirror never skips an order when an unusually large payload lands.
 */
export function buildBoundedPosSyncResponse(
  value: unknown,
  requestLimit: number,
  maxBytes = MAX_POS_SYNC_RESPONSE_BYTES,
): PosSyncResponse {
  const orders = z.array(rawSyncedOrderSchema).max(50).parse(value);
  const included: RawSyncedOrder[] = [];
  let response: PosSyncResponse = { orders: [], nextCursor: null };

  for (let index = 0; index < orders.length; index += 1) {
    const order = orders[index];
    const candidateOrders = [...included, order];
    const hasMore = index < orders.length - 1 || orders.length === requestLimit;
    const candidate: PosSyncResponse = {
      orders: candidateOrders,
      nextCursor: hasMore ? encodePosSyncCursor(order) : null,
    };

    if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > maxBytes) {
      if (included.length === 0) {
        throw new Error("A synced order exceeds the bounded POS response size.");
      }
      break;
    }

    included.push(order);
    response = candidate;
  }

  return response;
}
