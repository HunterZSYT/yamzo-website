import { createHash } from "node:crypto";

const CATALOG_UUID_NAMESPACE = "4ea47576-6f4f-5c20-9448-c2766f285af8";

export type OrderLineInput = Readonly<{
  menuItemId: string;
  variantId: string | null;
  modifierOptionIds: readonly string[];
  quantity: number;
}>;

export type ResolvedOrderLine = Readonly<{
  item_id: string;
  quantity: number;
  modifier_option_ids: string[];
}>;

function uuidBytes(value: string): Uint8Array {
  const hex = value.replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    throw new Error("Invalid catalog UUID namespace.");
  }
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

/** RFC 9562 UUIDv5 used only by the repeatable legacy seed generator. */
export function catalogUuid(key: string): string {
  const digest = createHash("sha1")
    .update(uuidBytes(CATALOG_UUID_NAMESPACE))
    .update(key, "utf8")
    .digest()
    .subarray(0, 16);

  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;

  const hex = digest.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export const catalogIds = {
  category: (categoryId: string) => catalogUuid(`category:${categoryId}`),
  item: (itemId: string) => catalogUuid(`item:${itemId}`),
  modifierGroup: (groupId: string) => catalogUuid(`group:${groupId}`),
  modifierOption: (groupId: string, optionId: string) =>
    catalogUuid(`option:${groupId}:${optionId}`),
  variantGroup: (itemId: string) => catalogUuid(`variant-group:${itemId}`),
  variantOption: (itemId: string, variantId: string) =>
    catalogUuid(`variant-option:${itemId}:${variantId}`),
} as const;

/**
 * Request identifiers have already been UUID-validated by the HTTP schema.
 * The database transaction validates membership, availability, selection
 * counts, and recalculates every price before committing.
 */
export function resolveOrderLines(
  lines: readonly OrderLineInput[],
): ResolvedOrderLine[] {
  return lines.map((line) => ({
    item_id: line.menuItemId,
    quantity: line.quantity,
    modifier_option_ids: [
      ...(line.variantId ? [line.variantId] : []),
      ...line.modifierOptionIds,
    ],
  }));
}
