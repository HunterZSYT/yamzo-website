import "server-only";

import { Resend } from "resend";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

type Environment = Readonly<Record<string, string | undefined>>;

const safeText = (value: string | undefined, maximum: number) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= maximum && !/[\r\n]/.test(trimmed)
    ? trimmed
    : null;
};

const syncCandidateSchema = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().max(120).nullable(),
  marketing_consent_at: z.string().datetime({ offset: true }).nullable(),
  resend_contact_id: z.string().min(3).max(128).nullable(),
  consent_observed_at: z.string().datetime({ offset: true }).nullable(),
});

const campaignDeliverySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(120),
  subject: z.string().min(2).max(180),
  preview_text: z.string().max(250).nullable(),
  body_text: z.string().min(2).max(12_000),
});

export type CustomerMessagingConfiguration = {
  apiKey: string;
  segmentId: string;
  from: string;
  replyTo: string | null;
};

export type CustomerAudienceSyncSummary = {
  processed: number;
  synced: number;
  failed: number;
};

export class CustomerMessagingError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function getCustomerMessagingConfiguration(
  environment: Environment = process.env,
): CustomerMessagingConfiguration | null {
  const apiKey = safeText(environment.RESEND_API_KEY, 512);
  const segmentId = safeText(environment.RESEND_CUSTOMERS_SEGMENT_ID, 128);
  const from = safeText(environment.RESEND_CUSTOMERS_FROM, 320);
  const replyTo = safeText(environment.RESEND_CUSTOMERS_REPLY_TO, 320);

  if (!apiKey || !segmentId || !from) return null;
  return { apiKey, segmentId, from, replyTo };
}

