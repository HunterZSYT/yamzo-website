import { z } from "zod";

import {
  menuCategories as fallbackCategories,
  menuItems as fallbackItems,
  menuModifierGroups as fallbackModifierGroups,
  type MenuCategory,
  type MenuItem,
  type MenuModifierGroup,
} from "@/data";
import type {
  LocalizedText,
  MenuImage,
  MenuModifierOption,
  MenuPriceVariant,
} from "@/data/menu-types";

export type StorefrontCatalog = Readonly<{
  source: "supabase" | "fallback";
  categories: readonly MenuCategory[];
  items: readonly MenuItem[];
  modifierGroups: readonly MenuModifierGroup[];
}>;

export type StorefrontCatalogRows = Readonly<{
  categories: unknown;
  items: unknown;
  groups: unknown;
  options: unknown;
  links: unknown;
}>;

const localizedRowSchema = z.object({
  id: z.string().uuid(),
  locale: z.enum(["en", "bn"]),
  name: z.string().trim().min(1),
});

const categoryRowSchema = localizedRowSchema.extend({
  slug: z.string().trim().min(1),
  parent_id: z.string().uuid().nullable(),
  sort_order: z.number().int(),
});

const itemRowSchema = localizedRowSchema.extend({
  slug: z.string().trim().min(1),
  base_price_minor: z.number().int().nonnegative(),
  is_available: z.boolean(),
  is_featured: z.boolean(),
  sort_order: z.number().int(),
  description: z.string().nullable(),
  category_id: z.string().uuid().nullable(),
  image_bucket: z.string().nullable(),
  image_path: z.string().max(500).nullable(),
  image_alt: z.string().nullable(),
});

const groupRowSchema = localizedRowSchema
  .extend({
    slug: z.string().trim().min(1),
    minimum_selections: z.number().int().min(0).max(20),
    maximum_selections: z.number().int().min(1).max(20),
    sort_order: z.number().int(),
    presentation: z.enum(["modifier", "variant"]),
  })
  .refine((row) => row.minimum_selections <= row.maximum_selections, {
    message: "Modifier minimum cannot exceed its maximum.",
  });

const optionRowSchema = localizedRowSchema.extend({
  group_id: z.string().uuid(),
  price_delta_minor: z.number().int().nonnegative(),
  sort_order: z.number().int(),
});

const itemGroupRowSchema = z.object({
  item_id: z.string().uuid(),
  group_id: z.string().uuid(),
  sort_order: z.number().int(),
});

type LocalizedRow = z.infer<typeof localizedRowSchema>;
type ItemRow = z.infer<typeof itemRowSchema>;
type GroupRow = z.infer<typeof groupRowSchema>;
type OptionRow = z.infer<typeof optionRowSchema>;
type ItemGroupRow = z.infer<typeof itemGroupRowSchema>;

type GroupDefinition = Readonly<{
  canonical: GroupRow;
  group: MenuModifierGroup | null;
}>;

const FALLBACK_CATALOG: StorefrontCatalog = {
  source: "fallback",
  categories: fallbackCategories,
  items: fallbackItems,
  modifierGroups: fallbackModifierGroups,
};

export function getFallbackStorefrontCatalog(): StorefrontCatalog {
  return FALLBACK_CATALOG;
}

function rowsById<T extends { id: string }>(rows: readonly T[]) {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const current = result.get(row.id) ?? [];
    current.push(row);
    result.set(row.id, current);
  }
  return result;
}

function canonicalRow<T extends LocalizedRow>(rows: readonly T[]): T | null {
  return rows.find((row) => row.locale === "en") ?? rows[0] ?? null;
}

function translations<T extends LocalizedRow>(
  rows: readonly T[],
  read: (row: T) => string | null = (row) => row.name,
): LocalizedText {
  const english = rows.find((row) => row.locale === "en");
  const bangla = rows.find((row) => row.locale === "bn");
  const fallback = english ?? bangla ?? rows[0];
  if (!fallback) return { en: "", bn: null };
  const englishText = read(fallback);
  const banglaText = bangla ? read(bangla) : null;

  return {
    en: englishText?.trim() || banglaText?.trim() || "",
    bn: banglaText?.trim() || null,
  };
}

