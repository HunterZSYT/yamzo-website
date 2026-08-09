import { z } from "zod";

const timestamp = z.string().datetime({ offset: true });

export const customerCampaignSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(120),
  subject: z.string().min(2).max(180),
  preview_text: z.string().max(250).nullable(),
  body_text: z.string().min(2).max(12_000),
  status: z.enum(["draft", "sending", "sent", "failed", "cancelled"]),
  resend_broadcast_id: z.string().min(3).max(128).nullable(),
  recipient_count: z.number().int().nonnegative(),
  delivery_attempts: z.number().int().nonnegative(),
  delivery_started_at: timestamp.nullable(),
  sent_at: timestamp.nullable(),
  failed_at: timestamp.nullable(),
  last_error_code: z.string().min(2).max(80).nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});

export const marketingSnapshotSchema = z.object({
  consented_account_count: z.number().int().nonnegative(),
  synced_contact_count: z.number().int().nonnegative(),
  pending_sync_count: z.number().int().nonnegative(),
  campaigns: z.array(customerCampaignSchema),
});

export const customerDirectoryEntrySchema = z.object({
  user_id: z.string().uuid(),
  email: z.string().email().nullable(),
  email_confirmed: z.boolean(),
  display_name: z.string().max(120).nullable(),
  preferred_locale: z.enum(["en", "bn"]),
  marketing_consent_at: timestamp.nullable(),
  contact_sync_state: z.enum(["not_opted_in", "pending", "attention", "synced"]),
  order_count: z.number().int().nonnegative(),
  last_order_at: timestamp.nullable(),
  last_order_status: z
    .enum([
      "pending_acceptance",
      "accepted",
      "preparing",
      "ready",
      "out_for_delivery",
      "delivered",
      "rejected",
      "cancelled",
    ])
    .nullable(),
  phone_count: z.number().int().nonnegative(),
  address_count: z.number().int().nonnegative(),
  created_at: timestamp,
  last_sign_in_at: timestamp.nullable(),
});

export const customerDirectorySchema = z.object({
  total_count: z.number().int().nonnegative(),
  customers: z.array(customerDirectoryEntrySchema),
});

export type CustomerCampaign = z.infer<typeof customerCampaignSchema>;
export type MarketingSnapshot = z.infer<typeof marketingSnapshotSchema>;
export type CustomerDirectory = z.infer<typeof customerDirectorySchema>;
export type CustomerDirectoryEntry = z.infer<typeof customerDirectoryEntrySchema>;
