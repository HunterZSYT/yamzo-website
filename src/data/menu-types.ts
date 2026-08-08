export type Locale = "en" | "bn";

export type LocalizedText = Readonly<{
  en: string;
  bn: string | null;
}>;

export type MenuCategoryId = string;

export type MenuCategory = Readonly<{
  id: MenuCategoryId;
  slug: string;
  name: LocalizedText;
  sortOrder: number;
}>;

export type MenuItemId = string;

export type MenuImage = Readonly<{
  src: string;
  alt: LocalizedText;
}>;

export type Serving = Readonly<{
  unit: "piece" | "gram";
  quantity: number;
  maximumQuantity?: number;
}>;

export type MenuPriceVariant = Readonly<{
  id: string;
  label: LocalizedText;
  quantity?: number;
  unit?: "piece";
  price: number;
}>;

export type FixedPricing = Readonly<{
  kind: "fixed";
  price: number;
}>;

export type VariantPricing = Readonly<{
  kind: "variants";
  variants: readonly [MenuPriceVariant, ...MenuPriceVariant[]];
}>;

export type MenuPricing = FixedPricing | VariantPricing;

export type MenuModifierOption = Readonly<{
  id: string;
  label: LocalizedText;
  priceDelta: number;
}>;

export type MenuModifierGroup = Readonly<{
  id: string;
  label: LocalizedText;
  selection: "single" | "multiple";
  minimumSelections: number;
  maximumSelections: number;
  options: readonly [MenuModifierOption, ...MenuModifierOption[]];
}>;

export type MenuItem = Readonly<{
  id: MenuItemId;
  slug: string;
  categoryId: MenuCategoryId;
  name: LocalizedText;
  description: LocalizedText;
  pricing: MenuPricing;
  image: MenuImage | null;
  serving: Serving | null;
  modifierGroupIds: readonly string[];
  popular: boolean;
  featured: boolean;
  bestValue: boolean;
  sortOrder: number;
}>;
