import { describe, expect, it } from "vitest";

import {
  buildBoundedPosClaimResponse,
  decodePosClaimCursor,
} from "@/lib/pos/claim-pagination";

const order = {
  order_id: "7c4fdac0-687f-4a34-a143-f16c5f7e7833",
  order_reference: "YZ-20260808-00000001",
  mode: "live" as const,
  status: "pending_acceptance" as const,
  version: 1,
  currency_code: "BDT" as const,
  subtotal_minor: 27_500,
  discount_minor: 0,
  delivery_fee_minor: 3_000,
  grand_total_minor: 30_500,
  customer_note: null,
  placed_at: "2026-08-08T09:00:00.000Z",
  updated_at: "2026-08-08T09:00:00.000Z",
  contact: {
    full_name: "Test Customer",
    phone_e164: "+8801712345678",
    sector_number: 11,
    road_number: "20",
    house_number: "80",
    flat_number: "4B",
  },
  items: [
    {
      id: "c6598852-e7b3-47c7-9342-63fabf48008c",
      source_item_public_key: "menu_item_chicken_momo",
      name_en: "Chicken Momo",
      quantity: 1,
      effective_unit_price_minor: 27_500,
      line_total_minor: 27_500,
      customer_note: null,
      modifiers: [],
    },
  ],
};

describe("POS claim pagination", () => {
  it("encodes an opaque keyset cursor from the last returned order", () => {
    const response = buildBoundedPosClaimResponse([order], 1);
    expect(response.nextCursor).toBeTruthy();
    expect(decodePosClaimCursor(response.nextCursor)).toEqual({
      modeRank: 0,
      placedAt: order.placed_at,
      orderId: order.order_id,
    });
    expect(() => decodePosClaimCursor("not-a-valid-cursor"))
      .toThrow(/cursor is invalid/i);
  });

  it("returns a bounded prefix and a cursor when more claimed rows remain", () => {
    const second = {
      ...order,
      order_id: "bf6b149f-4985-464b-bf2e-c36187eebfaa",
      order_reference: "YZ-20260808-00000002",
      placed_at: "2026-08-08T09:01:00.000Z",
      updated_at: "2026-08-08T09:01:00.000Z",
      items: [{
        ...order.items[0],
        id: "99580df1-3242-454d-bc34-358b093a78ef",
      }],
    };
    const oneOrder = buildBoundedPosClaimResponse([order], 1);
    const oneOrderBytes = Buffer.byteLength(JSON.stringify(oneOrder), "utf8");
    const bounded = buildBoundedPosClaimResponse(
      [order, second],
      2,
      oneOrderBytes + 8,
    );
    expect(bounded.orders).toHaveLength(1);
    expect(decodePosClaimCursor(bounded.nextCursor)?.orderId).toBe(order.order_id);
  });

  it("resets the cursor after a short final page", () => {
    expect(buildBoundedPosClaimResponse([order], 10).nextCursor).toBeNull();
  });
});
