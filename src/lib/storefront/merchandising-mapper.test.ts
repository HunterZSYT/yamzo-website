import { describe, expect, it } from "vitest";

import {
  buildStorefrontMerchandising,
  type StorefrontMerchandisingRows,
} from "./merchandising-mapper";

const bannerId = "11111111-1111-4111-8111-111111111111";
const offerId = "22222222-2222-4222-8222-222222222222";
const heroSectionId = "33333333-3333-4333-8333-333333333333";
const offersSectionId = "44444444-4444-4444-8444-444444444444";

function merchandisingRows(
  overrides: Partial<StorefrontMerchandisingRows> = {},
): StorefrontMerchandisingRows {
  return {
    banners: [
      {
        id: bannerId,
        placement: "hero",
        action_url: "/#menu",
        sort_order: 20,
        locale: "en",
        eyebrow: "Uttara-only delivery",
        title: "Dinner is sorted",
        body: "Fresh seafood from our Uttara kitchen.",
        action_label: "Order now",
        image_bucket: "site-media",
        image_path: "banners/dinner special.webp",
        image_alt: "Yamzo dinner platter",
      },
      {
        id: bannerId,
        placement: "hero",
        action_url: "/#menu",
        sort_order: 20,
        locale: "bn",
        eyebrow: "শুধু উত্তরায় ডেলিভারি",
        title: "রাতের খাবার তৈরি",
        body: "উত্তরার কিচেন থেকে ফ্রেশ সি-ফুড।",
        action_label: "অর্ডার করুন",
        image_bucket: "site-media",
        image_path: "banners/dinner special.webp",
        image_alt: "ইয়ামজো ডিনার প্ল্যাটার",
      },
    ],
    offers: [
      {
        id: offerId,
        code: "WELCOME15",
        kind: "percent",
        value: 1_500,
        maximum_discount_minor: 20_000,
        minimum_subtotal_minor: 50_000,
        starts_at: null,
        ends_at: "2026-08-31T17:59:59+00:00",
        priority: 50,
        locale: "en",
        name: "15% welcome offer",
        description: "Save on your first Yamzo order.",
        terms: "Maximum discount ৳200.",
      },
      {
        id: offerId,
        code: "WELCOME15",
        kind: "percent",
        value: 1_500,
        maximum_discount_minor: 20_000,
        minimum_subtotal_minor: 50_000,
        starts_at: null,
        ends_at: "2026-08-31T17:59:59+00:00",
        priority: 50,
        locale: "bn",
        name: "১৫% স্বাগতম অফার",
        description: "প্রথম ইয়ামজো অর্ডারে সাশ্রয় করুন।",
        terms: "সর্বোচ্চ ছাড় ৳২০০।",
      },
    ],
    homeSections: [
      {
        id: heroSectionId,
        section_key: "hero",
        kind: "banner",
        sort_order: 30,
        config: {},
        locale: "en",
        title: null,
        subtitle: null,
      },
      {
        id: offersSectionId,
        section_key: "offers",
        kind: "offers",
        sort_order: 10,
        config: { density: "compact" },
        locale: "en",
        title: "Today’s offers",
        subtitle: "Savings selected by the Yamzo team.",
      },
      {
        id: offersSectionId,
        section_key: "offers",
        kind: "offers",
        sort_order: 10,
        config: { density: "compact" },
        locale: "bn",
        title: "আজকের অফার",
        subtitle: "ইয়ামজো টিমের বাছাই করা সাশ্রয়।",
      },
    ],
    ...overrides,
  };
}

describe("storefront merchandising mapper", () => {
  it("maps bilingual scheduled content and obeys database section ordering", () => {
    const merchandising = buildStorefrontMerchandising(
      merchandisingRows(),
      "https://project.supabase.co",
    );

    expect(merchandising.source).toBe("supabase");
    expect(merchandising.homeSections.map((section) => section.sectionKey)).toEqual([
      "offers",
      "hero",
    ]);
    expect(merchandising.homeSections[0]).toMatchObject({
      title: { en: "Today’s offers", bn: "আজকের অফার" },
      config: { density: "compact" },
    });
    expect(merchandising.banners[0]).toMatchObject({
      placement: "hero",
      title: { en: "Dinner is sorted", bn: "রাতের খাবার তৈরি" },
      actionUrl: "/#menu",
    });
    expect(merchandising.banners[0]?.image?.src).toBe(
      "https://project.supabase.co/storage/v1/object/public/site-media/banners/dinner%20special.webp",
    );
    expect(merchandising.offers[0]).toMatchObject({
      kind: "percent",
      value: 1_500,
      minimumSubtotalMinor: 50_000,
      name: { en: "15% welcome offer", bn: "১৫% স্বাগতম অফার" },
    });
  });

  it("keeps valid empty promotional results authoritative", () => {
    const merchandising = buildStorefrontMerchandising(
      merchandisingRows({ banners: [], offers: [] }),
      "https://project.supabase.co",
    );

    expect(merchandising.source).toBe("supabase");
    expect(merchandising.banners).toEqual([]);
    expect(merchandising.offers).toEqual([]);
    expect(merchandising.homeSections).toHaveLength(2);
  });

  it("drops unsafe storage paths without discarding valid banner copy", () => {
    const unsafeBanners = (merchandisingRows().banners as Array<Record<string, unknown>>)
      .map((row) => ({ ...row, image_path: "../private/key.txt" }));
    const merchandising = buildStorefrontMerchandising(
      merchandisingRows({ banners: unsafeBanners }),
      "https://project.supabase.co",
    );

    expect(merchandising.source).toBe("supabase");
    expect(merchandising.banners[0]?.image).toBeNull();
    expect(merchandising.banners[0]?.title.en).toBe("Dinner is sorted");
  });

  it("uses the safe one-page layout with no invented promotions for invalid data", () => {
    const merchandising = buildStorefrontMerchandising(
      merchandisingRows({ homeSections: [{ invalid: true }] }),
      "https://project.supabase.co",
    );

    expect(merchandising.source).toBe("fallback");
    expect(merchandising.banners).toEqual([]);
    expect(merchandising.offers).toEqual([]);
    expect(merchandising.homeSections.map((section) => section.kind)).toEqual([
      "banner",
      "offers",
      "categories",
      "menu",
      "reviews",
    ]);
  });
});
