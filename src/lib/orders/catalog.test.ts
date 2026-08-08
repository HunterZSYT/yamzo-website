import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  catalogIds,
  catalogUuid,
  resolveOrderLines,
} from "./catalog";

describe("catalog order resolver", () => {
  it("generates stable RFC UUIDv5 IDs for the repeatable legacy seed", () => {
    expect(catalogUuid("item:menu_item_chicken_momo")).toBe(
      "052f9516-3bc9-54da-8e83-9d11b93363fc",
    );
    expect(catalogIds.item("menu_item_chicken_momo")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("passes database-native item and option identifiers to the order RPC", () => {
    const itemId = "052f9516-3bc9-54da-8e83-9d11b93363fc";
    const variantId = "56fc3346-94e1-55d9-a6c2-635b56707fa0";
    const modifierId = "7f909c55-28bc-57e5-aa98-b2970b2a00f9";

    expect(
      resolveOrderLines([
        {
          menuItemId: itemId,
          variantId,
          modifierOptionIds: [modifierId],
          quantity: 2,
        },
      ]),
    ).toEqual([
      {
        item_id: itemId,
        modifier_option_ids: [variantId, modifierId],
        quantity: 2,
      },
    ]);
  });

  it("keeps the generated seed aligned with its stable IDs", () => {
    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase",
        "migrations",
        "20260808085928_menu_catalog_seed.sql",
      ),
      "utf8",
    );
    expect(migration).toContain(catalogIds.item("menu_item_chicken_momo"));
    expect(migration).toContain(
      catalogIds.variantOption("menu_item_naga_shingara", "family-10"),
    );
  });
});
