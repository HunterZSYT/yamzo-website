import { randomUUID } from "node:crypto";

import { accountDeletionRequestSchema } from "@/lib/account/contracts";
import {
  assertSameOrigin,
  privateJson,
  readJsonBody,
  RequestContractError,
  requestContractErrorResponse,
} from "@/lib/orders/http";
import { hasSupabaseConfig } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function accountError(
  requestId: string,
  status: number,
  error: string,
  message: string,
) {
  return privateJson(
    { error, message, requestId },
    { status, requestId },
  );
}

function deletionGuardError(
  message: string,
  requestId: string,
) {
  if (message.includes("AUTHENTICATION_REQUIRED")) {
    return accountError(requestId, 401, "AUTHENTICATION_REQUIRED", "Sign in to continue.");
  }
  if (message.includes("ACCOUNT_DELETION_CONFIRMATION_INVALID")) {
    return accountError(
      requestId,
      422,
      "ACCOUNT_DELETION_CONFIRMATION_INVALID",
      "Enter your exact account email and DELETE to continue.",
    );
  }
  if (message.includes("STAFF_ACCOUNT_DELETION_REQUIRES_OWNER_TRANSFER")) {
    return accountError(
      requestId,
      409,
      "STAFF_ACCOUNT_DELETION_REQUIRES_OWNER_TRANSFER",
      "Active staff accounts cannot be deleted from the customer profile. Transfer ownership or remove staff access first.",
    );
  }
  if (message.includes("RATE_LIMITED")) {
    return accountError(
      requestId,
      429,
      "RATE_LIMITED",
      "Too many deletion attempts. Please wait and try again.",
    );
  }
  return accountError(
    requestId,
    500,
    "ACCOUNT_DELETION_FAILED",
    "We could not delete that account. Please try again.",
  );
}

export async function DELETE(request: Request) {
  const requestId = randomUUID();

  try {
    assertSameOrigin(request);
    if (!hasSupabaseConfig()) {
      return accountError(
        requestId,
        503,
        "ACCOUNT_SERVICE_UNAVAILABLE",
        "Account service is temporarily unavailable. Please try again.",
      );
    }

    const parsed = accountDeletionRequestSchema.safeParse(
      await readJsonBody(request),
    );
    if (!parsed.success) {
      return accountError(
        requestId,
        400,
        "INVALID_REQUEST",
        "Enter your exact account email and DELETE to continue.",
      );
    }

    const sessionClient = await createClient();
    const {
      data: { user },
      error: userError,
    } = await sessionClient.auth.getUser();
    if (userError || !user?.email) {
      return accountError(requestId, 401, "AUTHENTICATION_REQUIRED", "Sign in to continue.");
    }

    const { error: guardError } = await sessionClient
      .schema("api")
      .rpc("confirm_my_account_deletion", {
        p_confirmation_email: parsed.data.email,
        p_confirmation_phrase: parsed.data.confirmation,
      });
    if (guardError) return deletionGuardError(guardError.message, requestId);

    const adminClient = createAdminClient();
    const { error: deletionError } = await adminClient.auth.admin.deleteUser(
      user.id,
    );
    if (deletionError) {
      return accountError(
        requestId,
        503,
        "ACCOUNT_DELETION_FAILED",
        "We could not delete that account. Please try again.",
      );
    }

    // A failed audit write cannot resurrect a deleted account. The response is
    // still successful, while the server retains no customer PII in the
    // tombstone payload.
    await adminClient
      .schema("api")
      .rpc("record_account_deletion_completion", { p_user_id: user.id });

    return privateJson(
      { ok: true, requestId },
      { status: 200, requestId },
    );
  } catch (error) {
    if (error instanceof RequestContractError) {
      return requestContractErrorResponse(error, requestId);
    }
    return accountError(
      requestId,
      500,
      "ACCOUNT_DELETION_FAILED",
      "We could not delete that account. Please try again.",
    );
  }
}
