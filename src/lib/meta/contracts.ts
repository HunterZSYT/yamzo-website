import { z } from "zod";

export const metaPixelRuntimeConfigSchema = z.object({
  enabled: z.boolean(),
  pixel_id: z.string().regex(/^\d{5,32}$/).nullable(),
  consent_required: z.literal(true),
});

const metaPurchaseContentSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{2,79}$/),
  quantity: z.number().int().min(1).max(20),
  item_price_minor: z.number().int().nonnegative(),
});

export const metaPurchaseClaimSchema = z.object({
  outbox_id: z.number().int().positive().safe(),
  claim_token: z.string().min(32).max(128),
  attempt: z.number().int().min(1).max(7),
  pixel_id: z.string().regex(/^\d{5,32}$/),
  access_token: z.string().min(20).max(2048).regex(/^\S+$/),
  event_id: z.string().regex(/^purchase-YZ-\d{8}-\d{8}$/),
  event_time: z.number().int().positive(),
  order_reference: z.string().regex(/^YZ-\d{8}-\d{8}$/),
  user_id: z.string().uuid().nullable(),
  grand_total_minor: z.number().int().nonnegative(),
  currency_code: z.literal("BDT"),
  full_name: z.string().trim().min(2).max(120),
  phone_e164: z.string().regex(/^\+8801[3-9]\d{8}$/),
  contents: z.array(metaPurchaseContentSchema).max(100),
  num_items: z.number().int().nonnegative().max(2_000),
});

export const metaPurchaseClaimsSchema = z
  .array(metaPurchaseClaimSchema)
  .max(10);

export type MetaPurchaseClaim = z.infer<typeof metaPurchaseClaimSchema>;

export const browserMetaPurchaseSchema = z.object({
  eventId: z.string().regex(/^purchase-YZ-\d{8}-\d{8}$/),
  value: z.number().finite().nonnegative(),
  currency: z.literal("BDT"),
});

export type BrowserMetaPurchase = z.infer<typeof browserMetaPurchaseSchema>;
