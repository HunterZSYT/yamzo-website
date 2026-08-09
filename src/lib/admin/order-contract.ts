import { z } from "zod";

import {
  ADMIN_ORDER_STATUSES,
  type AdminOrderDetail,
  type AdminOrderMutationAudit,
  type AdminOrderMutationInput,
  type AdminOrderStatusEvent,
} from "./types";

const isoDateTime = z.string().datetime({ offset: true });
const nullableIsoDateTime = isoDateTime.nullable();
const uuid = z.string().uuid();

const modifierSchema = z.object({
  source_option_id: uuid.nullable(),
  group_name_en: z.string().trim().min(1).max(160),
  group_name_bn: z.string().trim().min(1).max(160),
  option_name_en: z.string().trim().min(1).max(160),
  option_name_bn: z.string().trim().min(1).max(160),
  price_delta_minor: z.number().int().min(0),
});

const orderItemSchema = z.object({
  id: uuid,
  source_item_id: uuid.nullable(),
  source_item_public_key: z.string().min(1).max(80).nullable(),
  source_item_slug: z.string().min(1).max(160).nullable(),
  name_en: z.string().trim().min(1).max(160),
  name_bn: z.string().trim().min(1).max(160),
  quantity: z.number().int().min(1).max(20),
  unit_price_minor: z.number().int().min(0),
  modifier_unit_total_minor: z.number().int().min(0),
  effective_unit_price_minor: z.number().int().min(0),
  line_total_minor: z.number().int().min(0),
  customer_note: z.string().max(300).nullable(),
  modifiers: z.array(modifierSchema).max(20),
});

const operationsOrderSchema = z.object({
  order_id: uuid,
  order_reference: z.string().min(3).max(80),
  mode: z.enum(["live", "test"]),
  status: z.enum(ADMIN_ORDER_STATUSES),
  version: z.number().int().min(1),
  locale: z.enum(["en", "bn"]),
  subtotal_minor: z.number().int().nonnegative(),
  discount_minor: z.number().int().nonnegative(),
  delivery_fee_minor: z.number().int().nonnegative(),
  grand_total_minor: z.number().int().nonnegative(),
  currency_code: z.literal("BDT"),
  customer_note: z.string().max(500).nullable(),
  placed_at: isoDateTime,
  accepted_at: nullableIsoDateTime,
  completed_at: nullableIsoDateTime,
  cancelled_at: nullableIsoDateTime,
  archived_at: nullableIsoDateTime,
  updated_at: isoDateTime,
  contact: z.object({
    full_name: z.string().trim().min(1).max(120),
    phone_e164: z.string().regex(/^\+8801[3-9]\d{8}$/),
    sector_number: z.number().int().min(1).max(99),
    road_number: z.string().trim().min(1).max(80),
    house_number: z.string().trim().min(1).max(80),
    flat_number: z.string().trim().min(1).max(80),
  }),
  items: z.array(orderItemSchema).min(1).max(60),
});

const statusEventSchema = z.object({
  id: z.number().int().nonnegative(),
  from_status: z.enum(ADMIN_ORDER_STATUSES).nullable(),
  to_status: z.enum(ADMIN_ORDER_STATUSES),
  actor_type: z.enum(["customer", "staff", "terminal", "system"]),
  note: z.string().max(500).nullable(),
  created_at: isoDateTime,
});

const mutationAuditSchema = z.object({
  id: z.number().int().nonnegative(),
  action: z.enum(["order.admin_updated", "order.live_archived"]),
  from_version: z.number().int().min(1),
  to_version: z.number().int().min(2),
  from_status: z.enum(ADMIN_ORDER_STATUSES),
  to_status: z.enum(ADMIN_ORDER_STATUSES),
  note: z.string().max(500).nullable(),
  created_at: isoDateTime,
});

export const adminOrderDetailResponseSchema = z.object({
  order: operationsOrderSchema,
  status_events: z.array(statusEventSchema).max(250),
  mutation_audits: z.array(mutationAuditSchema).max(250),
});

export const adminOrderMutationInputSchema = z
  .object({
    orderId: uuid,
    expectedVersion: z.number().int().min(1),
    toStatus: z.enum(ADMIN_ORDER_STATUSES).nullable(),
    discountMinor: z.number().int().min(0).max(1_000_000_000).nullable(),
    deliveryFeeMinor: z.number().int().min(0).max(1_000_000_000).nullable(),
    note: z.string().trim().max(500).nullable(),
    items: z
      .array(
        z.object({
          sourceItemId: uuid.nullable(),
          itemNameEn: z.string().trim().min(1).max(160),
          itemNameBn: z.string().trim().min(1).max(160),
          quantity: z.number().int().min(1).max(20),
          unitPriceMinor: z.number().int().min(0).max(1_000_000),
          customerNote: z.string().trim().max(300).nullable(),
          modifiers: z
            .array(
              z.object({
                sourceOptionId: uuid.nullable(),
                groupNameEn: z.string().trim().min(1).max(160),
                groupNameBn: z.string().trim().min(1).max(160),
                optionNameEn: z.string().trim().min(1).max(160),
                optionNameBn: z.string().trim().min(1).max(160),
                priceDeltaMinor: z.number().int().min(0).max(100_000),
              }),
            )
            .max(20),
        }),
      )
      .min(1)
      .max(60)
      .nullable(),
  })
  .superRefine((value, context) => {
    if (value.toStatus === "cancelled" && (value.note?.trim().length ?? 0) < 2) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "Add a short cancellation reason.",
      });
    }
  });

