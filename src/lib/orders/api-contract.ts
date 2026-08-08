import { z } from "zod";

const bdPhoneSchema = z
  .string()
  .trim()
  .max(32)
  .regex(/^\+?\d+$/, "Enter a valid Bangladesh mobile number.")
  .refine(
    (value) => /^(?:\+?8801|01)[3-9]\d{8}$/.test(value),
    "Enter a valid Bangladesh mobile number.",
  )
  .transform((value) => {
    if (value.startsWith("+880")) return value;
    if (value.startsWith("880")) return `+${value}`;
    return `+880${value.slice(1)}`;
  });

const catalogIdSchema = z.string().uuid("Use a valid catalog identifier.");

const orderLineSchema = z
  .object({
    menuItemId: catalogIdSchema,
    variantId: catalogIdSchema.nullable(),
    modifierOptionIds: z
      .array(catalogIdSchema)
      .max(40)
      .default([]),
    quantity: z.number().int().min(1).max(20),
  })
  .strict()
  .superRefine((line, context) => {
    const selectedOptionIds = [
      ...(line.variantId ? [line.variantId] : []),
      ...line.modifierOptionIds,
    ];
    if (new Set(selectedOptionIds).size !== selectedOptionIds.length) {
      context.addIssue({
        code: "custom",
        message: "Catalog option identifiers must be unique.",
        path: ["modifierOptionIds"],
      });
    }
    if (selectedOptionIds.length > 40) {
      context.addIssue({
        code: "too_big",
        maximum: 40,
        origin: "array",
        inclusive: true,
        message: "Choose no more than 40 catalog options for one item.",
        path: ["modifierOptionIds"],
      });
    }
  });

export const createOrderRequestSchema = z
  .object({
    customer: z
      .object({
        fullName: z.string().trim().min(2).max(120),
        sector: z
          .union([z.string(), z.number().int()])
          .transform((value) => Number(value))
          .pipe(z.number().int().min(1).max(18)),
        road: z.string().trim().regex(/^\d+$/).max(40),
        house: z.string().trim().regex(/^\d+$/).max(40),
        flat: z.string().trim().min(1).max(40),
        phone: bdPhoneSchema,
        notes: z.string().trim().max(500).optional().default(""),
      })
      .strict(),
    lines: z.array(orderLineSchema).min(1).max(30),
    locale: z.enum(["en", "bn"]).optional().default("en"),
    expectedSubtotalMinor: z.number().int().nonnegative(),
    turnstileToken: z.string().min(1).max(2048).optional(),
  })
  .strict();

export const idempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const orderReferenceSchema = z
  .string()
  .regex(/^YZ-[0-9]{8}-[0-9]{8}$/);

export const trackingTokenSchema = z
  .string()
  .min(32)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/);

export const trackingCredentialSchema = z
  .object({
    publicId: orderReferenceSchema,
    token: trackingTokenSchema,
  })
  .strict();

export const orderLookupRequestSchema = z
  .object({
    phone: bdPhoneSchema,
    trackingTokens: z.array(trackingCredentialSchema).max(12).default([]),
    turnstileToken: z.string().min(1).max(2048).optional(),
  })
  .strict();

export const createOrderRpcResponseSchema = z.object({
  order_id: z.string().uuid(),
  order_reference: orderReferenceSchema,
  tracking_token: trackingTokenSchema,
  mode: z.enum(["test", "live"]),
  status: z.literal("pending_acceptance"),
  version: z.number().int().positive(),
  grand_total_minor: z.number().int().nonnegative(),
  currency_code: z.literal("BDT"),
});

const orderStatusSchema = z.enum([
  "placed",
  "pending_acceptance",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "rejected",
  "cancelled",
]);

export const phoneLookupRpcResponseSchema = z.discriminatedUnion("found", [
  z.object({ found: z.literal(false) }),
  z.object({
    found: z.literal(true),
    reference_hint: z.string().regex(/^\d{4}$/),
    status: orderStatusSchema,
    mode: z.enum(["test", "live"]),
    placed_at: z.string().datetime({ offset: true }),
  }),
]);

const trackedOrderItemSchema = z.object({
  id: z.string().uuid(),
  name_en: z.string(),
  name_bn: z.string(),
  quantity: z.number().int().min(1).max(20),
  unit_price_minor: z.number().int().nonnegative(),
  modifier_unit_total_minor: z.number().int().nonnegative(),
  line_total_minor: z.number().int().nonnegative(),
  modifiers: z.array(
    z.object({
      group_name_en: z.string(),
      group_name_bn: z.string(),
      option_name_en: z.string(),
      option_name_bn: z.string(),
      price_delta_minor: z.number().int().nonnegative(),
    }),
  ),
});

export const trackedOrderRpcResponseSchema = z.object({
  order_id: z.string().uuid(),
  order_reference: orderReferenceSchema,
  mode: z.enum(["test", "live"]),
  status: orderStatusSchema,
  version: z.number().int().positive(),
  subtotal_minor: z.number().int().nonnegative(),
  discount_minor: z.number().int().nonnegative(),
  delivery_fee_minor: z.number().int().nonnegative(),
  grand_total_minor: z.number().int().nonnegative(),
  currency_code: z.literal("BDT"),
  placed_at: z.string().datetime({ offset: true }),
  accepted_at: z.string().datetime({ offset: true }).nullable(),
  completed_at: z.string().datetime({ offset: true }).nullable(),
  cancelled_at: z.string().datetime({ offset: true }).nullable(),
  items: z.array(trackedOrderItemSchema),
  events: z.array(
    z.object({
      status: orderStatusSchema,
      created_at: z.string().datetime({ offset: true }),
    }),
  ),
});

export const orderHistoryRowSchema = z.object({
  id: z.string().uuid(),
  order_reference: orderReferenceSchema,
  mode: z.enum(["test", "live"]),
  status: orderStatusSchema,
  version: z.number().int().positive(),
  grand_total_minor: z.number().int().nonnegative(),
  currency_code: z.literal("BDT"),
  placed_at: z.string().datetime({ offset: true }),
  completed_at: z.string().datetime({ offset: true }).nullable(),
  item_count: z.number().int().nonnegative(),
});

export type CreateOrderRpcResponse = z.infer<
  typeof createOrderRpcResponseSchema
>;
export type TrackedOrderRpcResponse = z.infer<
  typeof trackedOrderRpcResponseSchema
>;
export type OrderHistoryRow = z.infer<typeof orderHistoryRowSchema>;
export type PhoneLookupRpcResponse = z.infer<
  typeof phoneLookupRpcResponseSchema
>;