export function isCustomerMessagingConfigured(
  environment: Environment = process.env,
): boolean {
  return getCustomerMessagingConfiguration(environment) !== null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Campaign content is intentionally plain text in the database. Rendering it
 * here prevents arbitrary HTML or tracking scripts from being introduced by an
 * admin draft while retaining a required Resend broadcast unsubscribe link.
 */
export function renderCustomerCampaignHtml(bodyText: string) {
  const paragraphs = bodyText
    .trim()
    .split(/\n\s*\n/g)
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`)
    .join("");

  return `<main style="font-family:Arial,sans-serif;line-height:1.6;color:#102f49">${paragraphs}<hr style="border:0;border-top:1px solid #d9e6ee;margin:28px 0" /><p style="font-size:12px;color:#5a7184">You are receiving this because you opted in to Yamzo Uttara updates. <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a>.</p></main>`;
}

export function renderCustomerCampaignText(bodyText: string) {
  return `${bodyText.trim()}\n\nYou are receiving this because you opted in to Yamzo Uttara updates. Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}`;
}

function errorCode(error: unknown, fallback: string) {
  if (error instanceof CustomerMessagingError) return error.code;
  return fallback;
}

function dataOrThrow<T>(
  result: { data: T | null; error: { name: string } | null },
  fallback: string,
): T {
  if (result.error || result.data === null) {
    throw new CustomerMessagingError(
      result.error?.name ? `RESEND_${result.error.name.toUpperCase()}` : fallback,
    );
  }
  return result.data;
}

async function getAccountEmail(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  const email = data.user?.email?.trim().toLowerCase();
  if (error || !email) {
    throw new CustomerMessagingError("CUSTOMER_EMAIL_UNAVAILABLE");
  }
  return email;
}

async function resolveOrCreateContact(
  resend: Resend,
  email: string,
  displayName: string | null,
  segmentId: string,
) {
  const existing = await resend.contacts.get({ email });
  if (!existing.error && existing.data) return { contactId: existing.data.id, created: false };
  if (existing.error && existing.error.name !== "not_found") {
    throw new CustomerMessagingError(`RESEND_${existing.error.name.toUpperCase()}`);
  }

  const created = dataOrThrow(
    await resend.contacts.create({
      email,
      firstName: displayName?.trim().slice(0, 120) || undefined,
      unsubscribed: false,
      segments: [{ id: segmentId }],
    }),
    "RESEND_CONTACT_CREATE_FAILED",
  );
  return { contactId: created.id, created: true };
}

async function ensureSegmentMembership(
  resend: Resend,
  contactId: string,
  segmentId: string,
) {
  const segments = dataOrThrow(
    await resend.contacts.segments.list({ contactId }),
    "RESEND_SEGMENT_LOOKUP_FAILED",
  );
  if (segments.data.some((segment) => segment.id === segmentId)) return;

  dataOrThrow(
    await resend.contacts.segments.add({ contactId, segmentId }),
    "RESEND_SEGMENT_ADD_FAILED",
  );
}

export async function syncCustomerAudience(): Promise<CustomerAudienceSyncSummary> {
  const configuration = getCustomerMessagingConfiguration();
  if (!configuration) {
    throw new CustomerMessagingError("CUSTOMER_MESSAGING_NOT_CONFIGURED");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .schema("api")
    .rpc("list_marketing_sync_candidates", { p_limit: 250 });
  if (error) throw new CustomerMessagingError("CUSTOMER_AUDIENCE_READ_FAILED");

  const candidates = z.array(syncCandidateSchema).safeParse(data ?? []);
  if (!candidates.success) {
    throw new CustomerMessagingError("CUSTOMER_AUDIENCE_DATA_INVALID");
  }

  const resend = new Resend(configuration.apiKey);
  let synced = 0;
  let failed = 0;

  for (const candidate of candidates.data) {
    try {
      let contactId = candidate.resend_contact_id;

      if (candidate.marketing_consent_at) {
        const email = await getAccountEmail(candidate.user_id);
        const resolved = await resolveOrCreateContact(
          resend,
          email,
          candidate.display_name,
          configuration.segmentId,
        );
        contactId = resolved.contactId;

        if (!resolved.created) {
          const reOptedIn =
            candidate.consent_observed_at === null ||
            Date.parse(candidate.marketing_consent_at) >
              Date.parse(candidate.consent_observed_at);
          dataOrThrow(
            reOptedIn
              ? await resend.contacts.update({
                  id: contactId,
                  firstName: candidate.display_name?.trim().slice(0, 120) || null,
                  unsubscribed: false,
                })
              : await resend.contacts.update({
                  id: contactId,
                  firstName: candidate.display_name?.trim().slice(0, 120) || null,
                }),
            "RESEND_CONTACT_UPDATE_FAILED",
          );
          await ensureSegmentMembership(resend, contactId, configuration.segmentId);
        }
      } else if (contactId) {
        dataOrThrow(
          await resend.contacts.update({ id: contactId, unsubscribed: true }),
          "RESEND_CONTACT_OPT_OUT_FAILED",
        );
      } else {
        continue;
      }

      const { error: linkError } = await admin
        .schema("api")
        .rpc("upsert_marketing_contact_link", {
          p_user_id: candidate.user_id,
          p_resend_contact_id: contactId,
          p_consent_observed_at: candidate.marketing_consent_at,
        });
      if (linkError) throw new CustomerMessagingError("CUSTOMER_AUDIENCE_SAVE_FAILED");
      synced += 1;
    } catch (syncError) {
      failed += 1;
      await admin.schema("api").rpc("mark_marketing_contact_sync_error", {
        p_user_id: candidate.user_id,
        p_error_code: errorCode(syncError, "CUSTOMER_AUDIENCE_SYNC_FAILED"),
      });
    }
  }

  return { processed: candidates.data.length, synced, failed };
}

export async function createCustomerCampaignBroadcast(input: unknown) {
  const campaign = campaignDeliverySchema.parse(input);
  const configuration = getCustomerMessagingConfiguration();
  if (!configuration) {
    throw new CustomerMessagingError("CUSTOMER_MESSAGING_NOT_CONFIGURED");
  }

  const resend = new Resend(configuration.apiKey);
  const result = await resend.broadcasts.create({
    name: campaign.name,
    segmentId: configuration.segmentId,
    from: configuration.from,
    replyTo: configuration.replyTo ?? undefined,
    subject: campaign.subject,
    previewText: campaign.preview_text ?? undefined,
    html: renderCustomerCampaignHtml(campaign.body_text),
    text: renderCustomerCampaignText(campaign.body_text),
    send: false,
  });
  return dataOrThrow(result, "RESEND_BROADCAST_CREATE_FAILED").id;
}

export async function sendCustomerCampaignBroadcast(broadcastId: string) {
  const configuration = getCustomerMessagingConfiguration();
  if (!configuration) {
    throw new CustomerMessagingError("CUSTOMER_MESSAGING_NOT_CONFIGURED");
  }

  const result = await new Resend(configuration.apiKey).broadcasts.send(broadcastId);
  return dataOrThrow(result, "RESEND_BROADCAST_SEND_FAILED").id;
}
