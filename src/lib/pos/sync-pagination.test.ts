import { describe, expect, it } from "vitest";

import {
  buildBoundedPosSyncResponse,
  decodePosSyncCursor,
} from "@/lib/pos/sync-pagination";

const order = {
  order_id: "7c4fdac0-687f-4a34-a143-f16c5f7e7833",
  order_reference: "YZ-20260809-00000001",
  mode: "live" as const,
  status: "pending_acceptance" as const,
  version: 4,
  locale: "en" as const,
  subtotal_minor: 27_500,
  discount_minor: 2_500,
  delivery_fee_minor: 3_000,
  grand_total_minor: 28_000,
  currency_code: "BDT" as const,
  customer_note: "Ring the bell",
  placed_at: "2026-08-09T09:00:00.000Z",
  accepted_at: null,
  completed_at: null,
  cancelled_at: null,
  archived_at: null,
  updated_at: "2026-08-09T09:05:00.000Z",
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
      source_item_id: null,
      source_item_public_key: null,
      source_item_slug: null,
      name_en: "Chicken Momo",
      name_bn: "চিকেন মোমো",
      quantity: 1,
      unit_price_minor: 25_000,
      modifier_unit_total_minor: 2_500,
      effective_unit_price_minor: 27_500,
      line_total_minor: 27_500,
      customer_note: "No chilli",
      modifiers: [
        {
          source_option_id: null,
          group_name_en: "Extras",
          group_name_bn: "এক্সট্রা",
          option_name_en: "Extra sauce",
          option_name_bn: "এক্সট্রা সস",
          price_delta_minor: 2_500,
        },
      ],
    },
  ],
};

describe("POS sync pagination", () => {
  it("returns the full current snapshot and encodes the updated-at keyset cursor", () => {
    const response = buildBoundedPosSyncResponse([order], 1);

    expect(response.orders).toEqual([order]);
    expect(decodePosSyncCursor(response.nextCursor)).toEqual({
      updatedAt: order.updated_at,
      orderId: order.order_id,
    });
  });

  it("preserves authoritative terminal statuses instead of reducing them to a POS action", () => {
    const response = buildBoundedPosSyncResponse(
      [{
        ...order,
        status: "delivered" as const,
        accepted_at: "2026-08-09T09:06:00.000Z",
        completed_at: "2026-08-09T09:45:00.000Z",
      }],
      50,
    );

    expect(response.orders[0]?.status).toBe("delivered");
    expect(response.nextCursor).toBeNull();
  });

  it("returns a bounded prefix with an opaque resume cursor", () => {
    const second = {
      ...order,
      order_id: "bf6b149f-4985-464b-bf2e-c36187eebfaa",
      order_reference: "YZ-20260809-00000002",
      updated_at: "2026-08-09T09:06:00.000Z",
      items: [{
        ...order.items[0],
        id: "99580df1-3242-454d-bc34-358b093a78ef",
      }],
    };
    const firstPage = buildBoundedPosSyncResponse([order], 1);
    const byteLimit = Buffer.byteLength(JSON.stringify(firstPage), "utf8") + 8;
    const response = buildBoundedPosSyncResponse([order, second], 2, byteLimit);

    expect(response.orders).toHaveLength(1);
    expect(decodePosSyncCursor(response.nextCursor)?.orderId).toBe(order.order_id);
  });

  it("rejects malformed opaque cursors", () => {
    expect(() => decodePosSyncCursor("not-a-valid-cursor")).toThrow(
      /cursor is invalid/i,
    );
  });
});
