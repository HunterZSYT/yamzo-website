import { describe, expect, it } from "vitest";

import {
  adminOrderMutationInputSchema,
  parseAdminOrderDetail,
  toAdminOrderMutationPayload,
} from "./order-contract";

const orderId = "a6ebc476-6126-4efa-b8be-bd7140e11be7";

describe("admin website-order contract", () => {
  it("parses privileged details only when the complete server payload is valid", () => {
    const detail = parseAdminOrderDetail({
      order: {
        order_id: orderId,
        order_reference: "YZ-20260809-00000001",
        mode: "live",
        status: "pending_acceptance",
        version: 3,
        locale: "en",
        subtotal_minor: 25_000,
        discount_minor: 500,
        delivery_fee_minor: 3_000,
        grand_total_minor: 27_500,
        currency_code: "BDT",
        customer_note: "Call from the lobby",
        placed_at: "2026-08-09T08:00:00.000Z",
        accepted_at: null,
        completed_at: null,
        cancelled_at: null,
        archived_at: null,
        updated_at: "2026-08-09T08:01:00.000Z",
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
            id: "b5b8a2d6-22af-4700-a25a-0697be13b245",
            source_item_id: null,
            source_item_public_key: null,
            source_item_slug: null,
            name_en: "Chicken momo",
            name_bn: "Chicken momo",
            quantity: 1,
            unit_price_minor: 25_000,
            modifier_unit_total_minor: 0,
            effective_unit_price_minor: 25_000,
            line_total_minor: 25_000,
            customer_note: null,
            modifiers: [],
          },
        ],
      },
      status_events: [
        {
          id: 1,
          from_status: "placed",
          to_status: "pending_acceptance",
          actor_type: "system",
          note: null,
          created_at: "2026-08-09T08:00:00.000Z",
        },
      ],
      mutation_audits: [],
    });

    expect(detail).toMatchObject({
      orderId,
      contact: { phoneE164: "+8801712345678" },
      items: [{ nameEn: "Chicken momo", effectiveUnitPriceMinor: 25_000 }],
    });
    expect(detail?.statusEvents[0]).toMatchObject({
      fromStatus: "placed",
      toStatus: "pending_acceptance",
    });
  });

  it("keeps items null for a status-only optimistic-concurrency update", () => {
    const input = adminOrderMutationInputSchema.parse({
      orderId,
      expectedVersion: 3,
      toStatus: "ready",
      discountMinor: null,
      deliveryFeeMinor: null,
      note: "Kitchen confirmed",
      items: null,
    });

    expect(toAdminOrderMutationPayload(input)).toEqual({
      p_order_id: orderId,
      p_expected_version: 3,
      p_to_status: "ready",
      p_items: null,
      p_discount_minor: null,
      p_delivery_fee_minor: null,
      p_note: "Kitchen confirmed",
    });
  });

  it("rejects a mutation without a full safe line-item shape", () => {
    const result = adminOrderMutationInputSchema.safeParse({
      orderId,
      expectedVersion: 3,
      toStatus: null,
      discountMinor: 0,
      deliveryFeeMinor: null,
      note: null,
      items: [
        {
          sourceItemId: null,
          itemNameEn: "",
          itemNameBn: "",
          quantity: 0,
          unitPriceMinor: -1,
          customerNote: null,
          modifiers: [],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("requires a concise reason when cancelling an order", () => {
    const result = adminOrderMutationInputSchema.safeParse({
      orderId,
      expectedVersion: 3,
      toStatus: "cancelled",
      discountMinor: null,
      deliveryFeeMinor: null,
      note: null,
      items: null,
    });

    expect(result.success).toBe(false);
  });
});
