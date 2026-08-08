import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

import ts from "typescript";

const outputPath = process.argv[2];
if (!outputPath) {
  throw new Error("Pass the migration SQL path as the first argument.");
}

const projectRoot = path.resolve(import.meta.dirname, "..");
const menuSource = fs.readFileSync(
  path.join(projectRoot, "src", "data", "menu.ts"),
  "utf8",
);
const compiledMenu = ts.transpileModule(menuSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "menu.ts",
});
const menuModule = { exports: {} };
const context = vm.createContext({
  Buffer,
  console,
  exports: menuModule.exports,
  module: menuModule,
  require() {
    throw new Error("The menu data module must not have runtime imports.");
  },
});
vm.runInContext(compiledMenu.outputText, context, { filename: "menu.js" });

const { menuCategories, menuItems, menuModifierGroups } = menuModule.exports;
const namespace = "4ea47576-6f4f-5c20-9448-c2766f285af8";

for (const item of menuItems) {
  const expectedPublicKey = `menu_item_${item.slug.replaceAll("-", "_")}`;
  if (item.id !== expectedPublicKey) {
    throw new Error(
      `Menu item ${item.id} does not match derived public key ${expectedPublicKey}.`,
    );
  }
}

function uuidBytes(value) {
  return Buffer.from(value.replaceAll("-", ""), "hex");
}

