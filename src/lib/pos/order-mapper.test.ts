import { describe, expect, it } from "vitest";

import {
  mapClaimedOrder,
  minorToTaka,
  PosOrderMappingError,
} from "@/lib/pos/order-mapper";

const rawOrder = {
  order_id: "7c4fdac0-687f-4a34-a143-f16c5f7e7833",
  order_reference: "YZ-20260808-00000001",
  mode: "live" as const,
  status: "pending_acceptance" as const,
  version: 1,
  currency_code: "BDT" as const,
  subtotal_minor: 27_500,
  discount_minor: 2_500,
  delivery_fee_minor: 3_000,
  grand_total_minor: 28_000,
  customer_note: "Ring the bell",
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
      customer_note: "No chilli",
      modifiers: [{ option_name_en: "Extra sauce" }],
    },
  ],
};

describe("claimed-order POS mapping", () => {
  it("maps stable catalog IDs and divides minor units by 100 exactly", () => {
    expect(mapClaimedOrder(rawOrder)).toMatchObject({
      remoteId: rawOrder.order_id,
      orderCode: rawOrder.order_reference,
      remoteVersion: 1,
      status: "pending",
      subtotal: 275,
      deliveryFee: 30,
      discount: 25,
      total: 280,
      items: [
        {
          menuItemPublicId: "menu_item_chicken_momo",
          unitPrice: 275,
          note: "No chilli | Options: Extra sauce",
        },
      ],
    });
  });

  it("refuses to round a fractional taka amount", () => {
    expect(() => minorToTaka(10_001)).toThrow(PosOrderMappingError);
    expect(() =>
      mapClaimedOrder({
        ...rawOrder,
        subtotal_minor: 27_501,
        grand_total_minor: 28_001,
        items: [
          {
            ...rawOrder.items[0],
            effective_unit_price_minor: 27_501,
            line_total_minor: 27_501,
          },
        ],
      }),
    ).toThrow(/exactly in whole taka/i);
  });
});
