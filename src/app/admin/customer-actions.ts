"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { AdminActionState } from "@/lib/admin/action-state";
import { authorizeAdminMutation } from "@/lib/admin/server-action";
import {
  CustomerMessagingError,
  createCustomerCampaignBroadcast,
  sendCustomerCampaignBroadcast,
  syncCustomerAudience,
} from "@/lib/customers/messaging";

const campaignSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  subject: z.string().trim().min(2).max(180),
  previewText: z.string().trim().max(250).optional().default(""),
  bodyText: z.string().trim().min(2).max(12_000),
});

const campaignIdSchema = z.string().uuid();

const errorMessages: Record<string, string> = {
  CUSTOMERS_MANAGE_PERMISSION_REQUIRED:
    "Your role cannot manage customer operations.",
  MARKETING_CAMPAIGN_NOT_FOUND: "That campaign no longer exists.",
  MARKETING_CAMPAIGN_NOT_SENDABLE:
    "Only a draft or failed campaign can be sent.",
  MARKETING_CAMPAIGN_NOT_CANCELLABLE:
    "That campaign cannot be cancelled now.",
  MARKETING_AUDIENCE_SYNC_REQUIRED:
    "Sync the consented customer audience before sending this campaign.",
  CUSTOMER_MESSAGING_NOT_CONFIGURED:
    "Customer email delivery is not configured on the server yet.",
};

function failed(message: string): AdminActionState {
  return { status: "error", message };
}

function databaseMessage(message: string) {
  const match = Object.entries(errorMessages).find(([code]) => message.includes(code));
  return match?.[1] ?? "The change was not saved. Refresh and try again.";
}

function messagingMessage(error: unknown) {
  if (error instanceof CustomerMessagingError) {
    return errorMessages[error.code] ?? "Customer email delivery could not be completed.";
  }
  return "Customer email delivery could not be completed.";
}

function refreshCustomers() {
  revalidatePath("/admin/customers");
}

function readCampaign(formData: FormData, includeId: boolean) {
  return campaignSchema.safeParse({
    id: includeId ? formData.get("id") : undefined,
    name: formData.get("name"),
    subject: formData.get("subject"),
    previewText: formData.get("previewText"),
    bodyText: formData.get("bodyText"),
  });
}

export async function syncCustomerAudienceAction(
  _previous: AdminActionState,
  _formData: FormData,
): Promise<AdminActionState> {
  void _previous;
  void _formData;

  const authorized = await authorizeAdminMutation("customers.manage");
  if (!authorized) {
    return failed("An active staff account with customers.manage is required.");
  }

  try {
    const summary = await syncCustomerAudience();
    refreshCustomers();
    return summary.failed === 0
      ? {
          status: "success",
          message:
            summary.processed === 0
              ? "The consented audience is already in sync."
              : `Audience sync complete: ${summary.synced} customer${summary.synced === 1 ? "" : "s"} updated.`,
        }
      : failed(
          `Audience sync completed with ${summary.failed} customer${summary.failed === 1 ? "" : "s"} needing attention. No campaign was sent.`,
        );
  } catch (error) {
    return failed(messagingMessage(error));
  }
}

export async function createCustomerCampaignAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = readCampaign(formData, false);
  if (!parsed.success) return failed("Check the campaign name, subject, and message.");

  const authorized = await authorizeAdminMutation("customers.manage");
  if (!authorized) {
    return failed("An active staff account with customers.manage is required.");
  }

  const { error } = await authorized.client.schema("api").rpc(
    "create_marketing_campaign",
    {
      p_name: parsed.data.name,
      p_subject: parsed.data.subject,
      p_preview_text: parsed.data.previewText || null,
      p_body_text: parsed.data.bodyText,
    },
  );
  if (error) return failed(databaseMessage(error.message));

  refreshCustomers();
  return { status: "success", message: "Campaign draft created." };
}

