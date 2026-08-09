import { z } from "zod";

const accountOrderStatusSchema = z.enum([
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

const accountPhoneSchema = z.object({
  id: z.string().uuid(),
  phone_e164: z.string().regex(/^\+8801[3-9]\d{8}$/),
  label: z.string().min(1).max(40),
  is_primary: z.boolean(),
  verified_at: z.string().datetime({ offset: true }).nullable(),
  created_at: z.string().datetime({ offset: true }),
});

const accountAddressSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(40),
  sector_number: z.number().int().min(1).max(99),
  road_number: z.string().regex(/^\d{1,40}$/),
  house_number: z.string().regex(/^\d{1,40}$/),
  flat_number: z.string().min(1).max(40),
  is_default: z.boolean(),
  created_at: z.string().datetime({ offset: true }),
});

const accountOrderSchema = z.object({
  order_reference: z.string().regex(/^YZ-[0-9]{8}-[0-9]{8}$/),
  mode: z.enum(["live", "test"]),
  status: accountOrderStatusSchema,
  version: z.number().int().positive(),
  grand_total_minor: z.number().int().nonnegative(),
  currency_code: z.literal("BDT"),
  placed_at: z.string().datetime({ offset: true }),
  completed_at: z.string().datetime({ offset: true }).nullable(),
  item_count: z.number().int().nonnegative(),
});

export const accountSnapshotSchema = z.object({
  display_name: z.string().min(2).max(120).nullable(),
  preferred_locale: z.enum(["en", "bn"]),
  marketing_consent_at: z.string().datetime({ offset: true }).nullable(),
  phones: z.array(accountPhoneSchema).max(5),
  addresses: z.array(accountAddressSchema).max(5),
  orders: z.array(accountOrderSchema).max(100),
});

export const accountDeletionRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(320),
    confirmation: z.literal("DELETE"),
  })
  .strict();

export type AccountSnapshot = z.infer<typeof accountSnapshotSchema>;
export type AccountPhone = z.infer<typeof accountPhoneSchema>;
export type AccountAddress = z.infer<typeof accountAddressSchema>;
export type AccountOrder = z.infer<typeof accountOrderSchema>;
