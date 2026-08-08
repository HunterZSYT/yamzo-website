import { z } from "zod";

import type { LocalizedText, MenuImage } from "@/data/menu-types";

export type StorefrontBannerPlacement = "hero" | "announcement" | "cart";

export type StorefrontBanner = Readonly<{
  id: string;
  placement: StorefrontBannerPlacement;
  actionUrl: string | null;
  sortOrder: number;
  eyebrow: LocalizedText;
  title: LocalizedText;
  body: LocalizedText;
  actionLabel: LocalizedText;
  image: MenuImage | null;
}>;

export type StorefrontOffer = Readonly<{
  id: string;
  code: string | null;
  kind: "percent" | "fixed" | "free_delivery";
  value: number;
  maximumDiscountMinor: number | null;
  minimumSubtotalMinor: number;
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
  name: LocalizedText;
  description: LocalizedText;
  terms: LocalizedText;
}>;

export type StorefrontHomeSection = Readonly<{
  id: string;
  sectionKey: string;
  kind: "banner" | "offers" | "categories" | "menu" | "reviews" | "custom";
  sortOrder: number;
  config: Readonly<Record<string, unknown>>;
  title: LocalizedText;
  subtitle: LocalizedText;
}>;

export type StorefrontMerchandising = Readonly<{
  source: "supabase" | "fallback";
  banners: readonly StorefrontBanner[];
  offers: readonly StorefrontOffer[];
  homeSections: readonly StorefrontHomeSection[];
}>;

export type StorefrontMerchandisingRows = Readonly<{
  banners: unknown;
  offers: unknown;
  homeSections: unknown;
}>;

const localeSchema = z.enum(["en", "bn"]);
const actionUrlSchema = z
  .string()
  .max(500)
  .refine(
    (value) =>
      /^\/[A-Za-z0-9/_?&=#.%+-]*$/.test(value) ||
      /^https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9/_?&=#.%+-]*)?$/.test(value),
    "Banner actions must use a safe internal path or HTTPS URL.",
  )
  .nullable();

const bannerRowSchema = z.object({
  id: z.string().uuid(),
  placement: z.enum(["hero", "announcement", "cart"]),
  action_url: actionUrlSchema,
  sort_order: z.number().int(),
  locale: localeSchema,
  eyebrow: z.string().max(160).nullable(),
  title: z.string().trim().min(1).max(160),
  body: z.string().max(600).nullable(),
  action_label: z.string().max(80).nullable(),
  image_bucket: z.string().nullable(),
  image_path: z.string().max(500).nullable(),
  image_alt: z.string().max(300).nullable(),
});

const offerRowSchema = z.object({
  id: z.string().uuid(),
  code: z.string().max(32).nullable(),
  kind: z.enum(["percent", "fixed", "free_delivery"]),
  value: z.number().int().nonnegative(),
  maximum_discount_minor: z.number().int().nonnegative().nullable(),
  minimum_subtotal_minor: z.number().int().nonnegative(),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  priority: z.number().int(),
  locale: localeSchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().max(800).nullable(),
  terms: z.string().max(2_000).nullable(),
});

const homeSectionRowSchema = z.object({
  id: z.string().uuid(),
  section_key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  kind: z.enum(["banner", "offers", "categories", "menu", "reviews", "custom"]),
  sort_order: z.number().int(),
  config: z.record(z.string(), z.unknown()),
  locale: localeSchema.nullable(),
  title: z.string().max(160).nullable(),
  subtitle: z.string().max(400).nullable(),
});

type BannerRow = z.infer<typeof bannerRowSchema>;
type LocalizedRow = Readonly<{ locale: "en" | "bn" | null }>;

const FALLBACK_HOME_SECTIONS: readonly StorefrontHomeSection[] = [
  {
    id: "fallback-hero",
    sectionKey: "hero",
    kind: "banner",
    sortOrder: 10,
    config: {},
    title: { en: "", bn: null },
    subtitle: { en: "", bn: null },
  },
  {
    id: "fallback-offers",
    sectionKey: "offers",
    kind: "offers",
    sortOrder: 20,
    config: {},
    title: { en: "Offers", bn: "অফার" },
    subtitle: {
      en: "A little extra joy with your order.",
      bn: "আপনার অর্ডারের সাথে একটু বাড়তি আনন্দ।",
    },
  },
  {
    id: "fallback-categories",
    sectionKey: "categories",
    kind: "categories",
    sortOrder: 30,
    config: {},
    title: { en: "Explore the menu", bn: "মেনু দেখুন" },
    subtitle: { en: "", bn: null },
  },
  {
    id: "fallback-menu",
    sectionKey: "menu",
    kind: "menu",
    sortOrder: 40,
    config: {},
    title: { en: "Made for Uttara", bn: "উত্তরার জন্য তৈরি" },
    subtitle: {
      en: "Freshly prepared by Yamzo Uttara.",
      bn: "ইয়ামজো উত্তরা থেকে সতেজভাবে প্রস্তুত।",
    },
  },
  {
    id: "fallback-reviews",
    sectionKey: "reviews",
    kind: "reviews",
    sortOrder: 50,
    config: {},
    title: { en: "Loved by our guests", bn: "অতিথিদের ভালোবাসা" },
    subtitle: {
      en: "Recent five-star Google reviews.",
      bn: "সাম্প্রতিক পাঁচ তারকা গুগল রিভিউ।",
    },
  },
];

const FALLBACK_MERCHANDISING: StorefrontMerchandising = {
  source: "fallback",
  banners: [],
  offers: [],
  homeSections: FALLBACK_HOME_SECTIONS,
};

export function getFallbackStorefrontMerchandising(): StorefrontMerchandising {
  return FALLBACK_MERCHANDISING;
}

function rowsById<T extends { id: string }>(rows: readonly T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const current = grouped.get(row.id) ?? [];
    current.push(row);
    grouped.set(row.id, current);
  }
  return grouped;
}