export async function updateCustomerCampaignAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = readCampaign(formData, true);
  if (!parsed.success || !parsed.data.id) {
    return failed("Check the campaign name, subject, and message.");
  }

  const authorized = await authorizeAdminMutation("customers.manage");
  if (!authorized) {
    return failed("An active staff account with customers.manage is required.");
  }

  const { error } = await authorized.client.schema("api").rpc(
    "update_marketing_campaign",
    {
      p_campaign_id: parsed.data.id,
      p_name: parsed.data.name,
      p_subject: parsed.data.subject,
      p_preview_text: parsed.data.previewText || null,
      p_body_text: parsed.data.bodyText,
    },
  );
  if (error) return failed(databaseMessage(error.message));

  refreshCustomers();
  return { status: "success", message: "Campaign draft updated." };
}

export async function cancelCustomerCampaignAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const campaignId = campaignIdSchema.safeParse(formData.get("campaignId"));
  if (!campaignId.success) return failed("That campaign could not be identified.");

  const authorized = await authorizeAdminMutation("customers.manage");
  if (!authorized) {
    return failed("An active staff account with customers.manage is required.");
  }

  const { error } = await authorized.client
    .schema("api")
    .rpc("cancel_marketing_campaign", { p_campaign_id: campaignId.data });
  if (error) return failed(databaseMessage(error.message));

  refreshCustomers();
  return { status: "success", message: "Campaign cancelled." };
}

export async function sendCustomerCampaignAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const campaignId = campaignIdSchema.safeParse(formData.get("campaignId"));
  if (!campaignId.success) return failed("That campaign could not be identified.");

  const authorized = await authorizeAdminMutation("customers.manage");
  if (!authorized) {
    return failed("An active staff account with customers.manage is required.");
  }

  let deliveryStarted = false;
  let deliveryAccepted = false;
  try {
    const sync = await syncCustomerAudience();
    if (sync.failed > 0) {
      refreshCustomers();
      return failed("The audience has sync issues. Resolve them before sending a campaign.");
    }

    const { data: campaign, error: beginError } = await authorized.client
      .schema("api")
      .rpc("begin_marketing_campaign_send", { p_campaign_id: campaignId.data });
    if (beginError) return failed(databaseMessage(beginError.message));
    deliveryStarted = true;

    const broadcastId = await createCustomerCampaignBroadcast(campaign);
    const { error: recordError } = await authorized.client
      .schema("api")
      .rpc("record_marketing_campaign_broadcast", {
        p_campaign_id: campaignId.data,
        p_resend_broadcast_id: broadcastId,
      });
    if (recordError) {
      try {
        await authorized.client.schema("api").rpc("fail_marketing_campaign_send", {
          p_campaign_id: campaignId.data,
          p_error_code: "BROADCAST_RECORD_FAILED",
        });
      } catch {
        // The delivery has not reached Resend. Preserve the original safe error
        // even if recording the local failure is temporarily unavailable.
      }
      return failed("The broadcast draft was not recorded. Nothing was sent.");
    }

    await sendCustomerCampaignBroadcast(broadcastId);
    deliveryAccepted = true;
    const { error: finishError } = await authorized.client
      .schema("api")
      .rpc("finish_marketing_campaign_send", { p_campaign_id: campaignId.data });
    if (finishError) {
      refreshCustomers();
      return failed(
        "Resend accepted the broadcast, but its local status could not be finalized. Refresh this page before retrying.",
      );
    }

    refreshCustomers();
    return { status: "success", message: "Campaign sent to the consented customer audience." };
  } catch (error) {
    if (deliveryStarted && !deliveryAccepted) {
      try {
        await authorized.client.schema("api").rpc("fail_marketing_campaign_send", {
          p_campaign_id: campaignId.data,
          p_error_code:
            error instanceof CustomerMessagingError
              ? error.code
              : "CUSTOMER_CAMPAIGN_DELIVERY_FAILED",
        });
      } catch {
        // Returning a useful action result is safer than surfacing an internal
        // failure from the best-effort audit transition.
      }
    }
    refreshCustomers();
    return failed(messagingMessage(error));
  }
}
