import { describe, expect, it } from "vitest";

import {
  accountDeletionRequestSchema,
  accountSnapshotSchema,
} from "./contracts";

describe("account contracts", () => {
  it("accepts a private self-service account snapshot", () => {
    const parsed = accountSnapshotSchema.safeParse({
      display_name: "Yamzo Customer",
      preferred_locale: "en",
      marketing_consent_at: null,
      phones: [
        {
          id: "83ce9ed4-7d82-4234-8d45-5d40ea4f090d",
          phone_e164: "+8801712345678",
          label: "Primary",
          is_primary: true,
          verified_at: null,
          created_at: "2026-08-09T00:00:00.000Z",
        },
      ],
      addresses: [
        {
          id: "b0e7032a-b801-4b11-8e70-0e65a957f36d",
          label: "Home",
          sector_number: 11,
          road_number: "20",
          house_number: "80",
          flat_number: "4B",
          is_default: true,
          created_at: "2026-08-09T00:00:00.000Z",
        },
      ],
      orders: [],
    });

    expect(parsed.success).toBe(true);
  });

  it("requires an intentional, exact deletion confirmation", () => {
    expect(
      accountDeletionRequestSchema.safeParse({
        email: "customer@example.com",
        confirmation: "DELETE",
      }).success,
    ).toBe(true);
    expect(
      accountDeletionRequestSchema.safeParse({
        email: "customer@example.com",
        confirmation: "delete",
      }).success,
    ).toBe(false);
  });
});
