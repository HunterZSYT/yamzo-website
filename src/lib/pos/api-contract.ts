import { z } from "zod";

export const terminalCodeSchema = z
  .string()
  .regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/);
export const terminalNonceSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{22,64}$/);
export const terminalSignatureSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{86}$/);
export const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const unixTimestampSchema = z.string().regex(/^\d{10}$/);
export const eventKeySchema = z.string().uuid();
export const orderIdSchema = z.string().uuid();

export const posTerminalVerifierSchema = z
  .object({
    terminal_id: z.string().uuid(),
    /** Base64url-encoded Ed25519 SubjectPublicKeyInfo DER (44 bytes). */
    public_key: z.string().regex(/^[A-Za-z0-9_-]{59}$/),
    public_key_fingerprint: sha256HexSchema,
  })
  .strict();

export const claimOrdersRequestSchema = z
  .object({
    cursor: z.string().max(200).nullable().optional(),
    limit: z.number().int().min(1).max(10).default(10),
    includeTest: z.boolean().default(false),
  })
  .strict();

export const posOrderStatusSchema = z.enum([
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "rejected",
  "cancelled",
]);

export const transitionOrderRequestSchema = z
  .object({
    eventKey: eventKeySchema,
    orderId: orderIdSchema,
    toStatus: posOrderStatusSchema,
    expectedVersion: z.number().int().min(1).max(2_147_483_647),
    note: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .strict();

export const printAckRequestSchema = z
  .object({
    eventKey: eventKeySchema,
    orderId: orderIdSchema,
    kind: z.enum(["customer_receipt", "kitchen_copy"]),
    succeeded: z.boolean(),
    errorCode: z
      .string()
      .regex(/^[A-Z0-9_:-]{1,80}$/)
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.succeeded && !value.errorCode) {
      context.addIssue({
        code: "custom",
        path: ["errorCode"],
        message: "A safe error code is required when printing fails.",
      });
    }
  });

const rawModifierSchema = z.object({
  option_name_en: z.string().trim().min(1).max(160),
});

const rawOrderItemSchema = z.object({
  id: z.string().uuid(),
  source_item_public_key: z
    .string()
    .regex(/^[a-z][a-z0-9_]{2,79}$/),
  name_en: z.string().trim().min(1).max(160),
  quantity: z.number().int().min(1).max(99),
  effective_unit_price_minor: z.number().int().min(0),
  line_total_minor: z.number().int().min(0),
  customer_note: z.string().max(300).nullable(),
  // Matches the checkout contract's maximum selected catalog options.
  modifiers: z.array(rawModifierSchema).max(40),
});

export const rawClaimedOrderSchema = z.object({
  order_id: z.string().uuid(),
  order_reference: z.string().trim().min(3).max(80),
  mode: z.enum(["live", "test"]),
  status: z.literal("pending_acceptance"),
  version: z.number().int().min(1),
  currency_code: z.literal("BDT"),
  subtotal_minor: z.number().int().min(0),
  discount_minor: z.number().int().min(0),
  delivery_fee_minor: z.number().int().min(0),
  grand_total_minor: z.number().int().min(0),
  customer_note: z.string().max(500).nullable(),
  placed_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  contact: z.object({
    full_name: z.string().trim().min(1).max(120),
    phone_e164: z.string().regex(/^\+8801[3-9]\d{8}$/),
    sector_number: z.number().int().min(1).max(99),
    road_number: z.string().trim().min(1).max(80),
    house_number: z.string().trim().min(1).max(80),
    flat_number: z.string().trim().min(1).max(80),
  }),
  items: z.array(rawOrderItemSchema).min(1).max(100),
});

export type RawClaimedOrder = z.infer<typeof rawClaimedOrderSchema>;

export const posOrderSnapshotSchema = z.object({
  remoteId: z.string().uuid(),
  orderCode: z.string().min(1).max(80),
  remoteVersion: z.number().int().min(1),
  status: z.literal("pending"),
  customerName: z.string().min(1).max(120),
  customerPhone: z.string().regex(/^\+8801[3-9]\d{8}$/),
  address: z.object({
    sector: z.string().regex(/^\d+$/),
    road: z.string().min(1).max(80),
    house: z.string().min(1).max(80),
    flat: z.string().min(1).max(80),
  }),
  deliveryNote: z.string().max(500).nullable(),
  subtotal: z.number().int().min(0),
  deliveryFee: z.number().int().min(0),
  discount: z.number().int().min(0),
  total: z.number().int().min(0),
  isTest: z.boolean(),
  remoteCreatedAt: z.string().datetime({ offset: true }),
  remoteUpdatedAt: z.string().datetime({ offset: true }),
  items: z
    .array(
      z.object({
        remoteItemId: z.string().uuid(),
        menuItemPublicId: z
          .string()
          .regex(/^[a-z][a-z0-9_]{2,79}$/),
        name: z.string().min(1).max(160),
        quantity: z.number().int().min(1).max(99),
        unitPrice: z.number().int().min(0),
        note: z.string().max(300).nullable(),
      }),
    )
    .min(1)
    .max(100),
});

export type PosOrderSnapshot = z.infer<typeof posOrderSnapshotSchema>;
