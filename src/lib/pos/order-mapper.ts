import {
  posOrderSnapshotSchema,
  rawClaimedOrderSchema,
  type PosOrderSnapshot,
} from "@/lib/pos/api-contract";

export class PosOrderMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosOrderMappingError";
  }
}

export function mapClaimedOrders(value: unknown): PosOrderSnapshot[] {
  if (!Array.isArray(value)) {
    throw new PosOrderMappingError("The claimed-order response is not an array.");
  }
  return value.map(mapClaimedOrder);
}

export function mapClaimedOrder(value: unknown): PosOrderSnapshot {
  const parsed = rawClaimedOrderSchema.safeParse(value);
  if (!parsed.success) {
    throw new PosOrderMappingError("A claimed order does not match the POS contract.");
  }
  const order = parsed.data;
  const items = order.items.map((item) => {
    if (
      item.line_total_minor !==
      item.effective_unit_price_minor * item.quantity
    ) {
      throw new PosOrderMappingError("A claimed order line total is invalid.");
    }
    return {
      remoteItemId: item.id,
      menuItemPublicId: item.source_item_public_key,
      name: item.name_en,
      quantity: item.quantity,
      unitPrice: minorToTaka(item.effective_unit_price_minor),
      note: combineItemNote(
        item.customer_note,
        item.modifiers.map((modifier) => modifier.option_name_en),
      ),
    };
  });

  const subtotal = minorToTaka(order.subtotal_minor);
  const deliveryFee = minorToTaka(order.delivery_fee_minor);
  const discount = minorToTaka(order.discount_minor);
  const total = minorToTaka(order.grand_total_minor);
  const lineSubtotal = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
  if (lineSubtotal !== subtotal || total !== subtotal + deliveryFee - discount) {
    throw new PosOrderMappingError("A claimed order total is invalid.");
  }

  return posOrderSnapshotSchema.parse({
    remoteId: order.order_id,
    orderCode: order.order_reference,
    remoteVersion: order.version,
    status: "pending",
    customerName: order.contact.full_name,
    customerPhone: order.contact.phone_e164,
    address: {
      sector: String(order.contact.sector_number),
      road: order.contact.road_number,
      house: order.contact.house_number,
      flat: order.contact.flat_number,
    },
    deliveryNote: order.customer_note,
    subtotal,
    deliveryFee,
    discount,
    total,
    isTest: order.mode === "test",
    remoteCreatedAt: order.placed_at,
    remoteUpdatedAt: order.updated_at,
    items,
  });
}

export function minorToTaka(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value % 100 !== 0) {
    throw new PosOrderMappingError(
      "A remote money value cannot be represented exactly in whole taka.",
    );
  }
  return value / 100;
}

function combineItemNote(
  customerNote: string | null,
  modifierNames: string[],
): string | null {
  const parts = [
    customerNote?.trim() || "",
    modifierNames.length > 0
      ? `Options: ${modifierNames.map((name) => name.trim()).join(", ")}`
      : "",
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(" | ").slice(0, 300);
}