function minorToBdt(value: number) {
  return value / 100;
}

function publicStorageUrl(
  supabaseUrl: string,
  bucket: string,
  objectPath: string,
) {
  const encodedPath = objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return new URL(
    `/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`,
    supabaseUrl,
  ).toString();
}

function databaseImage(
  rows: readonly ItemRow[],
  supabaseUrl: string,
): MenuImage | null {
  const imageRow = rows.find(
    (row) =>
      row.image_bucket === "menu-media" &&
      row.image_path &&
      !row.image_path.startsWith("/") &&
      !/(^|\/)\.\.(\/|$)/.test(row.image_path),
  );
  if (!imageRow?.image_path) return null;

  const itemName = translations(rows);
  const imageAlt = translations(rows, (row) => row.image_alt);
  return {
    src: publicStorageUrl(
      supabaseUrl,
      imageRow.image_bucket as "menu-media",
      imageRow.image_path,
    ),
    alt: {
      en: imageAlt.en || itemName.en,
      bn: imageAlt.bn,
    },
  };
}

function buildGroupDefinitions(
  groupRows: readonly GroupRow[],
  optionRows: readonly OptionRow[],
) {
  const groupsById = rowsById(groupRows);
  const optionsById = rowsById(optionRows);
  const optionIdsByGroup = new Map<string, Set<string>>();

  for (const option of optionRows) {
    const ids = optionIdsByGroup.get(option.group_id) ?? new Set<string>();
    ids.add(option.id);
    optionIdsByGroup.set(option.group_id, ids);
  }

  const definitions = new Map<string, GroupDefinition>();
  for (const [groupId, localizedGroups] of groupsById) {
    const canonical = canonicalRow(localizedGroups);
    if (!canonical) continue;

    const options = [...(optionIdsByGroup.get(groupId) ?? [])]
      .flatMap((optionId) => {
        const localizedOptions = optionsById.get(optionId);
        const canonicalOption = localizedOptions
          ? canonicalRow(localizedOptions)
          : null;
        if (!localizedOptions || !canonicalOption) return [];
        return [{
          id: canonicalOption.id,
          label: translations(localizedOptions),
          priceDelta: minorToBdt(canonicalOption.price_delta_minor),
          sortOrder: canonicalOption.sort_order,
        }];
      })
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((option) => ({
        id: option.id,
        label: option.label,
        priceDelta: option.priceDelta,
      }));

    const canRender =
      options.length > 0 && options.length >= canonical.minimum_selections;
    definitions.set(groupId, {
      canonical,
      group: canRender
        ? {
            id: canonical.id,
            label: translations(localizedGroups),
            selection:
              canonical.maximum_selections === 1 ? "single" : "multiple",
            minimumSelections: canonical.minimum_selections,
            maximumSelections: canonical.maximum_selections,
            options: options as [MenuModifierOption, ...MenuModifierOption[]],
          }
        : null,
    });
  }

  return definitions;
}

function linksByItem(rows: readonly ItemGroupRow[]) {
  const result = new Map<string, ItemGroupRow[]>();
  for (const row of rows) {
    const current = result.get(row.item_id) ?? [];
    current.push(row);
    result.set(row.item_id, current);
  }
  for (const links of result.values()) {
    links.sort((a, b) => a.sort_order - b.sort_order);
  }
  return result;
}