export const adminOrderArchiveInputSchema = z.object({
  orderId: uuid,
  expectedVersion: z.number().int().min(1),
  note: z.string().trim().min(2).max(500),
});

export const adminOrderMutationResponseSchema = z.object({
  order_id: uuid,
  status: z.enum(ADMIN_ORDER_STATUSES),
  version: z.number().int().min(1),
  archived_at: nullableIsoDateTime,
});

export const adminOrderArrivalCursorSchema = z.object({
  placedAt: isoDateTime,
  orderId: uuid,
});

const orderSummarySchema = z.object({
  order_id: uuid,
  order_reference: z.string().min(3).max(80),
  mode: z.enum(["live", "test"]),
  status: z.enum(ADMIN_ORDER_STATUSES),
  version: z.number().int().min(1),
  grand_total_minor: z.number().int().nonnegative(),
  currency_code: z.string().min(3).max(8),
  placed_at: isoDateTime,
  accepted_at: nullableIsoDateTime,
  completed_at: nullableIsoDateTime,
  archived_at: nullableIsoDateTime,
});

export const adminOrderArrivalResponseSchema = z.array(orderSummarySchema).max(50);

export function parseAdminOrderDetail(value: unknown): AdminOrderDetail | null {
  const parsed = adminOrderDetailResponseSchema.safeParse(value);
  if (!parsed.success) return null;

  const { order } = parsed.data;
  const statusEvents: AdminOrderStatusEvent[] = parsed.data.status_events.map(
    (event) => ({
      id: event.id,
      fromStatus: event.from_status,
      toStatus: event.to_status,
      actorType: event.actor_type,
      note: event.note,
      createdAt: event.created_at,
    }),
  );
  const mutationAudits: AdminOrderMutationAudit[] = parsed.data.mutation_audits.map(
    (audit) => ({
      id: audit.id,
      action: audit.action,
      fromVersion: audit.from_version,
      toVersion: audit.to_version,
      fromStatus: audit.from_status,
      toStatus: audit.to_status,
      note: audit.note,
      createdAt: audit.created_at,
    }),
  );

  return {
    orderId: order.order_id,
    orderReference: order.order_reference,
    mode: order.mode,
    status: order.status,
    version: order.version,
    grandTotalMinor: order.grand_total_minor,
    currencyCode: order.currency_code,
    placedAt: order.placed_at,
    acceptedAt: order.accepted_at,
    completedAt: order.completed_at,
    archivedAt: order.archived_at,
    locale: order.locale,
    subtotalMinor: order.subtotal_minor,
    discountMinor: order.discount_minor,
    deliveryFeeMinor: order.delivery_fee_minor,
    customerNote: order.customer_note,
    cancelledAt: order.cancelled_at,
    contact: {
      fullName: order.contact.full_name,
      phoneE164: order.contact.phone_e164,
      sectorNumber: order.contact.sector_number,
      roadNumber: order.contact.road_number,
      houseNumber: order.contact.house_number,
      flatNumber: order.contact.flat_number,
    },
    items: order.items.map((item) => ({
      id: item.id,
      sourceItemId: item.source_item_id,
      sourceItemPublicKey: item.source_item_public_key,
      sourceItemSlug: item.source_item_slug,
      nameEn: item.name_en,
      nameBn: item.name_bn,
      quantity: item.quantity,
      unitPriceMinor: item.unit_price_minor,
      modifierUnitTotalMinor: item.modifier_unit_total_minor,
      effectiveUnitPriceMinor: item.effective_unit_price_minor,
      lineTotalMinor: item.line_total_minor,
      customerNote: item.customer_note,
      modifiers: item.modifiers.map((modifier) => ({
        sourceOptionId: modifier.source_option_id,
        groupNameEn: modifier.group_name_en,
        groupNameBn: modifier.group_name_bn,
        optionNameEn: modifier.option_name_en,
        optionNameBn: modifier.option_name_bn,
        priceDeltaMinor: modifier.price_delta_minor,
      })),
    })),
    statusEvents,
    mutationAudits,
  };
}

export function toAdminOrderMutationPayload(input: AdminOrderMutationInput) {
  return {
    p_order_id: input.orderId,
    p_expected_version: input.expectedVersion,
    p_to_status: input.toStatus,
    p_items: input.items?.map((item) => ({
      source_item_id: item.sourceItemId,
      item_name_en: item.itemNameEn,
      item_name_bn: item.itemNameBn,
      quantity: item.quantity,
      unit_price_minor: item.unitPriceMinor,
      customer_note: item.customerNote,
      modifiers: item.modifiers.map((modifier) => ({
        source_option_id: modifier.sourceOptionId,
        group_name_en: modifier.groupNameEn,
        group_name_bn: modifier.groupNameBn,
        option_name_en: modifier.optionNameEn,
        option_name_bn: modifier.optionNameBn,
        price_delta_minor: modifier.priceDeltaMinor,
      })),
    })) ?? null,
    p_discount_minor: input.discountMinor,
    p_delivery_fee_minor: input.deliveryFeeMinor,
    p_note: input.note,
  };
}