function catalogUuid(key) {
  const digest = createHash("sha1")
    .update(uuidBytes(namespace))
    .update(key, "utf8")
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const ids = {
  category: (id) => catalogUuid(`category:${id}`),
  item: (id) => catalogUuid(`item:${id}`),
  group: (id) => catalogUuid(`group:${id}`),
  option: (groupId, optionId) => catalogUuid(`option:${groupId}:${optionId}`),
  variantGroup: (itemId) => catalogUuid(`variant-group:${itemId}`),
  variantOption: (itemId, variantId) =>
    catalogUuid(`variant-option:${itemId}:${variantId}`),
};

function sqlText(value) {
  if (value === null || value === undefined || value === "") return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function valuesStatement(table, columns, rows, conflict) {
  if (!rows.length) return "";
  const values = rows
    .map((row) => `  (${row.join(", ")})`)
    .join(",\n");
  return `insert into ${table} (${columns.join(", ")})\nvalues\n${values}\n${conflict};\n`;
}

const categoryRows = menuCategories.map((category) => [
  sqlText(ids.category(category.id)),
  sqlText(category.slug),
  "true",
  "false",
  String(category.sortOrder),
]);
const categoryTranslationRows = menuCategories.flatMap((category) =>
  ["en", "bn"].map((locale) => [
    sqlText(ids.category(category.id)),
    sqlText(locale),
    sqlText(category.name[locale] ?? category.name.en),
    "null",
  ]),
);

const itemRows = menuItems.map((item) => {
  const price =
    item.pricing.kind === "fixed"
      ? item.pricing.price
      : Math.min(...item.pricing.variants.map((variant) => variant.price));
  return [
    sqlText(ids.item(item.id)),
    sqlText(item.slug),
    String(price * 100),
    "true",
    "true",
    item.featured ? "true" : "false",
    String(item.sortOrder),
  ];
});
const itemTranslationRows = menuItems.flatMap((item) =>
  ["en", "bn"].map((locale) => [
    sqlText(ids.item(item.id)),
    sqlText(locale),
    sqlText(item.name[locale] ?? item.name.en),
    sqlText(item.description[locale] ?? item.description.en),
  ]),
);
const itemCategoryRows = menuItems.map((item) => [
  sqlText(ids.item(item.id)),
  sqlText(ids.category(item.categoryId)),
  "true",
  String(item.sortOrder),
]);

const variantItems = menuItems.filter(
  (item) => item.pricing.kind === "variants",
);
const groupRows = [
  ...menuModifierGroups.map((group, index) => [
    sqlText(ids.group(group.id)),
    sqlText(group.id),
    String(group.minimumSelections),
    String(group.maximumSelections),
    "true",
    String((index + 1) * 10),
  ]),
  ...variantItems.map((item, index) => [
    sqlText(ids.variantGroup(item.id)),
    sqlText(`${item.slug}-pack-size`),
    "1",
    "1",
    "true",
    String(1000 + index * 10),
  ]),
];
const groupTranslationRows = [
  ...menuModifierGroups.flatMap((group) =>
    ["en", "bn"].map((locale) => [
      sqlText(ids.group(group.id)),
      sqlText(locale),
      sqlText(group.label[locale] ?? group.label.en),
      "null",
    ]),
  ),
  ...variantItems.flatMap((item) =>
    ["en", "bn"].map((locale) => [
      sqlText(ids.variantGroup(item.id)),
      sqlText(locale),
      sqlText(locale === "bn" ? "প্যাক সাইজ" : "Pack size"),
      "null",
    ]),
  ),
];
const optionRows = [
  ...menuModifierGroups.flatMap((group) =>
    group.options.map((option, index) => [
      sqlText(ids.option(group.id, option.id)),
      sqlText(ids.group(group.id)),
      String(option.priceDelta * 100),
      "true",
      String((index + 1) * 10),
    ]),
  ),
  ...variantItems.flatMap((item) => {
    const basePrice = Math.min(
      ...item.pricing.variants.map((variant) => variant.price),
    );
    return item.pricing.variants.map((variant, index) => [
      sqlText(ids.variantOption(item.id, variant.id)),
      sqlText(ids.variantGroup(item.id)),
      String((variant.price - basePrice) * 100),
      "true",
      String((index + 1) * 10),
    ]);
  }),
];
const optionTranslationRows = [
  ...menuModifierGroups.flatMap((group) =>
    group.options.flatMap((option) =>
      ["en", "bn"].map((locale) => [
        sqlText(ids.option(group.id, option.id)),
        sqlText(locale),
        sqlText(option.label[locale] ?? option.label.en),
      ]),
    ),
  ),
  ...variantItems.flatMap((item) =>
    item.pricing.variants.flatMap((variant) =>
      ["en", "bn"].map((locale) => [
        sqlText(ids.variantOption(item.id, variant.id)),
        sqlText(locale),
        sqlText(variant.label[locale] ?? variant.label.en),
      ]),
    ),
  ),
];
const itemGroupRows = [
  ...menuItems.flatMap((item) =>
    item.modifierGroupIds.map((groupId, index) => [
      sqlText(ids.item(item.id)),
      sqlText(ids.group(groupId)),
      String((index + 1) * 10),
    ]),
  ),
  ...variantItems.map((item) => [
    sqlText(ids.item(item.id)),
    sqlText(ids.variantGroup(item.id)),
    "0",
  ]),
];

const sql = [
  "-- Generated by scripts/generate-menu-catalog-seed.mjs from src/data/menu.ts.",
  "-- IDs are deterministic UUIDv5 values; prices are authoritative BDT minor units.",
  "-- Variant prices are modeled as required, item-specific modifier options.",
  "",
  valuesStatement(
    "app.menu_categories",
    ["id", "slug", "is_active", "is_featured", "sort_order"],
    categoryRows,
    "on conflict (id) do update set slug = excluded.slug, is_active = excluded.is_active, is_featured = excluded.is_featured, sort_order = excluded.sort_order",
  ),
  valuesStatement(
    "app.menu_category_translations",
    ["category_id", "locale", "name", "description"],
    categoryTranslationRows,
    "on conflict (category_id, locale) do update set name = excluded.name, description = excluded.description",
  ),
  valuesStatement(
    "app.menu_items",
    ["id", "slug", "base_price_minor", "is_active", "is_available", "is_featured", "sort_order"],
    itemRows,
    "on conflict (id) do update set slug = excluded.slug, base_price_minor = excluded.base_price_minor, is_active = excluded.is_active, is_available = excluded.is_available, is_featured = excluded.is_featured, sort_order = excluded.sort_order",
  ),
  valuesStatement(
    "app.menu_item_translations",
    ["item_id", "locale", "name", "description"],
    itemTranslationRows,
    "on conflict (item_id, locale) do update set name = excluded.name, description = excluded.description",
  ),
  valuesStatement(
    "app.menu_item_categories",
    ["item_id", "category_id", "is_primary", "sort_order"],
    itemCategoryRows,
    "on conflict (item_id, category_id) do update set is_primary = excluded.is_primary, sort_order = excluded.sort_order",
  ),
  valuesStatement(
    "app.modifier_groups",
    ["id", "slug", "minimum_selections", "maximum_selections", "is_active", "sort_order"],
    groupRows,
    "on conflict (id) do update set slug = excluded.slug, minimum_selections = excluded.minimum_selections, maximum_selections = excluded.maximum_selections, is_active = excluded.is_active, sort_order = excluded.sort_order",
  ),
  valuesStatement(
    "app.modifier_group_translations",
    ["group_id", "locale", "name", "description"],
    groupTranslationRows,
    "on conflict (group_id, locale) do update set name = excluded.name, description = excluded.description",
  ),
  valuesStatement(
    "app.modifier_options",
    ["id", "group_id", "price_delta_minor", "is_active", "sort_order"],
    optionRows,
    "on conflict (id) do update set group_id = excluded.group_id, price_delta_minor = excluded.price_delta_minor, is_active = excluded.is_active, sort_order = excluded.sort_order",
  ),
  valuesStatement(
    "app.modifier_option_translations",
    ["option_id", "locale", "name"],
    optionTranslationRows,
    "on conflict (option_id, locale) do update set name = excluded.name",
  ),
  valuesStatement(
    "app.menu_item_modifier_groups",
    ["item_id", "group_id", "sort_order"],
    itemGroupRows,
    "on conflict (item_id, group_id) do update set sort_order = excluded.sort_order",
  ),
].join("\n");

fs.writeFileSync(path.resolve(outputPath), `${sql.trim()}\n`, "utf8");
console.log(
  `Generated ${menuCategories.length} categories, ${menuItems.length} items, ${groupRows.length} modifier groups, and ${optionRows.length} modifier options.`,
);