function buildCatalog(
  rows: StorefrontCatalogRows,
  supabaseUrl: string,
): StorefrontCatalog {
  const categories = categoryRowSchema.array().safeParse(rows.categories);
  const items = itemRowSchema.array().safeParse(rows.items);
  const groups = groupRowSchema.array().safeParse(rows.groups);
  const options = optionRowSchema.array().safeParse(rows.options);
  const links = itemGroupRowSchema.array().safeParse(rows.links);

  if (
    !categories.success ||
    !items.success ||
    !groups.success ||
    !options.success ||
    !links.success
  ) {
    return FALLBACK_CATALOG;
  }

  const categoryRowsById = rowsById(categories.data);
  const itemRowsById = rowsById(items.data);
  const groupDefinitions = buildGroupDefinitions(groups.data, options.data);
  const itemLinks = linksByItem(links.data);
  const fallbackImagesBySlug = new Map<string, MenuImage>(
    fallbackItems.flatMap((item) =>
      item.image ? [[item.slug, item.image] as [string, MenuImage]] : [],
    ),
  );

  const catalogCategories = [...categoryRowsById.values()]
    .flatMap((localizedRows) => {
      const canonical = canonicalRow(localizedRows);
      if (!canonical) return [];
      return [{
        id: canonical.id,
        slug: canonical.slug,
        name: translations(localizedRows),
        sortOrder: canonical.sort_order,
      } satisfies MenuCategory];
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const categoryById = new Map(
    catalogCategories.map((category) => [category.id, category]),
  );

  const catalogItems = [...itemRowsById.values()].flatMap((localizedRows) => {
    const canonical = canonicalRow(localizedRows);
    if (
      !canonical ||
      !canonical.is_available ||
      !canonical.category_id ||
      !categoryById.has(canonical.category_id)
    ) {
      return [];
    }

    const modifierGroupIds: string[] = [];
    let variantGroup: MenuModifierGroup | null = null;
    let invalid = false;
    let minimumSelections = 0;

    for (const link of itemLinks.get(canonical.id) ?? []) {
      const definition = groupDefinitions.get(link.group_id);
      if (!definition) {
        invalid = true;
        break;
      }

      if (definition.canonical.presentation === "variant") {
        if (
          variantGroup ||
          !definition.group ||
          definition.canonical.minimum_selections !== 1 ||
          definition.canonical.maximum_selections !== 1
        ) {
          invalid = true;
          break;
        }
        variantGroup = definition.group;
        minimumSelections += 1;
      } else if (definition.group) {
        modifierGroupIds.push(definition.group.id);
        minimumSelections += definition.group.minimumSelections;
      } else if (definition.canonical.minimum_selections > 0) {
        invalid = true;
        break;
      }
    }

    if (invalid || minimumSelections > 40) return [];

    const pricing: MenuItem["pricing"] = variantGroup
      ? {
          kind: "variants",
          variants: variantGroup.options.map((option) => ({
            id: option.id,
            label: option.label,
            price: minorToBdt(canonical.base_price_minor) + option.priceDelta,
          })) as [MenuPriceVariant, ...MenuPriceVariant[]],
        }
      : {
          kind: "fixed",
          price: minorToBdt(canonical.base_price_minor),
        };
    const image =
      databaseImage(localizedRows, supabaseUrl) ??
      fallbackImagesBySlug.get(canonical.slug) ??
      null;

    return [{
      id: canonical.id,
      slug: canonical.slug,
      categoryId: canonical.category_id,
      name: translations(localizedRows),
      description: translations(localizedRows, (row) => row.description),
      pricing,
      image,
      serving: null,
      modifierGroupIds,
      popular: canonical.is_featured,
      featured: canonical.is_featured,
      bestValue: false,
      sortOrder: canonical.sort_order,
    } satisfies MenuItem];
  });

  if (catalogCategories.length === 0 || catalogItems.length === 0) {
    return FALLBACK_CATALOG;
  }

  const usedModifierGroups = new Set(
    catalogItems.flatMap((item) => item.modifierGroupIds),
  );
  const modifierGroups = [...groupDefinitions.values()]
    .filter(
      (definition) =>
        definition.canonical.presentation === "modifier" &&
        definition.group &&
        usedModifierGroups.has(definition.canonical.id),
    )
    .sort((a, b) => a.canonical.sort_order - b.canonical.sort_order)
    .map((definition) => definition.group as MenuModifierGroup);
  const categorySortOrders = new Map(
    catalogCategories.map((category) => [category.id, category.sortOrder]),
  );

  return {
    source: "supabase",
    categories: catalogCategories,
    items: catalogItems.sort((a, b) =>
      (categorySortOrders.get(a.categoryId) ?? 0) -
        (categorySortOrders.get(b.categoryId) ?? 0) ||
      a.sortOrder - b.sortOrder,
    ),
    modifierGroups,
  };
}

export function buildStorefrontCatalog(
  rows: StorefrontCatalogRows,
  supabaseUrl: string,
): StorefrontCatalog {
  try {
    return buildCatalog(rows, supabaseUrl);
  } catch {
    return FALLBACK_CATALOG;
  }
}