function canonicalRow<T extends LocalizedRow>(rows: readonly T[]) {
  return rows.find((row) => row.locale === "en") ?? rows[0] ?? null;
}

function localizedText<T extends LocalizedRow>(
  rows: readonly T[],
  read: (row: T) => string | null,
): LocalizedText {
  const english = rows.find((row) => row.locale === "en");
  const bangla = rows.find((row) => row.locale === "bn");
  const first = english ?? bangla ?? rows[0];
  const englishValue = english ? read(english)?.trim() : null;
  const banglaValue = bangla ? read(bangla)?.trim() : null;
  const fallbackValue = first ? read(first)?.trim() : null;

  return {
    en: englishValue || banglaValue || fallbackValue || "",
    bn: banglaValue || null,
  };
}

function publicStorageUrl(
  supabaseUrl: string,
  bucket: string | null,
  objectPath: string | null,
) {
  if (
    !bucket ||
    !objectPath ||
    !["menu-media", "site-media"].includes(bucket) ||
    objectPath.startsWith("/") ||
    /(^|\/)\.\.(\/|$)/.test(objectPath)
  ) {
    return null;
  }

  const encodedPath = objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return new URL(
    `/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`,
    supabaseUrl,
  ).toString();
}

function bannerImage(rows: readonly BannerRow[], supabaseUrl: string): MenuImage | null {
  const source = rows.find((row) =>
    publicStorageUrl(supabaseUrl, row.image_bucket, row.image_path),
  );
  const src = source
    ? publicStorageUrl(supabaseUrl, source.image_bucket, source.image_path)
    : null;
  if (!src) return null;

  const alt = localizedText(rows, (row) => row.image_alt);
  return {
    src,
    alt: alt.en ? alt : localizedText(rows, (row) => row.title),
  };
}

function buildMerchandising(
  rows: StorefrontMerchandisingRows,
  supabaseUrl: string,
): StorefrontMerchandising {
  const banners = bannerRowSchema.array().safeParse(rows.banners);
  const offers = offerRowSchema.array().safeParse(rows.offers);
  const homeSections = homeSectionRowSchema.array().safeParse(rows.homeSections);

  if (!banners.success || !offers.success || !homeSections.success) {
    return FALLBACK_MERCHANDISING;
  }

  const mappedBanners = [...rowsById(banners.data).values()]
    .flatMap((localizedRows) => {
      const canonical = canonicalRow(localizedRows);
      if (!canonical) return [];
      return [{
        id: canonical.id,
        placement: canonical.placement,
        actionUrl: canonical.action_url,
        sortOrder: canonical.sort_order,
        eyebrow: localizedText(localizedRows, (row) => row.eyebrow),
        title: localizedText(localizedRows, (row) => row.title),
        body: localizedText(localizedRows, (row) => row.body),
        actionLabel: localizedText(localizedRows, (row) => row.action_label),
        image: bannerImage(localizedRows, supabaseUrl),
      } satisfies StorefrontBanner];
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

  const mappedOffers = [...rowsById(offers.data).values()]
    .flatMap((localizedRows) => {
      const canonical = canonicalRow(localizedRows);
      if (!canonical) return [];
      return [{
        id: canonical.id,
        code: canonical.code,
        kind: canonical.kind,
        value: canonical.value,
        maximumDiscountMinor: canonical.maximum_discount_minor,
        minimumSubtotalMinor: canonical.minimum_subtotal_minor,
        startsAt: canonical.starts_at,
        endsAt: canonical.ends_at,
        priority: canonical.priority,
        name: localizedText(localizedRows, (row) => row.name),
        description: localizedText(localizedRows, (row) => row.description),
        terms: localizedText(localizedRows, (row) => row.terms),
      } satisfies StorefrontOffer];
    })
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

  const mappedHomeSections = [...rowsById(homeSections.data).values()]
    .flatMap((localizedRows) => {
      const canonical = canonicalRow(localizedRows);
      if (!canonical) return [];
      return [{
        id: canonical.id,
        sectionKey: canonical.section_key,
        kind: canonical.kind,
        sortOrder: canonical.sort_order,
        config: canonical.config,
        title: localizedText(localizedRows, (row) => row.title),
        subtitle: localizedText(localizedRows, (row) => row.subtitle),
      } satisfies StorefrontHomeSection];
    })
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.sectionKey.localeCompare(b.sectionKey),
    );

  if (mappedHomeSections.length === 0) {
    return FALLBACK_MERCHANDISING;
  }

  return {
    source: "supabase",
    banners: mappedBanners,
    offers: mappedOffers,
    homeSections: mappedHomeSections,
  };
}

export function buildStorefrontMerchandising(
  rows: StorefrontMerchandisingRows,
  supabaseUrl: string,
): StorefrontMerchandising {
  try {
    return buildMerchandising(rows, supabaseUrl);
  } catch {
    return FALLBACK_MERCHANDISING;
  }
}
