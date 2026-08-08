import { describe, expect, it } from "vitest";

import {
  buildStorefrontCatalog,
  type StorefrontCatalogRows,
} from "./storefront-mapper";

const categoryId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const modifierGroupId = "33333333-3333-4333-8333-333333333333";
const modifierOptionId = "44444444-4444-4444-8444-444444444444";
const variantGroupId = "55555555-5555-4555-8555-555555555555";
const regularVariantId = "66666666-6666-4666-8666-666666666666";
const familyVariantId = "77777777-7777-4777-8777-777777777777";

function catalogRows(overrides: Partial<StorefrontCatalogRows> = {}) {
  return {
    categories: [
      {
        id: categoryId,
        slug: "new-category",
        parent_id: null,
        sort_order: 10,
        locale: "en",
        name: "New category",
      },
      {
        id: categoryId,
        slug: "new-category",
        parent_id: null,
        sort_order: 10,
        locale: "bn",
        name: "নতুন বিভাগ",
      },
    ],
    items: [
      {
        id: itemId,
        slug: "database-created-dish",
        base_price_minor: 20_000,
        is_available: true,
        is_featured: true,
        sort_order: 20,
        locale: "en",
        name: "Database-created dish",
        description: "Created without a local TypeScript record.",
        category_id: categoryId,
        image_bucket: "menu-media",
        image_path: "items/new dish.webp",
        image_alt: "A new dish",
      },
      {
        id: itemId,
        slug: "database-created-dish",
        base_price_minor: 20_000,
        is_available: true,
        is_featured: true,
        sort_order: 20,
        locale: "bn",
        name: "ডেটাবেসের নতুন খাবার",
        description: null,
        category_id: categoryId,
        image_bucket: "menu-media",
        image_path: "items/new dish.webp",
        image_alt: "নতুন খাবার",
      },
    ],
    groups: [
      {
        id: variantGroupId,
        slug: "portion",
        minimum_selections: 1,
        maximum_selections: 1,
        sort_order: 10,
        locale: "en",
        name: "Portion",
        presentation: "variant",
      },
      {
        id: modifierGroupId,
        slug: "extras",
        minimum_selections: 0,
        maximum_selections: 2,
        sort_order: 20,
        locale: "en",
        name: "Extras",
        presentation: "modifier",
      },
    ],
    options: [
      {
        id: regularVariantId,
        group_id: variantGroupId,
        price_delta_minor: 0,
        sort_order: 10,
        locale: "en",
        name: "Regular",
      },
      {
        id: familyVariantId,
        group_id: variantGroupId,
        price_delta_minor: 5_000,
        sort_order: 20,
        locale: "en",
        name: "Family",
      },
      {
        id: modifierOptionId,
        group_id: modifierGroupId,
        price_delta_minor: 1_250,
        sort_order: 10,
        locale: "en",
        name: "Extra sauce",
      },
    ],
    links: [
      { item_id: itemId, group_id: variantGroupId, sort_order: 0 },
      { item_id: itemId, group_id: modifierGroupId, sort_order: 10 },
    ],
    ...overrides,
  } satisfies StorefrontCatalogRows;
}

describe("storefront catalog mapper", () => {
  it("renders database-created catalog entities with public UUIDs", () => {
    const catalog = buildStorefrontCatalog(
      catalogRows(),
      "https://project.supabase.co",
    );

    expect(catalog.source).toBe("supabase");
    expect(catalog.categories[0]).toMatchObject({
      id: categoryId,
      slug: "new-category",
    });
    expect(catalog.items[0]).toMatchObject({
      id: itemId,
      categoryId,
      modifierGroupIds: [modifierGroupId],
      popular: true,
    });
    expect(catalog.items[0]?.pricing).toEqual({
      kind: "variants",
      variants: [
        expect.objectContaining({ id: regularVariantId, price: 200 }),
        expect.objectContaining({ id: familyVariantId, price: 250 }),
      ],
    });
    expect(catalog.modifierGroups[0]).toMatchObject({
      id: modifierGroupId,
      selection: "multiple",
      maximumSelections: 2,
    });
    expect(catalog.items[0]?.image?.src).toBe(
      "https://project.supabase.co/storage/v1/object/public/menu-media/items/new%20dish.webp",
    );
  });

  it("uses a supplied local menu image by exact slug when storage media is absent", () => {
    const withoutStorageMedia = (catalogRows().items as Array<Record<string, unknown>>)
      .map((row) => ({
        ...row,
        slug: "fried-calamari",
        image_bucket: null,
        image_path: null,
        image_alt: null,
      }));
    const catalog = buildStorefrontCatalog(
      catalogRows({ items: withoutStorageMedia }),
      "https://project.supabase.co",
    );

    expect(catalog.items[0]?.image?.src).toBe("/menu/fried-calamari.png");
  });

  it("falls back in preview-only mode when authoritative rows are unusable", () => {
    const catalog = buildStorefrontCatalog(
      catalogRows({ items: [] }),
      "https://project.supabase.co",
    );

    expect(catalog.source).toBe("fallback");
    expect(catalog.items.length).toBeGreaterThan(0);
  });
});
