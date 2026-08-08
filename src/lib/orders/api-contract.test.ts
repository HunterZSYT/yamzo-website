import { describe, expect, it } from "vitest";

import {
  createOrderRequestSchema,
  orderLookupRequestSchema,
  phoneLookupRpcResponseSchema,
} from "./api-contract";
import { presentTrackedOrder } from "./presenters";

describe("order API contracts", () => {
  it("normalizes Bangladeshi phones and numeric sectors", () => {
    const parsed = createOrderRequestSchema.parse({
      customer: {
        fullName: "Junaed Saimon",
        sector: "11",
        road: "20",
        house: "80",
        flat: "3A",
        phone: "01761 737584",
      },
      lines: [
        {
          menuItemId: "052f9516-3bc9-54da-8e83-9d11b93363fc",
          variantId: null,
          modifierOptionIds: [],
          quantity: 1,
        },
      ],
      expectedSubtotalMinor: 19500,
    });

    expect(parsed.customer.phone).toBe("+8801761737584");
    expect(parsed.customer.sector).toBe(11);
    expect(parsed.locale).toBe("en");
    expect(parsed.expectedSubtotalMinor).toBe(19500);
  });

  it("accepts only unique database-native catalog UUIDs", () => {
    const itemId = "052f9516-3bc9-54da-8e83-9d11b93363fc";
    const optionId = "7f909c55-28bc-57e5-aa98-b2970b2a00f9";
    const base = {
      customer: {
        fullName: "Junaed Saimon",
        sector: 11,
        road: "20",
        house: "80",
        flat: "3A",
        phone: "01761737584",
      },
      expectedSubtotalMinor: 19500,
    };

    expect(
      createOrderRequestSchema.safeParse({
        ...base,
        lines: [{
          menuItemId: "menu_item_chicken_momo",
          variantId: null,
          modifierOptionIds: [],
          quantity: 1,
        }],
      }).success,
    ).toBe(false);
    expect(
      createOrderRequestSchema.safeParse({
        ...base,
        lines: [{
          menuItemId: itemId,
          variantId: optionId,
          modifierOptionIds: [optionId],
          quantity: 1,
        }],
      }).success,
    ).toBe(false);
  });

  it("keeps phone lookup separate from full-order authorization", () => {
    const parsed = orderLookupRequestSchema.parse({
      phone: "01761737584",
      trackingTokens: [],
      turnstileToken: "verified-on-the-server",
    });
    expect(parsed.trackingTokens).toEqual([]);
    expect(parsed).not.toHaveProperty("allowPhoneHistory");

    expect(
      phoneLookupRpcResponseSchema.parse({
        found: true,
        reference_hint: "0042",
        status: "preparing",
        mode: "live",
        placed_at: "2026-08-08T08:00:00+00:00",
      }),
    ).toMatchObject({
      found: true,
      reference_hint: "0042",
      status: "preparing",
    });
  });

  it("presents tracked minor-unit totals as whole BDT for the current UI", () => {
    const summary = presentTrackedOrder({
      order_id: "7c8adfb5-d132-42a4-a523-930928ee9500",
      order_reference: "YZ-20260808-00000001",
      mode: "test",
      status: "preparing",
      version: 3,
      subtotal_minor: 39000,
      discount_minor: 0,
      delivery_fee_minor: 5000,
      grand_total_minor: 44000,
      currency_code: "BDT",
      placed_at: "2026-08-08T08:00:00+00:00",
      accepted_at: "2026-08-08T08:01:00+00:00",
      completed_at: null,
      cancelled_at: null,
      items: [
        {
          id: "467de77c-24c7-45d5-b26d-1a830748e8c3",
          name_en: "Seafood Rice Bowl",
          name_bn: "Seafood Rice Bowl",
          quantity: 1,
          unit_price_minor: 39000,
          modifier_unit_total_minor: 0,
          line_total_minor: 39000,
          modifiers: [],
        },
      ],
      events: [
        { status: "preparing", created_at: "2026-08-08T08:02:00+00:00" },
      ],
    });

    expect(summary.total).toBe(440);
    expect(summary.itemCount).toBe(1);
    expect(summary.phoneMasked).toBe("Private");
  });
});
